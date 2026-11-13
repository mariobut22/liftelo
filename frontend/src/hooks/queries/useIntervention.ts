import { useQuery } from '@tanstack/react-query'

import { getInterventionDetail } from '../../services/api'
import type { InterventionDetail } from '../../types/intervention'

const useIntervention = (id?: string) =>
  useQuery<InterventionDetail>({
    queryKey: ['intervention-detail', id],
    queryFn: () => getInterventionDetail(id ?? ''),
    enabled: Boolean(id),
  })

export default useIntervention
