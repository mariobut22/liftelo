import { ApiError, apiFetch, getLocationElevators, getLocations } from '../../services/api'
import useAuthStore from '../../store/authStore'
import type { Location } from '../../types/location'
import { cacheRead, cacheWrite, scopeOf } from './readCache'

/*
 * The data a technician needs to START a record without signal: locations + elevators of the active company.
 * Online: normal requests, the result is also written to the per-account read cache. No answer (network failure, status 0):
 * the cached copy of the SAME account is used (stale-while-offline). HTTP errors are never masked by the cache.
 */

export type CachedElevator = { id: number; location_id?: number; label: string; serial_number?: string | null }

const currentScope = (): string | null => {
  const user = useAuthStore.getState().user
  return user ? scopeOf(user.id, user.company_id) : null
}

const isNoAnswer = (error: unknown) => error instanceof ApiError && error.status === 0

export async function getLocationsOfflineAware(): Promise<Location[]> {
  const scope = currentScope()
  try {
    const locations = await getLocations()
    if (scope) void cacheWrite('locations', scope, locations)
    return locations
  } catch (error) {
    if (scope && isNoAnswer(error)) {
      const cached = await cacheRead<Location[]>('locations', scope)
      if (cached) return cached.data
    }
    throw error
  }
}

type LocationElevators = Awaited<ReturnType<typeof getLocationElevators>>

export async function getLocationElevatorsOfflineAware(locationId: number): Promise<LocationElevators> {
  const scope = currentScope()
  try {
    return await getLocationElevators(locationId)
  } catch (error) {
    if (scope && isNoAnswer(error)) {
      const cached = await cacheRead<CachedElevator[]>('elevators-all', scope)
      if (cached) return cached.data.filter((elevator) => elevator.location_id === locationId) as LocationElevators
    }
    throw error
  }
}

let lastPrefetch = 0
const PREFETCH_EVERY_MS = 10 * 60_000

/** Refreshes the read cache in the background (app start, tab visible, back online). Never throws; skipped while offline. */
export async function prefetchOfflineData(force = false): Promise<void> {
  const scope = currentScope()
  if (!scope || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
  if (!force && Date.now() - lastPrefetch < PREFETCH_EVERY_MS) return
  lastPrefetch = Date.now()
  try {
    const [locations, elevators] = await Promise.all([
      getLocations(),
      apiFetch<CachedElevator[]>('/api/locations/all-elevators'),
    ])
    await cacheWrite('locations', scope, locations)
    await cacheWrite('elevators-all', scope, elevators)
  } catch (error) {
    lastPrefetch = 0 // try again at the next trigger
    if (!isNoAnswer(error)) console.warn('[offline] prefetch failed', error)
  }
}
