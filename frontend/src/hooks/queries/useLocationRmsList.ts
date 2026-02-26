import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '../../services/api'

export type LocationRmsListItem = {
  id: number
  visit_date: string
  created_at: string
  notes_general?: string | null
  technician?: string | null
  user_id?: number | null
}

const fiveMinutes = 1000 * 60 * 5

const useLocationRmsList = (id?: number) =>
  useQuery<LocationRmsListItem[]>({
    queryKey: ['location-rms-list', id],
    queryFn: () => apiFetch<LocationRmsListItem[]>(`/api/rms-visits/location/${id}`),
    enabled: typeof id === 'number' && !Number.isNaN(id) && id > 0,
    staleTime: fiveMinutes,
  })

export default useLocationRmsList
