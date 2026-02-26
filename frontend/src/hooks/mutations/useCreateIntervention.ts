import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createIntervention, type CreateInterventionPayload } from '../../services/api'

export const useCreateIntervention = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateInterventionPayload) => createIntervention(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interventions'] })
    },
  })
}
