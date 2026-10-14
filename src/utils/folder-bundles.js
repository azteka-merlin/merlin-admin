import { Zip, ZipPassThrough } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";

export const BUNDLE_MAX_BYTES = 200 * 1024 ** 2;
export const BUNDLE_MAX_FILES = 3000;
// Reserve room for both ZIP headers, UTF-8 paths of up to 500 characters and
// ZIP64 metadata before assigning an entry to a bounded package.
export const BUNDLE_ENTRY_OVERHEAD_BYTES = 8192;

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

export function planFolderBundles(descriptors) {
  const direct = [];
  const bundles = [];
  let current = [];
  let bytes = 0;
  for (const entry of descriptors) {
    const packedBytes = entry.file.size + BUNDLE_ENTRY_OVERHEAD_BYTES;
    if (packedBytes > BUNDLE_MAX_BYTES) { direct.push(entry); continue; }
    if (current.length && (bytes + packedBytes > BUNDLE_MAX_BYTES || current.length >= BUNDLE_MAX_FILES)) {
      bundles.push(current);
      current = [];
      bytes = 0;
    }
    current.push(entry);
    bytes += packedBytes;
  }
  if (current.length) bundles.push(current);
  return { direct, bundles };
}

// Stored ZIP entries avoid hours of compression and are streamed from each File.
// Only one bounded bundle is held in memory at a time before its multipart upload.
export async function createFolderBundle(entries, signal, { onProgress, prefetchFiles = 6 } = {}) {
  const clock = () => globalThis.performance?.now() ?? Date.now();
  const startedAt = clock();
  let readWaitMs = 0;
  let hashAndZipMs = 0;
  let processedBytes = 0;
  const categories = { smallFiles: 0, smallBytes: 0, smallDurationMs: 0,
    largeFiles: 0, largeBytes: 0, largeDurationMs: 0 };
  let lastProgressAt = -Infinity;
  const progress = (force = false) => {
    const now = clock();
    if (onProgress && (force || now - lastProgressAt >= 100)) {
      lastProgressAt = now;
      onProgress({ preparedFiles: files.length, preparedBytes: processedBytes });
    }
  };
  const abortIfNeeded = () => {
    if (signal?.aborted) {
      const error = new Error("Upload canceled");
      error.name = "AbortError";
      throw error;
    }
  };
  const chunks = [];
  const bundleHash = sha256.create();
  const files = [];
  let zipError = null;
  let resolveZip;
  let rejectZip;
  const finished = new Promise((resolve, reject) => { resolveZip = resolve; rejectZip = reject; });
  finished.catch(() => {});
  const zip = new Zip((error, chunk, final) => {
    if (error) { zipError = error; rejectZip(error); return; }
    if (chunk?.length) { chunks.push(chunk); bundleHash.update(chunk); }
    if (final) resolveZip();
  });
  try {
    abortIfNeeded();
    // The next six small files are read ahead, bounded to 12 MiB, while the
    // current file is hashed. Large files retain bounded 4 MiB reads.
    const ahead = new Map();
    const prefetchCount = Math.max(1, Math.min(6, prefetchFiles));
    const prefetch = from => {
      if (signal?.aborted) return;
      for (let index = from; index < Math.min(entries.length, from + prefetchCount); index++) {
        const file = entries[index].file;
        if (file.size > 2 * 1024 ** 2 || ahead.has(index)) continue;
        // Capture failures immediately, including promises not consumed after abort.
        ahead.set(index, file.arrayBuffer().then(value => ({ value }), error => ({ error })));
      }
    };
    prefetch(0);
    for (let index = 0; index < entries.length; index++) {
      const { file, path } = entries[index];
      const fileStartedAt = clock();
      abortIfNeeded();
      const member = new ZipPassThrough(path);
      // Retries must produce byte-identical ZIPs when reusing an uploaded object.
      member.mtime = new Date("2020-01-01T00:00:00.000Z");
      zip.add(member);
      const fileHash = sha256.create();
      const consume = value => {
        abortIfNeeded();
        const processingAt = clock();
        fileHash.update(value);
        member.push(value);
        hashAndZipMs += clock() - processingAt;
        processedBytes += value.length;
        if (zipError) throw zipError;
        progress();
      };
      if (ahead.has(index)) {
        const readAt = clock();
        const result = await ahead.get(index);
        readWaitMs += clock() - readAt;
        ahead.delete(index);
        if (result.error) throw result.error;
        consume(new Uint8Array(result.value));
      } else {
        for (let offset = 0; offset < file.size; offset += 4 * 1024 ** 2) {
          abortIfNeeded();
          const readAt = clock();
          const bytes = await file.slice(offset, Math.min(file.size, offset + 4 * 1024 ** 2)).arrayBuffer();
          readWaitMs += clock() - readAt;
          consume(new Uint8Array(bytes));
        }
      }
      member.push(new Uint8Array(0), true);
      files.push({ path, sizeBytes: file.size, sha256: hex(fileHash.digest()) });
      const category = file.size < 1024 ** 2 ? "small" : "large";
      categories[`${category}Files`]++;
      categories[`${category}Bytes`] += file.size;
      categories[`${category}DurationMs`] += clock() - fileStartedAt;
      prefetch(index + 1);
      progress();
    }
    zip.end();
    await finished;
    const blob = new Blob(chunks, { type: "application/zip" });
    if (blob.size > BUNDLE_MAX_BYTES) throw new Error("O pacote ultrapassou 200 MiB. Revise os arquivos selecionados.");
    blob.name = "merlin-bundle.zip";
    abortIfNeeded();
    progress(true);
    return { blob, sha256: hex(bundleHash.digest()), files,
      timing: { durationMs: clock() - startedAt, readWaitMs, hashAndZipMs,
        bytes: processedBytes, files: files.length, ...categories } };
  } catch (error) {
    zip.terminate();
    throw error;
  }
}
