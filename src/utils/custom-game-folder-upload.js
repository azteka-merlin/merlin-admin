import { createFolderUploadPlan, runFolderUploadPipeline } from "./folder-upload-engine.js";
import { loadUploadCheckpoint, saveUploadCheckpoint, deleteUploadCheckpoint,
  loadUploadUnitCheckpoints, saveUploadUnitCheckpoint, storageAvailable } from "./custom-game-upload-store.js";
import { createTransferLimiter, readFileForUpload, uploadSignedPart } from "./custom-game-transfer.js";
import { createFolderUploadProgress } from "./folder-upload-progress.js";

const ROOT = "/panel-api/custom-games/upload";
const canceled = () => new Error("Upload canceled");
const pause = (milliseconds, signal) => new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(canceled()); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
  if (signal?.aborted) return abort();
  signal?.addEventListener("abort", abort, { once: true });
});

export function folderDescriptors(files) {
  if (!files.length || files.length > 20000) throw new Error("Selecione uma pasta com até 20.000 arquivos.");
  const root = String(files[0].webkitRelativePath || "").split("/")[0];
  const descriptors = files.map(file => {
    const relative = String(file.webkitRelativePath || file.name).replace(/\\/g, "/");
    const path = root && relative.startsWith(`${root}/`) ? relative.slice(root.length + 1) : relative;
    if (!path || path.length > 500 || path.split("/").length > 32 || path.split("/").some(part =>
      !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) || part.toLowerCase() === ".merlin-install.json")) {
      throw new Error(`Caminho inválido na pasta: ${relative}`);
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 30 * 1024 ** 3) throw new Error(`Tamanho inválido: ${relative}`);
    return { file, path };
  });
  const total = descriptors.reduce((sum, entry) => sum + entry.file.size, 0);
  if (!total || total > 200 * 1024 ** 3) throw new Error("A pasta precisa conter dados e não pode ultrapassar 200 GiB.");
  const paths = new Set();
  for (const { path } of descriptors) {
    const normalized = path.toLowerCase();
    if (paths.has(normalized)) throw new Error(`Caminho duplicado: ${path}`);
    paths.add(normalized);
  }
  for (const { path } of descriptors) {
    const parts = path.toLowerCase().split("/");
    for (let i = 1; i < parts.length; i++) if (paths.has(parts.slice(0, i).join("/"))) throw new Error(`Conflito entre arquivo e pasta: ${path}`);
  }
  return descriptors;
}

export async function discardFolderUpload(gameId, apiRequest) {
  return withUploadLock(gameId, () => discardFolderUploadUnlocked(gameId, apiRequest));
}
async function discardFolderUploadUnlocked(gameId, apiRequest) {
  const stored = await loadUploadCheckpoint(gameId);
  if (stored?.serverSessionId) {
    await apiRequest(`${ROOT}/sessions/${stored.serverSessionId}/cancel`, { method: "POST", mutate: true });
  }
  await deleteUploadCheckpoint(gameId);
}

function withUploadLock(gameId, action) {
  if (globalThis.navigator?.locks) {
    return navigator.locks.request(`merlin-upload:${gameId}`, { ifAvailable: true }, lock => {
      if (!lock) throw new Error("Este jogo já está sendo enviado em outra aba.");
      return action();
    });
  }
  return action();
}

