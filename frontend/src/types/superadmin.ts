export interface SuperadminCompanyRow {
  id: number
  name: string
  created_at: string
  subscription_status?: 'trial' | 'active' | 'suspended' | null
  subscription_plan?: string | null
  subscription_expires_at?: string | null
  total_locations: number
  total_users: number
  total_rms: number
  total_interventions: number
}

export interface SuperadminStats {
  totalCompanies: number
  totalUsers: number
  totalRms: number
  totalInterventions: number
}
