import { useQuery } from '@tanstack/react-query'

import { getFinding, getFindings, getFindingsByLocation, getFindingsSummary, type FindingsQuery } from '../../services/api'

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

/** Open faults per location (list + map badges). Failing/offline = no badges, never an error screen. */
export const useFindingsByLocation = (enabled = true) =>
  useQuery({
    queryKey: ['findings', 'by-location'],
    queryFn: getFindingsByLocation,
    staleTime: oneMinute,
    enabled,
    retry: false,
  })

/** Open faults of one location (used for the notice in the RMS / intervention forms). Hidden when unavailable. */
export const useOpenFindingsForLocation = (locationId: number | null | undefined) =>
  useQuery({
    queryKey: ['findings', 'open-for-location', locationId],
    queryFn: () => getFindings({ location_id: locationId ?? 0, state: 'open', limit: 200 }),
    enabled: Boolean(locationId),
    staleTime: 30 * 1000,
    retry: false,
  })

export const useFinding = (id: number | null) =>
  useQuery({
    queryKey: ['findings', 'detail', id],
    queryFn: () => getFinding(id ?? 0),
    enabled: Boolean(id),
  })
