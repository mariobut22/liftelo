import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarCheck, ChevronRight, ClipboardList, QrCode, Wrench } from 'lucide-react'

import InterventionCreateModal from '../interventions/InterventionCreateModal'
import RmsCreateModal from '../rms/RmsCreateModal'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { useFindingsSummary } from '../../hooks/queries/useFindings'
import { useFindingsRole } from '../../lib/findings'
import { cn } from '../../lib/utils'
import useQrScanStore from '../../store/qrScanStore'
import type { HomeSummary } from '../../types/home'
import { getLocale } from '../../i18n'

const MAX_TECH = 5
const MAX_LOCATIONS = 3

const parseDay = (value?: string | null) => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

const startOfToday = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

const rowClass =
  'flex min-h-12 min-w-0 items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400'

type Urgency = 'overdue' | 'today' | 'upcoming' | 'none'
const rank: Record<Urgency, number> = { overdue: 0, today: 1, upcoming: 2, none: 3 }

/** Home "Today" block: scan + create shortcuts, my work orders by urgency, locations without RMS, open faults. */
function TodayCard({ summary, language }: { summary: HomeSummary; language: string }) {
  const { t } = useTranslation('dashboard')
  const role = useFindingsRole()
  const isAdmin = role === 'admin'
  const canCreate = role !== 'viewer'
  const openQrScanner = useQrScanStore((state) => state.openScanner)
  const { data: faults } = useFindingsSummary()
  const [rmsOpen, setRmsOpen] = useState(false)
  const [interventionOpen, setInterventionOpen] = useState(false)
  const locale = getLocale(language)

  const today = startOfToday()
  const orders = (summary.work_orders?.items ?? [])
    .map((order) => {
      const due = parseDay(order.due_date)
      const urgency: Urgency = !due ? 'none' : due.getTime() < today ? 'overdue' : due.getTime() === today ? 'today' : 'upcoming'
      return { order, due, urgency }
    })
    .sort((a, b) => {
      if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency]
      return (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0)
    })
  const total = summary.work_orders?.open_assigned_count ?? orders.length
  // Admins get a compact card: only what is due today or overdue; the rest lives in the "needs attention" card.
  const shownOrders = isAdmin
    ? orders.filter((o) => o.urgency === 'overdue' || o.urgency === 'today').slice(0, 3)
    : orders.slice(0, MAX_TECH)
  const allMissing = summary.rms_missing_locations ?? []
  const missing = isAdmin ? [] : allMissing.slice(0, MAX_LOCATIONS)
  const openFaults = faults?.open ?? 0
  const outOfService = (faults?.out_of_service ?? 0) > 0
  const nothingDue = shownOrders.length === 0 && missing.length === 0 && openFaults === 0

  return (
    <Card data-testid="today-card" className="rounded-2xl border border-zinc-300 p-4 shadow-sm sm:p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-zinc-700" aria-hidden="true" />
          <h2 className="text-base font-semibold text-zinc-900">{t('today.title')}</h2>
        </div>

        <div className="space-y-2">
          <Button className="h-14 w-full text-base" onClick={openQrScanner}>
            <QrCode className="h-5 w-5" />
            {t('scanQr.button')}
          </Button>
          <p className="text-xs text-zinc-500">{t('scanQr.text')}</p>
          {canCreate ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12 text-sm" data-testid="today-new-rms" onClick={() => setRmsOpen(true)}>
                <ClipboardList className="h-4 w-4" />
                {t('today.newRms')}
              </Button>
              <Button variant="outline" className="h-12 text-sm" data-testid="today-new-intervention" onClick={() => setInterventionOpen(true)}>
                <Wrench className="h-4 w-4" />
                {t('today.newIntervention')}
              </Button>
            </div>
          ) : null}
        </div>

        {shownOrders.length > 0 ? (
          <div className="space-y-2" data-testid="today-orders">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('today.orders')}</p>
            {shownOrders.map(({ order, due, urgency }) => (
              <Link key={order.id} to={`/dashboard/work-orders/${order.id}`} data-testid="today-order" data-urgency={urgency} className={rowClass}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-zinc-900">
                    {order.location_name || t('myTasks.workOrderFallback', { id: order.id })}
                  </span>
                  <span className={cn('block text-xs', urgency === 'overdue' ? 'text-rose-600' : 'text-zinc-500')}>
                    {due ? t('myTasks.due', { date: due.toLocaleDateString(locale) }) : t('myTasks.noDueDate')}
                  </span>
                </span>
                {urgency === 'overdue' ? <Badge className="bg-rose-100 text-rose-700">{t('today.overdue')}</Badge> : null}
                {urgency === 'today' ? <Badge variant="secondary">{t('today.dueToday')}</Badge> : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </Link>
            ))}
            {!isAdmin && total > shownOrders.length ? (
              <Link to="/dashboard/work-orders" className="inline-flex min-h-9 items-center text-xs font-medium text-zinc-500 underline-offset-2 hover:underline">
                {t('myTasks.more', { count: total - shownOrders.length })}
              </Link>
            ) : null}
          </div>
        ) : null}

        {missing.length > 0 ? (
          <div className="space-y-2" data-testid="today-missing">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('needsAttention.missingRms')}</p>
              <Badge variant="secondary">{t('missingRmsLocations.count', { count: allMissing.length })}</Badge>
            </div>
            {missing.map((location) => (
              <Link key={location.id} to={`/dashboard/locations/${location.id}`} data-testid="today-missing-item" className={rowClass}>
                <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{location.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </Link>
            ))}
            {allMissing.length > missing.length ? (
              <Link to="/dashboard/rms-overview" className="inline-flex min-h-9 items-center text-xs font-medium text-zinc-500 underline-offset-2 hover:underline">
                {t('needsAttention.more', { count: allMissing.length - missing.length })}
              </Link>
            ) : null}
          </div>
        ) : null}

        {openFaults > 0 ? (
          <Link to="/dashboard/findings" data-testid="today-faults" className={cn(rowClass, outOfService ? 'border-rose-300 bg-rose-50' : '')}>
            <AlertTriangle className={cn('h-4 w-4 shrink-0', outOfService ? 'text-rose-600' : 'text-amber-600')} />
            <span className="min-w-0 flex-1 font-medium text-zinc-900">{t('today.faults', { count: openFaults })}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </Link>
        ) : null}

        {nothingDue ? (
          <p data-testid="today-empty" className="text-sm text-zinc-500">
            {t('today.empty')}
          </p>
        ) : null}
      </div>

      {canCreate ? (
        <>
          <RmsCreateModal open={rmsOpen} onOpenChange={setRmsOpen} />
          <InterventionCreateModal open={interventionOpen} onOpenChange={setInterventionOpen} />
        </>
      ) : null}
    </Card>
  )
}

export default TodayCard
