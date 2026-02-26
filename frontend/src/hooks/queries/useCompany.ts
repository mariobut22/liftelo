import { useQuery } from '@tanstack/react-query'

import { getCompany } from '../../services/api'

const useCompany = () =>
  useQuery({
    queryKey: ['company'],
    queryFn: getCompany,
  })

export default useCompany
