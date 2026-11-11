import { dbDelete, dbGet, dbGetAll, dbPut, idbSupported } from './idb'
import { orderQueue, type OutboxItem, type Owner } from './outboxCore'

/*
 * Persistent outbox (IndexedDB store "outbox"). Items are written BEFORE anything is shown as "saved", survive reloads,
 * and are only deleted after the server confirmed every step (or a person discarded them).
 * Blobs (photos, signature PNGs) are stored as Blobs, no base64 inflation.
 */

type Listener = () => void
const listeners = new Set<Listener>()
const CHANNEL = 'liftelo-outbox'
let channel: BroadcastChannel | null = null
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = () => listeners.forEach((listener) => listener())
  }
} catch {
  channel = null
}

/** call after every change: updates this tab's UI and (via BroadcastChannel) the other tabs */
function notifyChanged() {
  listeners.forEach((listener) => listener())
  try {
    channel?.postMessage('changed')
  } catch {
    // closed channel: ignore
  }
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const outboxAvailable = (): boolean => idbSupported()

export async function listOutbox(): Promise<OutboxItem[]> {
  if (!outboxAvailable()) return []
  try {
    return orderQueue(await dbGetAll<OutboxItem>('outbox'))
  } catch (error) {
    console.error('[outbox] list failed', error)
    return []
  }
}

export async function listOutboxFor(owner: Owner | null): Promise<OutboxItem[]> {
  if (!owner) return []
  const items = await listOutbox()
  return items.filter((item) => item.userId === owner.userId && (item.companyId ?? null) === (owner.companyId ?? null))
}

export const getOutboxItem = (id: string) => dbGet<OutboxItem>('outbox', id)

/** Throws when the browser refuses to store (quota, private mode): the caller must then NOT claim the entry was saved. */
export async function saveOutboxItem(item: OutboxItem): Promise<void> {
  await dbPut('outbox', item)
  notifyChanged()
}

export async function deleteOutboxItem(id: string): Promise<void> {
  await dbDelete('outbox', id)
  notifyChanged()
}

/** Last-resort backup: everything waiting as JSON (photos/signatures as data URLs) so nothing is lost if the browser evicts storage. */
export async function exportOutboxJson(items: OutboxItem[]): Promise<Blob> {
  const toDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  const out = []
  for (const item of items) {
    out.push({
      ...item,
      photos: await Promise.all(item.photos.map(async (photo) => ({ ...photo, blob: await toDataUrl(photo.blob) }))),
      signatures: item.signatures
        ? { ...item.signatures, technician: await toDataUrl(item.signatures.technician), client: item.signatures.client ? await toDataUrl(item.signatures.client) : null }
        : null,
    })
  }
  return new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'liftelo', items: out }, null, 2)], {
    type: 'application/json',
  })
}

/** Ask the browser not to evict our storage under pressure (no effect on iOS idle eviction). Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      if (await navigator.storage.persisted?.()) return true
      return await navigator.storage.persist()
    }
  } catch {
    // not supported / denied
  }
  return false
}