export async function runCustomGameFolderUpload({ files, gameId, signal, apiRequest, apiUpload, onProgress, onSession,
  prepareBundle, readFile = readFileForUpload, signedUpload = uploadSignedPart }) {
  const execute = async () => {
    const descriptors = folderDescriptors(files);
    const plan = createFolderUploadPlan(descriptors);
    let checkpoint = await loadUploadCheckpoint(gameId);
    if (checkpoint && (checkpoint.fingerprint !== plan.fingerprint || checkpoint.planVersion !== plan.version)) {
      throw new Error("A pasta mudou desde o envio anterior. Descarte o envio pendente antes de selecionar outra pasta.");
    }
    checkpoint ||= { fingerprint: plan.fingerprint, planVersion: plan.version, manifestId: crypto.randomUUID() };
    const session = await apiRequest(`${ROOT}/sessions`, { method: "POST", mutate: true,
      body: { gameId, fingerprint: plan.fingerprint, planVersion: plan.version, sessionId: checkpoint.serverSessionId } });
    checkpoint.serverSessionId = session.sessionId;
    if (session.manifestId) checkpoint.manifestId = session.manifestId;
    if (session.manifestKey) checkpoint.manifestKey = session.manifestKey;
    await saveUploadCheckpoint(gameId, checkpoint);
    onSession?.(checkpoint);
    const sessionRoot = `${ROOT}/sessions/${session.sessionId}`;
    if (session.manifestKey || checkpoint.manifestKey) return { key: session.manifestKey || checkpoint.manifestKey, sizeBytes: descriptors.reduce((sum, e) => sum + e.file.size, 0) };
    const unitCheckpoints = await loadUploadUnitCheckpoints(gameId);
    const resumePersistent = await storageAvailable();
    const serverObjects = new Map((session.objects || []).map(object => [object.clientId, object]));
    const progress = createFolderUploadProgress(plan.units);
    progress.setTransport(session.transport);
    const limit = createTransferLimiter(4);
    const uploadStartedAt = performance.now();
    const metrics = { retries: 0, transport: session.transport, uploadMs: 0, completeMs: 0, readMs: 0, hashMs: 0,
      bundlePreparationMs: 0, bundleReadMs: 0, bundleHashAndZipMs: 0, partRequests: 0 };
    let lastReport = 0;
    const report = (force = false, extra = {}) => {
      const now = performance.now();
      if (!force && now - lastReport < 250) return;
      lastReport = now;
      const snapshot = progress.snapshot(extra);
      snapshot.resumePersistent = resumePersistent;
      onProgress?.(snapshot);
    };
    const updateUnit = async (unit, value) => {
      unitCheckpoints[unit.id] = { ...unitCheckpoints[unit.id], ...value };
      await saveUploadUnitCheckpoint(gameId, unit.id, unitCheckpoints[unit.id]);
    };
    for (const unit of plan.units) {
      const remote = serverObjects.get(unit.id);
      const local = unitCheckpoints[unit.id];
      if (remote?.completed && local?.sha256 && remote.sha256 === local.sha256 && local.metadata) {
        local.result = { key: remote.key, sizeBytes: remote.sizeBytes };
        progress.restore(unit);
      } else {
        if (local?.result) delete local.result;
        if (local?.parts && local.key === remote?.key && local.uploadId === remote.uploadId) {
          progress.baseline(unit, local.parts.reduce((sum, part, index) => sum + (part ? Math.min(local.partSize, remote.sizeBytes - index * local.partSize) : 0), 0));
        }
      }
    }
    const retry = async (action, taskSignal) => {
      for (let attempt = 0; ; attempt++) {
        if (taskSignal?.aborted) throw canceled();
        try { return await action(attempt); } catch (error) {
          if (taskSignal?.aborted || attempt >= 3 || [400, 401, 409, 413].includes(error.status)) throw error;
          metrics.retries++;
          await pause(700 * (attempt + 1), taskSignal);
        }
      }
    };
    const timer = setInterval(() => report(), 1000);
    try {
      await runFolderUploadPipeline({ units: plan.units, signal, prepareBundle,
        prepareConcurrency: 2, uploadConcurrency: 2, maxPreparedBytes: 400 * 1024 ** 2,
        isComplete: unit => Boolean(unitCheckpoints[unit.id]?.result),
        onState: state => {
          for (const unit of plan.units) {
            const prepared = state.preparedByUnit?.[unit.id];
            if (prepared) progress.prepared(unit, prepared.bytes, prepared.files);
          }
          report();
        },
        onTiming: (unit, timing) => {
          progress.timing(unit, timing);
          metrics.bundlePreparationMs += timing.durationMs || 0;
          metrics.bundleReadMs += timing.readWaitMs || 0;
          metrics.bundleHashAndZipMs += timing.hashAndZipMs || 0;
        },
        onPrepared: async (unit, prepared) => {
          await updateUnit(unit, { sha256: prepared.sha256,
            metadata: { kind: "bundle", sizeBytes: prepared.blob.size, sha256: prepared.sha256, files: prepared.files } });
          progress.prepared(unit, unit.bytes, unit.entries.length);
          report(true);
        },
        uploadUnit: async (unit, prepared, _index, taskSignal) => {
          const blob = prepared?.blob || unit.entries[0].file;
          const saved = unitCheckpoints[unit.id] || {};
          const started = await retry(() => apiRequest(`${sessionRoot}/objects/initiate`, { method: "POST", mutate: true,
            body: { clientId: unit.id, filename: blob.name || "merlin-bundle.zip", sizeBytes: blob.size, sha256: saved.sha256 }, signal: taskSignal }), taskSignal);
          const sameMultipart = saved.key === started.key && saved.uploadId === started.uploadId;
          await updateUnit(unit, { key: started.key, uploadId: started.uploadId, partSize: started.partSize,
            parts: sameMultipart ? saved.parts || [] : [], result: undefined });
          if (started.completed && saved.sha256) {
            await updateUnit(unit, { result: { key: started.key, sizeBytes: blob.size } });
            progress.complete(unit); report(true); return;
          }
          const partSize = started.partSize || session.partSize;
          const count = Math.ceil(blob.size / partSize);
          const parts = unitCheckpoints[unit.id].parts || [];
          if (parts.length > count) throw new Error("Os checkpoints do arquivo não correspondem ao pacote atual.");
          const loaded = Array.from({ length: count }, (_, index) => parts[index] ? Math.min(partSize, blob.size - index * partSize) : 0);
          const reportPart = () => { progress.sent(unit, loaded.reduce((sum, n) => sum + n, 0)); report(); };
          reportPart();
          const signedBatches = new Map();
          const signedPart = async (index, refresh) => {
            const batchIndex = Math.floor(index / 16);
            if (refresh) signedBatches.delete(batchIndex);
            if (!signedBatches.has(batchIndex)) {
              const numbers = Array.from({ length: Math.min(16, count - batchIndex * 16) }, (_, i) => batchIndex * 16 + i + 1);
              const signed = apiRequest(`${sessionRoot}/objects/sign`, { method: "POST", mutate: true,
                body: { clientId: unit.id, partNumbers: numbers }, signal: taskSignal });
              signed.catch(() => signedBatches.delete(batchIndex));
              signedBatches.set(batchIndex, signed);
            }
            const batch = await signedBatches.get(batchIndex);
            return batch.parts.find(part => part.partNumber === index + 1).url;
          };
          const sendPart = async (index, chunk) => {
            if (parts[index]) return;
            let result;
            const uploadStarted = performance.now();
            result = await retry(async attempt => {
              loaded[index] = 0; reportPart();
              return limit(async () => {
                if (taskSignal.aborted) throw canceled();
                metrics.partRequests++;
                let response;
                if (session.transport === "direct" && attempt < 3) {
                  const url = await signedPart(index, attempt > 0);
                  response = await signedUpload(url, chunk, { signal: taskSignal,
                    onProgress: bytes => { loaded[index] = Math.min(chunk.size, bytes); reportPart(); } });
                } else {
                  response = await apiUpload(`${sessionRoot}/objects/part?clientId=${encodeURIComponent(unit.id)}&partNumber=${index + 1}`, chunk,
                    { mutate: true, headers: { "Content-Type": "application/octet-stream" }, timeoutMs: 900000, signal: taskSignal,
                      onProgress: ({ loaded: bytes }) => { loaded[index] = Math.min(chunk.size, bytes); reportPart(); } });
                }
                return { partNumber: index + 1, etag: response.etag };
              }, taskSignal);
            }, taskSignal);
            metrics.uploadMs += performance.now() - uploadStarted;
            parts[index] = result;
            loaded[index] = chunk.size;
            await updateUnit(unit, { parts });
            reportPart();
          };
          if (unit.kind === "file" && !saved.sha256) {
            const hashed = await readFile(blob, { partSize, completed: parts.map(Boolean), signal: taskSignal, onPart: sendPart,
              onProgress: bytes => { progress.prepared(unit, bytes, bytes === blob.size ? 1 : 0); report(); } });
            metrics.readMs += hashed.readMs || 0;
            metrics.hashMs += hashed.hashMs || 0;
            await updateUnit(unit, { sha256: hashed.sha256, metadata: { kind: "file", path: unit.entries[0].path, sizeBytes: blob.size, sha256: hashed.sha256 } });
          } else {
            let next = 0;
            await Promise.all(Array.from({ length: Math.min(2, count) }, async () => {
              while (next < count) {
                const index = next++;
                if (!parts[index]) await sendPart(index, blob.slice(index * partSize, Math.min(blob.size, (index + 1) * partSize)));
              }
            }));
          }
          const completeStarted = performance.now();
          const current = unitCheckpoints[unit.id];
          const result = await retry(() => apiRequest(`${sessionRoot}/objects/complete`, { method: "POST", mutate: true,
            body: { clientId: unit.id, parts, sizeBytes: blob.size, sha256: current.sha256 }, signal: taskSignal }), taskSignal);
          metrics.completeMs += performance.now() - completeStarted;
          await updateUnit(unit, { result: { key: result.key, sizeBytes: blob.size } });
          progress.complete(unit);
          report(true);
        },
      });
      if (signal?.aborted) throw canceled();
      clearInterval(timer);
      report(true, { label: "Conferindo arquivos enviados", finalizing: true, etaSeconds: null, etaHint: null });
      const entries = plan.units.map(unit => {
        const saved = unitCheckpoints[unit.id];
        if (!saved?.result || !saved.metadata) throw new Error("Ainda existem arquivos sem confirmação de envio.");
        return { ...saved.metadata, key: saved.result.key };
      });
      const manifest = await retry(() => apiRequest(`${ROOT}/folder/complete`, { method: "POST", mutate: true, signal,
        body: { gameId, sessionId: session.sessionId, manifestId: checkpoint.manifestId,
          files: entries.filter(e => e.kind === "file"), bundles: entries.filter(e => e.kind === "bundle") } }), signal);
      checkpoint.manifestKey = manifest.key;
      checkpoint.totalSizeBytes = manifest.sizeBytes;
      metrics.elapsedMs = performance.now() - uploadStartedAt;
      checkpoint.metrics = metrics;
      await saveUploadCheckpoint(gameId, checkpoint);
      console.info("[CustomGames upload]", { sessionId: session.sessionId, objects: plan.units.length, files: descriptors.length, ...metrics });
      return { key: manifest.key, sizeBytes: manifest.sizeBytes };
    } catch (error) {
      if (signal?.aborted) {
        await discardFolderUploadUnlocked(gameId, apiRequest);
      }
      throw error;
    } finally { clearInterval(timer); }
  };
  return withUploadLock(gameId, execute);
}
