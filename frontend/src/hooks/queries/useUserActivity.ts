import { useQuery } from '@tanstack/react-query'

import { getUserActivity } from '../../services/api'
import type { ActivityResponse, ActivityQueryParams } from '../../types/activity'

const fiveMinutes = 1000 * 60 * 5

const useUserActivity = (params: ActivityQueryParams) =>
  useQuery<ActivityResponse>({
    queryKey: ['activity', params],
    queryFn: () => getUserActivity(params),
    staleTime: fiveMinutes,
  })

export default useUserActivity
