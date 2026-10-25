import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createVehicle, type CreateVehiclePayload } from '../../services/api'
import type { Vehicle } from '../../types/vehicle'

export const useCreateVehicle = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => createVehicle(payload),
    onSuccess: (createdVehicle) => {
      queryClient.setQueryData<Vehicle[]>(['vehicles'], (previousVehicles = []) => [
        createdVehicle,
        ...previousVehicles.filter((vehicle) => vehicle.id !== createdVehicle.id),
      ])
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    },
  })
}
