import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getSuperadminRevenue } from '../../services/api'
import type { SuperadminRevenue } from '../../types/superadmin'
import { useFormat } from '../../lib/format'
import { PanelCard, QueryBoundary, Stat } from './MonitoringShared'

function RevenueContent({ data }: { data: SuperadminRevenue }) {
  const { t } = useTranslation('superadmin')
  const { formatCurrency, formatNumber, formatDate } = useFormat()
  const money = (cents: number) => formatCurrency(cents / 100, data.currency)
  const s = data.summary

  const lifecycle: Array<{ key: string; value: number }> = [
    { key: 'paying', value: s.paying_companies },
    { key: 'freeGranted', value: s.free_granted },
    { key: 'trialActive', value: s.trial_active },
    { key: 'trialExpired', value: s.trial_expired },
    { key: 'pastDue', value: s.past_due },
    { key: 'suspended', value: s.suspended },
    { key: 'canceled', value: s.canceled },
    { key: 'noSubscription', value: s.without_subscription },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        <Stat label={t('monitoring.revenue.mrr')} value={money(s.mrr_cents)} tone="good" />
        <Stat label={t('monitoring.revenue.arr')} value={money(s.arr_cents)} />
        <Stat label={t('monitoring.revenue.payingCompanies')} value={formatNumber(s.paying_companies)} hint={t('monitoring.revenue.ofCompanies', { total: s.companies_total })} />
        <Stat
          label={t('monitoring.revenue.mrrSplit')}
          value={<span className="text-base">{t('monitoring.revenue.stripeAmount', { amount: money(s.mrr_stripe_cents) })}</span>}
          hint={t('monitoring.revenue.manualAmount', { amount: money(s.mrr_manual_cents) })}
        />
      </div>

      <PanelCard title={t('monitoring.revenue.howCounted')}>
        <p className="text-sm text-gray-600">{t('monitoring.revenue.mrrBasis')}</p>
      </PanelCard>

      <PanelCard title={t('monitoring.revenue.lifecycleTitle')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {lifecycle.map((item) => (
            <div key={item.key} className="rounded-lg border border-gray-100 p-3">
              <dd className="text-xl font-semibold tabular-nums text-zinc-900">{formatNumber(item.value)}</dd>
              <dt className="text-xs text-gray-500">{t(`monitoring.revenue.lifecycle.${item.key}`)}</dt>
            </div>
          ))}
        </dl>
      </PanelCard>

      <PanelCard title={t('monitoring.revenue.byPlan')}>
        {data.by_plan.length === 0 ? (
          <p className="text-sm text-gray-500">{t('monitoring.revenue.noPlans')}</p>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {data.by_plan.map((plan) => (
                <li key={plan.plan_code} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">{plan.plan_name}</span>
                    <span className="text-sm font-semibold tabular-nums">{money(plan.mrr_cents)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {plan.price_cents === null ? null : `${t('superadminDashboard.perMonth', { price: money(plan.price_cents) })} · `}
                    {t('monitoring.revenue.planCounts', { total: plan.total, paying: plan.paying, trial: plan.trial })}
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t('superadminDashboard.plan')}</th>
                    <th className="px-4 py-2 font-medium">{t('monitoring.revenue.price')}</th>
                    <th className="px-4 py-2 font-medium">{t('monitoring.revenue.colCompanies')}</th>
                    <th className="px-4 py-2 font-medium">{t('monitoring.revenue.lifecycle.trialActive')}</th>
                    <th className="px-4 py-2 font-medium">{t('monitoring.revenue.lifecycle.paying')}</th>
                    <th className="px-4 py-2 font-medium">{t('monitoring.revenue.lifecycle.freeGranted')}</th>
                    <th className="px-4 py-2 font-medium">{t('monitoring.revenue.mrr')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 tabular-nums">
                  {data.by_plan.map((plan) => (
                    <tr key={plan.plan_code}>
                      <td className="px-4 py-2 font-medium text-zinc-900">{plan.plan_name}</td>
                      <td className="px-4 py-2 text-zinc-600">{plan.price_cents === null ? '—' : money(plan.price_cents)}</td>
                      <td className="px-4 py-2 text-zinc-600">{formatNumber(plan.total)}</td>
                      <td className="px-4 py-2 text-zinc-600">{formatNumber(plan.trial)}</td>
                      <td className="px-4 py-2 text-zinc-600">{formatNumber(plan.paying)}</td>
                      <td className="px-4 py-2 text-zinc-600">{formatNumber(plan.free_granted)}</td>
                      <td className="px-4 py-2 font-semibold text-zinc-900">{money(plan.mrr_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PanelCard>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <PanelCard title={t('monitoring.revenue.upcomingTitle')}>
          {data.upcoming_trials.length === 0 ? (
            <p className="text-sm text-gray-500">{t('monitoring.revenue.upcomingNone')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.upcoming_trials.map((row) => (
                <li key={row.company_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link to={`/superadmin/companies/${row.company_id}`} className="min-w-0 break-words font-medium text-zinc-900 underline-offset-2 hover:underline">
                    {row.company_name}
                  </Link>
                  <span className="shrink-0 text-xs text-gray-500">{t('monitoring.revenue.endsOn', { date: formatDate(row.trial_ends_at) })}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <div className="space-y-4 sm:space-y-6">
          <PanelCard title={t('monitoring.revenue.churnTitle')}>
            <p className="text-2xl font-semibold tabular-nums text-zinc-900">{formatNumber(data.churn.canceled_last_30_days)}</p>
            <p className="text-xs text-gray-500">{t('monitoring.revenue.churnLast30')}</p>
            <p className="mt-2 text-xs text-gray-500">{t('monitoring.revenue.churnTotal', { count: data.churn.canceled_total })}</p>
            <p className="mt-2 text-xs text-gray-400">{t('monitoring.revenue.churnNote')}</p>
          </PanelCard>
          <PanelCard title={t('monitoring.revenue.conversionTitle')}>
            {data.conversion.rate === null ? (
              <p className="text-sm text-gray-500">{t('monitoring.revenue.conversionNone')}</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums text-zinc-900">{formatNumber(data.conversion.rate, { maximumFractionDigits: 1 })}%</p>
                <p className="text-xs text-gray-500">
                  {t('monitoring.revenue.conversionDetail', { converted: data.conversion.converted_to_paid, cohort: data.conversion.cohort_trials_ended_90d })}
                </p>
              </>
            )}
            <p className="mt-2 text-xs text-gray-400">{t('monitoring.revenue.conversionNote')}</p>
          </PanelCard>
        </div>
      </div>
    </div>
  )
}

export default function RevenuePanel() {
  const query = useQuery<SuperadminRevenue, Error>({ queryKey: ['superadmin', 'revenue'], queryFn: getSuperadminRevenue, retry: false })
  return <QueryBoundary query={query}>{(data) => <RevenueContent data={data} />}</QueryBoundary>
}
