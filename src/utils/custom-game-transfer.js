export function createTransferLimiter(concurrency = 4) {
  let active = 0;
  const waiting = [];
  function drain() {
    while (active < concurrency && waiting.length) {
      const job = waiting.shift();
      if (job.signal?.aborted) { job.reject(new Error("Upload canceled")); continue; }
      active++;
      Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { active--; drain(); });
    }
  }
  return (run, signal) => new Promise((resolve, reject) => { waiting.push({ run, signal, resolve, reject }); drain(); });
}

export function uploadSignedPart(url, body, { signal, onProgress, timeoutMs = 900000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    let idleTimer;
    let stalled = false;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { stalled = true; request.abort(); }, 45000);
    };
    const finish = (callback, value) => { clearTimeout(idleTimer); signal?.removeEventListener("abort", abort); callback(value); };
    if (signal?.aborted) return reject(new Error("Upload canceled"));
    request.open("PUT", url, true);
    request.timeout = timeoutMs;
    request.setRequestHeader("Content-Type", "application/octet-stream");
    signal?.addEventListener("abort", abort, { once: true });
    request.upload.onprogress = event => { armIdleTimer(); onProgress?.(event.loaded); };
    request.onerror = () => finish(reject, new Error("A conexão com o armazenamento foi interrompida."));
    request.ontimeout = () => finish(reject, new Error("O armazenamento demorou a responder."));
    request.onabort = () => finish(reject, new Error(stalled ? "O envio parou de responder." : "Upload canceled"));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        const error = new Error(`O armazenamento recusou o envio (${request.status}).`);
        error.status = request.status;
        return finish(reject, error);
      }
      const etag = request.getResponseHeader("ETag");
      if (!etag) return finish(reject, new Error("O armazenamento não confirmou a parte enviada."));
      finish(resolve, { etag });
    };
    armIdleTimer();
    request.send(body);
  });
}

export function readFileForUpload(file, { partSize, completed, signal, onPart, onProgress }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/custom-game-transfer.worker.js", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback(value);
    };
    const abort = () => finish(reject, new Error("Upload canceled"));
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data.bytes);
      else if (data.type === "part") {
        Promise.resolve().then(() => onPart(data.index, data.blob)).then(() => {
          if (!settled) worker.postMessage({ type: "ack", index: data.index });
        }, error => finish(reject, error));
      } else if (data.type === "done") finish(resolve, data);
      else if (data.type === "error") finish(reject, new Error(data.message));
    };
    worker.onerror = event => finish(reject, new Error(event.message || "Falha na preparação do arquivo."));
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ type: "start", file, partSize, completed });
  });
}
