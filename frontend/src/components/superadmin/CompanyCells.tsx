import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOverviewStatusLabel } from '../../hooks/useOverviewStatusLabel'
import { useFormat } from '../../lib/format'
import {
  daysSince,
  daysUntil,
  getOverviewStatus,
  getRelevantEnd,
  limitState,
  type LimitState,
  type OverviewStatus,
} from '../../lib/superadminOverview'
import type { SuperadminCompanyRow } from '../../types/superadmin'
import { cn } from '../../lib/utils'

const STATUS_STYLE: Record<OverviewStatus, string> = {
  trial: 'bg-sky-100 text-sky-700',
  trial_expired: 'bg-red-100 text-red-700',
  active: 'bg-emerald-100 text-emerald-700',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-zinc-200 text-zinc-700',
  suspended: 'bg-red-100 text-red-700',
  none: 'bg-zinc-100 text-zinc-500',
}

export function PlanBadge({ company }: { company: SuperadminCompanyRow }) {
  const { t } = useTranslation('superadmin')
  const { formatCurrency } = useFormat()
  const sub = company.subscription
  if (!sub) return null
  const price = sub.price_cents === null ? null : formatCurrency(sub.price_cents / 100)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
      <span className="rounded-md bg-zinc-900 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
        {sub.plan_name}
      </span>
      {price ? <span>{t('superadminDashboard.perMonth', { price })}</span> : null}
      {sub.has_stripe ? (
        <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600">
          {t('superadminDashboard.stripeLinked')}
        </span>
      ) : null}
    </span>
  )
}

export function StatusCell({ company, now }: { company: SuperadminCompanyRow; now: number }) {
  const { t } = useTranslation('superadmin')
  const { formatDate } = useFormat()
  const statusLabel = useOverviewStatusLabel()
  const status = getOverviewStatus(company)
  const end = getRelevantEnd(company)
  const days = daysUntil(end, now)
  const sub = company.subscription

  let dateLine: string | null = null
  if (end && sub) {
    const date = formatDate(end)
    if (status === 'trial' || status === 'trial_expired') dateLine = t('superadminDashboard.trialEnds', { date })
    else if (status === 'active') dateLine = t(sub.cancel_at_period_end ? 'superadminDashboard.periodEnds' : 'superadminDashboard.periodRenews', { date })
    else dateLine = t(days !== null && days < 0 ? 'superadminDashboard.periodEnded' : 'superadminDashboard.periodEnds', { date })
  }

  let daysLine: string | null = null
  let urgent = false
  if (days !== null && (status === 'trial' || status === 'trial_expired' || status === 'active')) {
    if (days < 0) {
      daysLine = t('superadminDashboard.expiredDaysAgo', { count: Math.abs(days) })
      urgent = true
    } else if (days === 0) {
      daysLine = t('superadminDashboard.endsToday')
      urgent = true
    } else {
      daysLine = t('superadminDashboard.daysLeft', { count: days })
      urgent = days <= 3 && status !== 'active'
    }
  }

  return (
    <div className="space-y-1">
      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', STATUS_STYLE[status])}>{statusLabel(status)}</span>
      {dateLine ? <div className="text-xs text-zinc-500">{dateLine}</div> : null}
      {daysLine ? <div className={cn('text-xs', urgent ? 'font-medium text-red-600' : 'text-zinc-500')}>{daysLine}</div> : null}
      {sub?.cancel_at_period_end && status === 'active' ? (
        <div className="text-xs text-amber-600">{t('superadminDashboard.cancelsAtPeriodEnd')}</div>
      ) : null}
    </div>
  )
}

const LIMIT_STYLE: Record<LimitState, string> = {
  ok: 'text-zinc-700',
  at: 'font-medium text-amber-600',
  over: 'font-semibold text-red-600',
}

function UsageLine({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { t } = useTranslation('superadmin')
  const state = limitState(used, limit)
  const hint = state === 'over' ? t('superadminDashboard.limitOver') : state === 'at' ? t('superadminDashboard.limitAt') : undefined
  return (
    <div className={cn('flex items-center gap-1.5 text-xs', LIMIT_STYLE[state])} title={hint}>
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums">
        {used}/{limit === null ? '∞' : limit}
      </span>
      {state !== 'ok' ? <AlertTriangle className="h-3.5 w-3.5" aria-label={hint} /> : null}
    </div>
  )
}

export function UsageCell({ company }: { company: SuperadminCompanyRow }) {
  const { t } = useTranslation('superadmin')
  return (
    <div className="space-y-0.5" title={t('superadminDashboard.membersTooltip', { viewers: company.usage.viewers })}>
      <UsageLine label={t('superadminDashboard.admins')} used={company.usage.admins} limit={company.limits.admin} />
      <UsageLine label={t('superadminDashboard.technicians')} used={company.usage.technicians} limit={company.limits.technician} />
    </div>
  )
}

export function ActivityCell({ company, now }: { company: SuperadminCompanyRow; now: number }) {
  const { t } = useTranslation('superadmin')
  const { locale, formatDate } = useFormat()
  const days = daysSince(company.last_activity_at, now)
  if (!company.last_activity_at || days === null) {
    return <span className="text-xs text-zinc-400">{t('superadminDashboard.noActivity')}</span>
  }
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')
  return (
    <div className="space-y-0.5">
      <div className={cn('text-sm', days >= 14 ? 'font-medium text-amber-600' : 'text-zinc-700')}>{relative}</div>
      <div className="text-xs text-zinc-500">{formatDate(company.last_activity_at)}</div>
    </div>
  )
}
