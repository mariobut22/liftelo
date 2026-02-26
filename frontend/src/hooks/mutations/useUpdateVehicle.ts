import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateVehicle, type CreateVehiclePayload } from '../../services/api'

export const useUpdateVehicle = (id: number) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => updateVehicle(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}
