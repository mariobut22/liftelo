import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '../../services/api'

export type LocationActiveStatus = {
  status: string
  source?: string | null
  updatedAt?: string | null
}

const fiveMinutes = 1000 * 60 * 5

const useLocationActiveStatus = (id?: number) =>
  useQuery<LocationActiveStatus>({
    queryKey: ['location-active-status', id],
    queryFn: () => apiFetch<LocationActiveStatus>(`/api/locations/${id}/active-status`),
    enabled: typeof id === 'number' && !Number.isNaN(id) && id > 0,
    staleTime: fiveMinutes,
  })

export default useLocationActiveStatus
