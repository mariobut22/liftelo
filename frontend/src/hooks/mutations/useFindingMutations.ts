import { useMutation, useQueryClient } from '@tanstack/react-query'

import { addFindingEvent, createFinding, type AddFindingEventPayload, type CreateFindingPayload } from '../../services/api'

export const useAddFindingEvent = (id: number) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AddFindingEventPayload) => addFindingEvent(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })
}

export const useCreateFinding = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateFindingPayload) => createFinding(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })
}
