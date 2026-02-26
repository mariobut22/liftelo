import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '../../services/api'

export type LocationInterventionItem = {
  id: number
  location_id: number
  date: string
  created_at?: string
  technician?: string
  notes?: string | null
  status?: string | null
  technician_signature_path?: string | null
  client_signature_path?: string | null
  signed_at?: string | null
}

const fiveMinutes = 1000 * 60 * 5

const useLocationInterventions = (id?: number) =>
  useQuery<LocationInterventionItem[]>({
    queryKey: ['location-interventions', id],
    queryFn: () => apiFetch<LocationInterventionItem[]>(`/api/interventions/by-location/${id}`),
    enabled: typeof id === 'number' && !Number.isNaN(id) && id > 0,
    staleTime: fiveMinutes,
  })

export default useLocationInterventions
