import { useQuery } from '@tanstack/react-query'

import { getVehicles } from '../../services/api'

const useVehicles = () =>
  useQuery({
    queryKey: ['vehicles'],
    queryFn: getVehicles,
  })

export default useVehicles
