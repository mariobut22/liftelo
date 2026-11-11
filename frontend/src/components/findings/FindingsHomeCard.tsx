import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Card } from '../ui/card'
import FindingCard from './FindingCard'
import { useFindings, useFindingsSummary } from '../../hooks/queries/useFindings'
import { cn } from '../../lib/utils'
import { useFindingsRole } from '../../lib/findings'

const MAX_ITEMS = 5

function Tile({ label, value, tone, to }: { label: string; value: number; tone: 'danger' | 'info' | 'neutral'; to: string }) {
  return (
    <Link
      to={to}
      data-testid="findings-tile"
      data-tone={value > 0 ? tone : 'neutral'}
      className={cn(
        'block min-w-0 rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
        value > 0 && tone === 'danger' ? 'border-rose-300 bg-rose-50 hover:bg-rose-100' : '',
        value > 0 && tone === 'info' ? 'border-sky-200 bg-sky-50 hover:bg-sky-100' : '',
        value === 0 || tone === 'neutral' ? 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100' : ''
      )}
    >
      <p className="text-xs text-zinc-600">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', value > 0 && tone === 'danger' ? 'text-rose-700' : 'text-zinc-900')}>{value}</p>
    </Link>
  )
}

/** Home: admin gets counts (out of service highlighted; "to order" is a separate count), others a compact list. */
function FindingsHomeCard() {
  const { t } = useTranslation('findings')
  const role = useFindingsRole()
  const navigate = useNavigate()
  const isAdmin = role === 'admin'
  const { data: summary } = useFindingsSummary()
  const { data: list } = useFindings({ state: 'open', limit: MAX_ITEMS }, !isAdmin)

  if (!summary || summary.open === 0) return null
  const items = list?.items ?? []

  return (
    <Card
      data-testid="findings-home-card"
      className={cn(
        'rounded-2xl border p-4 shadow-sm sm:p-6',
        summary.out_of_service > 0 ? 'border-rose-200' : 'border-zinc-200'
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                summary.out_of_service > 0 ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">{isAdmin ? t('home.title') : t('home.mine')}</p>
              <p className="text-xs text-zinc-500">{t('home.subtitle')}</p>
            </div>
          </div>
          <Link
            to="/dashboard/findings"
            className="inline-flex min-h-9 shrink-0 items-center text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            {t('home.viewAll')}
          </Link>
        </div>

        {isAdmin ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label={t('home.outOfService')} value={summary.out_of_service} tone="danger" to="/dashboard/findings?severity=out_of_service" />
              <Tile label={t('home.toOrder')} value={summary.to_order} tone="info" to="/dashboard/findings?tab=toOrder" />
              <Tile label={t('home.waitingPart')} value={summary.waiting_part} tone="info" to="/dashboard/findings" />
              <Tile label={t('home.inService')} value={summary.in_service} tone="neutral" to="/dashboard/findings" />
            </div>
            <p className="text-xs text-zinc-500">
              {t('home.open', { count: summary.open })}
              {summary.oldest_days !== null ? ` · ${t('home.oldest', { count: summary.oldest_days })}` : ''}
            </p>
          </>
        ) : (
          <div className="space-y-2">
            {items.map((finding) => (
              <FindingCard key={finding.id} finding={finding} compact onOpen={(id) => navigate(`/dashboard/findings?id=${id}`)} />
            ))}
            {summary.open > items.length ? (
              <Link to="/dashboard/findings" className="inline-flex min-h-9 items-center text-xs font-medium text-zinc-500 hover:text-zinc-900">
                {t('home.more', { count: summary.open - items.length })} <ChevronRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  )
}

export default FindingsHomeCard
