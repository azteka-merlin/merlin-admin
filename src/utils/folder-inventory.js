import { sha256 } from "@noble/hashes/sha2.js";

export const FOLDER_INVENTORY_FORMAT = "merlin-folder-inventory-v1";

export function compareFolderEntries(a, b) {
  return b.file.size - a.file.size || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function createFolderInventoryDigest() {
  const encoder = new TextEncoder();
  const hash = sha256.create().update(encoder.encode(`${FOLDER_INVENTORY_FORMAT}\n`));
  return {
    add(path, size) { hash.update(encoder.encode(`${JSON.stringify([path, size])}\n`)); },
    finish() { return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, "0")).join(""); },
  };
}

export function parseFolderInventory(value) {
  if (value?.format !== FOLDER_INVENTORY_FORMAT ||
      !Number.isSafeInteger(value.fileCount) || value.fileCount < 1 || value.fileCount > 500000 ||
      !Number.isSafeInteger(value.totalSizeBytes) || value.totalSizeBytes < 1 || value.totalSizeBytes > 200 * 1024 ** 3 ||
      typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error("O arquivo não é um inventário de pasta válido do Merlin.");
  }
  return { fileCount: value.fileCount, totalSizeBytes: value.totalSizeBytes, sha256: value.sha256 };
}
