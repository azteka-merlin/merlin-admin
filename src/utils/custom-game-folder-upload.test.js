import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createFolderBundle } from "./folder-bundles.js";
import { runCustomGameFolderUpload, folderDescriptors, folderDescriptorsAsync, discardFolderUpload } from "./custom-game-folder-upload.js";
import { loadUploadCheckpoint, loadUploadUnitCheckpoints, deleteUploadCheckpoint, saveUploadCheckpoint } from "./custom-game-upload-store.js";
import { createTransferLimiter } from "./custom-game-transfer.js";

function fixture() {
  const objects = new Map();
  const calls = { initiate: 0, parts: 0, complete: 0, manifest: 0, metadata: 0, cancel: 0, sign: 0 };
  const session = { sessionId: crypto.randomUUID(), partSize: 64 * 1024 ** 2, transport: "proxy", objects: [] };
  let firstUploadId = null;
  let loseComplete = false;
  let resetMultipart = false;
  let failPart = false;
  let loseMetadata = false;
  let processing = false;
  let interruptFinalization = false;
  let activeMetadata = 0;
  let maxMetadata = 0;
  const metadata = new Map();
  const request = async (path, options = {}) => {
    if (path.endsWith("/sessions")) return { ...session, objects: [...objects.values()] };
    if (path.endsWith(`/sessions/${session.sessionId}`)) return { ...session, status: "open", objects: [...objects.values()] };
    if (path.endsWith("/objects/sign")) {
      calls.sign++;
      return { parts: options.body.partNumbers.map(partNumber => ({ partNumber, url: `https://fixture.invalid/part/${partNumber}` })) };
    }
    if (path.endsWith("/initiate")) {
      calls.initiate++;
      const { clientId, sizeBytes } = options.body;
      if (!objects.has(clientId)) {
        const object = { clientId, key: `fixture/files/${crypto.randomUUID()}`, uploadId: crypto.randomUUID(), sizeBytes };
        firstUploadId ||= object.uploadId;
        objects.set(clientId, object);
      }
      return { ...objects.get(clientId), partSize: session.partSize };
    }
    if (path.endsWith("/objects/complete")) {
      calls.complete++;
      const object = objects.get(options.body.clientId);
      if (resetMultipart) {
        resetMultipart = false;
        object.uploadId = crypto.randomUUID();
        throw Object.assign(new Error("Uma parte deste arquivo não foi reconhecida pelo R2."), {
          status: 409, code: "multipart_parts_reset", uploadId: object.uploadId,
        });
      }
      object.completed = true; object.sha256 = options.body.sha256;
      if (loseComplete) { loseComplete = false; throw new Error("response lost"); }
      return { ...object };
    }
    if (/\/metadata\/batches\/\d+$/.test(path)) {
      calls.metadata++;
      const index = Number(path.split("/").pop());
      const old = metadata.get(index);
      if (old) assert.deepEqual(old, options.body.entries);
      activeMetadata++;
      maxMetadata = Math.max(maxMetadata, activeMetadata);
      await new Promise(resolve => setTimeout(resolve, 5));
      metadata.set(index, options.body.entries);
      activeMetadata--;
      if (loseMetadata) { loseMetadata = false; throw new Error("metadata response lost"); }
      return { success: true };
    }
    if (path.endsWith("/metadata/complete")) {
      calls.manifest++;
      assert.equal(options.body.batchCount, metadata.size);
      if (interruptFinalization) {
        interruptFinalization = false; session.status = "finalizing";
        throw Object.assign(new Error("interrupted"), { status: 400 });
      }
      if (processing) { processing = false; return { status: "processing" }; }
      const entries = [...metadata.values()].flat();
      assert.ok(entries.every(entry => [...objects.values()].some(o => o.key === entry.key && o.sha256 === entry.sha256)));
      return { status: "complete", key: "fixture/manifests/manifest.json", sizeBytes: entries.reduce((sum, e) => sum + (e.kind === "bundle" ? e.files.reduce((s, f) => s + f.sizeBytes, 0) : e.sizeBytes), 0) };
    }
    if (path.endsWith("/cancel")) { calls.cancel++; return { success: true }; }
    throw new Error(`Unexpected request ${path}`);
  };
  const upload = async (_path, body, options) => {
    calls.parts++;
    if (failPart) throw Object.assign(new Error("temporary upload failure"), { status: 400 });
    options.onProgress({ loaded: body.size });
    return { etag: createHash("md5").update(Buffer.from(await body.arrayBuffer())).digest("hex") };
  };
  return { request, upload, calls, objects, session,
    loseComplete: () => { loseComplete = true; }, resetMultipart: () => { resetMultipart = true; },
    firstUploadId: () => firstUploadId, failParts: value => { failPart = value; },
    loseMetadata: () => { loseMetadata = true; }, processOnce: () => { processing = true; },
    interruptFinalization: () => { interruptFinalization = true; }, maxMetadata: () => maxMetadata };
}
const files = () => [Object.assign(new Blob([new Uint8Array(1024 * 1024)]), { name: "data.bin", webkitRelativePath: "Game/data.bin", lastModified: 123 })];
const prepareBundle = (entries, options) => createFolderBundle(entries, options.signal);

