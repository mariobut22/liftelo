import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import DataTable from '../components/table/DataTable'
import type { RmsOverviewRow } from '../types/rms-overview'
import { useStatsRms } from '../hooks/queries/useStatsRms'
import { useRmsOverview } from '../hooks/queries/useRmsOverview'

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—'

const getSafeMonth = (value: number, fallback: number) =>
  value >= 1 && value <= 12 ? value : fallback

const coverageClass = (coverage: number) => {
  if (coverage < 60) return 'bg-rose-100 text-rose-700'
  if (coverage <= 80) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function Stats() {
  const { t } = useTranslation('rms')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = useMemo(() => searchParams, [searchParams])
  const now = new Date()
  const initialYearParam = Number(initialParams.get('year'))
  const initialMonthParam = Number(initialParams.get('month'))
  const [year, setYear] = useState(() =>
    Number.isFinite(initialYearParam) && initialYearParam > 2000
      ? initialYearParam
      : now.getFullYear()
  )
  const [month, setMonth] = useState(() =>
    getSafeMonth(initialMonthParam, now.getMonth() + 1)
  )
  const [search, setSearch] = useState(() => initialParams.get('search') ?? '')
  const [sorting, setSorting] = useState<
    Array<{ id: string; desc: boolean }>
  >(() => {
    const sortParam = initialParams.get('sort')
    const orderParam = initialParams.get('order')
    return sortParam ? [{ id: sortParam, desc: orderParam === 'desc' }] : []
  })

  const { data: stats, isLoading: statsLoading, error: statsError } = useStatsRms(year, month)
  const { data: overview, isLoading: overviewLoading, error: overviewError } = useRmsOverview(year, month)
  const rows = overview ?? []

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), [])
  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
  }, [now])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    params.set('year', String(year))
    params.set('month', String(month))
    if (search) {
      params.set('search', search)
    } else {
      params.delete('search')
    }
    if (sorting[0]) {
      params.set('sort', sorting[0].id)
      params.set('order', sorting[0].desc ? 'desc' : 'asc')
    } else {
      params.delete('sort')
      params.delete('order')
    }
    setSearchParams(params, { replace: true })
  }, [month, search, searchParams, setSearchParams, sorting, year])

  const columns = useMemo<ColumnDef<RmsOverviewRow>[]>(
    () => [
      {
        accessorKey: 'location_name',
        header: t('stats.table.location'),
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => navigate(`/dashboard/locations/${row.original.location_id}`)}
            className="text-left font-medium text-zinc-900"
          >
            {row.original.location_name}
          </button>
        ),
      },
      {
        accessorKey: 'expected',
        header: t('stats.table.expected'),
        cell: ({ row }) =>
          row.original.expected ? (
            <Badge className="bg-emerald-100 text-emerald-700">{t('stats.status.expected')}</Badge>
          ) : (
            <Badge variant="secondary">{t('stats.status.na')}</Badge>
          ),
      },
      {
        id: 'status',
        header: t('stats.table.status'),
        cell: ({ row }) => {
          if (!row.original.expected) {
            return <Badge variant="secondary">{t('stats.status.na')}</Badge>
          }
          if (!row.original.has_rms) {
            return <Badge className="bg-rose-100 text-rose-700">{t('stats.status.missing')}</Badge>
          }
          if (row.original.late) {
            return <Badge className="bg-amber-100 text-amber-700">{t('stats.status.late')}</Badge>
          }
          return <Badge className="bg-emerald-100 text-emerald-700">{t('stats.status.done')}</Badge>
        },
      },
      {
        accessorKey: 'last_rms_visit_date',
        header: t('stats.table.lastVisit'),
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">{formatDate(row.original.last_rms_visit_date)}</span>
        ),
      },
    ],
    [navigate, t]
  )

  const kpiSkeleton = (
    <div className="space-y-3">
      <div className="h-4 w-20 animate-pulse rounded bg-zinc-200/70" />
      <div className="h-7 w-24 animate-pulse rounded bg-zinc-200/70" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t('stats.title')}</h1>
          <p className="text-sm text-zinc-500">{t('stats.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(event) => setMonth(getSafeMonth(Number(event.target.value), month))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            {monthOptions.map((value) => (
              <option key={value} value={value}>
                {value.toString().padStart(2, '0')}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            {yearOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      {statsError ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('stats.errors.title')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {statsError instanceof Error ? statsError.message : t('stats.errors.statsLoadFailed')}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="rounded-xl border border-zinc-200 p-5 shadow-sm transition-shadow">
          {statsLoading ? (
            kpiSkeleton
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500">{t('stats.kpis.expected')}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{stats?.expected_rms ?? '—'}</p>
              </div>
              <Badge variant="secondary">RMS</Badge>
            </div>
          )}
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-5 shadow-sm transition-shadow">
          {statsLoading ? (
            kpiSkeleton
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500">{t('stats.kpis.done')}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{stats?.done_count ?? '—'}</p>
              </div>
              <Badge className="bg-emerald-100 text-emerald-700">✓</Badge>
            </div>
          )}
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-5 shadow-sm transition-shadow">
          {statsLoading ? (
            kpiSkeleton
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500">{t('stats.kpis.late')}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{stats?.late_count ?? '—'}</p>
              </div>
              <Badge className="bg-amber-100 text-amber-700">⏳</Badge>
            </div>
          )}
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-5 shadow-sm transition-shadow">
          {statsLoading ? (
            kpiSkeleton
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500">{t('stats.kpis.missing')}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{stats?.missing_count ?? '—'}</p>
              </div>
              <Badge className="bg-rose-100 text-rose-700">!</Badge>
            </div>
          )}
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-5 shadow-sm transition-shadow">
          {statsLoading ? (
            kpiSkeleton
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500">{t('stats.kpis.coverage')}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">
                  {typeof stats?.coverage_percent === 'number' ? `${stats.coverage_percent}%` : '—'}
                </p>
              </div>
              <Badge className={coverageClass(stats?.coverage_percent ?? 0)}>
                {typeof stats?.coverage_percent === 'number' ? `${stats.coverage_percent}%` : '—'}
              </Badge>
            </div>
          )}
        </Card>
      </div>

      {!statsLoading && stats ? (
        <div className="grid gap-3 md:grid-cols-2">
          {stats.missing_count > 0 ? (
            <Card className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-700 shadow-sm">
              <AlertTriangle className="h-4 w-4" />
              {t('stats.alerts.missing', { count: stats.missing_count })}
            </Card>
          ) : null}
          {stats.late_count > 0 ? (
            <Card className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-700 shadow-sm">
              <AlertTriangle className="h-4 w-4" />
              {t('stats.alerts.late', { count: stats.late_count })}
            </Card>
          ) : null}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={overviewLoading}
        searchValue={search}
        onSearchChange={setSearch}
        sorting={sorting}
        onSortingChange={setSorting}
        columnVisibilityKey="liftelo:rms-overview:columns"
        onRowClick={(row) => navigate(`/dashboard/locations/${row.location_id}`)}
      />

      {!overviewLoading && overviewError ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('stats.errors.title')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {overviewError instanceof Error ? overviewError.message : t('stats.errors.overviewLoadFailed')}
          </p>
        </Card>
      ) : null}

      {!overviewLoading && !overviewError && rows.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">{t('stats.empty.noData')}</p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default Stats
