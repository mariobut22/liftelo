import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { API_BASE_URL, getSuperadminCompanies, getSuperadminStats } from '../services/api'
import type { SuperadminCompanyRow, SuperadminStats } from '../types/superadmin'
import { Button } from '../components/ui/button'
import CreateCompanyModal from '../components/superadmin/CreateCompanyModal'
import RevenuePanel from '../components/superadmin/RevenuePanel'
import HealthPanel from '../components/superadmin/HealthPanel'
import AuditPanel from '../components/superadmin/AuditPanel'
import GrowthPanel from '../components/superadmin/GrowthPanel'
import useAuthStore from '../store/authStore'
import { getLocale } from '../i18n'
import { useTranslation } from 'react-i18next'
import { Input } from '../components/ui/input'
import { ActivityCell, PlanBadge, StatusCell, UsageCell } from '../components/superadmin/CompanyCells'
import { useOverviewStatusLabel } from '../hooks/useOverviewStatusLabel'
import { useFormat } from '../lib/format'
import { cn } from '../lib/utils'
import {
  ALERT_KEYS,
  OVERVIEW_STATUSES,
  compareCompanies,
  getAlerts,
  getOverviewStatus,
  type AlertKey,
  type OverviewStatus,
  type SortKey,
} from '../lib/superadminOverview'

const TABS = ['companies', 'revenue', 'health', 'audit', 'growth'] as const
type DashboardTab = (typeof TABS)[number]

function SuperadminDashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: DashboardTab = TABS.find((item) => item === tabParam) ?? 'companies'
  const selectTab = (next: DashboardTab) => {
    setSearchParams(next === 'companies' ? {} : { tab: next }, { replace: true })
  }

  const [companies, setCompanies] = useState<SuperadminCompanyRow[]>([])
  const [stats, setStats] = useState<SuperadminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState<number | 'all'>('all')
  const [now, setNow] = useState(() => Date.now()) // refreshed whenever the companies are (re)loaded
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OverviewStatus | 'all'>('all')
  const [alertFilter, setAlertFilter] = useState<AlertKey | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('created')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const statusLabel = useOverviewStatusLabel()
  const { formatNumber } = useFormat()
  const logout = useAuthStore((state) => state.logout)
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (err) {
      console.warn('Logout failed', err)
    } finally {
      logout()
    }
  }

  const fetchCompanies = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSuperadminCompanies()
      setCompanies(data)
      setNow(Date.now())
    } catch (err) {
      console.error('Failed to fetch companies', err)
      setError(t('superadmin:superadminDashboard.unableLoadCompanies'))
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async (nextYear: number, nextMonth: number | 'all') => {
    setStatsLoading(true)
    setStatsError(null)
    try {
      const data = await getSuperadminStats({
        year: nextYear,
        month: nextMonth === 'all' ? undefined : nextMonth,
      })
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch superadmin stats', err)
      setStatsError(t('superadmin:superadminDashboard.unableLoadStats'))
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    void fetchCompanies()
    // load once; the error text is translated when the request fails
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void fetchStats(year, month)
    // reload only when the filters change; the error text is translated when the request fails
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const totals = useMemo(
    () => ({
      totalCompanies: stats?.totalCompanies ?? 0,
      totalUsers: stats?.totalUsers ?? 0,
      totalRms: stats?.totalRms ?? 0,
      totalInterventions: stats?.totalInterventions ?? 0,
    }),
    [stats]
  )

  const monthOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('superadmin:superadminDashboard.allMonths') },
      ...Array.from({ length: 12 }, (_, index) => ({
        value: index + 1,
        label: new Date(2024, index, 1).toLocaleString(getLocale(), { month: 'long' }),
      })),
    ],
    [t]
  )

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return [currentYear - 1, currentYear, currentYear + 1]
  }, [])

  const alertsByCompany = useMemo(() => new Map(companies.map((company) => [company.id, getAlerts(company, now)])), [companies, now])
  const alertCounts = useMemo(() => {
    const counts: Record<AlertKey, number> = { trialEnding: 0, expired: 0, billing: 0, overLimit: 0, inactive: 0 }
    for (const list of alertsByCompany.values()) for (const key of list) counts[key] += 1
    return counts
  }, [alertsByCompany])

  const visibleCompanies = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = companies.filter((company) => {
      if (query && !company.name.toLowerCase().includes(query)) return false
      if (statusFilter !== 'all' && getOverviewStatus(company) !== statusFilter) return false
      if (alertFilter && !alertsByCompany.get(company.id)?.includes(alertFilter)) return false
      return true
    })
    const direction = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => direction * compareCompanies(a, b, sortKey) || b.id - a.id)
  }, [companies, search, statusFilter, alertFilter, alertsByCompany, sortKey, sortDir])

  const hasFilters = search.trim() !== '' || statusFilter !== 'all' || alertFilter !== null
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setAlertFilter(null)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'status' ? 'asc' : 'desc')
    }
  }

  const sortOptions: Array<{ key: SortKey; label: string }> = [
    { key: 'created', label: t('superadmin:superadminDashboard.sortCreated') },
    { key: 'name', label: t('common:labels.name') },
    { key: 'status', label: t('superadmin:superadminDashboard.statusColumn') },
    { key: 'users', label: t('superadmin:superadminDashboard.users') },
    { key: 'locations', label: t('superadmin:superadminDashboard.locations') },
    { key: 'rms', label: 'RMS' },
    { key: 'interventions', label: t('common:labels.interventions') },
    { key: 'activity', label: t('superadmin:superadminDashboard.lastActivity') },
  ]

  const SortHeader = ({ column, label, className }: { column: SortKey; label: string; className?: string }) => (
    <th
      className={cn('px-4 py-2 text-left font-medium text-gray-500', className)}
      aria-sort={sortKey === column ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 hover:text-black">
        {label}
        <span aria-hidden className={sortKey === column ? 'text-zinc-900' : 'text-zinc-300'}>
          {sortKey === column ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )

  return (
    <div className="min-h-full w-full max-w-full overflow-x-clip bg-gray-50">
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{t('superadmin:superadminDashboard.superadminDashboard')}</h1>
            <p className="text-sm text-zinc-500">{t('superadmin:superadminDashboard.overviewAllCompaniesActivity')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setCreateOpen(true)}>{t('superadmin:createCompany')}</Button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-black"
            >
              {t('common:actions.signOut')}
            </button>
          </div>
        </div>

        <div role="tablist" aria-label={t('superadmin:monitoring.tabsLabel')} className="flex w-full max-w-full gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`superadmin-tab-${item}`}
              aria-selected={tab === item}
              aria-controls="superadmin-tabpanel"
              onClick={() => selectTab(item)}
              className={cn(
                'min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors',
                tab === item ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-gray-500 hover:text-zinc-900'
              )}
            >
              {t(`superadmin:monitoring.tabs.${item}`)}
            </button>
          ))}
        </div>

        <div id="superadmin-tabpanel" role="tabpanel" aria-labelledby={`superadmin-tab-${tab}`} className="space-y-4 sm:space-y-6">
        {tab === 'revenue' ? <RevenuePanel /> : null}
        {tab === 'health' ? <HealthPanel /> : null}
        {tab === 'audit' ? <AuditPanel /> : null}
        {tab === 'growth' ? <GrowthPanel /> : null}
        {tab === 'companies' ? (
        <>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{t('superadmin:superadminDashboard.year')}</span>
            <select
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{t('superadmin:superadminDashboard.month')}</span>
            <select
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              value={month}
              onChange={(event) => {
                const value = event.target.value
                setMonth(value === 'all' ? 'all' : Number(value))
              }}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {statsLoading ? (
            <span className="text-sm text-gray-500">{t('superadmin:superadminDashboard.loadingStatistics')}</span>
          ) : statsError ? (
            <span className="text-sm text-rose-600">{statsError}</span>
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4 [&>*]:min-w-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-xs text-gray-500">{t('superadmin:superadminDashboard.totalCompanies')}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalCompanies}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-xs text-gray-500">{t('superadmin:superadminDashboard.totalUsers')}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalUsers}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-xs text-gray-500">{t('superadmin:superadminDashboard.totalRms')}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalRms}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-xs text-gray-500">{t('superadmin:superadminDashboard.totalInterventions')}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalInterventions}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-gray-700">{t('superadmin:superadminDashboard.alerts.title')}</h2>
            {alertFilter ? (
              <button type="button" onClick={() => setAlertFilter(null)} className="text-xs text-gray-600 underline hover:text-black">
                {t('superadmin:superadminDashboard.alerts.clear')}
              </button>
            ) : null}
          </div>
          {loading || error ? (
            <p className="text-sm text-gray-400">—</p>
          ) : ALERT_KEYS.every((key) => alertCounts[key] === 0) ? (
            <p className="text-sm text-gray-500">{t('superadmin:superadminDashboard.alerts.allClear')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ALERT_KEYS.filter((key) => alertCounts[key] > 0).map((key) => {
                const active = alertFilter === key
                const danger = key === 'expired' || key === 'billing'
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    title={active ? t('superadmin:superadminDashboard.alerts.filterActive') : undefined}
                    onClick={() => setAlertFilter(active ? null : key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-sm transition-colors',
                      active
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : danger
                        ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    )}
                  >
                    <span className="font-semibold tabular-nums">{alertCounts[key]}</span>
                    <span>{t(`superadmin:superadminDashboard.alerts.${key}`)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3">
            <h2 className="text-lg font-medium text-gray-700">{t('superadmin:superadminDashboard.companies')}</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('superadmin:superadminDashboard.searchPlaceholder')}
                aria-label={t('superadmin:superadminDashboard.searchPlaceholder')}
                className="sm:max-w-xs"
              />
              <select
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={statusFilter}
                aria-label={t('superadmin:superadminDashboard.statusFilter')}
                onChange={(event) => setStatusFilter(event.target.value as OverviewStatus | 'all')}
              >
                <option value="all">{t('superadmin:superadminDashboard.allStatuses')}</option>
                {OVERVIEW_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 md:hidden">
                <select
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={sortKey}
                  aria-label={t('superadmin:superadminDashboard.sortBy')}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                >
                  {sortOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {t('superadmin:superadminDashboard.sortBy')}: {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  aria-label={sortDir === 'asc' ? t('superadmin:superadminDashboard.sortAscending') : t('superadmin:superadminDashboard.sortDescending')}
                  onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
              {!loading && !error ? (
                <span className="text-xs text-gray-500 sm:ml-auto">
                  {t('superadmin:superadminDashboard.showing', { shown: visibleCompanies.length, total: companies.length })}
                </span>
              ) : null}
            </div>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-gray-500">{t('superadmin:superadminDashboard.loadingCompanies')}</p>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-rose-600">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchCompanies()}>
                {t('superadmin:superadminDashboard.retry')}
              </Button>
            </div>
          ) : companies.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{t('superadmin:superadminDashboard.noCompaniesFound')}</p>
          ) : visibleCompanies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-gray-500">{t('superadmin:superadminDashboard.noResults')}</p>
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  {t('superadmin:superadminDashboard.clearFilters')}
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {visibleCompanies.map((company) => (
                  <li key={company.id} className="relative rounded-lg border border-gray-200 p-3 transition-colors focus-within:ring-2 focus-within:ring-zinc-400 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words font-medium text-zinc-900">
                          <Link
                            to={`/superadmin/companies/${company.id}`}
                            aria-label={t('superadmin:superadminDashboard.openCompany', { name: company.name })}
                            className="outline-none after:absolute after:inset-0 after:content-['']"
                          >
                            {company.name}
                          </Link>
                        </div>
                        <PlanBadge company={company} />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <StatusCell company={company} now={now} />
                      <UsageCell company={company} />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center text-xs text-gray-500">
                      <div>
                        <dd className="text-base font-semibold tabular-nums text-zinc-900">{formatNumber(company.total_locations)}</dd>
                        <dt>{t('superadmin:superadminDashboard.locations')}</dt>
                      </div>
                      <div>
                        <dd className="text-base font-semibold tabular-nums text-zinc-900">{formatNumber(company.total_rms)}</dd>
                        <dt>RMS</dt>
                      </div>
                      <div>
                        <dd className="text-base font-semibold tabular-nums text-zinc-900">{formatNumber(company.total_interventions)}</dd>
                        <dt>{t('common:labels.interventions')}</dt>
                      </div>
                    </dl>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                      <span>{t('superadmin:superadminDashboard.lastActivity')}</span>
                      <ActivityCell company={company} now={now} />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <SortHeader column="name" label={t('common:labels.name')} />
                      <SortHeader column="status" label={t('superadmin:superadminDashboard.statusColumn')} />
                      <SortHeader column="users" label={t('superadmin:superadminDashboard.users')} />
                      <SortHeader column="locations" label={t('superadmin:superadminDashboard.locations')} />
                      <SortHeader column="rms" label="RMS" />
                      <SortHeader column="interventions" label={t('common:labels.interventions')} />
                      <SortHeader column="activity" label={t('superadmin:superadminDashboard.lastActivity')} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleCompanies.map((company) => (
                      <tr key={company.id} className="cursor-pointer align-top transition-colors focus-within:bg-gray-50 hover:bg-gray-50" onClick={() => navigate(`/superadmin/companies/${company.id}`)}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900">
                            <Link
                              to={`/superadmin/companies/${company.id}`}
                              aria-label={t('superadmin:superadminDashboard.openCompany', { name: company.name })}
                              className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {company.name}
                            </Link>
                          </div>
                          <PlanBadge company={company} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusCell company={company} now={now} />
                        </td>
                        <td className="px-4 py-3">
                          <UsageCell company={company} />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600">{formatNumber(company.total_locations)}</td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600">{formatNumber(company.total_rms)}</td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600">{formatNumber(company.total_interventions)}</td>
                        <td className="px-4 py-3">
                          <ActivityCell company={company} now={now} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        </>
        ) : null}
        </div>

        <CreateCompanyModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={fetchCompanies}
        />
      </div>
    </div>
  )
}

export default SuperadminDashboard