test("retries identical metadata after response loss and resumes finalization", async () => {
  const gameId = crypto.randomUUID(); const fake = fixture();
  fake.loseMetadata(); fake.processOnce();
  try {
    const result = await runCustomGameFolderUpload({ files: files(), gameId, apiRequest: fake.request, apiUpload: fake.upload, prepareBundle });
    assert.equal(result.key, "fixture/manifests/manifest.json");
    assert.equal(fake.calls.parts, 1);
    assert.equal(fake.calls.manifest, 2);
  } finally { await deleteUploadCheckpoint(gameId); }
});

test("resumes finalization by replaying bounded metadata without reuploading game data", async () => {
  const gameId = crypto.randomUUID(); const fake = fixture(); fake.interruptFinalization();
  const options = { files: files(), gameId, apiRequest: fake.request, apiUpload: fake.upload, prepareBundle };
  try {
    await assert.rejects(runCustomGameFolderUpload(options), /interrupted/);
    const metadataRequests = fake.calls.metadata;
    const result = await runCustomGameFolderUpload(options);
    assert.equal(result.key, "fixture/manifests/manifest.json");
    assert.equal(fake.calls.parts, 1);
    assert.equal(fake.calls.metadata, metadataRequests + 1);
  } finally { await deleteUploadCheckpoint(gameId); }
});

test("folder selection explains an empty folder and reports the actual count above the limit", () => {
  assert.throws(() => folderDescriptors([]), /não contém arquivos/);
  assert.throws(() => folderDescriptors(new Array(500001)), /500\.001 arquivos.*limite é de 500\.000/);
});

test("uploads large folder metadata with bounded concurrency", async () => {
  const gameId = crypto.randomUUID();
  const fake = fixture();
  const source = Array.from({ length: 900 }, (_, index) => Object.assign(
    new Blob([new Uint8Array([index % 251])]),
    { name: `asset-${index}.bin`, webkitRelativePath: `Game/romfs/asset-${index}.bin`, lastModified: index + 1 },
  ));
  try {
    const result = await runCustomGameFolderUpload({ files: source, gameId, apiRequest: fake.request,
      apiUpload: fake.upload, prepareBundle });
    assert.equal(result.key, "fixture/manifests/manifest.json");
    assert.ok(fake.calls.metadata > 1);
    assert.ok(fake.maxMetadata() > 1);
    assert.ok(fake.maxMetadata() <= 4);
    assert.equal(fake.calls.manifest, 1);
  } finally { await deleteUploadCheckpoint(gameId); }
});

test("folder upload retries a lost completion response without sending the object again", async () => {
  const gameId = crypto.randomUUID();
  const fake = fixture(); fake.loseComplete();
  try {
    const result = await runCustomGameFolderUpload({ files: files(), gameId, apiRequest: fake.request, apiUpload: fake.upload, prepareBundle });
    assert.equal(result.key, "fixture/manifests/manifest.json");
    assert.equal(fake.calls.parts, 1);
    assert.equal(fake.calls.complete, 2);
    assert.equal((await loadUploadCheckpoint(gameId)).manifestKey, result.key);
    assert.ok(Object.values(await loadUploadUnitCheckpoints(gameId))[0].metadata.sha256);
  } finally { await deleteUploadCheckpoint(gameId); }
});

test("missing R2 multipart part retries only that object from the selected file", async () => {
  const gameId = crypto.randomUUID();
  const fake = fixture(); fake.resetMultipart();
  try {
    const result = await runCustomGameFolderUpload({ files: files(), gameId, apiRequest: fake.request,
      apiUpload: fake.upload, prepareBundle });
    const originalUploadId = fake.firstUploadId();
    assert.equal(result.key, "fixture/manifests/manifest.json");
    assert.equal(fake.calls.initiate, 1);
    assert.equal(fake.calls.parts, 2);
    assert.equal(fake.calls.complete, 2);
    const checkpoint = Object.values(await loadUploadUnitCheckpoints(gameId))[0];
    assert.ok(checkpoint.uploadId);
    assert.notEqual(checkpoint.uploadId, originalUploadId);
  } finally { await deleteUploadCheckpoint(gameId); }
});

test("reload resumes the same multipart and refuses a changed folder", async () => {
  const gameId = crypto.randomUUID();
  const fake = fixture(); fake.failParts(true);
  const options = { files: files(), gameId, apiRequest: fake.request, apiUpload: fake.upload, prepareBundle };
  try {
    await assert.rejects(runCustomGameFolderUpload(options), /temporary upload failure/);
    const before = await loadUploadUnitCheckpoints(gameId);
    assert.equal(fake.calls.cancel, 0);
    const changed = files(); changed[0].lastModified++;
    await assert.rejects(runCustomGameFolderUpload({ ...options, files: changed }), /pasta mudou/);
    fake.failParts(false);
    await runCustomGameFolderUpload(options);
    const after = await loadUploadUnitCheckpoints(gameId);
    assert.equal(Object.values(before)[0].uploadId, Object.values(after)[0].uploadId);
  } finally { await deleteUploadCheckpoint(gameId); }
});

