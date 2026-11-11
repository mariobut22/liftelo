import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getSuperadminGrowth } from '../../services/api'
import type { SuperadminGrowth } from '../../types/superadmin'
import { useFormat } from '../../lib/format'
import { BarChart, PanelCard, QueryBoundary, Stat } from './MonitoringShared'

function GrowthContent({ data }: { data: SuperadminGrowth }) {
  const { t } = useTranslation('superadmin')
  const { formatDate, formatNumber } = useFormat()
  const labels = data.weeks.map((week) => formatDate(`${week.week_start}T12:00:00`, '—', { day: '2-digit', month: '2-digit' }))
  const lastWeek = data.weeks[data.weeks.length - 1]
  const range = `${formatDate(`${data.weeks[0].week_start}T12:00:00`)} – ${formatDate(`${lastWeek.week_start}T12:00:00`)}`

  const charts = [
    { key: 'newCompanies', values: data.weeks.map((w) => w.new_companies), barClass: 'bg-zinc-800' },
    { key: 'newUsers', values: data.weeks.map((w) => w.new_users), barClass: 'bg-sky-600' },
    { key: 'activeCompanies', values: data.weeks.map((w) => w.active_companies), barClass: 'bg-emerald-600' },
  ] as const

  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="text-xs text-gray-500">{t('monitoring.growth.range', { range })}</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
        <Stat label={t('monitoring.growth.newCompaniesTotal')} value={formatNumber(data.totals.new_companies)} />
        <Stat label={t('monitoring.growth.newUsersTotal')} value={formatNumber(data.totals.new_users)} />
        <Stat label={t('monitoring.growth.activeThisWeek')} value={formatNumber(lastWeek.active_companies)} tone="good" />
      </div>
      {charts.map((chart) => (
        <PanelCard key={chart.key} title={t(`monitoring.growth.${chart.key}`)}>
          <BarChart
            values={[...chart.values]}
            labels={labels}
            barClass={chart.barClass}
            ariaLabel={`${t(`monitoring.growth.${chart.key}`)}: ${chart.values.join(', ')}`}
          />
          {chart.key === 'activeCompanies' ? <p className="mt-3 text-xs text-gray-400">{t('monitoring.growth.activeNote')}</p> : null}
        </PanelCard>
      ))}
      <p className="text-xs text-gray-400">{t('monitoring.growth.weekNote')}</p>
    </div>
  )
}

export default function GrowthPanel() {
  const query = useQuery<SuperadminGrowth, Error>({ queryKey: ['superadmin', 'growth'], queryFn: getSuperadminGrowth, retry: false })
  return <QueryBoundary query={query}>{(data) => <GrowthContent data={data} />}</QueryBoundary>
}
