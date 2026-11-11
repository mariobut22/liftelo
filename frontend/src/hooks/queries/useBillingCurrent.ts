import { useQuery } from '@tanstack/react-query'

import { getBillingCurrent } from '../../services/api'
import useAuthStore from '../../store/authStore'
import type { BillingCurrent } from '../../types/billing'

const useBillingCurrent = () => {
  const user = useAuthStore((state) => state.user)
  const activeCompanyId = useAuthStore((state) => state.user?.company_id)

  return useQuery<BillingCurrent>({
    queryKey: ['billing', 'current', activeCompanyId],
    queryFn: getBillingCurrent,
    enabled: Boolean(user && user.role !== 'superadmin' && activeCompanyId),
    staleTime: 1000 * 30,
  })
}

export default useBillingCurrent
