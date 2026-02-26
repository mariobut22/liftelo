import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '../../services/api'

export type LocationRmsVisit = {
  id: number
  location_id: number
  visit_date: string
  rms_month?: string | null
  created_at: string
}

const fiveMinutes = 1000 * 60 * 5

const useLocationRmsVisits = (id?: number) =>
  useQuery<LocationRmsVisit[]>({
    queryKey: ['location-rms-visits', id],
    queryFn: () => apiFetch<LocationRmsVisit[]>(`/api/locations/${id}/rms-visits`),
    enabled: typeof id === 'number' && !Number.isNaN(id) && id > 0,
    staleTime: fiveMinutes,
  })

export default useLocationRmsVisits
