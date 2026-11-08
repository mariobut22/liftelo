import { onUnauthorized } from './authEvents'
import { emitPaymentRequired } from './billingEvents'
import type { Location, LocationWithActivity } from '../types/location'
import type { ProjectDetail } from '../types/project-detail'
import type { WorkOrder } from '../types/work-order'
import type { WorkOrderDetail } from '../types/work-order-detail'
import type { Vehicle } from '../types/vehicle'
import type { RmsVisit, RmsVisitDetail } from '../types/rms'
import type { Intervention, InterventionPhoto } from '../types/intervention'
import type { StatsResponse } from '../types/stats'
import type { User } from '../types/user'
import type { RmsOverviewRow } from '../types/rms-overview'
import type { Project } from '../types/project'
import type { Company } from '../types/company'
import type {
  SuperadminActionPath,
  SuperadminAuditFilters,
  SuperadminAuditPage,
  SuperadminCompanyDetail,
  SuperadminCompanyRow,
  SuperadminGrowth,
  SuperadminHealth,
  SuperadminRevenue,
  SuperadminStats,
} from '../types/superadmin'
import type { BillingCurrent, BillingPlan } from '../types/billing'
import type { WorkLine, WorkLinePayload } from '../lib/workLines'
import type { FindingCategory, FindingEventType, FindingRequestEntry, FindingSeverity, FindingState } from '../lib/findings'
import i18n from '../i18n'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api';
const BASE_URL = API_BASE_URL

export function buildApiUrl(path: string): string {
  const normalizedBase = (BASE_URL || '').replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (normalizedBase && normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath
  }

  return `${normalizedBase}${normalizedPath}`
}

/**
 * Error thrown by apiFetch. `message` is ALWAYS a translated, user-safe text (never raw backend text):
 * the backend sends `{ error, code }`, `error` is stable English for developers/logs only.
 */
export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type ApiErrorBody = {
  error?: string
  code?: string
  role?: string
  limit?: number
  used?: number
  pending_invites?: number
}

async function readErrorBody(response: Response): Promise<{ text: string; body: ApiErrorBody | null }> {
  const text = await response.text().catch(() => '')
  if (!text) return { text, body: null }
  try {
    const parsed = JSON.parse(text) as unknown
    return { text, body: parsed && typeof parsed === 'object' ? (parsed as ApiErrorBody) : null }
  } catch {
    return { text, body: null }
  }
}

/** Translated message for an error code; unknown or missing codes get the generic translated message. */
export function apiErrorMessage(body: ApiErrorBody | null): string {
  const code = body?.code
  if (code === 'role_limit_reached') {
    const role = body?.role === 'admin' || body?.role === 'technician' ? body.role : null
    if (role && typeof body?.limit === 'number') {
      return i18n.t(`common:apiErrors.roleLimitReachedFor.${role}`, {
        used: (body.used ?? 0) + (body.pending_invites ?? 0),
        limit: body.limit,
      })
    }
  }
  const key = code ? `common:apiErrors.codes.${code}` : ''
  if (key && i18n.exists(key)) {
    return i18n.t(key)
  }
  return i18n.t('common:apiErrors.generic')
}

/**
 * ApiError for a failed response that was NOT read through apiFetch (e.g. XMLHttpRequest uploads with progress).
 * Applies the same global side effects as apiFetch: 401 -> session expired, 402/viewer 403 -> payment/read-only popup.
 */
