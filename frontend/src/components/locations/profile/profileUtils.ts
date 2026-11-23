import { getLocale } from '../../../i18n'
import type { Finding } from '../../../services/api'
import type useLocationElevators from '../../../hooks/queries/useLocationElevators'

export type ElevatorRow = NonNullable<ReturnType<typeof useLocationElevators>['data']>[number]

export const TAB_IDS = ['overview', 'elevators', 'faults', 'history', 'info'] as const
export type TabId = (typeof TAB_IDS)[number]

export const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(getLocale()) : '—')

export const formatTime = (value?: string | null) => (value ? new Date(value).toLocaleTimeString(getLocale()) : '')

export type MonthlyRow = { label: string; status: 'done' | 'late' | 'missing' | 'na'; displayDate?: string | null; year: number; month: number }

/** Last 12 months, newest first. A month is "late" when its RMS was only done in the following month. */
export const buildMonthlyRows = (visits: Array<{ visit_date: string; rms_month?: string | null }> = [], frequency = 1): MonthlyRow[] => {
  const now = new Date()
  const months: Array<{ year: number; month: number }> = []
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: date.getFullYear(), month: date.getMonth() + 1 })
  }
  const visitLookup = new Map<string, { visit_date: string; rms_month?: string | null }>()
  visits.forEach((visit) => {
    const parsed = new Date(visit.rms_month || visit.visit_date)
    if (Number.isNaN(parsed.getTime())) return
    const key = `${parsed.getFullYear()}-${parsed.getMonth() + 1}`
    const existing = visitLookup.get(key)
    if (!existing || new Date(existing.visit_date) < new Date(visit.visit_date)) visitLookup.set(key, visit)
  })
  const isExpected = (month: number) => (month - 1) % (frequency || 1) === 0
  return months.map(({ year, month }): MonthlyRow => {
    const key = `${year}-${month}`
    const nextKey = month === 12 ? `${year + 1}-1` : `${year}-${month + 1}`
    const visit = visitLookup.get(key)
    const nextVisit = visitLookup.get(nextKey)
    const status = isExpected(month) ? (visit ? 'done' : nextVisit ? 'late' : 'missing') : 'na'
    const displayDate = status === 'na' ? null : visit?.rms_month || visit?.visit_date || nextVisit?.rms_month || nextVisit?.visit_date || null
    return { label: `${String(month).padStart(2, '0')}/${year}`, status, displayDate, year, month }
  })
}

/** Next month (this one if still missing) in which an RMS is expected, as MM/YYYY. */
export const nextRmsDue = (rows: MonthlyRow[], frequency = 1): string => {
  const current = rows[0]
  if (current && (current.status === 'missing' || current.status === 'late')) return current.label
  const freq = frequency || 1
  const now = new Date()
  for (let i = 1; i <= 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    if (date.getMonth() % freq === 0) return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  }
  return '—'
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { out_of_service: 0, in_service: 1, recommendation: 2 }

export const sortFaults = (items: Finding[]) =>
  [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.days_open - a.days_open)

export const worstSeverity = (items: Finding[]): Finding['severity'] | null =>
  items.length ? sortFaults(items)[0].severity : null

export const SEVERITY_CHIP: Record<Finding['severity'], string> = {
  out_of_service: 'border-rose-200 bg-rose-50 text-rose-700',
  in_service: 'border-amber-200 bg-amber-50 text-amber-700',
  recommendation: 'border-zinc-200 bg-zinc-50 text-zinc-700',
}


export type LocationFormValues = {
  name: string
  address: string
  contact_person: string
  contact_phone: string
  upravitelj: string
  kljuc_strojarnice: string
  notes: string
  rms_frequency: number
}

export type ElevatorFormValues = {
  label: string
  serial_number: string
  control_group_type: string
  cabin_door_type: string
  lock_type: string
  machine_room_key: string
  comment: string
}

export const emptyElevatorForm: ElevatorFormValues = {
  label: '',
  serial_number: '',
  control_group_type: '',
  cabin_door_type: '',
  lock_type: '',
  machine_room_key: '',
  comment: '',
}


export const tabButtonId = (id: TabId) => `loc-tab-${id}`
export const tabPanelId = (id: TabId) => `loc-panel-${id}`
