import { useQuery } from '@tanstack/react-query'

import { getBillingPlans } from '../../services/api'
import type { BillingPlan } from '../../types/billing'

const useBillingPlans = () =>
  useQuery<BillingPlan[]>({
    queryKey: ['billing', 'plans'],
    queryFn: getBillingPlans,
    staleTime: 1000 * 60 * 10,
  })

export default useBillingPlans
