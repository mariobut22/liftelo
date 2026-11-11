/*
 * Minimal promise wrapper over IndexedDB (no dependency). One database, two stores:
 *   outbox    - records waiting to be sent (keyPath "id"), see outboxStore.ts
 *   readcache - small per-account read cache for starting a visit offline (keyPath "key"), see readCache.ts
 */

const DB_NAME = 'liftelo-offline'
const DB_VERSION = 1
export type StoreName = 'outbox' | 'readcache'

/** Internal (never shown to users): which storage step failed. */
export class StorageError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.name = 'StorageError'
    this.code = code
  }
}

let dbPromise: Promise<IDBDatabase> | null = null

export function idbSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!idbSupported()) {
      reject(new StorageError('indexeddb_unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('readcache')) db.createObjectStore('readcache', { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new StorageError('indexeddb_open_failed'))
    request.onblocked = () => reject(new StorageError('indexeddb_blocked'))
  }).catch((error) => {
    dbPromise = null // allow a later retry
    throw error
  })
  return dbPromise
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = work(tx.objectStore(store))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error ?? request.error ?? new StorageError('indexeddb_tx_failed'))
    tx.onabort = () => reject(tx.error ?? new StorageError('indexeddb_tx_aborted'))
  })
}

export const dbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key))
export const dbGetAll = <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll())
export const dbPut = (store: StoreName, value: unknown) => run(store, 'readwrite', (s) => s.put(value)).then(() => undefined)
export const dbDelete = (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined)
export const dbClear = (store: StoreName) => run(store, 'readwrite', (s) => s.clear()).then(() => undefined)
