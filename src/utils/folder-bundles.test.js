import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { createFolderBundle, planFolderBundles } from "./folder-bundles.js";

test("groups at most 3,000 small files, while large files stay direct", () => {
  const items = Array.from({ length: 3001 }, (_, index) => ({
    path: `Data/${index}.bin`, file: { size: 1 },
  }));
  items.push({ path: "big.bin", file: { size: 1024 ** 2 } });
  const plan = planFolderBundles(items);
  assert.equal(plan.direct.length, 1);
  assert.deepEqual(plan.bundles.map(bundle => bundle.length), [3000, 1]);
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
