import { useQuery } from '@tanstack/react-query'

import { getRmsOverview } from '../../services/api'

export const useRmsOverview = (year: number, month: number) =>
  useQuery({
    queryKey: ['rms-overview', year, month],
    queryFn: () => getRmsOverview(year, month),
  })
