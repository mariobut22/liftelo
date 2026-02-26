export type RmsOverviewRow = {
  location_id: number
  location_name: string
  expected: boolean
  has_rms: boolean
  late: boolean
  last_rms_visit_date?: string | null
}
