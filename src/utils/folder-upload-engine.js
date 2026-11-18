import { sha256 } from "@noble/hashes/sha2.js";
import { BUNDLE_ENTRY_OVERHEAD_BYTES, BUNDLE_MAX_BYTES, planFolderBundles } from "./folder-bundles.js";
import { compareFolderEntries, createFolderInventoryDigest } from "./folder-inventory.js";

export const FOLDER_UPLOAD_PLAN_VERSION = 2;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const abortError = () => Object.assign(new Error("Upload canceled"), { name: "AbortError" });
const now = () => globalThis.performance?.now() ?? Date.now();

// Sort without locale-sensitive comparison, keeping package bytes and indexes
// identical after a reload or selection in a different filesystem order.
export function createFolderUploadPlan(descriptors) {
  const sorted = [...descriptors].sort(compareFolderEntries);
  const plan = planFolderBundles(sorted);
  const digest = sha256.create();
  digest.update(new TextEncoder().encode(`merlin-folder-plan:${FOLDER_UPLOAD_PLAN_VERSION}\n`));
  for (const { path, file } of sorted) {
    digest.update(new TextEncoder().encode(`${JSON.stringify([path, file.size, Number(file.lastModified) || 0])}\n`));
  }
  return finishFolderUploadPlan(plan, hex(digest.digest()));
}

export async function createFolderUploadPlanAsync(descriptors, { signal, onProgress, expectedInventory } = {}) {
  const yieldToUi = () => new Promise(resolve => setTimeout(resolve, 0));
  if (signal?.aborted) throw abortError();
  if (expectedInventory && descriptors.length !== expectedInventory.fileCount) {
    throw new Error(`O navegador encontrou ${descriptors.length.toLocaleString("pt-BR")} de ${expectedInventory.fileCount.toLocaleString("pt-BR")} arquivos. Confira a pasta ou envie o jogo como ZIP.`);
  }
  const sorted = [...descriptors].sort(compareFolderEntries);
  const digest = sha256.create();
  const encoder = new TextEncoder();
  digest.update(encoder.encode(`merlin-folder-plan:${FOLDER_UPLOAD_PLAN_VERSION}\n`));
  const inventoryDigest = expectedInventory ? createFolderInventoryDigest() : null;
  let inventoryBytes = 0;
  for (let start = 0; start < sorted.length; start += 5000) {
    if (signal?.aborted) throw abortError();
    const end = Math.min(sorted.length, start + 5000);
    for (let index = start; index < end; index++) {
      const { path, file } = sorted[index];
      digest.update(encoder.encode(`${JSON.stringify([path, file.size, Number(file.lastModified) || 0])}\n`));
      if (inventoryDigest) {
        inventoryDigest.add(path, file.size);
        inventoryBytes += file.size;
      }
    }
    onProgress?.({ done: end, count: sorted.length });
    if (end < sorted.length) await yieldToUi();
  }
  if (inventoryDigest && (inventoryBytes !== expectedInventory.totalSizeBytes || inventoryDigest.finish() !== expectedInventory.sha256)) {
    throw new Error("Os arquivos selecionados não correspondem ao inventário. Confira se a pasta mudou ou envie o jogo como ZIP.");
  }
  return finishFolderUploadPlan(planFolderBundles(sorted), hex(digest.digest()));
}

function finishFolderUploadPlan(plan, fingerprint) {
  const units = [
    ...plan.direct.map(entry => ({ kind: "file", entries: [entry], bytes: entry.file.size, estimatedPreparedBytes: 0 })),
    ...plan.bundles.map(entries => ({ kind: "bundle", entries,
      bytes: entries.reduce((total, entry) => total + entry.file.size, 0),
      estimatedPreparedBytes: entries.reduce((total, entry) => total + entry.file.size + BUNDLE_ENTRY_OVERHEAD_BYTES, 0) })),
  ].map((unit, index) => ({ ...unit, index, id: `v${FOLDER_UPLOAD_PLAN_VERSION}:${index}` }));
  return { ...plan, units, fingerprint, version: FOLDER_UPLOAD_PLAN_VERSION };
}

export function prepareFolderBundleInWorker(entries, { signal, onProgress } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/custom-game-bundle.worker.js", import.meta.url), { type: "module" });
    const finish = (error, value) => {
      signal?.removeEventListener("abort", canceled);
      worker.terminate();
      if (error) reject(error); else resolve(value);
    };
    const canceled = () => finish(abortError());
    signal?.addEventListener("abort", canceled, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data);
      else if (data.type === "done") finish(null, data.prepared);
      else if (data.type === "error") finish(new Error(data.message));
    };
    worker.onerror = event => finish(new Error(event.message || "Falha ao preparar pacote."));
    worker.onmessageerror = () => finish(new Error("Falha ao receber o pacote preparado."));
    try { worker.postMessage({ entries }); } catch (error) { finish(error); }
  });
}

/**
 * Prepare bounded bundles from the start, overlap network with CPU/disk, and
 * alternate ready bundles with direct files. The byte reservation includes
 * preparing, queued AND uploading bundles, released only after upload settles.
 * uploadUnit(unit, prepared|null, index, taskSignal) owns network/checkpoint data.
 */