export function apiErrorFromResponse(status: number, rawBody: string, url: string, options: { silent?: boolean } = {}): ApiError {
  const silent = options.silent === true // background sends (offline outbox) report the error themselves: no logout/popup side effects
  let body: ApiErrorBody | null = null
  try {
    const parsed = JSON.parse(rawBody) as unknown
    body = parsed && typeof parsed === 'object' ? (parsed as ApiErrorBody) : null
  } catch {
    body = null
  }
  if (status === 401) {
    if (!silent) onUnauthorized()
    const code = body?.code && i18n.exists(`common:apiErrors.codes.${body.code}`) ? body.code : 'not_authenticated'
    return new ApiError(apiErrorMessage({ code }), 401, code)
  }
  if (status === 403 && body?.code === 'viewer_read_only') {
    const message = apiErrorMessage(body)
    if (!silent) emitPaymentRequired({ kind: 'viewer_read_only', message, url })
    return new ApiError(message, 403, body.code)
  }
  if (status === 402) {
    if (body?.code === 'service_disabled_technician') {
      const message = apiErrorMessage(body)
      if (!silent) emitPaymentRequired({ kind: 'service_disabled_technician', message, url })
      return new ApiError(message, 402, body.code)
    }
    const message = apiErrorMessage({ code: 'subscription_locked' })
    if (!silent) emitPaymentRequired({ kind: 'subscription_locked', message, url })
    return new ApiError(message, 402, 'subscription_locked')
  }
  return new ApiError(apiErrorMessage(body), status, body?.code)
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = options.body instanceof FormData
  console.debug('[apiFetch] request', { url })
  let response: Response
  try {
    response = await fetch(buildApiUrl(url), {
      credentials: 'include',
      headers: isFormData
        ? options.headers
        : {
            'Content-Type': 'application/json',
            ...options.headers,
          },
      ...options,
    })
  } catch (networkError) {
    // browsers word network failures in their own (English) language: never show that text
    console.error('[API] network error', url, networkError)
    throw new ApiError(i18n.t('common:apiErrors.network'), 0)
  }

  console.debug('[apiFetch] response', { url, status: response.status })
  if (response.status === 401) {
    console.warn('[apiFetch] unauthorized', { url, status: response.status })
    const { body } = await readErrorBody(response.clone())
    onUnauthorized()
    const code = body?.code && i18n.exists(`common:apiErrors.codes.${body.code}`) ? body.code : 'not_authenticated'
    throw new ApiError(apiErrorMessage({ code }), 401, code)
  }

  if (response.status === 402 || response.status === 403) {
    const { text: raw, body } = await readErrorBody(response.clone())

    if (response.status === 403 && body?.code === 'viewer_read_only') {
      const message = apiErrorMessage(body)
      emitPaymentRequired({ kind: 'viewer_read_only', message, url })
      throw new ApiError(message, 403, body.code)
    }

    if (response.status === 402) {
      console.warn('[apiFetch] payment required', { url, status: response.status, text: raw })
      if (body?.code === 'service_disabled_technician') {
        const message = apiErrorMessage(body)
        emitPaymentRequired({ kind: 'service_disabled_technician', message, url })
        throw new ApiError(message, 402, body.code)
      }
      const message = apiErrorMessage({ code: 'subscription_locked' })
      emitPaymentRequired({ kind: 'subscription_locked', message, url })
      throw new ApiError(message, 402, 'subscription_locked')
    }
  }

  if (!response.ok) {
    const { text, body } = await readErrorBody(response)
    console.error('[API] error response', url, response.status, text)
    throw new ApiError(apiErrorMessage(body), response.status, body?.code)
  }

  try {
    return (await response.json()) as T
  } catch (parseError) {
    console.error('[API] invalid JSON response', url, parseError)
    throw new ApiError(i18n.t('common:apiErrors.generic'), response.status)
  }
}

/**
 * Downloads a file from the API (e.g. the Excel export) with fetch instead of navigating to the URL,
 * so a failure shows a translated message (ApiError) instead of the browser rendering raw backend JSON.
 */
export async function downloadApiFile(url: string, fallbackFileName: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(buildApiUrl(url), { credentials: 'include' })
  } catch (networkError) {
    console.error('[API] network error', url, networkError)
    throw new ApiError(i18n.t('common:apiErrors.network'), 0)
  }
  if (!response.ok) {
    const { text, body } = await readErrorBody(response)
    console.error('[API] download error response', url, response.status, text)
    throw new ApiError(apiErrorMessage(body), response.status, body?.code)
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const fileName = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || fallbackFileName
  const blob = await response.blob()
  const objectUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(objectUrl)
}

export function getSuperadminRevenue(): Promise<SuperadminRevenue> {
  return apiFetch<SuperadminRevenue>('/api/superadmin/revenue')
}

export function getSuperadminHealth(): Promise<SuperadminHealth> {
  return apiFetch<SuperadminHealth>('/api/superadmin/health')
}

export function getSuperadminGrowth(): Promise<SuperadminGrowth> {
  return apiFetch<SuperadminGrowth>('/api/superadmin/growth')
}

export function getSuperadminAudit(filters: SuperadminAuditFilters, offset: number, limit: number): Promise<SuperadminAuditPage> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value))
  }
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return apiFetch<SuperadminAuditPage>(`/api/superadmin/audit?${params.toString()}`)
}

export function getSuperadminCompanies(): Promise<SuperadminCompanyRow[]> {
  return apiFetch<SuperadminCompanyRow[]>('/api/superadmin/companies')
}

export function getSuperadminCompany(companyId: number): Promise<SuperadminCompanyDetail> {
  return apiFetch<SuperadminCompanyDetail>(`/api/superadmin/companies/${companyId}`)
}

