import { useMutation, useQueryClient } from '@tanstack/react-query'

import { terminateAllSessions } from '../../services/api'

const useTerminateAllSessions = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => terminateAllSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export default useTerminateAllSessions
