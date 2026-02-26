import { useQuery } from '@tanstack/react-query'

import { getNotifications } from '../../services/api'

const oneMinute = 1000 * 60

export type Notification = {
  id: number
  title?: string | null
  body?: string | null
  link?: string | null
  read_at?: string | null
  created_at?: string | null
}

const useNotifications = () =>
  useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    refetchInterval: oneMinute,
  })

export default useNotifications
