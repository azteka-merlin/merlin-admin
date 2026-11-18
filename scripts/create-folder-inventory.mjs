import { readdirSync, lstatSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { compareFolderEntries, createFolderInventoryDigest, FOLDER_INVENTORY_FORMAT } from "../src/utils/folder-inventory.js";

const source = process.argv[2];
if (!source) {
  console.error('Uso: npm run folder:inventory -- "C:\\Pasta do jogo"');
  process.exit(1);
}

try {
  const root = resolve(source);
  if (!lstatSync(root).isDirectory() || dirname(root) === root) throw new Error("Informe a pasta do jogo.");
  const files = readdirSync(root, { recursive: true, withFileTypes: true });
  const descriptors = [];
  let totalSizeBytes = 0;
  for (const item of files) {
    if (item.isDirectory()) continue;
    if (!item.isFile()) throw new Error(`A pasta contém um link ou tipo de arquivo incompatível: ${item.name}`);
    const filename = join(item.parentPath, item.name);
    const file = lstatSync(filename);
    if (!file.isFile()) throw new Error(`O tipo de arquivo mudou durante a leitura: ${item.name}`);
    descriptors.push({ path: relative(root, filename).split(sep).join("/"), file: { size: file.size } });
    totalSizeBytes += file.size;
  }
  if (descriptors.length < 1 || descriptors.length > 500000 || totalSizeBytes < 1 || totalSizeBytes > 200 * 1024 ** 3) {
    throw new Error("A pasta deve conter dados e ter até 500.000 arquivos e 200 GiB.");
  }
  descriptors.sort(compareFolderEntries);
  const digest = createFolderInventoryDigest();
  for (const { path, file } of descriptors) digest.add(path, file.size);
  const inventory = { format: FOLDER_INVENTORY_FORMAT, fileCount: descriptors.length, totalSizeBytes, sha256: digest.finish() };
  // Keep the inventory beside the folder so it is never included in its own listing.
  const output = join(dirname(root), `${basename(root)}.merlin-inventory.json`);
  writeFileSync(output, JSON.stringify(inventory, null, 2) + "\n");
  console.log(`${inventory.fileCount.toLocaleString("pt-BR")} arquivos conferidos. Selecione este inventário no Admin:\n${output}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
