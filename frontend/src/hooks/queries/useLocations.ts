import { useQuery } from '@tanstack/react-query'

import { getLocationsOfflineAware } from '../../lib/offline/offlineData'
import type { Location } from '../../types/location'

const fiveMinutes = 1000 * 60 * 5

const useLocations = () =>
  useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => getLocationsOfflineAware(),
    staleTime: fiveMinutes,
    networkMode: 'always', // offline: answer from the per-account read cache instead of waiting for a connection
  })

export default useLocations