export async function runFolderUploadPipeline({ units, signal, uploadUnit,
  isComplete = () => false, prepareBundle = prepareFolderBundleInWorker,
  onPrepared, onState, onTiming, prepareConcurrency = 2, uploadConcurrency = 2,
  maxPreparedBytes = 600 * 1024 ** 2 }) {
  if (signal?.aborted) throw abortError();
  if (typeof uploadUnit !== "function") throw new Error("uploadUnit is required");
  if (!Number.isFinite(maxPreparedBytes) || maxPreparedBytes < BUNDLE_MAX_BYTES) throw new Error("Invalid package memory limit");
  const prepareLimit = Math.max(1, Math.min(2, Math.floor(prepareConcurrency) || 1));
  const uploadLimit = Math.max(1, Math.min(8, Math.floor(uploadConcurrency) || 1));
  const controller = new AbortController();
  const tasks = units.map((unit, index) => {
    const complete = isComplete(unit, index);
    return { unit, index, status: complete ? "complete" : "pending", prepared: null,
      preparedFiles: complete && unit.kind === "bundle" ? unit.entries.length : 0,
      preparedBytes: complete && unit.kind === "bundle" ? unit.bytes : 0, reservedBytes: 0 };
  });
  let activePreparations = 0;
  let activeUploads = 0;
  let reservedBytes = 0;
  let failure = null;
  let preferBundle = true;
  let wake;
  const inFlight = new Set();
  const startedAt = now();
  const timing = { durationMs: 0, readWaitMs: 0, hashAndZipMs: 0, bundles: 0 };
  const changed = () => {
    onState?.({ preparing: activePreparations, ready: tasks.filter(task => task.status === "ready").length,
      uploading: activeUploads, reservedBytes,
      preparedFiles: tasks.reduce((sum, task) => sum + task.preparedFiles, 0),
      preparedBytes: tasks.reduce((sum, task) => sum + task.preparedBytes, 0),
      preparedByUnit: Object.fromEntries(tasks.filter(task => task.unit.kind === "bundle" &&
        (task.preparedFiles || task.preparedBytes || task.status === "complete"))
        .map(task => [task.unit.id, { files: task.preparedFiles, bytes: task.preparedBytes }])),
      completedUnits: tasks.filter(task => task.status === "complete").length,
      elapsedMs: now() - startedAt, timing: { ...timing } });
    const resolve = wake; wake = null; resolve?.();
  };
  const fail = error => {
    if (!failure) { failure = error; controller.abort(); }
    changed();
  };
  const canceled = () => fail(abortError());
  signal?.addEventListener("abort", canceled, { once: true });
  const launch = work => {
    const promise = work().catch(fail).finally(() => { inFlight.delete(promise); changed(); });
    inFlight.add(promise);
  };
  const prepare = task => {
    task.status = "preparing";
    task.reservedBytes = task.unit.estimatedPreparedBytes || BUNDLE_MAX_BYTES;
    reservedBytes += task.reservedBytes;
    activePreparations++;
    launch(async () => {
      try {
        task.prepared = await prepareBundle(task.unit.entries, { signal: controller.signal,
          onProgress: progress => {
            task.preparedFiles = progress.preparedFiles || 0;
            task.preparedBytes = progress.preparedBytes || 0;
            changed();
          } });
        if (controller.signal.aborted) throw failure || abortError();
        if (task.prepared.blob.size > task.reservedBytes) throw new Error("Prepared package exceeded its memory reservation");
        task.preparedFiles = task.unit.entries.length;
        task.preparedBytes = task.unit.bytes;
        await onPrepared?.(task.unit, task.prepared, task.index);
        const result = task.prepared.timing;
        if (result) {
          timing.durationMs += result.durationMs || 0;
          timing.readWaitMs += result.readWaitMs || 0;
          timing.hashAndZipMs += result.hashAndZipMs || 0;
          timing.bundles++;
          onTiming?.(task.unit, result, task.index);
        }
        task.status = "ready";
      } finally { activePreparations--; }
    });
  };
  const upload = task => {
    task.status = "uploading";
    activeUploads++;
    launch(async () => {
      try {
        await uploadUnit(task.unit, task.prepared, task.index, controller.signal);
        task.status = "complete";
      } finally {
        activeUploads--;
        reservedBytes -= task.reservedBytes;
        task.reservedBytes = 0;
        task.prepared = null;
      }
    });
  };
  try {
    changed();
    while (!failure && tasks.some(task => task.status !== "complete")) {
      while (activePreparations < prepareLimit) {
        const task = tasks.find(task => task.status === "pending" && task.unit.kind === "bundle");
        if (!task || reservedBytes + (task.unit.estimatedPreparedBytes || BUNDLE_MAX_BYTES) > maxPreparedBytes) break;
        prepare(task);
      }
      while (activeUploads < uploadLimit) {
        const bundle = tasks.find(task => task.status === "ready");
        const direct = tasks.find(task => task.status === "pending" && task.unit.kind !== "bundle");
        const selected = preferBundle ? bundle || direct : direct || bundle;
        if (!selected) break;
        preferBundle = selected.unit.kind !== "bundle";
        upload(selected);
      }
      changed();
      if (failure || tasks.every(task => task.status === "complete")) break;
      // Install the wake-up before yielding, so a settled microtask cannot be lost.
      await new Promise(resolve => { wake = resolve; });
    }
    if (failure) throw failure;
  } finally {
    signal?.removeEventListener("abort", canceled);
    controller.abort();
    await Promise.allSettled([...inFlight]);
    for (const task of tasks) task.prepared = null;
  }
}
