import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateVehicle, type CreateVehiclePayload } from '../../services/api'
import type { Vehicle } from '../../types/vehicle'

export const useUpdateVehicle = (id: number) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => updateVehicle(id, payload),
    onSuccess: (updatedVehicle) => {
      queryClient.setQueryData<Vehicle[]>(['vehicles'], (previousVehicles = []) =>
        previousVehicles.map((vehicle) =>
          vehicle.id === updatedVehicle.id ? updatedVehicle : vehicle
        )
      )
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}