/** Audited superadmin action. Always sends `reason` and the superadmin's own `password` (re-authentication). */
export function runSuperadminAction(
  companyId: number,
  path: SuperadminActionPath,
  body: Record<string, unknown> & { reason: string; password: string }
) {
  return apiFetch<{ success: boolean }>(`/api/superadmin/companies/${companyId}/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function createSuperadminCompany(payload: {
  name: string
  admin_email: string
  admin_password: string
}) {
  return apiFetch<{ company_id: number; admin_user_id: number }>('/api/superadmin/companies', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getSuperadminStats(params: { year?: number; month?: number }) {
  const searchParams = new URLSearchParams()
  if (params.year) searchParams.set('year', String(params.year))
  if (params.month) searchParams.set('month', String(params.month))
  const suffix = searchParams.toString()
  return apiFetch<SuperadminStats>(`/api/superadmin/stats${suffix ? `?${suffix}` : ''}`)
}

export function getUserCompanies() {
  return apiFetch<Array<{ id: number; name: string; logo_path?: string | null; role: 'admin' | 'technician' | 'viewer' }>>(
    '/api/users/companies'
  )
}

export function createCompany(payload: { name: string }) {
  return apiFetch<{ success: boolean; company: { id: number; name: string; role: 'admin' }; active_company_id: number }>(
    '/api/users/companies',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export function getBillingCurrent() {
  return apiFetch<BillingCurrent>('/api/billing/current')
}

export function getBillingPlans() {
  return apiFetch<BillingPlan[]>('/api/billing/plans')
}

export function activateBillingPlan(plan_code: string) {
  return apiFetch<BillingCurrent>('/api/billing/activate-plan', {
    method: 'POST',
    body: JSON.stringify({ plan_code }),
  })
}

export function cancelBillingAtPeriodEnd() {
  return apiFetch<BillingCurrent>('/api/billing/cancel', {
    method: 'POST',
  })
}

export function resumeBilling() {
  return apiFetch<BillingCurrent>('/api/billing/resume', {
    method: 'POST',
  })
}

export function createBillingCheckoutSession(payload: { plan_code: string; success_path?: string; cancel_path?: string }) {
  return apiFetch<{ url: string; id: string }>('/api/billing/checkout-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createBillingPortalSession(payload?: { return_path?: string }) {
  return apiFetch<{ url: string }>('/api/billing/portal-session', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export function updateUserLanguage(language: 'en' | 'hr') {
  return apiFetch<{ language: 'en' | 'hr' }>('/api/users/me/language', {
    method: 'PUT',
    body: JSON.stringify({ language }),
  })
}

export type CompanyExportCheck = {
  allowed: boolean
  retry_after_seconds: number
  in_progress: boolean
  files: { count: number; bytes: number; missing: number; refused: number; included: boolean; max_included_bytes: number }
}

export function getCompanyExportCheck() {
  return apiFetch<CompanyExportCheck>('/api/company/export/check')
}

/** URL of the ZIP download (opened as a browser download; admin only, rate limited server side). */
export function companyExportUrl() {
  return buildApiUrl('/api/company/export')
}

export type LegalConfig = { acceptance_enabled: boolean }

/** Public (no login): is the mandatory Terms/Privacy acceptance switched on? Short timeout; callers treat failure as "off". */
export async function getLegalConfig(timeoutMs = 3000): Promise<LegalConfig> {
  const response = await fetch(buildApiUrl('/api/legal/config'), { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as LegalConfig
}

export type LegalStatus = {
  enabled?: boolean
  required?: string[]
  versions: Record<string, string>
  accepted: Record<string, boolean>
  needs_acceptance: boolean
}

export function getLegalStatus() {
  return apiFetch<LegalStatus>('/api/legal/status')
}

export function acceptLegal() {
  return apiFetch<LegalStatus>('/api/legal/accept', {
    method: 'POST',
    body: JSON.stringify({ accept: true }),
  })
}

export function inviteCompanyUser(companyId: number, payload: { email: string; role: string }) {
  return apiFetch<{ success: boolean; mode?: 'invite_created' | 'existing_user_added' | 'invite_already_pending' }>('/api/companies/' + companyId + '/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function acceptInvitation(payload: { token: string; password: string; accept_terms: boolean }) {
  return apiFetch('/api/invitations/accept', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getCompanyUsers(companyId: number) {
  return apiFetch<Array<{ id: number; email: string; role: string; is_active: number }>>(
    `/api/companies/${companyId}/users`
  )
}

export function removeCompanyUser(companyId: number, userId: number) {
  return apiFetch(`/api/companies/${companyId}/users/${userId}`, {
    method: 'DELETE',
  })
}

/** Admin: erases the personal data of a leaver (account is kept as an anonymous placeholder, company records stay). */
export function anonymizeCompanyUser(userId: number) {
  return apiFetch<{ success: boolean; interventions_updated: number }>(`/api/users/${userId}/anonymize`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  })
}

/** Downloads the signed-in user's own personal data as a JSON file. */
export function downloadMyData() {
  return downloadApiFile('/api/users/me/export', 'liftelo-my-data.json')
}

export function switchCompany(company_id: number) {
  return apiFetch<{ success: boolean; active_company_id: number }>('/api/switch-company', {
    method: 'POST',
    body: JSON.stringify({ company_id }),
  })
}

export function getHomeSummary<T>() {
  return apiFetch<T>('/api/home/summary')
}

export function getLocations(): Promise<Location[]> {
  return apiFetch<Location[]>('/api/locations')
}

export function getLocationsWithActivity(): Promise<LocationWithActivity[]> {
  return apiFetch<LocationWithActivity[]>('/api/locations/with-last-activity')
}

export function getLocationById(id: number): Promise<Location> {
  return apiFetch<Location>(`/api/locations/${id}`)
}

export function updateLocation(
  id: number,
  payload: Partial<Omit<Location, 'rms_frequency'>> & { rms_frequency?: number }
) {
  return apiFetch(`/api/locations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function createLocation(payload: {
  name: string
  address: string
  contact_person?: string | null
  contact_phone?: string | null
  notes?: string | null
  rms_frequency?: number
}) {
  return apiFetch<{ id: number; latitude?: string | number | null; longitude?: string | number | null }>(
    '/api/locations',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export function getProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/api/projects')
}

export function createProject(payload: {
  name: string
  description?: string
  due_date?: string
}) {
  return apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getProjectById(id: number): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/api/projects/${id}`)
}

export function updateProject(id: number, payload: {
  name?: string
  description?: string | null
  due_date?: string | null
  owner_user_id?: number
  assigned_user_ids?: number[]
  sections?: Array<{
    id?: number
    title: string
    tasks?: Array<{ id?: number; title: string; is_completed?: boolean }>
  }>
}) {
  return apiFetch(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function updateProjectStatus(id: number, status: string) {
  return apiFetch(`/api/projects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function toggleProjectTask(taskId: number) {
  return apiFetch(`/api/projects/tasks/${taskId}/toggle`, {
    method: 'PATCH',
  })
}

export function createProjectSection(projectId: number, title: string) {
  const url = `/api/projects/${projectId}/sections`
  const payload = { title }
  console.log('[API] create section request', url, payload)
  return apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error('[API] create section failed', url, payload, error)
    throw error
  })
}

export function createProjectTask(sectionId: number, description: string) {
  const url = `/api/projects/sections/${sectionId}/tasks`
  const payload = { description }
  console.log('[API] create task request', url, payload)
  return apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error('[API] create task failed', url, payload, error)
    throw error
  })
}

