import test from "node:test";
import assert from "node:assert/strict";
import { createFolderUploadProgress } from "./folder-upload-progress.js";

test("resumed bytes never count as new network throughput", () => {
  let time = 0;
  const unit = { id: "large", kind: "file", bytes: 1000, entries: [{ file: { size: 1000 } }] };
  const progress = createFolderUploadProgress([unit], () => time);
  progress.baseline(unit, 900);
  progress.snapshot();
  time = 5000;
  assert.equal(progress.snapshot().speed, 0);
  progress.sent(unit, 1000);
  time = 10000;
  const result = progress.snapshot();
  assert.equal(result.bytes, 1000);
  assert.equal(result.averageSpeed, 10);
});

test("ETA waits for representative preparation samples and accounts for remaining files", () => {
  let time = 0;
  const entries = Array.from({ length: 1000 }, () => ({ file: { size: 100 } }));
  const unit = { id: "bundle", kind: "bundle", bytes: 100000, entries };
  const progress = createFolderUploadProgress([unit], () => time);
  progress.snapshot();
  time = 20000;
  progress.sent(unit, 90000);
  assert.equal(progress.snapshot().etaSeconds, null);
  progress.timing(unit, { durationMs: 1000, smallFiles: 10, smallBytes: 1000, smallDurationMs: 1000 });
  const before = progress.snapshot().etaSeconds;
  progress.prepared(unit, 90000, 900);
  const after = progress.snapshot().etaSeconds;
  assert.ok(before >= 50);
  assert.ok(after < before);
  assert.equal(progress.snapshot().preparedFiles, 900);
});
