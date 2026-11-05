import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getSuperadminHealth } from '../../services/api'
import type { SuperadminHealth } from '../../types/superadmin'
import { useFormat } from '../../lib/format'
import { Button } from '../ui/button'
import { PanelCard, QueryBoundary, Stat } from './MonitoringShared'

const formatBytes = (bytes: number, formatNumber: (v: number, o?: Intl.NumberFormatOptions) => string) => {
  if (bytes < 1024) return `${formatNumber(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${formatNumber(value, { maximumFractionDigits: 1 })} ${units[unit]}`
}

function HealthContent({ data, onRefresh, refreshing }: { data: SuperadminHealth; onRefresh: () => void; refreshing: boolean }) {
  const { t } = useTranslation('superadmin')
  const { formatNumber, formatDateTime } = useFormat()
  const { outbox, billing, uploads, app, database } = data
  const days = Math.floor(app.uptime_seconds / 86400)
  const hours = Math.floor((app.uptime_seconds % 86400) / 3600)
  const minutes = Math.floor((app.uptime_seconds % 3600) / 60)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">{t('monitoring.health.checkedAt', { time: formatDateTime(data.generated_at) })}</p>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {t('monitoring.refresh')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        <Stat
          label={t('monitoring.health.database')}
          value={database.ok ? t('monitoring.health.ok') : t('monitoring.health.down')}
          tone={database.ok ? 'good' : 'bad'}
          hint={database.ping_ms === null ? undefined : t('monitoring.health.ping', { ms: database.ping_ms })}
        />
        <Stat
          label={t('monitoring.health.outboxFailed')}
          value={outbox.available ? formatNumber(outbox.failed) : '—'}
          tone={outbox.available && outbox.failed > 0 ? 'bad' : 'default'}
          hint={outbox.available ? t('monitoring.health.last24h', { count: outbox.failed_last_24h }) : t('monitoring.health.unavailable')}
        />
        <Stat
          label={t('monitoring.health.webhookFailed')}
          value={billing.available ? formatNumber(billing.last_7_days.failed) : '—'}
          tone={billing.available && billing.last_7_days.failed > 0 ? 'bad' : 'default'}
          hint={billing.available ? t('monitoring.health.last7d') : t('monitoring.health.unavailable')}
        />
        <Stat
          label={t('monitoring.health.uploads')}
          value={uploads.available ? formatBytes(uploads.bytes, formatNumber) : '—'}
          hint={
            uploads.available
              ? `${t('monitoring.health.fileCount', { count: uploads.files })}${uploads.truncated ? ` · ${t('monitoring.health.truncated')}` : ''}`
              : t('monitoring.health.unavailable')
          }
        />
      </div>

      <PanelCard title={t('monitoring.health.outboxTitle')}>
        {!outbox.available ? (
          <p className="text-sm text-gray-500">{t('monitoring.health.unavailable')}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['pending', outbox.pending],
                  ['sentLast24h', outbox.sent_last_24h],
                  ['failedLast24h', outbox.failed_last_24h],
                  ['sending', outbox.sending],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-gray-100 p-3">
                  <dd className="text-xl font-semibold tabular-nums text-zinc-900">{formatNumber(value)}</dd>
                  <dt className="text-xs text-gray-500">{t(`monitoring.health.outbox.${key}`)}</dt>
                </div>
              ))}
            </dl>
            {outbox.oldest_pending_at ? (
              <p className="mt-2 text-xs text-amber-700">{t('monitoring.health.oldestPending', { time: formatDateTime(outbox.oldest_pending_at) })}</p>
            ) : null}
            <h3 className="mt-4 text-sm font-medium text-gray-700">{t('monitoring.health.lastFailedEmails')}</h3>
            {outbox.last_failed.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">{t('monitoring.health.noFailures')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {outbox.last_failed.map((row) => (
                  <li key={row.id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-gray-500">
                      <span>
                        {row.type ?? '—'} · {t('monitoring.health.attempts', { count: row.attempts })}
                      </span>
                      <span>{formatDateTime(row.created_at)}</span>
                    </div>
                    <p className="mt-0.5 break-words text-zinc-700">{row.error ?? t('monitoring.health.noErrorText')}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PanelCard>

      <PanelCard title={t('monitoring.health.billingTitle')}>
        {!billing.available ? (
          <p className="text-sm text-gray-500">{t('monitoring.health.unavailable')}</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              {t('monitoring.health.lastWebhook')}: <span className="font-medium text-zinc-900">{billing.last_event_at ? formatDateTime(billing.last_event_at) : t('monitoring.health.never')}</span>
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {(
                [
                  ['processed', billing.last_7_days.processed],
                  ['ignored', billing.last_7_days.ignored],
                  ['failed', billing.last_7_days.failed],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-gray-100 p-3">
                  <dd className="text-xl font-semibold tabular-nums text-zinc-900">{formatNumber(value)}</dd>
                  <dt className="text-xs text-gray-500">{t(`monitoring.health.webhook.${key}`)}</dt>
                </div>
              ))}
            </dl>
            <h3 className="mt-4 text-sm font-medium text-gray-700">{t('monitoring.health.lastFailedEvents')}</h3>
            {billing.last_failed.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">{t('monitoring.health.noFailures')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {billing.last_failed.map((row) => (
                  <li key={row.id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-gray-500">
                      <span className="break-all">
                        {row.provider} · {row.event_type ?? '—'}
                      </span>
                      <span>{formatDateTime(row.processed_at)}</span>
                    </div>
                    <p className="mt-0.5 break-words text-zinc-700">{row.error ?? t('monitoring.health.noErrorText')}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PanelCard>

      <PanelCard title={t('monitoring.health.appTitle')}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {(
            [
              ['version', app.version ?? '—'],
              ['commit', app.commit ?? t('monitoring.health.unknown')],
              ['node', app.node],
              ['environment', app.env ?? '—'],
              ['uptime', t('monitoring.health.uptimeValue', { d: days, h: hours, m: minutes })],
              ['started', formatDateTime(app.started_at)],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-gray-500">{t(`monitoring.health.app.${key}`)}</dt>
              <dd className="break-all font-medium text-zinc-900">{value}</dd>
            </div>
          ))}
        </dl>
      </PanelCard>
    </div>
  )
}

export default function HealthPanel() {
  const query = useQuery<SuperadminHealth, Error>({ queryKey: ['superadmin', 'health'], queryFn: getSuperadminHealth, retry: false })
  return (
    <QueryBoundary query={query}>
      {(data) => <HealthContent data={data} onRefresh={() => void query.refetch()} refreshing={query.isFetching} />}
    </QueryBoundary>
  )
}
