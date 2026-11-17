import test from "node:test";
import assert from "node:assert/strict";
import { folderMetadataBatches } from "./folder-metadata-batches.js";

test("bounded deterministic metadata batches preserve all 500,000 unicode paths", () => {
  const units = []; const checkpoints = {}; const expected = 500000;
  for (let start = 0; start < expected; start += 3000) {
    const id = String(start); units.push({ id });
    const files = Array.from({ length: Math.min(3000, expected - start) }, (_, i) => ({
      path: `game/áudio/arquivo-${String(start + i).padStart(6, "0")}.bin`, sizeBytes: 1, sha256: "a".repeat(64),
    }));
    checkpoints[id] = { result: { key: `fixture/${id}` }, metadata: { kind: "bundle", sizeBytes: files.length,
      sha256: "b".repeat(64), files } };
  }
  let count = 0; let batches = 0; const digest = [];
  for (const entries of folderMetadataBatches(units, checkpoints, "f".repeat(36))) {
    assert.ok(new TextEncoder().encode(JSON.stringify({ manifestId: "f".repeat(36), entries })).length <= 256 * 1024);
    assert.ok(entries.reduce((n, e) => n + 1 + (e.files?.length || 0), 0) <= 500);
    count += entries.reduce((n, e) => n + (e.files?.length || 0), 0); batches++;
    digest.push(JSON.stringify(entries));
  }
  assert.equal(count, expected);
  assert.ok(batches > 1);
  let i = 0;
  for (const entries of folderMetadataBatches(units, checkpoints, "f".repeat(36))) assert.equal(JSON.stringify(entries), digest[i++]);
});

test("fragments long multibyte paths by bytes, not just entry count", () => {
  const unit = { id: "v2:0" };
  const files = Array.from({ length: 3000 }, (_, i) => ({ path: `${"界".repeat(240)}/${i}.bin`,
    sizeBytes: 1, sha256: "c".repeat(64) }));
  const checkpoints = { [unit.id]: { result: { key: "game/files/object" }, metadata: {
    kind: "bundle", sizeBytes: 3000, sha256: "d".repeat(64), files,
  } } };
  const batches = [...folderMetadataBatches([unit], checkpoints, "f".repeat(36))];
  const parts = batches.flat();
  assert.ok(parts.length > 1);
  assert.deepEqual(parts.map(part => part.fragmentIndex), parts.map((_, i) => i));
  assert.ok(parts.every(part => part.fragmentCount === parts.length && part.clientId === unit.id));
  assert.deepEqual(parts.flatMap(part => part.files), files);
  for (const entries of batches) {
    assert.ok(new TextEncoder().encode(JSON.stringify({ manifestId: "f".repeat(36), entries })).length <= 256 * 1024);
    assert.ok(entries.reduce((sum, entry) => sum + 1 + entry.files.length, 0) <= 500);
  }
});
