const DATABASE_NAME = "merlin-custom-game-uploads";
const DATABASE_VERSION = 1;
const STORE_NAME = "checkpoints";
const UNIT_STORE_NAME = "unit-checkpoints";
const OPEN_TIMEOUT_MS = 2000;

const memory = new Map();
const unitMemory = new Map();
const queues = new Map();
let databasePromise;
let persistentStorageAvailable = null;

function gameKey(gameId) {
  const key = String(gameId ?? "").trim();
  if (!key) throw new TypeError("A game ID is required for an upload checkpoint.");
  return key;
}

// Checkpoints deliberately contain metadata only. Rejecting binary values also
// prevents accidentally duplicating a complete game in IndexedDB.
function copyMetadata(value, parents = new Set()) {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Upload checkpoint numbers must be finite.");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("Upload checkpoints must contain serializable metadata only.");
  if (parents.has(value)) throw new TypeError("Upload checkpoints cannot contain circular references.");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Upload checkpoints cannot contain File, Blob or other non-metadata values.");
  }
  parents.add(value);
  let copied;
  if (Array.isArray(value)) copied = value.map(item => copyMetadata(item, parents) ?? null);
  else {
    copied = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) Object.defineProperty(copied, key, {
        value: copyMetadata(item, parents), enumerable: true, configurable: true, writable: true,
      });
    }
  }
  parents.delete(value);
  return copied;
}

function disablePersistentStorage(database) {
  persistentStorageAvailable = false;
  database?.close();
}

function openDatabase() {
  if (persistentStorageAvailable === false) return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB) {
    persistentStorageAvailable = false;
    return Promise.resolve(null);
  }
  databasePromise = new Promise(resolve => {
    let settled = false;
    const finish = database => {
      if (settled) { database?.close(); return; }
      settled = true;
      clearTimeout(timeout);
      persistentStorageAvailable = Boolean(database);
      resolve(database);
    };
    const timeout = setTimeout(() => finish(null), OPEN_TIMEOUT_MS);
    let request;
    try { request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION); }
    catch { finish(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "gameId" });
      }
      if (!request.result.objectStoreNames.contains(UNIT_STORE_NAME)) {
        request.result.createObjectStore(UNIT_STORE_NAME, { keyPath: ["gameId", "unitId"] })
          .createIndex("gameId", "gameId", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => disablePersistentStorage(database);
      finish(database);
    };
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });
  return databasePromise;
}

async function databaseOperation(mode, operation, storeName = STORE_NAME) {
  const database = await openDatabase();
  if (!database || persistentStorageAvailable === false) return { persisted: false, value: undefined };
  try {
    const value = await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      let result;
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error("Upload checkpoint storage failed."));
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error("Upload checkpoint transaction was aborted."));
      transaction.onerror = () => reject(transaction.error || new Error("Upload checkpoint transaction failed."));
    });
    return { persisted: true, value };
  } catch {
    // Private mode, quota exhaustion and revoked permissions must not abort an
    // upload. The caller can inspect storageAvailable() to explain the fallback.
    disablePersistentStorage(database);
    return { persisted: false, value: undefined };
  }
}

function enqueue(key, operation) {
  const previous = queues.get(key) || Promise.resolve();
  const pending = previous.catch(() => {}).then(operation);
  queues.set(key, pending);
  pending.finally(() => {
    if (queues.get(key) === pending) queues.delete(key);
  }).catch(() => {});
  return pending;
}

/** Whether checkpoints survive a page reload. False means an explicit memory-only fallback. */
export async function uploadCheckpointStorageAvailable() {
  await openDatabase();
  return persistentStorageAvailable === true;
}

export const storageAvailable = uploadCheckpointStorageAvailable;

/** One current checkpoint per game; fingerprint + planVersion identify its exact folder plan. */
export async function loadUploadCheckpoint(gameId) {
  const key = gameKey(gameId);
  return enqueue(key, async () => {
    const loaded = await databaseOperation("readonly", store => store.get(key));
    const checkpoint = loaded.persisted ? loaded.value : memory.get(key);
    if (!checkpoint) return null;
    memory.set(key, copyMetadata(checkpoint));
    return copyMetadata(checkpoint);
  });
}

