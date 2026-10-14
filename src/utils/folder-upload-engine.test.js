import test from "node:test";
import assert from "node:assert/strict";
import { createFolderUploadPlan, prepareFolderBundleInWorker, runFolderUploadPipeline } from "./folder-upload-engine.js";

const MiB = 1024 ** 2;
const tick = () => new Promise(resolve => setImmediate(resolve));
const bundleUnit = (index, bytes = 100 * MiB) => ({ kind: "bundle", index,
  entries: [{ path: `${index}.bin`, file: { size: bytes } }], bytes, estimatedPreparedBytes: bytes });
const packed = unit => ({ blob: { size: unit.bytes }, files: [{ path: `${unit.index}.bin` }],
  sha256: "abc", timing: { durationMs: 2, readWaitMs: 1, hashAndZipMs: 1 } });

test("upload plan is deterministic across selection order and changes when source metadata changes", () => {
  const descriptors = [
    { path: "z.bin", file: { size: 10, lastModified: 7 } },
    { path: "a.bin", file: { size: 10, lastModified: 4 } },
    { path: "large.bin", file: { size: 250 * MiB, lastModified: 2 } },
  ];
  const plan = createFolderUploadPlan(descriptors);
  const shuffled = createFolderUploadPlan(descriptors.toReversed());
  assert.equal(shuffled.fingerprint, plan.fingerprint);
  assert.deepEqual(shuffled.units, plan.units);
  assert.deepEqual(plan.units[1].entries.map(entry => entry.path), ["a.bin", "z.bin"]);
  const changed = createFolderUploadPlan(descriptors.map(entry => entry.path === "a.bin"
    ? { ...entry, file: { ...entry.file, lastModified: 5 } } : entry));
  assert.notEqual(changed.fingerprint, plan.fingerprint);
});

test("pipeline overlaps preparation and direct upload, limits memory and checkpoints before sending", async () => {
  const units = [{ kind: "file", index: 0, entries: [{ path: "large", file: {} }], bytes: 300 * MiB },
    ...Array.from({ length: 5 }, (_, index) => bundleUnit(index + 1))];
  const events = [];
  const checkpointed = new Set();
  let peakPreparation = 0;
  let peakUploads = 0;
  let peakReserved = 0;
  const completed = [];
  await runFolderUploadPipeline({ units, maxPreparedBytes: 300 * MiB,
    prepareBundle: async (entries, { onProgress }) => {
      const index = Number(entries[0].path.split(".")[0]);
      events.push(`prepare:${index}`);
      onProgress({ preparedFiles: 0, preparedBytes: 50 * MiB });
      await tick();
      return packed(units[index]);
    },
    onPrepared: async (_unit, _prepared, index) => { await tick(); checkpointed.add(index); },
    uploadUnit: async (unit, prepared, index) => {
      if (unit.kind === "bundle") {
        assert.ok(checkpointed.has(index));
        assert.ok(prepared.blob);
      } else assert.equal(prepared, null);
      events.push(`upload:${index}`);
      await tick(); await tick();
      events.push(`done:${index}`);
      completed.push(index);
    },
    onState: state => {
      peakPreparation = Math.max(peakPreparation, state.preparing);
      peakUploads = Math.max(peakUploads, state.uploading);
      peakReserved = Math.max(peakReserved, state.reservedBytes);
      assert.ok(state.reservedBytes <= 300 * MiB);
    },
  });
  assert.equal(peakPreparation, 2);
  assert.equal(peakUploads, 2);
  assert.ok(peakReserved >= 200 * MiB);
  assert.ok(events.indexOf("prepare:1") < events.indexOf("done:0"));
  assert.ok(events.indexOf("upload:1") < events.indexOf("done:0"));
  assert.deepEqual(completed.sort(), [0, 1, 2, 3, 4, 5]);
});

test("completed checkpoints skip preparation and transmission", async () => {
  let preparedCount = 0;
  let uploadedCount = 0;
  const units = [bundleUnit(0), bundleUnit(1)];
  units.forEach((unit, index) => { unit.id = `bundle-${index}`; });
  const snapshots = [];
  await runFolderUploadPipeline({ units, isComplete: (_unit, index) => index === 0,
    prepareBundle: async () => { preparedCount++; return packed(units[1]); },
    uploadUnit: async () => { uploadedCount++; },
    onState: state => snapshots.push(state),
  });
  assert.equal(preparedCount, 1);
  assert.equal(uploadedCount, 1);
  assert.deepEqual(snapshots[0].preparedByUnit, { "bundle-0": { files: 1, bytes: 100 * MiB } });
  assert.deepEqual(snapshots.at(-1).preparedByUnit, {
    "bundle-0": { files: 1, bytes: 100 * MiB }, "bundle-1": { files: 1, bytes: 100 * MiB },
  });
  assert.equal(snapshots.at(-1).preparedFiles, 2);
});

test("cancellation aborts preparation and in-flight upload and releases queued blobs", async () => {
  const controller = new AbortController();
  let aborted = 0;
  let starts = 0;
  const units = [{ kind: "file", entries: [], bytes: 300 * MiB }, bundleUnit(1), bundleUnit(2)];
  const untilAborted = signal => new Promise((resolve, reject) => {
    starts++;
    signal.addEventListener("abort", () => { aborted++; reject(Object.assign(new Error("canceled"), { name: "AbortError" })); }, { once: true });
    if (starts === 3) queueMicrotask(() => controller.abort());
  });
  await assert.rejects(runFolderUploadPipeline({ units, signal: controller.signal,
    prepareBundle: async (_entries, { signal }) => untilAborted(signal),
    uploadUnit: async (_unit, _prepared, _index, signal) => untilAborted(signal),
  }), { name: "AbortError" });
  assert.equal(starts, 3);
  assert.equal(aborted, 3);
});

test("first preparation failure aborts active work and prevents new uploads", async () => {
  const expected = new Error("read failed");
  let uploads = 0;
  let canceled = 0;
  await assert.rejects(runFolderUploadPipeline({ units: [bundleUnit(0), bundleUnit(1), bundleUnit(2)],
    prepareBundle: async (entries, { signal }) => {
      if (entries[0].path === "0.bin") { await tick(); throw expected; }
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
        canceled++; reject(new Error("aborted"));
      }, { once: true }));
    },
    uploadUnit: async () => { uploads++; },
  }), expected);
  assert.equal(uploads, 0);
  assert.equal(canceled, 1);
});

test("worker adapter reports progress and terminates on completion or cancellation", async () => {
  const original = globalThis.Worker;
  const instances = [];
  class WorkerStub {
    constructor() { instances.push(this); }
    postMessage(data) { this.entries = data.entries; }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = WorkerStub;
  try {
    const progress = [];
    const result = { blob: new Blob(["stored"]), files: [], sha256: "abc" };
    const preparation = prepareFolderBundleInWorker([], { onProgress: value => progress.push(value.preparedBytes) });
    instances[0].onmessage({ data: { type: "progress", preparedBytes: 6 } });
    instances[0].onmessage({ data: { type: "done", prepared: result } });
    assert.equal(await preparation, result);
    assert.deepEqual(progress, [6]);
    assert.equal(instances[0].terminated, true);
    const controller = new AbortController();
    const canceled = prepareFolderBundleInWorker([], { signal: controller.signal });
    controller.abort();
    await assert.rejects(canceled, { name: "AbortError" });
    assert.equal(instances[1].terminated, true);
  } finally { globalThis.Worker = original; }
});
