import { useQuery } from '@tanstack/react-query'

import { getLocationsWithActivity } from '../../services/api'
import type { LocationWithActivity } from '../../types/location'

const fiveMinutes = 1000 * 60 * 5

const useLocationsWithActivity = () =>
  useQuery<LocationWithActivity[]>({
    queryKey: ['locations-with-activity'],
    queryFn: getLocationsWithActivity,
    staleTime: fiveMinutes,
  })

export default useLocationsWithActivity
