import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteUploadCheckpoint, fingerprintFolderEntries, listUploadCheckpoints,
  deleteUploadUnitCheckpoints, loadUploadCheckpoint, loadUploadUnitCheckpoints,
  saveUploadCheckpoint, saveUploadUnitCheckpoint, storageAvailable,
} from "./custom-game-upload-store.js";

test("memory fallback preserves serializable multipart state without keeping caller references", async () => {
  assert.equal(await storageAvailable(), false);
  const checkpoint = {
    fingerprint: "abc", planVersion: "bundles-v2", serverSessionId: "session-1", manifestId: "manifest-1",
    units: { "bundle-1": { key: "games/1/bundle-1.zip", sha256: "checksum", files: [{ path: "a.bin", sizeBytes: 32 }] } },
    multipart: { key: "games/1/bundle-2.zip", uploadId: "multipart-2", partSize: 128, sizeBytes: 512, parts: [{ partNumber: 1, etag: "etag-1" }] },
    totals: { bytes: 512 }, timings: { startedAt: 123 }, unused: undefined,
  };
  const saving = saveUploadCheckpoint("game-roundtrip", checkpoint);
  checkpoint.multipart.parts[0].etag = "changed-after-save";
  const saved = await saving;
  assert.equal(saved.multipart.parts[0].etag, "etag-1");
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.gameId, "game-roundtrip");
  assert.equal(saved.checkpointKey, '["game-roundtrip","abc","bundles-v2"]');
  assert.equal("unused" in saved, false);
  const loaded = await loadUploadCheckpoint("game-roundtrip");
  assert.deepEqual(loaded, saved);
  loaded.units["bundle-1"].files[0].path = "modified";
  assert.equal((await loadUploadCheckpoint("game-roundtrip")).units["bundle-1"].files[0].path, "a.bin");
  assert.ok((await listUploadCheckpoints()).some(item => item.gameId === "game-roundtrip"));
  await deleteUploadCheckpoint("game-roundtrip");
  assert.equal(await loadUploadCheckpoint("game-roundtrip"), null);
});

test("concurrent save/delete/save calls preserve their invocation order", async () => {
  const operations = [
    saveUploadCheckpoint("game-order", { fingerprint: "one", sequence: 1 }),
    saveUploadCheckpoint("game-order", { fingerprint: "two", sequence: 2 }),
    deleteUploadCheckpoint("game-order"),
    saveUploadCheckpoint("game-order", { fingerprint: "three", sequence: 3 }),
  ];
  await Promise.all(operations);
  assert.equal((await loadUploadCheckpoint("game-order")).sequence, 3);
  await deleteUploadCheckpoint("game-order");
});

test("per-unit checkpoints update independently and deleting a game clears only its units", async () => {
  await saveUploadCheckpoint("game-units", { fingerprint: "folder-1", planVersion: 1 });
  await Promise.all([
    saveUploadUnitCheckpoint("game-units", "direct-1", { multipart: { parts: [{ partNumber: 1, etag: "a" }] } }),
    saveUploadUnitCheckpoint("game-units", "bundle-1", { completed: true, files: [{ path: "member.bin", sha256: "abc" }] }),
    saveUploadUnitCheckpoint("other-game", "direct-1", { completed: true }),
    saveUploadUnitCheckpoint("game-units", "direct-1", { multipart: { parts: [{ partNumber: 1, etag: "a" }, { partNumber: 2, etag: "b" }] } }),
  ]);
  let units = await loadUploadUnitCheckpoints("game-units");
  assert.equal(Object.keys(units).length, 2);
  assert.equal(units["direct-1"].multipart.parts.length, 2);
  assert.equal(units["bundle-1"].files[0].path, "member.bin");
  assert.equal((await loadUploadCheckpoint("game-units")).units, undefined);
  units["bundle-1"].files[0].path = "caller-mutation";
  assert.equal((await loadUploadUnitCheckpoints("game-units"))["bundle-1"].files[0].path, "member.bin");
  await deleteUploadCheckpoint("game-units");
  assert.deepEqual(await loadUploadUnitCheckpoints("game-units"), {});
  assert.equal((await loadUploadUnitCheckpoints("other-game"))["direct-1"].completed, true);
  await deleteUploadUnitCheckpoints("other-game");
  assert.deepEqual(await loadUploadUnitCheckpoints("other-game"), {});
});

test("changing folder identity discards old unit checkpoints before saving a new session", async () => {
  await saveUploadCheckpoint("game-replaced", { fingerprint: "folder-one", planVersion: 1 });
  await saveUploadUnitCheckpoint("game-replaced", "one", { completed: true });
  await saveUploadCheckpoint("game-replaced", { fingerprint: "folder-one", planVersion: 1, serverSessionId: "same-plan" });
  assert.equal((await loadUploadUnitCheckpoints("game-replaced")).one.completed, true);
  await saveUploadCheckpoint("game-replaced", { fingerprint: "folder-two", planVersion: 1 });
  assert.deepEqual(await loadUploadUnitCheckpoints("game-replaced"), {});
  await saveUploadUnitCheckpoint("game-replaced", "two", { completed: true });
  await saveUploadCheckpoint("game-replaced", { fingerprint: "folder-two", planVersion: 2 });
  assert.deepEqual(await loadUploadUnitCheckpoints("game-replaced"), {});
  await deleteUploadCheckpoint("game-replaced");
});

test("checkpoints reject binary content and cycles instead of filling persistent storage", async () => {
  await assert.rejects(saveUploadCheckpoint("game-invalid", { blob: new Blob(["binary"]) }), /metadata/);
  await assert.rejects(saveUploadCheckpoint("game-invalid", { bytes: new Uint8Array([1, 2]) }), /metadata/);
  await assert.rejects(saveUploadCheckpoint("game-invalid", { invalid: Infinity }), /finite/);
  const circular = {}; circular.self = circular;
  await assert.rejects(saveUploadCheckpoint("game-invalid", circular), /circular/);
  assert.equal(await loadUploadCheckpoint("game-invalid"), null);
});

test("folder identity is deterministic across order and Windows path separators", async () => {
  const first = await fingerprintFolderEntries([
    { path: "Data\\two.bin", file: { size: 20, lastModified: 2 } },
    { path: "./one.bin", file: { size: 10, lastModified: 1 } },
  ], "plan-2");
  const second = await fingerprintFolderEntries([
    { path: "one.bin", sizeBytes: 10, lastModified: 1 },
    { path: "Data/two.bin", sizeBytes: 20, lastModified: 2 },
  ], "plan-2");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  for (const replacement of [
    { path: "one.bin", sizeBytes: 11, lastModified: 1 },
    { path: "one.bin", sizeBytes: 10, lastModified: 3 },
    { path: "One.bin", sizeBytes: 10, lastModified: 1 },
  ]) {
    assert.notEqual(first, await fingerprintFolderEntries([replacement, { path: "Data/two.bin", sizeBytes: 20, lastModified: 2 }], "plan-2"));
  }
  assert.notEqual(first, await fingerprintFolderEntries([
    { path: "one.bin", sizeBytes: 10, lastModified: 1 },
    { path: "Data/two.bin", sizeBytes: 20, lastModified: 2 },
  ], "plan-3"));
  await assert.rejects(fingerprintFolderEntries([{ path: "bad.bin", sizeBytes: -1 }], 1), /valid byte size/);
});
