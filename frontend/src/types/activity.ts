export type Activity = {
  id: number
  user_id: number
  username: string
  action: string
  entity_type?: string
  entity_id?: number
  metadata?: Record<string, unknown>
  created_at: string
}

export type ActivityResponse = {
  data: Activity[]
  total: number
  page: number
  limit: number
}

export type ActivityQueryParams = {
  page?: number
  limit?: number
  user_id?: number
  action?: string
  date_from?: string
  date_to?: string
}
