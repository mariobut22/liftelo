import { useQuery } from '@tanstack/react-query'

import { getFinding, getFindings, getFindingsSummary, type FindingsQuery } from '../../services/api'

const oneMinute = 1000 * 60

export const useFindings = (query: FindingsQuery = {}, enabled = true) =>
  useQuery({
    queryKey: ['findings', 'list', query],
    queryFn: () => getFindings(query),
    staleTime: oneMinute,
    enabled,
  })

export const useFindingsSummary = (enabled = true) =>
  useQuery({
    queryKey: ['findings', 'summary'],
    queryFn: getFindingsSummary,
    staleTime: oneMinute,
    enabled,
  })

export const useFinding = (id: number | null) =>
  useQuery({
    queryKey: ['findings', 'detail', id],
    queryFn: () => getFinding(id ?? 0),
    enabled: Boolean(id),
  })
