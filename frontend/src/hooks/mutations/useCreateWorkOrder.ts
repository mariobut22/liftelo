import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createWorkOrder, type CreateWorkOrderPayload } from '../../services/api'

export const useCreateWorkOrder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateWorkOrderPayload) => createWorkOrder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrders'] })
    },
  })
}
