import { useQuery } from '@tanstack/react-query'

import { getWorkOrderById } from '../../services/api'
import type { WorkOrderDetail } from '../../types/work-order-detail'

const fiveMinutes = 1000 * 60 * 5

const useWorkOrder = (id?: string) =>
  useQuery<WorkOrderDetail>({
    queryKey: ['workOrder', id],
    queryFn: () => getWorkOrderById(id ?? ''),
    enabled: Boolean(id),
    staleTime: fiveMinutes,
  })

export default useWorkOrder
