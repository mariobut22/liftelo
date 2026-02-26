import { useQuery } from '@tanstack/react-query'

import { getLocationElevators } from '../../services/api'

const useLocationElevators = (locationId?: number) =>
  useQuery({
    queryKey: ['location-elevators', locationId],
    queryFn: () => getLocationElevators(locationId ?? 0),
    enabled: Boolean(locationId),
  })

export default useLocationElevators
