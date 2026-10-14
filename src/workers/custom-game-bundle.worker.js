import { createFolderBundle } from "../utils/folder-bundles.js";

self.onmessage = async event => {
  const { entries } = event.data || {};
  try {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error("Pacote inválido.");
    const prepared = await createFolderBundle(entries, undefined, {
      onProgress: progress => self.postMessage({ type: "progress", ...progress }),
    });
    // Blob structured cloning shares the immutable backing data; do not turn
    // hundreds of MiB into a second ArrayBuffer on the UI thread.
    self.postMessage({ type: "done", prepared });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Falha ao preparar pacote." });
  }
};
