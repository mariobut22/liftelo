import { useMutation, useQueryClient } from '@tanstack/react-query'

import { disableUser } from '../../services/api'

const useDisableUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => disableUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export default useDisableUser
