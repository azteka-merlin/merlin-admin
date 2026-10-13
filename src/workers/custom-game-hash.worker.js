import { sha256 } from "@noble/hashes/sha2.js";

self.onmessage = async event => {
  const { file, chunkSize, reportProgress } = event.data || {};
  try {
    if (!file || !Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error("Arquivo inválido.");
    const hash = sha256.create();
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer());
      hash.update(chunk);
      if (reportProgress) self.postMessage({ type: "progress", bytesRead: Math.min(file.size, offset + chunk.length) });
    }
    const digest = Array.from(hash.digest(), byte => byte.toString(16).padStart(2, "0")).join("");
    self.postMessage({ type: "done", sha256: digest });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Falha ao verificar arquivo." });
  }
};
