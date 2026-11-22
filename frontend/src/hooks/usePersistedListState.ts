import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import useAuthStore from '../store/authStore'

/*
 * Remembers the last filters, search, sort and page size of a list page in localStorage, per user + company + page.
 * Two hooks, used together by a page:
 *   const saved = useSavedListState<State>('locations', ['search', 'sort', 'order', 'faults'])   // read once, before the useState calls
 *   const [search, setSearch] = useState(() => params.get('search') ?? saved.search ?? '')
 *   const { isActive } = usePersistedListState({ page: 'locations', current: { search, ... }, defaults: { search: '', ... } })
 * Everything is wrapped in try/catch: without storage (private mode, blocked) the page simply does not remember anything.
 */

const PREFIX = 'liftelo:list:'
const DEFAULT_IGNORE = ['pageSize']

const useStorageKey = (page: string) => {
  const userId = useAuthStore((state) => state.user?.id)
  const companyId = useAuthStore((state) => state.user?.company_id)
  return `${PREFIX}${userId ?? 'anon'}:${companyId ?? 0}:${page}`
}

const read = <T,>(key: string): Partial<T> => {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<T>) : {}
  } catch {
    return {} // storage blocked or corrupt value: behave as if nothing was saved
  }
}

const write = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode, quota): the page keeps working without persistence */
  }
}

/** Saved state of a page, read once on mount. Empty when the URL carries any of `urlKeys` (deep links win over saved state). */
export function useSavedListState<T extends object>(page: string, urlKeys: string[]): Partial<T> {
  const key = useStorageKey(page)
  const [searchParams] = useSearchParams()
  const [saved] = useState<Partial<T>>(() => {
    const stored = read<T>(key)
    if (!urlKeys.some((name) => searchParams.has(name))) return stored
    // the URL carries filters: it wins, only the page size (not a filter, never in the URL) is still restored
    const pageSize = (stored as { pageSize?: unknown }).pageSize
    return (typeof pageSize === 'number' ? { pageSize } : {}) as Partial<T>
  })
  return saved
}

interface Options<T> {
  page: string
  /** Current state of the page; saved on every change. */
  current: T
  /** Values meaning "no filter" (used for isActive). */
  defaults: T
  /** Keys that are saved but do not count as an active filter (default: pageSize). */
  ignoreKeys?: string[]
}

/** Saves `current` on every change; `isActive` is true when anything except the ignored keys differs from `defaults` (drives "Reset filters"). */
export default function usePersistedListState<T extends object>({ page, current, defaults, ignoreKeys = DEFAULT_IGNORE }: Options<T>) {
  const key = useStorageKey(page)
  const serialized = JSON.stringify(current)
  const defaultsSerialized = JSON.stringify(defaults)

  useEffect(() => {
    write(key, JSON.parse(serialized))
  }, [key, serialized])

  const isActive = useMemo(() => {
    const strip = (json: string) => JSON.stringify(Object.entries(JSON.parse(json) as object).filter(([name]) => !ignoreKeys.includes(name)))
    return strip(serialized) !== strip(defaultsSerialized)
  }, [serialized, defaultsSerialized, ignoreKeys])

  return { isActive }
}
