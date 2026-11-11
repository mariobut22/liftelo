export type Intervention = {
  id: number
  location_name: string
  visit_date: string
  status?: string
  created_at?: string
  pdf_available?: boolean
  /** derived signature state (unsigned | awaiting_client | completed | closed_without_client) */
  signature_state?: 'unsigned' | 'awaiting_client' | 'completed' | 'closed_without_client' | null
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

export type PhotoKind = 'before' | 'after' | 'other'

export type InterventionPhoto = {
  /** null for photos from the old comma-separated list (legacy) */
  id: number | null
  /** e.g. /uploads/interventions/3-i12-....jpg ; show with API_BASE_URL + file_path */
  file_path: string
  mime: string | null
  size_bytes: number | null
  width: number | null
  height: number | null
  kind: PhotoKind
  caption: string | null
  taken_at: string | null
  created_at: string | null
  legacy: boolean
}
