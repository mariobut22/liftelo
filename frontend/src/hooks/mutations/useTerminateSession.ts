import { useMutation, useQueryClient } from '@tanstack/react-query'

import { terminateSession } from '../../services/api'

const useTerminateSession = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => terminateSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export default useTerminateSession
