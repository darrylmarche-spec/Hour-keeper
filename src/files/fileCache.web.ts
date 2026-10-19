// Web version of fileCache.ts. Uses the browser's IndexedDB, which (unlike
// localStorage) has room for photos and keeps them across visits and offline.

const DB = 'hour-keeper-files';
const STORE = 'files';

interface Stored {
  bytes: ArrayBuffer;
  type: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putFile(key: string, bytes: ArrayBuffer, mimeType: string): Promise<void> {
  await run('readwrite', (s) => s.put({ bytes, type: mimeType } satisfies Stored, key));
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.delete(key);
}

export async function getFile(key: string): Promise<ArrayBuffer | null> {
  const v = (await run('readonly', (s) => s.get(key))) as Stored | undefined;
  return v ? v.bytes : null;
}

const urls = new Map<string, string>();

export async function fileUrl(key: string): Promise<string | null> {
  const cached = urls.get(key);
  if (cached) return cached;
  const v = (await run('readonly', (s) => s.get(key))) as Stored | undefined;
  if (!v) return null;
  const url = URL.createObjectURL(new Blob([v.bytes], { type: v.type }));
  urls.set(key, url);
  return url;
}
