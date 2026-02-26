import { useQuery } from '@tanstack/react-query'

import { getProjectById } from '../../services/api'
import type { ProjectDetail } from '../../types/project-detail'

const fiveMinutes = 1000 * 60 * 5

const useProject = (id?: number) =>
  useQuery<ProjectDetail>({
    queryKey: ['project', id],
    queryFn: () => getProjectById(id ?? 0),
    enabled: typeof id === 'number' && !Number.isNaN(id) && id > 0,
    staleTime: fiveMinutes,
  })

export default useProject
