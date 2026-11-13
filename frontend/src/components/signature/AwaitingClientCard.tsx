import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, PenLine } from 'lucide-react'

import { Card } from '../ui/card'
import useAuthStore from '../../store/authStore'
import { daysSince, getAwaitingClient, userCanWrite } from '../../lib/reportSignatures'

/**
 * Home hint for admins and technicians: reports signed by the technician that still wait for the client
 * (count, age of the oldest, the first few). Renders nothing when there are none, for viewers, or when the call fails.
 */
function AwaitingClientCard() {
  const { t } = useTranslation('signature')
  const canWrite = useAuthStore(() => userCanWrite())
  const { data } = useQuery({ queryKey: ['awaiting-client'], queryFn: getAwaitingClient, enabled: canWrite, retry: false })
  if (!canWrite || !data || !data.count || !Array.isArray(data.items)) return null

  const linkFor = (type: 'rms' | 'intervention', id: number) =>
    type === 'rms' ? `/dashboard/rms/${id}` : `/dashboard/interventions/${id}`

  return (
    <Card className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm sm:p-6" data-testid="awaiting-client-card">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <PenLine className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">{t('home.title')}</p>
            <p className="text-xs text-zinc-600" data-testid="awaiting-client-summary">
              {t('home.summary', { count: data.count, days: daysSince(data.oldest_at) })}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {data.items.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              to={linkFor(item.type, item.id)}
              className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-zinc-900">{item.location_name || `#${item.id}`}</span>
                <span className="block text-xs text-zinc-500">
                  {t(`home.${item.type}`)} · {t('home.itemAge', { count: daysSince(item.since) })}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <Link to="/dashboard/rms?signature=awaiting_client" className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline">
            {t('home.rms')} - {t('home.all')}
          </Link>
          <Link to="/dashboard/interventions?signature=awaiting_client" className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline">
            {t('home.intervention')} - {t('home.all')}
          </Link>
        </div>
      </div>
    </Card>
  )
}

export default AwaitingClientCard
