import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createRms, type CreateRmsPayload } from '../../services/api'

export const useCreateRms = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateRmsPayload) => createRms(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rms'] })
    },
  })
}
