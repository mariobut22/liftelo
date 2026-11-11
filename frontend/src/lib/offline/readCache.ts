import { dbClear, dbGet, dbPut, idbSupported } from './idb'

/*
 * Small, explicit read cache in IndexedDB (store "readcache") so a technician can open the app and start an RMS/intervention
 * without signal. It holds ONLY: the last session user + companies, the locations list and the elevators list of the active
 * company. Every entry is tagged with a scope (user id + company id); a different account never reads it, and logout clears it.
 * API responses are NOT cached by the service worker (see public/sw.js), this is the only place such data is kept.
 */

type Entry = { key: string; scope: string; savedAt: number; data: unknown }

export type CacheKey = 'session' | 'companies' | 'locations' | 'elevators-all'

export async function cacheWrite(key: CacheKey, scope: string, data: unknown): Promise<void> {
  if (!idbSupported()) return
  try {
    await dbPut('readcache', { key, scope, savedAt: Date.now(), data } satisfies Entry)
  } catch (error) {
    console.warn('[readCache] write failed', key, error)
  }
}

export async function cacheRead<T>(key: CacheKey, scope: string): Promise<{ data: T; savedAt: number } | null> {
  if (!idbSupported()) return null
  try {
    const entry = await dbGet<Entry>('readcache', key)
    if (!entry || entry.scope !== scope) return null
    return { data: entry.data as T, savedAt: entry.savedAt }
  } catch {
    return null
  }
}

/** Logout / session end: personal data must not stay on a shared phone. (The outbox is NOT touched: unsent entries are never deleted.) */
export async function clearReadCache(): Promise<void> {
  if (!idbSupported()) return
  try {
    await dbClear('readcache')
  } catch (error) {
    console.warn('[readCache] clear failed', error)
  }
}

export const scopeOf = (userId: number | null | undefined, companyId: number | null | undefined): string => `${userId ?? 0}:${companyId ?? 0}`
