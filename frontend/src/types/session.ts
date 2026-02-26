export type Session = {
  id: string
  user_id: number
  username: string
  ip_address: string
  user_agent: string
  created_at: string
  last_activity: string
  is_current?: boolean
}

export type SessionsResponse = {
  sessions: Session[]
}
