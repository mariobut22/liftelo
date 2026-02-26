import { useQuery } from '@tanstack/react-query'

import { getUsers } from '../../services/api'
import useAuthStore from '../../store/authStore'
import type { User } from '../../types/user'

const fiveMinutes = 1000 * 60 * 5

const useUsers = () => {
  const companyId = useAuthStore((state) => state.user?.company_id)
  return useQuery<User[]>({
    queryKey: ['users', companyId],
    queryFn: () => getUsers(companyId),
    staleTime: fiveMinutes,
  })
}

export default useUsers
