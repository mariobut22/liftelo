import { useQuery } from '@tanstack/react-query'

import { getLocationById } from '../../services/api'
import type { Location } from '../../types/location'

const fiveMinutes = 1000 * 60 * 5

const useLocation = (id?: number) =>
  useQuery<Location>({
    queryKey: ['location', id],
    queryFn: () => getLocationById(id ?? 0),
    enabled: typeof id === 'number' && !Number.isNaN(id) && id > 0,
    staleTime: fiveMinutes,
  })

export default useLocation
