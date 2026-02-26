import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createUser, type CreateUserPayload } from '../../services/api'

const useCreateUserInvite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export default useCreateUserInvite
