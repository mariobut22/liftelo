export interface Project {
  id: number
  name: string
  description: string | null
  status: 'active' | 'completed' | 'archived'
  location_id: number | null
  location_name?: string
  start_date: string | null
  expected_end_date: string | null
  created_at: string
  progress_percent?: number
  due_date?: string | null
  assigned_users?: string[]
  owner?: { id: number; name?: string | null; full_name?: string | null; username?: string | null }
}
