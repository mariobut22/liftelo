import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateEmailSettings } from '../../services/api'

const useUpdateEmailSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => updateEmailSettings(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'email'] })
    },
  })
}

export default useUpdateEmailSettings
