// Trials live in this browser only (IndexedDB). Nothing about a person's face or skin is
// stored on a server: photos go to the analysis and back, and only scores are kept here.

import type { Trial } from "./types";

const DB = "trial-of-one";
const STORE = "trials";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const listTrials = () => tx<Trial[]>("readonly", (s) => s.getAll() as IDBRequest<Trial[]>)
  .then((ts) => ts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
export const getTrial = (id: string) => tx<Trial | undefined>("readonly", (s) => s.get(id) as IDBRequest<Trial | undefined>);
export const saveTrial = (t: Trial) => tx("readwrite", (s) => s.put(t)).then(() => t);
export const deleteTrial = (id: string) => tx("readwrite", (s) => s.delete(id));

export function newId(): string {
  return crypto.randomUUID();
}
