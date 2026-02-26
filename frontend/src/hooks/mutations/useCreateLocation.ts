import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createLocation } from '../../services/api'

type CreateLocationPayload = {
  name: string
  address: string
  contact_person?: string | null
  contact_phone?: string | null
  notes?: string | null
  rms_frequency?: number
}

type CreateLocationResponse = {
  id: number
  latitude?: string | number | null
  longitude?: string | number | null
}

const useCreateLocation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateLocationPayload) => createLocation(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      queryClient.invalidateQueries({ queryKey: ['locations-with-activity'] })
    },
  }) as ReturnType<typeof useMutation<CreateLocationResponse, Error, CreateLocationPayload>>
}

export default useCreateLocation
