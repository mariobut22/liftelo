import { useQuery } from '@tanstack/react-query'

import { getHomeSummary } from '../../services/api'
import type { HomeSummary } from '../../types/home'

const fiveMinutes = 1000 * 60 * 5

const useHomeSummary = () =>
  useQuery<HomeSummary>({
    queryKey: ['homeSummary'],
    queryFn: () => getHomeSummary<HomeSummary>(),
    staleTime: fiveMinutes,
  })

export default useHomeSummary
