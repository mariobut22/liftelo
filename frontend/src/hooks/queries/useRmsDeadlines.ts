import { useQuery } from '@tanstack/react-query'

import { getRmsDeadlines } from '../../services/api'

export const useRmsDeadlines = () =>
  useQuery({
    queryKey: ['rms-deadlines'],
    queryFn: getRmsDeadlines,
    staleTime: 1000 * 60 * 5,
  })
