import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '../../services/api'

export type LocationLatestRms = {
  id: number
  location_id: number
  visit_date: string
  created_at: string
  items: Array<{
    id: number
    elevator_label: string
    status: string
    comment?: string | null
  }>
} | null

const fiveMinutes = 1000 * 60 * 5

const useLocationLatestRms = (id?: number) =>
  useQuery<LocationLatestRms>({
    queryKey: ['location-latest-rms', id],
    queryFn: () => apiFetch<LocationLatestRms>(`/api/locations/${id}/rms-visits/latest`),
    enabled: typeof id === 'number' && !Number.isNaN(id) && id > 0,
    staleTime: fiveMinutes,
  })

export default useLocationLatestRms
