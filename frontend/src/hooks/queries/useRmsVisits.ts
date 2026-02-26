import { useQuery } from '@tanstack/react-query'

import { getRmsVisits } from '../../services/api'

const useRmsVisits = () =>
  useQuery({
    queryKey: ['rms'],
    queryFn: getRmsVisits,
  })

export default useRmsVisits