export function deleteProjectSection(sectionId: number) {
  const url = `/api/projects/sections/${sectionId}`
  console.log('[API] delete section request', url)
  return apiFetch(url, {
    method: 'DELETE',
  }).catch((error) => {
    console.error('[API] delete section failed', url, error)
    throw error
  })
}

export function createProjectTaskComment(taskId: number, text: string) {
  const url = `/api/projects/tasks/${taskId}/comments`
  const payload = { comment: text }
  console.log('[API] create task comment request', url, payload)
  console.log('[API] sending comment payload', payload)
  return apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error('[API] create task comment failed', url, payload, error)
    throw error
  })
}

export function deleteRmsOverviewDate(payload: { location_id: number; year: number; month: number }) {
  return apiFetch('/api/rms-overview', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}

export function uploadProjectAttachment(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch(`/api/projects/${projectId}/attachments`, {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

export function getProjectAttachments(projectId: number) {
  return apiFetch<Array<{ id: number; url: string }>>(`/api/projects/${projectId}/attachments`)
}

export function getWorkOrders(): Promise<WorkOrder[]> {
  return apiFetch<WorkOrder[]>('/api/work-orders')
}

export function getWorkOrderById(id: string): Promise<WorkOrderDetail> {
  return apiFetch<WorkOrderDetail>(`/api/work-orders/${id}`)
}

export function uploadWorkOrderAttachment(workOrderId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch<WorkOrderDetail>(`/api/work-orders/${workOrderId}/attachments`, {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

export function closeWorkOrder(id: number) {
  return apiFetch(`/api/work-orders/${id}/close`, {
    method: 'PUT',
  })
}

export function updateWorkOrderStatus(id: number, status: string) {
  return apiFetch(`/api/work-orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export interface UpdateWorkOrderItem {
  id?: number
  description: string
  sort_order?: number
  is_completed?: boolean
}

export interface UpdateWorkOrderPayload {
  issued_date?: string
  due_date?: string
  general_comment?: string
  items: UpdateWorkOrderItem[]
  elevator_ids?: number[]
  assigned_user_ids?: number[]
  /** work / material table: omitted = unchanged, [] = clear; rejected 409 work_order_closed once the order is closed */
  work_lines?: WorkLinePayload[]
}

/** Replaces only the work / material table of an OPEN work order (admin, or the technician assigned to it). */
export function updateWorkOrderWorkLines(id: number, workLines: WorkLinePayload[]) {
  return apiFetch<{ work_lines: WorkLine[] }>(`/api/work-orders/${id}/items`, {
    method: 'PUT',
    body: JSON.stringify({ work_lines: workLines }),
  })
}

export function updateWorkOrder(id: number, payload: UpdateWorkOrderPayload) {
  return apiFetch(`/api/work-orders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function toggleWorkOrderItem(itemId: number) {
  return apiFetch(`/api/work-orders/items/${itemId}/toggle`, {
    method: 'PATCH',
  })
}

export function getVehicles(): Promise<Vehicle[]> {
  return apiFetch<Vehicle[]>('/api/vehicles')
}

export function getLocationElevators(locationId: number) {
  return apiFetch<Array<{ id: number; label: string; serial_number?: string | null; control_group_type?: string | null; cabin_door_type?: string | null; lock_type?: string | null; machine_room_key?: string | null; comment?: string | null }>>(`/api/locations/${locationId}/elevators`)
}

export function createLocationElevator(locationId: number, payload: {
  label: string
  serial_number?: string
  control_group_type?: string
  cabin_door_type?: string
  lock_type?: string
  machine_room_key?: string
  comment?: string
}) {
  return apiFetch(`/api/locations/${locationId}/elevators`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateElevator(elevatorId: number, payload: {
  label?: string
  serial_number?: string
  control_group_type?: string
  cabin_door_type?: string
  lock_type?: string
  machine_room_key?: string
  comment?: string
}) {
  return apiFetch(`/api/elevators/${elevatorId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteElevator(elevatorId: number) {
  return apiFetch(`/api/elevators/${elevatorId}`, {
    method: 'DELETE',
  })
}

export interface QrLabelData {
  id: number
  label: string
  serial_number: string | null
  location_id: number
  location_name: string
  qr_token: string
}

export interface ElevatorByQr {
  elevator: {
    id: number
    label: string
    serial_number: string | null
    control_group_type: string | null
    cabin_door_type: string | null
    lock_type: string | null
    machine_room_key: string | null
    comment: string | null
    location_id: number
    location_name: string
    location_address: string | null
  }
  history: Array<{ id: number; source: 'rms' | 'intervention'; date: string; created_at: string; status: string | null; comment: string | null }>
}

export function getElevatorByQr(token: string) {
  return apiFetch<ElevatorByQr>(`/api/elevators/by-qr/${encodeURIComponent(token)}`)
}

/** Admin only. Creates missing tokens lazily and returns label data for a location, one elevator or all elevators. */
export function createQrLabels(scope: { location_id?: number; elevator_id?: number }) {
  return apiFetch<QrLabelData[]>('/api/elevators/qr-labels', {
    method: 'POST',
    body: JSON.stringify(scope),
  })
}

/** Admin only. Revokes the printed sticker: a new token is issued, the old code stops working. */
export function regenerateElevatorQr(elevatorId: number) {
  return apiFetch<QrLabelData>(`/api/elevators/${elevatorId}/qr-token/regenerate`, { method: 'POST' })
}

export function getRmsVisits(): Promise<RmsVisit[]> {
  return apiFetch<RmsVisit[]>('/api/rms')
}

export function getRmsVisitById(id: string): Promise<RmsVisitDetail> {
  return apiFetch<RmsVisitDetail>(`/api/rms-visits/${id}`)
}

export function getInterventionPhotos(id: number): Promise<{ photos: InterventionPhoto[] }> {
  return apiFetch<{ photos: InterventionPhoto[] }>(`/api/interventions/${id}/photos`)
}

export function getInterventions(): Promise<Intervention[]> {
  return apiFetch<Intervention[]>('/api/interventions')
}

export function filterRecords(payload: {
  type: 'rms' | 'intervencija'
  date_from?: string
  date_to?: string
  technician?: string
  status?: string
  signature_state?: string
}) {
  return apiFetch<Array<{
    id: number
    date: string
    created_at?: string
    technician?: string
    location_name?: string
    status?: string | null
    document_name?: string | null
    items?: Array<{ elevator_label: string; comment?: string | null }>
    elevator_label?: string | null
    signature_state?: string | null
  }>>('/api/records/filter', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateInterventionStatus(id: number, status: string) {
  return apiFetch(`/api/interventions/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export function getUsers(companyId?: number | null) {
  if (!companyId) {
    return Promise.resolve([] as User[])
  }
  return apiFetch<User[]>(`/api/companies/${companyId}/users`)
}

export interface CreateUserPayload {
  username: string
  role: 'admin' | 'technician' | 'viewer' | 'superadmin'
}

export function getUserById(id: number) {
  return apiFetch<User>(`/api/users/${id}`)
}

export function createUser(payload: CreateUserPayload) {
  return apiFetch<{ invite_link?: string }>(
    '/api/users',
    {
    method: 'POST',
    body: JSON.stringify(payload),
    }
  )
}

export function disableUser(id: number) {
  return apiFetch(`/api/users/${id}/disable`, {
    method: 'PUT',
  })
}

export function getUserStats(id: number) {
  return apiFetch<{
    rms_last_7_days: number
    rms_last_30_days: number
    interventions_last_7_days: number
    interventions_last_30_days: number
    rmsList: Array<{ id: number; date: string }>
    intList: Array<{ id: number; date: string }>
  }>(`/api/users/${id}/stats`)
}

export function getUserLatestRms(id: number) {
  return apiFetch<Array<{ id: number; lift_id: number; created_at: string }>>(`/api/users/${id}/rms-latest`)
}

export function getUserLatestInterventions(id: number) {
  return apiFetch<Array<{ id: number; location_id: number; created_at: string }>>(
    `/api/users/${id}/interventions-latest`
  )
}

export function resetUserPassword(id: number, password: string) {
  return apiFetch(`/api/users/${id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ newPassword: password }),
  })
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch('/api/users/me/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export function getUserActivity(params?: {
  page?: number
  limit?: number
  user_id?: number
  action?: string
  date_from?: string
  date_to?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.user_id) searchParams.set('user_id', String(params.user_id))
  if (params?.action) searchParams.set('action', params.action)
  if (params?.date_from) searchParams.set('date_from', params.date_from)
  if (params?.date_to) searchParams.set('date_to', params.date_to)
  const query = searchParams.toString()
  return apiFetch<{
    data: Array<{
      id: number
      user_id: number
      username: string
      action: string
      entity_type?: string
      entity_id?: number
      metadata?: Record<string, unknown>
      created_at: string
    }>
    total: number
    page: number
    limit: number
  }>(`/api/users/activity${query ? `?${query}` : ''}`)
}

export function exportUserActivity(params?: {
  page?: number
  limit?: number
  user_id?: number
  action?: string
  date_from?: string
  date_to?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.user_id) searchParams.set('user_id', String(params.user_id))
  if (params?.action) searchParams.set('action', params.action)
  if (params?.date_from) searchParams.set('date_from', params.date_from)
  if (params?.date_to) searchParams.set('date_to', params.date_to)
  const query = searchParams.toString()
  return fetch(`${BASE_URL}/api/users/activity/export${query ? `?${query}` : ''}`, {
    credentials: 'include',
  })
}

export function getSessions() {
  return apiFetch<{ sessions: Array<{
    id: string
    user_id: number
    username: string
    ip_address: string
    user_agent: string
    created_at: string
    last_activity: string
    is_current?: boolean
  }> }>('/api/sessions')
}

export function terminateSession(id: string) {
  return apiFetch(`/api/sessions/${id}`, {
    method: 'DELETE',
  })
}

export function terminateAllSessions() {
  return apiFetch<{ success: boolean; terminated: number }>(
    '/api/sessions',
    { method: 'DELETE' }
  )
}

export function getSessionSettings() {
  return apiFetch<{ session_timeout_hours: number }>('/api/settings/session')
}

export function updateSessionSettings(payload: { session_timeout_hours: number }) {
  return apiFetch<{ session_timeout_hours: number }>('/api/settings/session', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getCompanySettings() {
  return apiFetch<{ default_language: 'hr' | 'en' }>('/api/settings/company')
}

export function updateCompanySettings(payload: { default_language: 'hr' | 'en' }) {
  return apiFetch<{ success: boolean; default_language: 'hr' | 'en' }>('/api/settings/company', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getNotifications() {
  return apiFetch<
    Array<{
      id: number
      title?: string | null
      body?: string | null
      link?: string | null
      read_at?: string | null
      created_at?: string | null
    }>
  >('/api/notifications')
}

export function markNotificationRead(id: number) {
  return apiFetch(`/api/notifications/${id}/read`, {
    method: 'PUT',
  })
}

export function markAllNotificationsRead() {
  return apiFetch('/api/notifications/read-all', {
    method: 'PUT',
  })
}

export function getEmailSettings() {
  return apiFetch<{ company_email_enabled: boolean; smtp_configured: boolean }>(
    '/api/settings/email'
  )
}

export function updateEmailSettings(company_email_enabled: boolean) {
  return apiFetch<{ company_email_enabled: boolean }>('/api/settings/email', {
    method: 'PUT',
    body: JSON.stringify({ company_email_enabled }),
  })
}

export function sendTestEmail() {
  return apiFetch<{ queued: boolean }>('/api/settings/email/test', {
    method: 'POST',
  })
}

export function setPassword(payload: { token: string; password: string; accept_terms: boolean }) {
  return apiFetch('/api/auth/set-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getStatsRms(year: number, month: number): Promise<StatsResponse> {
  return apiFetch<StatsResponse>(`/api/stats/rms?year=${year}&month=${month}`)
}

export function getRmsOverview(year: number, month: number): Promise<RmsOverviewRow[]> {
  return apiFetch<RmsOverviewRow[]>(`/api/rms/monthly-overview?year=${year}&month=${month}`)
}

export interface CreateRmsPayload {
  /** UUID generated once per record; every retry re-sends the same id so the server never stores it twice */
  client_request_id?: string
  location_id: number
  visit_date: string
  rms_month?: string
  notes_general?: string
  items: Array<{
    elevator_label: string
    status:
      | 'O.K.'
      | 'Potreban popravak - Dizalo u funkciji'
      | 'Potreban popravak - Dizalo nije u funkciji'
    comment?: string
  }>
  /** Defects found on elevators whose item has a repair status (see lib/findings.ts) */
  findings?: FindingRequestEntry[]
}

export interface CreateWorkOrderItem {
  description: string
  sort_order?: number
}

export interface CreateWorkOrderPayload {
  location_id: number
  issued_date?: string
  due_date?: string
  general_comment?: string
  items: CreateWorkOrderItem[]
  elevator_ids?: number[]
  assigned_user_ids?: number[]
  work_lines?: WorkLinePayload[]
}

export interface CreateVehiclePayload {
  name: string
  year: number
  last_registration_date: string
  registration_expiry_date: string
  image?: File | null
}


export interface CreateInterventionPayload {
  technician: string
  second_technician?: string
  location: string
  notes?: string
  date: string
  status?: string
  elevator_items?: Array<{
    elevator_label: string
    status?: string
    comment?: string
  }>
  images?: File[]
  /** Defects found on elevators whose item has a repair status (sent as a JSON string) */
  findings?: FindingRequestEntry[]
  /** Work / material table rows (sent as a JSON string); locked once the intervention is signed */
  work_lines?: WorkLinePayload[]
  /** UUID generated once per record; every retry re-sends the same id so the server never stores it twice */
  client_request_id?: string
}

/** A stalled mobile connection must fail (-> saved on the device) instead of hanging forever. */
export function onlineRequestSignal(ms = 30_000): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined
}

export function createRms(payload: CreateRmsPayload) {
  return apiFetch<{ id: number }>('/api/rms-visits', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: onlineRequestSignal(),
  })
}

// ---- Findings (faults per elevator) ----
export interface Finding {
  id: number
  location_id: number
  location_name: string | null
  elevator_id: number | null
  elevator_label: string
  source_type: 'rms_visit_item' | 'intervention' | 'manual'
  source_id: number | null
  description: string
  category: FindingCategory
  severity: FindingSeverity
  needs_part: boolean
  part_note: string | null
  created_by_user_id: number | null
  created_at: string
  state: FindingState
  parts_ordered: boolean
  parts_ordered_at: string | null
  resolved_at: string | null
  days_open: number
}

export interface FindingEvent {
  id: number
  event_type: FindingEventType
  state: FindingState | null
  note: string | null
  user_id: number | null
  user_name: string | null
  intervention_id: number | null
  work_order_id: number | null
  created_at: string
}

export interface FindingDetail extends Finding {
  created_by_name: string | null
  events: FindingEvent[]
}

export interface FindingsSummary {
  open: number
  out_of_service: number
  in_service: number
  recommendation: number
  needs_part: number
  to_order: number
  waiting_part: number
  oldest_days: number | null
}

export interface FindingsQuery {
  state?: 'open' | 'all' | FindingState
  severity?: FindingSeverity
  location_id?: number
  elevator_id?: number
  needs_part?: boolean
  parts_ordered?: boolean
  limit?: number
  offset?: number
}

export function getFindings(query: FindingsQuery = {}) {
  const params = new URLSearchParams()
  if (query.state) params.set('state', query.state)
  if (query.severity) params.set('severity', query.severity)
  if (query.location_id) params.set('location_id', String(query.location_id))
  if (query.elevator_id) params.set('elevator_id', String(query.elevator_id))
  if (query.needs_part) params.set('needs_part', '1')
  if (query.parts_ordered !== undefined) params.set('parts_ordered', query.parts_ordered ? '1' : '0')
  if (query.limit) params.set('limit', String(query.limit))
  if (query.offset) params.set('offset', String(query.offset))
  const qs = params.toString()
  return apiFetch<{ items: Finding[]; total: number; limit: number; offset: number }>(`/api/findings${qs ? `?${qs}` : ''}`)
}

export const getFindingsSummary = () => apiFetch<FindingsSummary>('/api/findings/summary')

export const getFinding = (id: number) => apiFetch<FindingDetail>(`/api/findings/${id}`)

export interface CreateFindingPayload {
  location_id: number
  elevator_id: number
  description: string
  category?: string
  severity?: FindingSeverity
  needs_part?: boolean
  part_note?: string
  client_request_id?: string
}

export const createFinding = (payload: CreateFindingPayload) =>
  apiFetch<{ id: number }>('/api/findings', { method: 'POST', body: JSON.stringify(payload) })

export interface AddFindingEventPayload {
  event_type: Exclude<FindingEventType, 'opened'>
  state?: Exclude<FindingState, 'resolved'>
  note?: string
}

export const addFindingEvent = (id: number, payload: AddFindingEventPayload) =>
  apiFetch<{ id: number; state: FindingState }>(`/api/findings/${id}/events`, { method: 'POST', body: JSON.stringify(payload) })

export function createWorkOrder(payload: CreateWorkOrderPayload) {
  return apiFetch('/api/work-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

const createVehicleFormData = (payload: CreateVehiclePayload) => {
  const formData = new FormData()
  formData.append('name', payload.name)
  formData.append('year', String(payload.year))
  formData.append('last_registration_date', payload.last_registration_date)
  formData.append('registration_expiry_date', payload.registration_expiry_date)
  if (payload.image) {
    formData.append('image', payload.image)
  }
  return formData
}

export function createVehicle(payload: CreateVehiclePayload) {
  return apiFetch<Vehicle>('/api/vehicles', {
    method: 'POST',
    body: createVehicleFormData(payload),
  })
}

export function updateVehicle(id: number, payload: CreateVehiclePayload) {
  return apiFetch<Vehicle>(`/api/vehicles/${id}`, {
    method: 'PUT',
    body: createVehicleFormData(payload),
  })
}

export function deleteVehicle(id: number) {
  return apiFetch(`/api/vehicles/${id}`, {
    method: 'DELETE',
  })
}

export function getCompany() {
  return apiFetch<Company>('/api/company')
}

export function updateCompany(payload: {
  name: string
  address?: string | null
  contact_person?: string | null
  contact_phone?: string | null
  oib?: string | null
  notes?: string | null
}) {
  return apiFetch<Company>('/api/company', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error
    }

    return apiFetch<Company>('/api/company/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  })
}

export function uploadCompanyLogo(file: File) {
  const formData = new FormData()
  formData.append('logo', file)
  return apiFetch<{ path: string }>('/api/company/logo', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

export function buildInterventionFormData(payload: CreateInterventionPayload): FormData {
  const formData = new FormData()
  formData.append('technician', payload.technician)
  if (payload.second_technician) {
    formData.append('second_technician', payload.second_technician)
  }
  formData.append('location', payload.location)
  if (payload.notes) {
    formData.append('notes', payload.notes)
  }
  formData.append('date', payload.date)
  if (payload.status) {
    formData.append('status', payload.status)
  }
  if (payload.elevator_items) {
    formData.append('elevator_items', JSON.stringify(payload.elevator_items))
  }
  if (payload.findings && payload.findings.length > 0) {
    formData.append('findings', JSON.stringify(payload.findings))
  }
  if (payload.work_lines && payload.work_lines.length > 0) {
    formData.append('work_lines', JSON.stringify(payload.work_lines))
  }
  if (payload.client_request_id) {
    formData.append('client_request_id', payload.client_request_id)
  }
  payload.images?.forEach((file) => {
    formData.append('images', file)
  })
  return formData
}

export function createIntervention(payload: CreateInterventionPayload) {
  return apiFetch<{ id: number }>('/api/interventions', {
    method: 'POST',
    body: buildInterventionFormData(payload),
    headers: {},
    signal: onlineRequestSignal(),
  })
}

export const dataUrlToFile = (dataUrl: string, filename: string) => {
  const [header, data] = dataUrl.split(',')
  const mimeMatch = header.match(/data:(.*);base64/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i)
  }
  return new File([array], filename, { type: mime })
}

export function signReport(payload: {
  type: 'rms' | 'intervention'
  id: number
  technician?: string | null
  client?: string | null
  /** name + role of the person signing for the client (required by the server when a client signature is sent) */
  clientSigner?: { name: string; role: string } | null
  /** language of the issued PDF (UI language of the signer) */
  language?: string
}) {
  const formData = new FormData()
  if (payload.technician) {
    formData.append('technician_signature', dataUrlToFile(payload.technician, 'technician.png'))
  }
  if (payload.client) {
    formData.append('client_signature', dataUrlToFile(payload.client, 'client.png'))
    if (payload.clientSigner) {
      formData.append('client_signer_name', payload.clientSigner.name)
      formData.append('client_signer_role', payload.clientSigner.role)
    }
  }
  if (payload.language) formData.append('language', payload.language)
  return apiFetch(`/api/reports/${payload.type}/${payload.id}/sign`, {
    method: 'POST',
    body: formData,
    headers: {},
    signal: onlineRequestSignal(),
  })
}

export function getInterventionById(id: number) {
  return apiFetch<Record<string, unknown> & { work_lines?: WorkLine[] }>(`/api/interventions/${id}`)
}

const api = {
  get: async <T>(path: string): Promise<{ data: T }> => {
    const data = await apiFetch<T>(path)
    return { data }
  },
  post: async <T>(path: string, body?: unknown): Promise<{ data: T }> => {
    const data = await apiFetch<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
    return { data }
  },
}

export default api