test("cancel aborts only its saved session and clears local checkpoints", async () => {
  const gameId = crypto.randomUUID();
  const fake = fixture(); fake.failParts(true);
  await assert.rejects(runCustomGameFolderUpload({ files: files(), gameId, apiRequest: fake.request, apiUpload: fake.upload, prepareBundle }));
  await discardFolderUpload(gameId, fake.request);
  assert.equal(fake.calls.cancel, 1);
  assert.equal(await loadUploadCheckpoint(gameId), null);
  assert.deepEqual(await loadUploadUnitCheckpoints(gameId), {});
});

test("discard cleans an unlinked package when cancellation races finalization", async () => {
  const gameId = crypto.randomUUID();
  const serverSessionId = crypto.randomUUID();
  const manifestKey = `${gameId}/manifests/${crypto.randomUUID()}.json`;
  await saveUploadCheckpoint(gameId, { fingerprint: "a".repeat(64), planVersion: 2,
    manifestId: crypto.randomUUID(), serverSessionId });
  const calls = [];
  const apiRequest = async (path, options = {}) => {
    calls.push({ path, options });
    if (path.endsWith("/cancel")) throw new Error("Este pacote já está sendo finalizado e não pode ser cancelado.");
    if (path === `/panel-api/custom-games/upload/sessions/${serverSessionId}`) {
      return { status: "finalized", manifestKey };
    }
    if (path.endsWith("/discard")) return { success: true };
    throw new Error(`Unexpected request ${path}`);
  };
  await discardFolderUpload(gameId, apiRequest);
  assert.deepEqual(calls.map(call => call.path), [
    `/panel-api/custom-games/upload/sessions/${serverSessionId}/cancel`,
    `/panel-api/custom-games/upload/sessions/${serverSessionId}`,
    "/panel-api/custom-games/upload/discard",
  ]);
  assert.deepEqual(calls[2].options.body, { key: manifestKey });
  assert.equal(await loadUploadCheckpoint(gameId), null);
});

test("direct uploads obtain URLs in batches and keep the same completion contract", async () => {
  const gameId = crypto.randomUUID();
  const fake = fixture();
  fake.session.transport = "direct";
  fake.session.partSize = 1024;
  let signedParts = 0;
  const source = [Object.assign(new Blob([new Uint8Array(8 * 1024)]), { name: "data.bin", webkitRelativePath: "Game/data.bin", lastModified: 1 })];
  try {
    await runCustomGameFolderUpload({ files: source, gameId, apiRequest: fake.request, apiUpload: fake.upload, prepareBundle,
      signedUpload: async (_url, blob, options) => {
        signedParts++;
        options.onProgress(blob.size);
        return { etag: "signed-etag" };
      } });
    assert.ok(signedParts > 1);
    assert.equal(fake.calls.sign, 1);
    assert.equal(fake.calls.parts, 0);
    assert.equal(fake.calls.complete, 1);
  } finally { await deleteUploadCheckpoint(gameId); }
});

test("global part limiter caps concurrency across different files", async () => {
  const limit = createTransferLimiter(4);
  let active = 0, maximum = 0;
  await Promise.all(Array.from({ length: 16 }, () => limit(async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
  })));
  assert.equal(maximum, 4);
});

test("folder validation preserves path safety and accepts empty members", () => {
  assert.equal(folderDescriptors([...files(), Object.assign(new Blob([]), { name: "empty.bin", webkitRelativePath: "Game/empty.bin" })]).length, 2);
  const bad = files(); bad[0].webkitRelativePath = "Game/../outside.bin";
  assert.throws(() => folderDescriptors(bad), /Caminho inválido/);
});

test("chunked folder validation matches the existing path and size checks", async () => {
  const selected = [...files(), Object.assign(new Blob([]), { name: "empty.bin", webkitRelativePath: "Game/empty.bin" })];
  const sync = folderDescriptors(selected);
  const asyncResult = await folderDescriptorsAsync(selected);
  assert.deepEqual(asyncResult.map(entry => entry.path), sync.map(entry => entry.path));
  const invalid = files(); invalid[0].webkitRelativePath = "Game/../outside.bin";
  await assert.rejects(folderDescriptorsAsync(invalid), /Caminho inválido/);
});

test("folder validation accepts a 30,000-file game manifest", () => {
  const entries = Array.from({ length: 30_000 }, (_, index) => ({
    name: `file-${index}.bin`, size: 1, webkitRelativePath: `Bloodborne/file-${index}.bin`,
  }));
  assert.equal(folderDescriptors(entries).length, 30_000);
});

test("folder selection accepts exactly 500,000 distinct files and rejects 500,001", () => {
  const files = Array.from({ length: 500000 }, (_, index) => ({
    name: index + ".bin", webkitRelativePath: "Game/data/" + index + ".bin", size: 1
  }));
  assert.equal(folderDescriptors(files).length, 500000);
  assert.throws(() => folderDescriptors([...files, { name: "extra.bin", webkitRelativePath: "Game/extra.bin", size: 1 }]),
    /500\.001 arquivos.*limite é de 500\.000/);
});
