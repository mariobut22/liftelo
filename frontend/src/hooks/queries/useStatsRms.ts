import { useQuery } from '@tanstack/react-query'

import { getStatsRms } from '../../services/api'

export const useStatsRms = (year: number, month: number) =>
  useQuery({
    queryKey: ['stats-rms', year, month],
    queryFn: () => getStatsRms(year, month),
  })
