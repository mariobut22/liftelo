import { useMutation, useQueryClient } from '@tanstack/react-query'

import { uploadCompanyLogo } from '../../services/api'

const useUploadCompanyLogo = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => uploadCompanyLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] })
    },
  })
}

export default useUploadCompanyLogo
