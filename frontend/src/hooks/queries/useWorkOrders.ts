import { useQuery } from '@tanstack/react-query'

import { getWorkOrders } from '../../services/api'
import type { WorkOrder } from '../../types/work-order'

const fiveMinutes = 1000 * 60 * 5

const useWorkOrders = () =>
  useQuery<WorkOrder[]>({
    queryKey: ['workOrders'],
    queryFn: () => getWorkOrders(),
    staleTime: fiveMinutes,
  })

export default useWorkOrders
