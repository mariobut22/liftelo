import { useQuery } from '@tanstack/react-query'

import { getInterventions } from '../../services/api'

export const useInterventions = () =>
  useQuery({
    queryKey: ['interventions'],
    queryFn: getInterventions,
  })