export async function saveUploadCheckpoint(gameId, checkpoint) {
  const key = gameKey(gameId);
  if (!checkpoint || Array.isArray(checkpoint) || typeof checkpoint !== "object") {
    return Promise.reject(new TypeError("An upload checkpoint must be a metadata object."));
  }
  let snapshot;
  try {
    snapshot = copyMetadata(checkpoint);
    snapshot.gameId = key;
    snapshot.schemaVersion = DATABASE_VERSION;
    snapshot.updatedAt = Date.now();
    snapshot.checkpointKey = JSON.stringify([key, snapshot.fingerprint ?? null, snapshot.planVersion ?? null]);
  } catch (error) { return Promise.reject(error); }
  return enqueue(key, async () => {
    const prior = memory.get(key) || (await databaseOperation("readonly", store => store.get(key))).value;
    if (prior && prior.checkpointKey !== snapshot.checkpointKey) await deleteUnitRecords(key);
    memory.set(key, snapshot);
    await databaseOperation("readwrite", store => store.put(snapshot));
    return copyMetadata(snapshot);
  });
}

export async function deleteUploadCheckpoint(gameId) {
  const key = gameKey(gameId);
  return enqueue(key, async () => {
    memory.delete(key);
    await databaseOperation("readwrite", store => store.delete(key));
    await deleteUnitRecords(key);
  });
}

async function deleteUnitRecords(key) {
  unitMemory.delete(key);
  await databaseOperation("readwrite", store => {
    const cursorRequest = store.index("gameId").openKeyCursor(key);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  }, UNIT_STORE_NAME);
}

/** Save only one unit's changed multipart/hash metadata instead of rewriting the complete manifest. */
export async function saveUploadUnitCheckpoint(gameId, unitId, checkpoint) {
  const key = gameKey(gameId);
  const unitKey = String(unitId ?? "").trim();
  if (!unitKey) throw new TypeError("An upload unit ID is required.");
  if (!checkpoint || Array.isArray(checkpoint) || typeof checkpoint !== "object") {
    throw new TypeError("An upload unit checkpoint must be a metadata object.");
  }
  const snapshot = copyMetadata(checkpoint);
  snapshot.gameId = key;
  snapshot.unitId = unitKey;
  snapshot.schemaVersion = DATABASE_VERSION;
  snapshot.updatedAt = Date.now();
  return enqueue(key, async () => {
    if (!unitMemory.has(key)) unitMemory.set(key, new Map());
    unitMemory.get(key).set(unitKey, snapshot);
    await databaseOperation("readwrite", store => store.put(snapshot), UNIT_STORE_NAME);
    return copyMetadata(snapshot);
  });
}

/** Unit IDs map to their checkpoint; callers can rebuild the in-memory transfer plan after reselection. */
export async function loadUploadUnitCheckpoints(gameId) {
  const key = gameKey(gameId);
  return enqueue(key, async () => {
    const loaded = await databaseOperation("readonly", store => store.index("gameId").getAll(key), UNIT_STORE_NAME);
    const records = loaded.persisted ? loaded.value : [...(unitMemory.get(key)?.values() || [])];
    const units = {};
    for (const record of records || []) {
      Object.defineProperty(units, record.unitId, {
        value: copyMetadata(record), enumerable: true, configurable: true, writable: true,
      });
    }
    unitMemory.set(key, new Map((records || []).map(record => [record.unitId, copyMetadata(record)])));
    return units;
  });
}

export async function deleteUploadUnitCheckpoints(gameId) {
  const key = gameKey(gameId);
  return enqueue(key, () => deleteUnitRecords(key));
}

export async function listUploadCheckpoints() {
  await Promise.allSettled([...queues.values()]);
  const loaded = await databaseOperation("readonly", store => store.getAll());
  const checkpoints = loaded.persisted ? loaded.value : [...memory.values()];
  return copyMetadata(checkpoints || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Folder identity only: content integrity is verified separately with per-file SHA-256. */
export async function fingerprintFolderEntries(descriptors, planVersion) {
  if (!Array.isArray(descriptors)) throw new TypeError("Folder entries must be an array.");
  if (planVersion === undefined || planVersion === null || String(planVersion) === "") {
    throw new TypeError("A folder plan version is required.");
  }
  const entries = descriptors.map(entry => {
    const path = String(entry.path ?? entry.relativePath ?? entry.webkitRelativePath ?? entry.file?.webkitRelativePath ?? "")
      .replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^(\.\/)+/, "");
    const size = Number(entry.sizeBytes ?? entry.size ?? entry.file?.size);
    const modified = Number(entry.lastModified ?? entry.file?.lastModified ?? 0);
    if (!path || !Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(modified) || modified < 0) {
      throw new TypeError("Folder entries need a path, valid byte size and last-modified timestamp.");
    }
    return [path, size, modified];
  }).sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] - b[1] || a[2] - b[2];
  });
  if (!globalThis.crypto?.subtle) throw new Error("Secure SHA-256 is unavailable in this browser.");
  const bytes = new TextEncoder().encode(JSON.stringify([String(planVersion), entries]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
