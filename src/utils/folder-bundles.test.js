import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { BUNDLE_MAX_BYTES, createFolderBundle, planFolderBundles } from "./folder-bundles.js";

test("groups at most 3,000 files and keeps files above 200 MiB direct", () => {
  const items = Array.from({ length: 3001 }, (_, index) => ({
    path: `Data/${index}.bin`, file: { size: 1 },
  }));
  items.push({ path: "two-megabytes.bin", file: { size: 2 * 1024 ** 2 } });
  items.push({ path: "big.bin", file: { size: BUNDLE_MAX_BYTES } });
  const plan = planFolderBundles(items);
  assert.equal(plan.direct.length, 1);
  assert.deepEqual(plan.bundles.map(bundle => bundle.length), [3000, 2]);
});

test("groups 2 MiB files into packages below the 200 MiB cap", () => {
  const items = Array.from({ length: 3000 }, (_, index) => ({
    path: `Data/${index}.bin`, file: { size: 2 * 1024 ** 2 },
  }));
  const plan = planFolderBundles(items);
  assert.equal(plan.direct.length, 0);
  assert.ok(plan.bundles.length >= 30 && plan.bundles.length <= 40);
  assert.equal(plan.bundles.reduce((sum, bundle) => sum + bundle.length, 0), items.length);
  for (const bundle of plan.bundles) {
    assert.ok(bundle.reduce((sum, entry) => sum + entry.file.size + 8192, 0) <= BUNDLE_MAX_BYTES);
  }
});

test("creates stored ZIP and per-file checksums without changing folder paths", async () => {
  const entries = [
    { path: "Data/hello.txt", file: new Blob(["hello"]) },
    { path: "empty.bin", file: new Blob([]) },
  ];
  const bundle = await createFolderBundle(entries);
  const bytes = new Uint8Array(await bundle.blob.arrayBuffer());
  const unpacked = unzipSync(bytes);
  assert.equal(new TextDecoder().decode(unpacked["Data/hello.txt"]), "hello");
  assert.equal(unpacked["empty.bin"].length, 0);
  assert.equal(bundle.files.length, 2);
  assert.equal(bundle.files[0].sha256, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert.match(bundle.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await createFolderBundle(entries)).sha256, bundle.sha256);
});

test("prefetch preserves content, order and hashes for medium and multi-read files", async () => {
  const entries = [
    { path: "medium.bin", file: new Blob([new Uint8Array(2 * 1024 ** 2).fill(37)]) },
    { path: "large.bin", file: new Blob([new Uint8Array(5 * 1024 ** 2 + 7).fill(83)]) },
    ...Array.from({ length: 8 }, (_, index) => ({ path: `Data/${index}.txt`, file: new Blob([`entry-${index}`]) })),
  ];
  const progress = [];
  const bundle = await createFolderBundle(entries, undefined, { onProgress: value => progress.push(value) });
  const unpacked = unzipSync(new Uint8Array(await bundle.blob.arrayBuffer()));
  for (const entry of entries) {
    assert.deepEqual(unpacked[entry.path], new Uint8Array(await entry.file.arrayBuffer()));
  }
  assert.deepEqual(bundle.files.map(file => file.path), entries.map(entry => entry.path));
  assert.deepEqual(progress.at(-1), { preparedFiles: entries.length,
    preparedBytes: entries.reduce((sum, entry) => sum + entry.file.size, 0) });
  assert.equal(bundle.timing.smallFiles, 8);
  assert.equal(bundle.timing.largeFiles, 2);
  assert.ok(bundle.timing.hashAndZipMs >= 0);
  assert.equal((await createFolderBundle(entries)).sha256, bundle.sha256);
});

test("canceling preparation rejects without consuming later files", async () => {
  const controller = new AbortController();
  let laterReads = 0;
  const file = new Blob([new Uint8Array(5 * 1024 ** 2)]);
  const later = new Blob(["later"]);
  later.arrayBuffer = async () => { laterReads++; throw new Error("should not be prefetched after abort"); };
  controller.abort();
  await assert.rejects(createFolderBundle([{ file, path: "first.bin" }, { file: later, path: "later.bin" }], controller.signal), { name: "AbortError" });
  assert.equal(laterReads, 0);
});
