import { useQuery } from '@tanstack/react-query'

import { getRmsVisitById } from '../../services/api'
import type { RmsVisitDetail } from '../../types/rms'

const fiveMinutes = 1000 * 60 * 5

const useRmsVisit = (id?: string) =>
  useQuery<RmsVisitDetail>({
    queryKey: ['rms-visit', id],
    queryFn: () => getRmsVisitById(id ?? ''),
    enabled: Boolean(id),
    staleTime: fiveMinutes,
  })

export default useRmsVisit
