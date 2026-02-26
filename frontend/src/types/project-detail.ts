export interface ProjectDetailUser {
  id: number
  full_name?: string | null
  name?: string
  username?: string
}

export interface ProjectDetailTask {
  id: number
  title: string
  description?: string
  is_completed: boolean
  assigned_users?: ProjectDetailUser[]
  comments?: Array<{
    id: number
    comment: string
    created_at: string
    user?: ProjectDetailUser
  }>
}

export interface ProjectDetailSection {
  id: number
  title: string
  tasks?: ProjectDetailTask[]
}

export interface ProjectDetail {
  id: number
  name: string
  description: string | null
  status: 'active' | 'completed' | 'archived'
  due_date?: string | null
  created_at?: string | null
  owner?: { id: number; name?: string | null; full_name?: string | null; username?: string | null }
  assigned_users?: ProjectDetailUser[]
  attachments?: Array<{ id: number; url: string }>
  sections?: ProjectDetailSection[]
}
