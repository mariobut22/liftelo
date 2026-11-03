export interface HomeSummary {
  user: {
    id: number
    name: string
  }
  user_stats: {
    rms_count: number
    intervention_count: number
  }
  rms_summary: {
    expected: number
    done: number
    late: number
    missing: number
  }
  rms_missing_locations: {
    id: number
    name: string
  }[]
  alerts: {
    count: number
  }
  work_orders?: {
    open_assigned_count: number
    items?: {
      id: number
      location_id: number | null
      location_name: string | null
      due_date: string | null
    }[]
  }
  vehicles?: {
    expiring_soon_count: number
    expiring_soon_list: {
      id: number
      name: string
      registration_expiry_date: string
    }[]
  } | null
  notifications?: {
    has_rms_alerts: boolean
    overdue_work_orders_count: number
    rms_coverage_low: boolean
  }
}
