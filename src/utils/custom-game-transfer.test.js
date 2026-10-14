import test from "node:test";
import assert from "node:assert/strict";
import { Worker as NodeWorker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { readFileForUpload } from "./custom-game-transfer.js";

class BrowserWorkerAdapter {
  constructor(url) {
    const source = `import {parentPort} from 'node:worker_threads';
      let loaded=false;const queued=[];
      globalThis.self={postMessage:data=>parentPort.postMessage(data)};
      parentPort.on('message', data=>loaded?self.onmessage({data}):queued.push(data));
      await import(${JSON.stringify(url.href)});loaded=true;
      for(const data of queued)self.onmessage({data});`;
    this.worker = new NodeWorker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), { type: "module" });
    this.worker.on("message", data => this.onmessage?.({ data }));
    this.worker.on("error", error => this.onerror?.({ message: error.message }));
  }
  postMessage(data) { this.worker.postMessage(data); }
  terminate() { void this.worker.terminate(); }
}

test("real transfer worker hashes the same bytes sent, skips resumed parts and bounds outstanding chunks", async () => {
  const prior = globalThis.Worker;
  globalThis.Worker = BrowserWorkerAdapter;
  try {
    const bytes = Buffer.alloc(8 * 1024 ** 2, 0x31);
    const file = new Blob([bytes]);
    let active = 0, maxActive = 0;
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    const parts = [];
    const result = await readFileForUpload(file, { partSize: 1024 ** 2, completed: [true], onPart: async (index, blob) => {
      maxActive = Math.max(maxActive, ++active);
      if (index === 1) await firstGate;
      if (index === 2) releaseFirst();
      assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes.subarray(index * 1024 ** 2, (index + 1) * 1024 ** 2));
      parts.push(index); active--;
    } });
    assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(parts.sort(), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(maxActive, 2);
  } finally { globalThis.Worker = prior; }
});
