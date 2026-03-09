export interface User {
  id: number
  username?: string
  role?: 'superadmin' | 'admin' | 'technician' | 'viewer'
  global_role?: 'user' | 'superadmin'
  email?: string
  status?: 'active' | 'pending' | 'inactive'
  is_active: number
  full_name?: string | null
  company_id?: number | null
  language?: 'en' | 'hr' | null
  disabled_at?: string | null
  created_at?: string | null
  last_login?: string | null
}
