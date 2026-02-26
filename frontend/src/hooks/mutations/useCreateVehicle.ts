import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createVehicle, type CreateVehiclePayload } from '../../services/api'

export const useCreateVehicle = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => createVehicle(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}
