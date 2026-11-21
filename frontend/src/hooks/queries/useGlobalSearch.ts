import { useQuery } from '@tanstack/react-query'

import { searchGlobal } from '../../services/api'

export const SEARCH_MIN_LENGTH = 2

/** Global search (GET /api/search). `query` must already be debounced by the caller. */
const useGlobalSearch = (query: string) => {
  const term = query.trim()
  return useQuery({
    queryKey: ['global-search', term],
    queryFn: ({ signal }) => searchGlobal(term, signal),
    enabled: term.length >= SEARCH_MIN_LENGTH,
    staleTime: 15_000,
    retry: false,
  })
}

export default useGlobalSearch
