import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createFolderBundle } from "./folder-bundles.js";
import { runCustomGameFolderUpload, folderDescriptors, discardFolderUpload } from "./custom-game-folder-upload.js";
import { loadUploadCheckpoint, loadUploadUnitCheckpoints, deleteUploadCheckpoint } from "./custom-game-upload-store.js";
import { createTransferLimiter } from "./custom-game-transfer.js";

function fixture() {
  const objects = new Map();
  const calls = { initiate: 0, parts: 0, complete: 0, manifest: 0, cancel: 0, sign: 0 };
  const session = { sessionId: crypto.randomUUID(), partSize: 64 * 1024 ** 2, transport: "proxy", objects: [] };
  let loseComplete = false;
  let failPart = false;
  const request = async (path, options = {}) => {
    if (path.endsWith("/sessions")) return { ...session, objects: [...objects.values()] };
    if (path.endsWith("/objects/sign")) {
      calls.sign++;
      return { parts: options.body.partNumbers.map(partNumber => ({ partNumber, url: `https://fixture.invalid/part/${partNumber}` })) };
    }
    if (path.endsWith("/initiate")) {
      calls.initiate++;
      const { clientId, sizeBytes } = options.body;
      if (!objects.has(clientId)) objects.set(clientId, { clientId, key: `fixture/files/${crypto.randomUUID()}`, uploadId: crypto.randomUUID(), sizeBytes });
      return { ...objects.get(clientId), partSize: session.partSize };
    }
    if (path.endsWith("/objects/complete")) {
      calls.complete++;
      const object = objects.get(options.body.clientId);
      object.completed = true; object.sha256 = options.body.sha256;
      if (loseComplete) { loseComplete = false; throw new Error("response lost"); }
      return { ...object };
    }
    if (path.endsWith("/folder/complete")) {
      calls.manifest++;
      assert.ok(options.body.bundles.every(bundle => objects.size && [...objects.values()].some(o => o.key === bundle.key && o.sha256 === bundle.sha256)));
      return { key: "fixture/manifests/manifest.json", sizeBytes: options.body.bundles.flatMap(b => b.files).reduce((sum, f) => sum + f.sizeBytes, 0) };
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
    loseComplete: () => { loseComplete = true; }, failParts: value => { failPart = value; } };
}
const files = () => [Object.assign(new Blob([new Uint8Array(1024 * 1024)]), { name: "data.bin", webkitRelativePath: "Game/data.bin", lastModified: 123 })];
const prepareBundle = (entries, options) => createFolderBundle(entries, options.signal);

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
