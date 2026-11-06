import { useQuery } from '@tanstack/react-query'

import { getLocationElevatorsOfflineAware } from '../../lib/offline/offlineData'

const useLocationElevators = (locationId?: number) =>
  useQuery({
    queryKey: ['location-elevators', locationId],
    queryFn: () => getLocationElevatorsOfflineAware(locationId ?? 0),
    enabled: Boolean(locationId),
    networkMode: 'always', // offline: answer from the per-account read cache instead of waiting for a connection
  })

export default useLocationElevators
