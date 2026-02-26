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
  }
  notifications?: {
    has_rms_alerts: boolean
    overdue_work_orders_count: number
    rms_coverage_low: boolean
  }
}
