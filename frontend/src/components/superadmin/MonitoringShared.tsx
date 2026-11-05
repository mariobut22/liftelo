import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/** Card used by all monitoring panels (same look as the cards on the dashboard). */
export function PanelCard({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6', className)}>
      {title || aside ? (
        <div className="mb-3 flex items-start justify-between gap-2">
          {title ? <h2 className="text-lg font-medium text-gray-700">{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums text-zinc-900',
          tone === 'good' && 'text-emerald-700',
          tone === 'warn' && 'text-amber-700',
          tone === 'bad' && 'text-red-700'
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
}

/** Loading / error (translated ApiError message) / retry wrapper around a TanStack query. */
export function QueryBoundary<T>({ query, children }: { query: UseQueryResult<T, Error>; children: (data: T) => ReactNode }) {
  const { t } = useTranslation('superadmin')
  if (query.isLoading) {
    return <p className="py-10 text-center text-sm text-gray-500">{t('monitoring.loading')}</p>
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-rose-600">{query.error?.message || t('monitoring.loadError')}</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t('superadminDashboard.retry')}
        </Button>
      </div>
    )
  }
  return <>{children(query.data)}</>
}

/** Plain CSS bar chart (no chart library): one bar per label, value above the bar, accessible summary via aria-label. */
export function BarChart({ values, labels, barClass, ariaLabel }: { values: number[]; labels: string[]; barClass: string; ariaLabel: string }) {
  const max = Math.max(1, ...values)
  return (
    <div role="img" aria-label={ariaLabel} className="flex h-40 items-end gap-1 sm:gap-2">
      {values.map((value, index) => (
        <div key={labels[index] + index} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-medium tabular-nums text-zinc-700">{value}</span>
          <div
            className={cn('w-full rounded-t', barClass, value === 0 && 'opacity-30')}
            style={{ height: `${Math.max(value === 0 ? 2 : 6, (value / max) * 100 * 0.78)}%` }}
          />
          <span className={cn('w-full truncate text-center text-[10px] text-gray-500', index % 2 === 1 && 'max-sm:invisible')}>{labels[index]}</span>
        </div>
      ))}
    </div>
  )
}
