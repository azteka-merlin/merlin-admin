import { sha256 } from "@noble/hashes/sha2.js";

// Read once for both the whole-file checksum and upload. At most two parts
// are alive in the worker/caller at a time; acknowledgements provide backpressure.
const acknowledgements = new Map();
self.onmessage = async ({ data }) => {
  if (data.type === "ack") {
    acknowledgements.get(data.index)?.();
    acknowledgements.delete(data.index);
    return;
  }
  if (data.type !== "start") return;
  try {
    const { file, partSize, completed = [] } = data;
    const hash = sha256.create();
    const pending = new Set();
    let hashMs = 0;
    let readMs = 0;
    for (let offset = 0, index = 0; offset < file.size; offset += partSize, index++) {
      while (pending.size >= 2) await Promise.race(pending);
      let started = performance.now();
      const bytes = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + partSize)).arrayBuffer());
      readMs += performance.now() - started;
      started = performance.now();
      hash.update(bytes);
      hashMs += performance.now() - started;
      self.postMessage({ type: "progress", bytes: offset + bytes.length });
      if (!completed[index]) {
        let release;
        const acknowledged = new Promise(resolve => { release = resolve; });
        acknowledgements.set(index, release);
        pending.add(acknowledged);
        acknowledged.then(() => pending.delete(acknowledged));
        self.postMessage({ type: "part", index, blob: new Blob([bytes]) });
      }
    }
    await Promise.all(pending);
    self.postMessage({ type: "done", sha256: Array.from(hash.digest(), b => b.toString(16).padStart(2, "0")).join(""), readMs, hashMs });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Falha ao ler o arquivo." });
  }
};
