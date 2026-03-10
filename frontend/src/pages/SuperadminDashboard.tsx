import { useEffect, useMemo, useState } from 'react'

import { API_BASE_URL, getSuperadminCompanies, getSuperadminStats } from '../services/api'
import type { SuperadminCompanyRow, SuperadminStats } from '../types/superadmin'
import { Button } from '../components/ui/button'
import CreateCompanyModal from '../components/superadmin/CreateCompanyModal'
import useAuthStore from '../store/authStore'

function SuperadminDashboard() {
  const [companies, setCompanies] = useState<SuperadminCompanyRow[]>([])
  const [stats, setStats] = useState<SuperadminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState<number | 'all'>('all')
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
    } catch (err) {
      console.error('Failed to fetch companies', err)
      setError('Unable to load companies')
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
      setStatsError('Unable to load stats')
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    void fetchCompanies()
  }, [])

  useEffect(() => {
    void fetchStats(year, month)
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
      { value: 'all' as const, label: 'All months' },
      ...Array.from({ length: 12 }, (_, index) => ({
        value: index + 1,
        label: new Date(2024, index, 1).toLocaleString('en', { month: 'long' }),
      })),
    ],
    []
  )

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return [currentYear - 1, currentYear, currentYear + 1]
  }, [])

  return (
    <div className="min-h-full bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Superadmin Dashboard</h1>
            <p className="text-sm text-zinc-500">Overview of all companies and activity.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setCreateOpen(true)}>Create Company</Button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-black"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Year</span>
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
            <span>Month</span>
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
            <span className="text-sm text-gray-500">Loading stats…</span>
          ) : statsError ? (
            <span className="text-sm text-rose-600">{statsError}</span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs text-gray-500">Total companies</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalCompanies}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs text-gray-500">Total users</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalUsers}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs text-gray-500">Total RMS</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalRms}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs text-gray-500">Total interventions</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.totalInterventions}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-700">Companies</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Created</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Locations</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Users</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">RMS</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Interventions</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-500" colSpan={7}>
                      Loading companies...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td className="px-4 py-4 text-center text-rose-600" colSpan={7}>
                      {error}
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-500" colSpan={7}>
                      No companies found.
                    </td>
                  </tr>
                ) : (
                  companies.map((company) => (
                    <tr key={company.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-zinc-900">{company.name}</div>
                        <div className="text-xs text-gray-500">{company.subscription_plan ?? 'basic'} plan</div>
                      </td>
                      <td className="px-4 py-2 text-zinc-600">
                        {new Date(company.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-zinc-600">{company.total_locations}</td>
                      <td className="px-4 py-2 text-zinc-600">{company.total_users}</td>
                      <td className="px-4 py-2 text-zinc-600">{company.total_rms}</td>
                      <td className="px-4 py-2 text-zinc-600">{company.total_interventions}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            company.subscription_status === 'suspended'
                              ? 'bg-red-100 text-red-700'
                              : company.subscription_status === 'active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {company.subscription_status ?? 'trial'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
