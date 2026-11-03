import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Clock, Wrench } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import useHomeSummary from '../hooks/queries/useHomeSummary'
import { cn } from '../lib/utils'
import useAuthStore from '../store/authStore'

const MAX_ITEMS = 5

// Date-only values arrive as ISO strings; read the calendar day directly to avoid timezone shifts.
const parseDay = (value?: string | null) => {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const isBeforeToday = (date: Date) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() < today.getTime()
}

const rowClass =
  'flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400'

function ItemGroup({
  title,
  badge,
  children,
}: {
  title: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        {badge}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function MoreLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-9 items-center text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
    >
      {label}
    </Link>
  )
}

function Home() {
  const { t, i18n } = useTranslation('dashboard')
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const { t: tCommon } = useTranslation('common')
  const {
    data: summary,
    isLoading: loading,
    error,
  } = useHomeSummary()

  const kpis = useMemo(
    () => [
      {
        label: t('kpis.rmsExpected'),
        value: summary?.rms_summary.expected,
        icon: CheckCircle2,
        to: '/dashboard/rms-overview',
      },
      {
        label: t('kpis.rmsDone'),
        value: summary?.rms_summary.done,
        icon: CheckCircle2,
        to: '/dashboard/rms',
      },
      {
        label: t('kpis.rmsLate'),
        value: summary?.rms_summary.late,
        icon: Clock,
        to: '/dashboard/rms-overview',
      },
      {
        label: t('kpis.rmsMissing'),
        value: summary?.rms_summary.missing,
        icon: Wrench,
        to: '/dashboard/rms-overview',
      },
    ],
    [summary, t]
  )

  const coveragePercent = useMemo(() => {
    if (!summary || summary.rms_summary.expected === 0) {
      return 0
    }

    return Math.round((summary.rms_summary.done / summary.rms_summary.expected) * 100)
  }, [summary])

  const coverageColor = useMemo(() => {
    if (coveragePercent < 50) return 'bg-rose-500'
    if (coveragePercent < 80) return 'bg-amber-400'
    return 'bg-emerald-500'
  }, [coveragePercent])

  const dateLocale = i18n.language?.startsWith('hr') ? 'hr-HR' : 'en-GB'
  const formatDay = (date: Date) => date.toLocaleDateString(dateLocale)

  if (loading) {
    return <div className="p-6 text-sm text-zinc-500">{t('loading')}</div>
  }

  if (!summary) {
    return <div className="p-6 text-red-500">{t('loadFailed')}</div>
  }

  const missingLocations = summary.rms_missing_locations ?? []
  const expiringVehicles = summary.vehicles?.expiring_soon_list ?? []
  const overdueWorkOrders = summary.notifications?.overdue_work_orders_count ?? 0
  const myOrders = summary.work_orders?.items ?? []
  const myOrdersTotal = summary.work_orders?.open_assigned_count ?? myOrders.length
  const needsAttention =
    missingLocations.length > 0 || expiringVehicles.length > 0 || overdueWorkOrders > 0
  const showMyTasks = !isAdmin || myOrders.length > 0

  const myTasksCard = showMyTasks ? (
    <Card className="rounded-2xl border border-zinc-200 p-4 shadow-sm sm:p-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{t('myTasks.title')}</p>
          <p className="text-xs text-zinc-500">{t('myTasks.subtitle')}</p>
        </div>
        {myOrders.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('myTasks.empty')}</p>
        ) : (
          <div className="space-y-2">
            {myOrders.map((order) => {
              const due = parseDay(order.due_date)
              const overdue = due ? isBeforeToday(due) : false
              return (
                <Link key={order.id} to={`/dashboard/work-orders/${order.id}`} className={rowClass}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-900">
                      {order.location_name || t('myTasks.workOrderFallback', { id: order.id })}
                    </span>
                    <span className={cn('block text-xs', overdue ? 'text-rose-600' : 'text-zinc-500')}>
                      {due ? t('myTasks.due', { date: formatDay(due) }) : t('myTasks.noDueDate')}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </Link>
              )
            })}
            {myOrdersTotal > myOrders.length ? (
              <MoreLink
                to="/dashboard/work-orders"
                label={t('myTasks.more', { count: myOrdersTotal - myOrders.length })}
              />
            ) : null}
          </div>
        )}
      </div>
    </Card>
  ) : null

  const attentionCard = isAdmin ? (
    <Card
      className={cn(
        'rounded-2xl border p-4 shadow-sm sm:p-6',
        needsAttention ? 'border-amber-200 bg-amber-50/60' : 'border-zinc-200'
      )}
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{t('needsAttention.title')}</p>
          <p className="text-xs text-zinc-500">{t('needsAttention.subtitle')}</p>
        </div>

        {!needsAttention ? (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{t('needsAttention.allGood')}</p>
              <p className="text-sm text-zinc-500">{t('needsAttention.allGoodHint')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {overdueWorkOrders > 0 ? (
              <ItemGroup title={t('needsAttention.overdueWorkOrders')}>
                <Link to="/dashboard/work-orders" className={cn(rowClass, 'bg-white')}>
                  <span className="min-w-0 flex-1 font-medium text-rose-600">
                    {t('needsAttention.overdueWorkOrdersCount', { count: overdueWorkOrders })}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </Link>
              </ItemGroup>
            ) : null}

            {expiringVehicles.length > 0 ? (
              <ItemGroup title={t('needsAttention.vehicles')}>
                {expiringVehicles.slice(0, MAX_ITEMS).map((vehicle) => {
                  const expiry = parseDay(vehicle.registration_expiry_date)
                  const expired = expiry ? isBeforeToday(expiry) : false
                  return (
                    <Link key={vehicle.id} to="/dashboard/vehicles" className={cn(rowClass, 'bg-white')}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-900">{vehicle.name}</span>
                        {expiry ? (
                          <span className={cn('block text-xs', expired ? 'text-rose-600' : 'text-amber-700')}>
                            {t(expired ? 'needsAttention.registrationExpired' : 'needsAttention.registrationExpires', {
                              date: formatDay(expiry),
                            })}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                    </Link>
                  )
                })}
                {expiringVehicles.length > MAX_ITEMS ? (
                  <MoreLink
                    to="/dashboard/vehicles"
                    label={t('needsAttention.more', { count: expiringVehicles.length - MAX_ITEMS })}
                  />
                ) : null}
              </ItemGroup>
            ) : null}

            {missingLocations.length > 0 ? (
              <ItemGroup
                title={t('needsAttention.missingRms')}
                badge={<Badge variant="secondary">{t('missingRmsLocations.count', { count: missingLocations.length })}</Badge>}
              >
                {missingLocations.slice(0, MAX_ITEMS).map((location) => (
                  <Link key={location.id} to={`/dashboard/locations/${location.id}`} className={cn(rowClass, 'bg-white')}>
                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{location.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                  </Link>
                ))}
                {missingLocations.length > MAX_ITEMS ? (
                  <MoreLink
                    to="/dashboard/rms-overview"
                    label={t('needsAttention.more', { count: missingLocations.length - MAX_ITEMS })}
                  />
                ) : null}
              </ItemGroup>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  ) : null

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 sm:space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
            {t('welcomeBack', { name: summary?.user.name ?? '' })}
          </h1>
          <p className="text-sm text-zinc-500">{t('monthlyOverview')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">
            {t('alerts', { count: summary?.alerts.count ?? 0 })}
          </Badge>
          <Button size="sm">{tCommon('actions.createReport')}</Button>
        </div>
      </div>

      {error ? (
        <Card className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-rose-600">{t('error.title')}</p>
            <p className="text-sm text-rose-500">
              {error instanceof Error ? error.message : t('error.unknown')}
            </p>
          </div>
        </Card>
      ) : null}

      {isAdmin ? attentionCard : myTasksCard}
      {isAdmin ? myTasksCard : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.label}
              to={item.to}
              aria-label={t('kpiOpen', { label: item.label })}
              className="block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-200 ease-in-out hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 sm:p-6"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-xs text-zinc-500 sm:text-sm">{item.label}</p>
                <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 sm:flex">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 sm:mt-4 sm:text-3xl">
                {item.value ?? 0}
              </p>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border border-zinc-200 p-4 shadow-sm sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-500">{t('coverage.label')}</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">
                {t('coverage.title')}
              </p>
            </div>
            <Link
              to="/dashboard/rms-overview"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 px-3 text-xs font-semibold text-zinc-900 transition-all duration-200 ease-in-out hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
            >
              {tCommon('actions.viewDetails')}
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>{t('coverage.done', { count: summary?.rms_summary.done ?? 0 })}</span>
              <span>{t('coverage.expected', { count: summary?.rms_summary.expected ?? 0 })}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-zinc-100">
              <div
                className={`h-3 rounded-full transition-all duration-200 ease-in-out ${coverageColor}`}
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{t('coverage.missing', { count: summary?.rms_summary.missing ?? 0 })}</span>
              <span>{t('coverage.complete', { percent: coveragePercent })}</span>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border border-zinc-200 p-4 shadow-sm sm:p-6">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-zinc-900">{t('myStats.title')}</p>
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>{t('myStats.myRms')}</span>
              <span className="font-semibold text-zinc-900">{summary?.user_stats?.rms_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>{t('myStats.interventions')}</span>
              <span className="font-semibold text-zinc-900">
                {summary?.user_stats?.intervention_count ?? 0}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {!isAdmin && missingLocations.length > 0 ? (
        <Card className="rounded-2xl border border-zinc-200 p-4 shadow-sm sm:p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900">{t('missingRmsLocations.title')}</p>
              <Badge variant="secondary">
                {t('missingRmsLocations.count', { count: missingLocations.length })}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {missingLocations.map((location) => (
                <Link key={location.id} to={`/dashboard/locations/${location.id}`} className={rowClass}>
                  <span className="min-w-0 flex-1 truncate">{location.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </Link>
              ))}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default Home
