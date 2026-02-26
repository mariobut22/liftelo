import { useQuery } from '@tanstack/react-query'

import { getEmailSettings } from '../../services/api'

const fiveMinutes = 1000 * 60 * 5

const useEmailSettings = () =>
  useQuery<{ company_email_enabled: boolean; smtp_configured: boolean }>({
    queryKey: ['settings', 'email'],
    queryFn: () => getEmailSettings(),
    staleTime: fiveMinutes,
  })

export default useEmailSettings
