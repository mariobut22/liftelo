import { useQuery } from '@tanstack/react-query'

import { getProjects } from '../../services/api'
import type { Project } from '../../types/project'

const fiveMinutes = 1000 * 60 * 5

const useProjects = () =>
  useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
    staleTime: fiveMinutes,
  })

export default useProjects
