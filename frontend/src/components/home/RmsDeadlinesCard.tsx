import { CalendarClock, CheckCircle2, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Card } from '../ui/card'
import { useRmsDeadlines } from '../../hooks/queries/useRmsDeadlines'
import { cn } from '../../lib/utils'
import { getLocale } from '../../i18n'

const MAX_ROWS = 6

const TONES = {
  critical: { card: 'border-rose-300 bg-rose-50/60', icon: 'bg-rose-100 text-rose-600', days: 'text-rose-700' },
  warning: { card: 'border-amber-300 bg-amber-50/60', icon: 'bg-amber-100 text-amber-600', days: 'text-amber-700' },
  normal: { card: 'border-zinc-200', icon: 'bg-zinc-100 text-zinc-600', days: 'text-zinc-700' },
  done: { card: 'border-emerald-200', icon: 'bg-emerald-100 text-emerald-600', days: 'text-emerald-700' },
} as const

/**
 * Home card "RMS deadlines": days left in the month, locations still without RMS and locations overdue from last month.
 * Same list for every role (RMS is company-wide). Colour: 7 days left = amber, last 3 days or overdue = red.
 * Rows open the location (where a new RMS is started). Data: GET /api/rms/deadlines.
 */
function RmsDeadlinesCard() {
  const { t, i18n } = useTranslation('dashboard')
  const { data } = useRmsDeadlines()

  if (!data || (data.expected === 0 && data.overdue_count === 0)) return null

  const tone = TONES[data.urgency]
  const monthName = (year: number, month: number) =>
    new Date(year, month - 1, 1).toLocaleDateString(getLocale(i18n.language), { month: 'long' })

  if (data.urgency === 'done') {
    return (
      <Card data-testid="rms-deadlines-card" data-urgency="done" className={cn('rounded-2xl border p-4 shadow-sm sm:p-6', tone.card)}>
        <div className="flex items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tone.icon)}>
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">{t('rmsDeadlines.title')}</p>
            <p className="text-sm text-zinc-600">{t('rmsDeadlines.allDone')}</p>
          </div>
        </div>
      </Card>
    )
  }

  const overdueById = new Map(data.overdue_locations.map((location) => [location.id, location]))
  const rows = [
    ...data.overdue_locations.map((location) => ({
      id: location.id,
      name: location.name,
      overdueMonth: monthName(location.year, location.month),
    })),
    ...data.missing_locations
      .filter((location) => !overdueById.has(location.id))
      .map((location) => ({ id: location.id, name: location.name, overdueMonth: null as string | null })),
  ]
  const visible = rows.slice(0, MAX_ROWS)

  return (
    <Card
      data-testid="rms-deadlines-card"
      data-urgency={data.urgency}
      className={cn('rounded-2xl border p-4 shadow-sm sm:p-6', tone.card)}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tone.icon)}>
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">{t('rmsDeadlines.title')}</p>
            <p data-testid="rms-deadlines-days" className={cn('text-sm font-medium', tone.days)}>
              {data.days_left === 0 ? t('rmsDeadlines.lastDay') : t('rmsDeadlines.daysLeft', { count: data.days_left })}
            </p>
            <p data-testid="rms-deadlines-missing" className="text-sm text-zinc-600">
              {data.missing_count > 0
                ? t('rmsDeadlines.missing', { count: data.missing_count })
                : t('rmsDeadlines.noneMissingThisMonth')}
              {data.overdue_count > 0 ? ` · ${t('rmsDeadlines.overdue', { count: data.overdue_count })}` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {visible.map((row) => (
            <Link
              key={row.id}
              to={`/dashboard/locations/${row.id}`}
              data-testid="rms-deadlines-row"
              data-overdue={row.overdueMonth ? 'true' : 'false'}
              className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-zinc-900">{row.name}</span>
                {row.overdueMonth ? (
                  <span className="block text-xs text-rose-600">
                    {t('rmsDeadlines.overdueFrom', { month: row.overdueMonth })}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </Link>
          ))}
          {rows.length > MAX_ROWS ? (
            <Link
              to="/dashboard/rms-overview"
              data-testid="rms-deadlines-more"
              className="inline-flex min-h-9 items-center text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              {t('rmsDeadlines.more', { count: rows.length - MAX_ROWS })}
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

export default RmsDeadlinesCard
