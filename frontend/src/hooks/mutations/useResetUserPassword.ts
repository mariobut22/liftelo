import { useMutation, useQueryClient } from '@tanstack/react-query'

import { resetUserPassword } from '../../services/api'

const useResetUserPassword = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) => resetUserPassword(id, newPassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export default useResetUserPassword
