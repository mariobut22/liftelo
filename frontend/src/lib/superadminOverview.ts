import type { SuperadminCompanyRow } from '../types/superadmin'

const DAY_MS = 86_400_000
export const INACTIVE_DAYS = 14
export const TRIAL_WARNING_DAYS = 3

/** Display status of a company: real subscription status, with an expired trial and a missing subscription split out. */
export type OverviewStatus = 'trial' | 'trial_expired' | 'active' | 'past_due' | 'canceled' | 'suspended' | 'none'

export const OVERVIEW_STATUSES: OverviewStatus[] = ['trial', 'trial_expired', 'active', 'past_due', 'canceled', 'suspended', 'none']

export type AlertKey = 'trialEnding' | 'expired' | 'billing' | 'overLimit' | 'inactive'
export const ALERT_KEYS: AlertKey[] = ['trialEnding', 'expired', 'billing', 'overLimit', 'inactive']

export const getOverviewStatus = (company: SuperadminCompanyRow): OverviewStatus => {
  if (!company.subscription) return 'none'
  if (company.access.reason === 'trial_expired') return 'trial_expired'
  return company.subscription.status
}

/** Whole days from now until `iso` (negative = in the past). null when there is no date. */
export const daysUntil = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return Math.ceil((time - now) / DAY_MS)
}

/** The date that matters for the status: trial end while on trial, otherwise the current period end. */
export const getRelevantEnd = (company: SuperadminCompanyRow): string | null => {
  const sub = company.subscription
  if (!sub) return null
  return sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end
}

export const daysSince = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return Math.floor((now - time) / DAY_MS)
}

export type LimitState = 'ok' | 'at' | 'over'

export const limitState = (used: number, limit: number | null): LimitState => {
  if (limit === null) return 'ok'
  if (used > limit) return 'over'
  if (used >= limit) return 'at'
  return 'ok'
}

export const getAlerts = (company: SuperadminCompanyRow, now: number): AlertKey[] => {
  const alerts: AlertKey[] = []
  const status = getOverviewStatus(company)
  const trialDays = status === 'trial' ? daysUntil(company.subscription?.trial_ends_at, now) : null
  if (trialDays !== null && trialDays >= 0 && trialDays <= TRIAL_WARNING_DAYS) alerts.push('trialEnding')
  if (status === 'trial_expired') alerts.push('expired')
  if (status === 'past_due' || status === 'canceled' || status === 'suspended') alerts.push('billing')
  if (
    limitState(company.usage.admins, company.limits.admin) !== 'ok' ||
    limitState(company.usage.technicians, company.limits.technician) !== 'ok'
  ) {
    alerts.push('overLimit')
  }
  // never active: measured from the day the company was created
  const idleDays = daysSince(company.last_activity_at ?? company.created_at, now)
  if (idleDays !== null && idleDays >= INACTIVE_DAYS) alerts.push('inactive')
  return alerts
}

const STATUS_ORDER: Record<OverviewStatus, number> = {
  trial_expired: 0,
  past_due: 1,
  suspended: 2,
  canceled: 3,
  trial: 4,
  active: 5,
  none: 6,
}

export type SortKey = 'created' | 'name' | 'status' | 'users' | 'locations' | 'rms' | 'interventions' | 'activity'

export const compareCompanies = (a: SuperadminCompanyRow, b: SuperadminCompanyRow, key: SortKey): number => {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    case 'status':
      return STATUS_ORDER[getOverviewStatus(a)] - STATUS_ORDER[getOverviewStatus(b)]
    case 'users':
      return a.total_users - b.total_users
    case 'locations':
      return a.total_locations - b.total_locations
    case 'rms':
      return a.total_rms - b.total_rms
    case 'interventions':
      return a.total_interventions - b.total_interventions
    case 'activity':
      return (a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0) - (b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0)
    case 'created':
    default:
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  }
}
