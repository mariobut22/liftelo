import { useQuery } from '@tanstack/react-query'

import { getSessions } from '../../services/api'
import type { SessionsResponse } from '../../types/session'

const fiveMinutes = 1000 * 60 * 5

const useSessions = () =>
  useQuery<SessionsResponse>({
    queryKey: ['sessions'],
    queryFn: () => getSessions(),
    staleTime: fiveMinutes,
  })

export default useSessions
