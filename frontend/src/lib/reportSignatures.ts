import { apiFetch, dataUrlToFile, onlineRequestSignal } from '../services/api'
import useAuthStore from '../store/authStore'
import type { ClientSignatureValue } from '../components/signature/ClientSignatureBlock'

/** Signature states of RMS visits / interventions (derived on the server, see docs/infrastructure.md section 20). */
export type ReportType = 'rms' | 'intervention'
export type SignatureState = 'unsigned' | 'awaiting_client' | 'completed' | 'closed_without_client'
export const SIGNATURE_STATES: SignatureState[] = ['unsigned', 'awaiting_client', 'completed', 'closed_without_client']

export type TimelineEvent = {
  type: 'created' | 'technician_signed' | 'client_signed' | 'client_declined'
  at: string | null
  method?: 'drawn' | 'scan' | 'declined'
  name?: string | null
  role?: string | null
  note?: string | null
  by_name?: string | null
  completion_id?: number
  scan_path?: string | null
}

export type ReportSignatureInfo = {
  id: number
  type: ReportType
  state: SignatureState
  locked: boolean
  document_number: string
  short_hash: string | null
  technician: { name: string | null; at: string | null } | null
  client: { method: 'drawn' | 'scan' | 'declined'; name: string | null; role: string | null; at: string | null; note: string | null; by_name: string | null } | null
  awaiting_since: string | null
  timeline: TimelineEvent[]
  snapshots: Array<{ id: number; snapshot_no: number; completion_id: number | null; created_at: string; short_hash: string | null; language: string | null }>
  scans: Array<{ completion_id: number; file_path: string; mime: string | null; size_bytes: number | null; created_at: string }>
}

export type VerifyResult = {
  status: 'ok' | 'differs' | 'no_snapshot' | 'not_signed'
  document_number: string
  snapshots: Array<{ id: number; snapshot_no: number; short_hash: string | null; hash_ok: boolean; pdf_ok: boolean }>
}

export type AwaitingClientSummary = {
  count: number
  oldest_at: string | null
  items: Array<{ type: ReportType; id: number; since: string; location_name: string | null }>
}

export const reportSignatureKey = (type: ReportType, id: number | string) => ['report-signature', type, String(id)] as const

export const getReportSignature = (type: ReportType, id: number | string) =>
  apiFetch<ReportSignatureInfo>(`/api/reports/${type}/${id}/signature`)

export const getAwaitingClient = () => apiFetch<AwaitingClientSummary>('/api/reports/awaiting-client')

export const verifyReport = (type: ReportType, id: number | string) =>
  apiFetch<VerifyResult>(`/api/reports/${type}/${id}/verify`)

export function collectClientSignature(input: { type: ReportType; id: number; signature: string; name: string; role: string; language?: string }) {
  const form = new FormData()
  form.append('client_signature', dataUrlToFile(input.signature, 'client.png'))
  form.append('signer_name', input.name)
  form.append('signer_role', input.role)
  if (input.language) form.append('language', input.language)
  return apiFetch(`/api/reports/${input.type}/${input.id}/client-signature`, { method: 'POST', body: form, headers: {}, signal: onlineRequestSignal() })
}

export function attachClientScan(input: { type: ReportType; id: number; file: File; note?: string; name?: string; role?: string }) {
  const form = new FormData()
  form.append('scan', input.file)
  if (input.note) form.append('note', input.note)
  if (input.name) form.append('signer_name', input.name)
  if (input.role) form.append('signer_role', input.role)
  // a scan can be several MB: no short timeout
  return apiFetch(`/api/reports/${input.type}/${input.id}/client-scan`, { method: 'POST', body: form, headers: {} })
}

export const declineClient = (input: { type: ReportType; id: number; reason: string }) =>
  apiFetch(`/api/reports/${input.type}/${input.id}/client-declined`, {
    method: 'POST',
    body: JSON.stringify({ reason: input.reason }),
    signal: onlineRequestSignal(),
  })

/** Viewers are read-only everywhere (the server enforces it too, this only hides the actions). */
export function userCanWrite(): boolean {
  const { user, companies } = useAuthStore.getState()
  if (!user) return false
  if (user.role === 'superadmin') return true
  const active = companies.find((company) => company.id === user.company_id) ?? companies[0]
  return active ? active.role !== 'viewer' : user.role !== 'viewer'
}

/** whole days since a timestamp (>= 0) */
export const daysSince = (value?: string | null): number =>
  value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)) : 0

export type ClientSignatureCheck =
  | { ok: true; signature: string | null; signer: { name: string; role: string } | null }
  | { ok: false; problem: 'clientSignatureRequired' | 'signerRequired' }

/** Validates the client part of the signing step: "not present" (sign later), or a drawn signature + name + role. */
export function evaluateClientSignature(value: ClientSignatureValue | undefined): ClientSignatureCheck {
  if (!value) return { ok: false, problem: 'clientSignatureRequired' }
  if (value.absent) return { ok: true, signature: null, signer: null }
  if (!value.signature) return { ok: false, problem: 'clientSignatureRequired' }
  if (!value.name || !value.role) return { ok: false, problem: 'signerRequired' }
  return { ok: true, signature: value.signature, signer: { name: value.name, role: value.role } }
}
