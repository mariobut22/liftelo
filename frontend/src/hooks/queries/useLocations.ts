import { useQuery } from '@tanstack/react-query'

import { getLocations } from '../../services/api'
import type { Location } from '../../types/location'

const fiveMinutes = 1000 * 60 * 5

const useLocations = () =>
  useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => getLocations(),
    staleTime: fiveMinutes,
  })

export default useLocations
