import { Zip, ZipPassThrough } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";

export const BUNDLE_MAX_BYTES = 256 * 1024 ** 2;
export const BUNDLE_MAX_FILES = 3000;
export const SMALL_FILE_BYTES = 1024 ** 2;

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

export function planFolderBundles(descriptors) {
  const direct = [];
  const bundles = [];
  let current = [];
  let bytes = 0;
  for (const entry of descriptors) {
    if (entry.file.size >= SMALL_FILE_BYTES) { direct.push(entry); continue; }
    if (current.length && (bytes + entry.file.size > BUNDLE_MAX_BYTES || current.length >= BUNDLE_MAX_FILES)) {
      bundles.push(current);
      current = [];
      bytes = 0;
    }
    current.push(entry);
    bytes += entry.file.size;
  }
  if (current.length) bundles.push(current);
  return { direct, bundles };
}

// Stored ZIP entries avoid hours of compression and are streamed from each File.
// Only one bounded bundle is held in memory at a time before its multipart upload.
export async function createFolderBundle(entries, signal) {
  const chunks = [];
  const bundleHash = sha256.create();
  const files = [];
  let zipError = null;
  let resolveZip;
  let rejectZip;
  const finished = new Promise((resolve, reject) => { resolveZip = resolve; rejectZip = reject; });
  const zip = new Zip((error, chunk, final) => {
    if (error) { zipError = error; rejectZip(error); return; }
    if (chunk?.length) { chunks.push(chunk); bundleHash.update(chunk); }
    if (final) resolveZip();
  });
  try {
    for (const { file, path } of entries) {
      if (signal?.aborted) throw new Error("Upload canceled");
      const member = new ZipPassThrough(path);
      // Retries must produce byte-identical ZIPs when reusing an uploaded object.
      member.mtime = new Date("2020-01-01T00:00:00.000Z");
      zip.add(member);
      const fileHash = sha256.create();
      const reader = file.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal?.aborted) throw new Error("Upload canceled");
          fileHash.update(value);
          member.push(value);
          if (zipError) throw zipError;
        }
      } finally { reader.releaseLock(); }
      member.push(new Uint8Array(0), true);
      files.push({ path, sizeBytes: file.size, sha256: hex(fileHash.digest()) });
    }
    zip.end();
    await finished;
    const blob = new Blob(chunks, { type: "application/zip" });
    blob.name = "merlin-bundle.zip";
    return { blob, sha256: hex(bundleHash.digest()), files };
  } catch (error) {
    zip.terminate();
    throw error;
  }
}
