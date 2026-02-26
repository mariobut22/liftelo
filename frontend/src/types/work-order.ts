export interface WorkOrder {
  id: number
  location_name: string
  due_date: string | null
  status: 'open' | 'completed'
  created_at: string
  assigned_users?: string[]
}
