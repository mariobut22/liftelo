export interface RmsVisit {
  id: number
  location_id: number
  location_name: string
  visit_date: string
  rms_month?: string | null
  created_at: string
  status?: string
}

export interface RmsVisitItem {
  id: number
  visit_id: number
  elevator_label: string
  status: string
  comment?: string | null
}

export interface RmsVisitDetail {
  id: number
  location_id: number
  user_id?: number | null
  visit_date: string
  rms_month?: string | null
  notes_general?: string | null
  created_at: string
  technician_name?: string | null
  status?: string | null
  signature_status?: string | null
  technician_signature_path?: string | null
  client_signature_path?: string | null
  signed_at?: string | null
  items: RmsVisitItem[]
}
