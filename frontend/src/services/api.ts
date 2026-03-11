import { onUnauthorized } from './authEvents'
import type { Location, LocationWithActivity } from '../types/location'
import type { ProjectDetail } from '../types/project-detail'
import type { WorkOrder } from '../types/work-order'
import type { WorkOrderDetail } from '../types/work-order-detail'
import type { Vehicle } from '../types/vehicle'
import type { RmsVisit, RmsVisitDetail } from '../types/rms'
import type { Intervention } from '../types/intervention'
import type { StatsResponse } from '../types/stats'
import type { User } from '../types/user'
import type { RmsOverviewRow } from '../types/rms-overview'
import type { Project } from '../types/project'
import type { Company } from '../types/company'
import type { SuperadminCompanyRow, SuperadminStats } from '../types/superadmin'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api';
const BASE_URL = API_BASE_URL

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = options.body instanceof FormData
  console.debug('[apiFetch] request', { url })
  const response = await fetch(`${BASE_URL}${url}`, {
    credentials: 'include',
    headers: isFormData
      ? options.headers
      : {
          'Content-Type': 'application/json',
          ...options.headers,
        },
    ...options,
  })

  console.debug('[apiFetch] response', { url, status: response.status })
  if (response.status === 401) {
    console.warn('[apiFetch] unauthorized', { url, status: response.status })
    onUnauthorized()
    throw new Error('Unauthorized')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const detail = text ? ` ${text}` : ''
    console.error('[API] error response', url, response.status, text)
    throw new Error(`HTTP ${response.status}${detail}`)
  }

  return response.json() as Promise<T>
}

export function getSuperadminCompanies(): Promise<SuperadminCompanyRow[]> {
  return apiFetch<SuperadminCompanyRow[]>('/api/superadmin/companies')
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

export function updateUserLanguage(language: 'en' | 'hr') {
  return apiFetch<{ language: 'en' | 'hr' }>('/api/users/me/language', {
    method: 'PUT',
    body: JSON.stringify({ language }),
  })
}

export function inviteCompanyUser(companyId: number, payload: { email: string; role: string }) {
  return apiFetch('/api/companies/' + companyId + '/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function acceptInvitation(payload: { token: string; password: string }) {
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

export function getRmsVisits(): Promise<RmsVisit[]> {
  return apiFetch<RmsVisit[]>('/api/rms')
}

export function getRmsVisitById(id: string): Promise<RmsVisitDetail> {
  return apiFetch<RmsVisitDetail>(`/api/rms-visits/${id}`)
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

export function setPassword(payload: { token: string; password: string }) {
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
}

export function createRms(payload: CreateRmsPayload) {
  return apiFetch<{ id: number }>('/api/rms-visits', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

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
  return apiFetch('/api/vehicles', {
    method: 'POST',
    body: createVehicleFormData(payload),
  })
}

export function updateVehicle(id: number, payload: CreateVehiclePayload) {
  return apiFetch(`/api/vehicles/${id}`, {
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

export function uploadCompanyLogo(file: File) {
  const formData = new FormData()
  formData.append('logo', file)
  return apiFetch<{ path: string }>('/api/company/logo', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

export function createIntervention(payload: CreateInterventionPayload) {
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
  payload.images?.forEach((file) => {
    formData.append('images', file)
  })

  return apiFetch<{ id: number }>('/api/interventions', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

const dataUrlToFile = (dataUrl: string, filename: string) => {
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

export function signReport(payload: { type: 'rms' | 'intervention'; id: number; technician?: string | null; client?: string | null }) {
  const formData = new FormData()
  if (payload.technician) {
    formData.append('technician_signature', dataUrlToFile(payload.technician, 'technician.png'))
  }
  if (payload.client) {
    formData.append('client_signature', dataUrlToFile(payload.client, 'client.png'))
  }
  return apiFetch(`/api/reports/${payload.type}/${payload.id}/sign`, {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

export function getInterventionById(id: number) {
  return apiFetch(`/api/interventions/${id}`)
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
