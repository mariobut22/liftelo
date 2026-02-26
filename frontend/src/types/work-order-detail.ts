export interface WorkOrderDetail {
  id: number
  location_id?: number
  location_name: string
  issued_date: string | null
  due_date: string | null
  status: 'open' | 'completed'
  comment: string | null
  general_comment?: string | null
  created_at: string
  items?: { id: number; text?: string; description?: string; is_completed?: boolean }[]
  elevators?: { id: number; label?: string; name?: string }[]
  assigned_users?: { id: number; full_name?: string; name?: string }[]
  attachments?: { id: number; url: string }[]
}
