export type Intervention = {
  id: number
  location_name: string
  visit_date: string
  status?: string
  created_at?: string
  pdf_available?: boolean
}

export type InterventionDetail = {
  id: number
  location_id: number
  location_name?: string | null
  technician?: string | null
  second_technician?: string | null
  notes?: string | null
  date?: string | null
  status?: string | null
  signature_status?: string | null
  created_at?: string | null
  technician_signature_path?: string | null
  client_signature_path?: string | null
  signed_at?: string | null
  items?: Array<{ id: number; elevator_label?: string | null; comment?: string | null }>
}
