import { apiFetch, downloadApiFile } from '../services/api'

// Import of locations + elevators from Excel/CSV (backend: docs/infrastructure.md §22). Limits mirror the backend (which enforces them).
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024
export const IMPORT_MAX_ROWS = 500
export const IMPORT_EXTENSIONS = ['xlsx', 'csv'] as const

export type ImportRowStatus = 'ok' | 'warning' | 'error'
export type ImportMessageLevel = 'error' | 'warning' | 'info'

export type ImportRowMessage = {
  code: string
  level: ImportMessageLevel
  params?: { field?: string; max?: number; label?: string }
}

export type ImportPreviewRow = {
  row: number
  status: ImportRowStatus
  name: string
  address: string
  elevator: string | null
  messages: ImportRowMessage[]
}

export type ImportPlanCounts = { locations: number; elevators: number; skipped: number }

export type ImportPreview = {
  file: { type: 'xlsx' | 'csv'; rows: number }
  columns: Array<{ header: string; field: string | null }>
  summary: {
    rows: number
    ok: number
    warning: number
    error: number
    will_create: ImportPlanCounts
    will_create_with_warnings: ImportPlanCounts
  }
  rows: ImportPreviewRow[]
}

export type ImportResult = {
  locations_created: number
  elevators_created: number
  skipped: number
  duplicate?: boolean
}

export type ImportFileProblem = 'wrongType' | 'tooBig' | 'empty'

/** Client-side pre-check so the user gets an instant message (the backend repeats every check on the real content). */
export function checkImportFile(file: File): ImportFileProblem | null {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(ext)) return 'wrongType'
  if (file.size === 0) return 'empty'
  if (file.size > IMPORT_MAX_BYTES) return 'tooBig'
  return null
}

export function previewLocationImport(file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<ImportPreview>('/api/import/locations/preview', { method: 'POST', body: form, headers: {} })
}

export function applyLocationImport(file: File, options: { clientRequestId: string; includeWarnings: boolean }) {
  const form = new FormData()
  form.append('file', file)
  form.append('client_request_id', options.clientRequestId)
  form.append('include_warnings', options.includeWarnings ? 'true' : 'false')
  return apiFetch<ImportResult>('/api/import/locations/apply', { method: 'POST', body: form, headers: {} })
}

export function downloadImportTemplate(kind: 'xlsx' | 'csv', language: string) {
  const lang = language === 'en' ? 'en' : 'hr'
  return downloadApiFile(`/api/import/template.${kind}?lang=${lang}`, `liftelo-import-template.${kind}`)
}

export const newClientRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
