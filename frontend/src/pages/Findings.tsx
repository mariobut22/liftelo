import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import FindingCard from '../components/findings/FindingCard'
import FindingDetailDialog from '../components/findings/FindingDetailDialog'
import { SeverityBadge } from '../components/findings/FindingBadges'
import { useFindings } from '../hooks/queries/useFindings'
import useLocations from '../hooks/queries/useLocations'
import { cn } from '../lib/utils'
import type { Finding, FindingsQuery } from '../services/api'
import type { FindingSeverity } from '../lib/findings'

type Tab = 'open' | 'toOrder' | 'all'
const TABS: Tab[] = ['open', 'toOrder', 'all']
const SEVERITIES: FindingSeverity[] = ['out_of_service', 'in_service', 'recommendation']

const selectClass = 'h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 sm:w-auto'

function Findings() {
  const { t } = useTranslation('findings')
  const [params, setParams] = useSearchParams()
  const { data: locations } = useLocations()
  const [tab, setTab] = useState<Tab>(params.get('state') === 'all' ? 'all' : params.get('tab') === 'toOrder' ? 'toOrder' : 'open')
  const [severity, setSeverity] = useState<FindingSeverity | ''>(
    SEVERITIES.includes(params.get('severity') as FindingSeverity) ? (params.get('severity') as FindingSeverity) : ''
  )
  const [needsPart, setNeedsPart] = useState(false)
  const [locationId, setLocationId] = useState<number | ''>(params.get('location') ? Number(params.get('location')) : '')
  const elevatorId = params.get('elevator') ? Number(params.get('elevator')) : null
  const openId = params.get('id') ? Number(params.get('id')) : null

  const query = useMemo<FindingsQuery>(() => {
    const q: FindingsQuery = { limit: 200 }
    if (tab === 'toOrder') {
      q.state = 'open'
      q.needs_part = true
      q.parts_ordered = false
    } else {
      q.state = tab === 'all' ? 'all' : 'open'
      if (needsPart) q.needs_part = true
    }
    if (severity) q.severity = severity
    if (locationId) q.location_id = locationId
    if (elevatorId) q.elevator_id = elevatorId
    return q
  }, [tab, severity, needsPart, locationId, elevatorId])

  const { data, isLoading, error } = useFindings(query)
  const items = data?.items ?? []

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const copyList = async (list: Finding[]) => {
    const text = list
      .map((f) =>
        `- ${t('toOrder.line', {
          elevator: f.elevator_label,
          location: f.location_name ?? '',
          part: f.part_note || t('toOrder.noPartNote'),
        })}`
      )
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('toOrder.copied'))
    } catch {
      toast.error(t('toOrder.copyFailed'))
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="findings-page">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">{t('page.title')}</h1>
        <p className="text-sm text-zinc-500">{t('page.subtitle')}</p>
      </div>

      <div role="tablist" className="flex gap-2 overflow-x-auto" data-testid="findings-tabs">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-tab={id}
            onClick={() => {
              setTab(id)
              setParam('state', null)
            }}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
              tab === id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            )}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" data-testid="findings-filters">
        <select
          aria-label={t('filters.severity')}
          value={severity}
          onChange={(event) => setSeverity(event.target.value as FindingSeverity | '')}
          className={selectClass}
        >
          <option value="">{t('filters.allSeverities')}</option>
          {SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {t(`severity.${value}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('filters.location')}
          value={locationId}
          onChange={(event) => setLocationId(event.target.value ? Number(event.target.value) : '')}
          className={selectClass}
        >
          <option value="">{t('filters.allLocations')}</option>
          {(locations ?? []).map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        {tab !== 'toOrder' ? (
          <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={needsPart} onChange={(event) => setNeedsPart(event.target.checked)} className="h-5 w-5 rounded border-zinc-300" />
            {t('filters.needsPart')}
          </label>
        ) : null}
        {elevatorId ? (
          <Button type="button" variant="outline" className="h-11" onClick={() => setParam('elevator', null)}>
            {t('filters.clearElevator')}
          </Button>
        ) : null}
        <span className="text-sm text-zinc-500 sm:ml-auto">{t('page.total', { count: data?.total ?? 0 })}</span>
      </div>

      {error ? (
        <Card className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-600">
          {error instanceof Error ? error.message : t('page.loadFailed')}
        </Card>
      ) : null}

      {isLoading ? <p className="text-sm text-zinc-500">…</p> : null}

      {!isLoading && !error && items.length === 0 ? (
        <Card className="rounded-2xl border border-zinc-200 p-6 text-sm text-zinc-500" data-testid="findings-empty">
          {t(`empty.${tab}`)}
        </Card>
      ) : null}

      {tab === 'toOrder' && items.length > 0 ? (
        <Card className="space-y-3 rounded-2xl border border-zinc-200 p-4 shadow-sm sm:p-6" data-testid="to-order-list">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900">{t('toOrder.title')}</p>
              <p className="text-xs text-zinc-500">{t('toOrder.hint')}</p>
            </div>
            <Button type="button" variant="secondary" className="h-11" onClick={() => copyList(items)}>
              <Copy className="h-4 w-4" />
              {t('toOrder.copy')}
            </Button>
          </div>
          <ul className="divide-y divide-zinc-100">
            {items.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setParam('id', String(f.id))}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-900">
                      {f.elevator_label} <span className="font-normal text-zinc-500">· {f.location_name}</span>
                    </span>
                    <span className="block truncate text-zinc-700">{f.part_note || t('toOrder.noPartNote')}</span>
                  </span>
                  <SeverityBadge severity={f.severity} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="findings-list">
          {items.map((f) => (
            <FindingCard key={f.id} finding={f} onOpen={(id) => setParam('id', String(id))} />
          ))}
        </div>
      )}

      <FindingDetailDialog findingId={openId} onClose={() => setParam('id', null)} />
    </div>
  )
}

export default Findings
