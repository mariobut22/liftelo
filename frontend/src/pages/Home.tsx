import { useMemo } from 'react'
import { Bell, CheckCircle2, Clock, Wrench } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import useHomeSummary from '../hooks/queries/useHomeSummary'

function Home() {
  const {
    data: summary,
    isLoading: loading,
    error,
  } = useHomeSummary()

  const kpis = useMemo(
    () => [
      {
        label: 'RMS expected',
        value: summary?.rms_summary.expected,
        icon: CheckCircle2,
      },
      {
        label: 'RMS done',
        value: summary?.rms_summary.done,
        icon: CheckCircle2,
      },
      {
        label: 'RMS late',
        value: summary?.rms_summary.late,
        icon: Clock,
      },
      {
        label: 'RMS missing',
        value: summary?.rms_summary.missing,
        icon: Wrench,
      },
    ],
    [summary]
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

  if (loading) {
    return <div className="p-6 text-sm text-zinc-500">Loading dashboard...</div>
  }

  if (!summary) {
    return <div className="p-6 text-red-500">Failed to load dashboard.</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-5xl font-bold text-blue-600">Liftelo v2</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-zinc-900">
            Welcome back, {summary?.user.name}
          </h1>
          <p className="text-sm text-zinc-500">Here's what's happening this month</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{summary?.alerts.count ?? 0} alerts</Badge>
          <Button size="sm">Create report</Button>
        </div>
      </div>

      {error ? (
        <Card className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-rose-600">Unable to load data</p>
            <p className="text-sm text-rose-500">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon

          return (
            <Card
              key={item.label}
              className="rounded-2xl border border-zinc-200 p-6 shadow-sm transition-all duration-200 ease-in-out hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">{item.label}</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold text-zinc-900">
                {item.value ?? 0}
              </p>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border border-zinc-200 p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Coverage</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">
                RMS completion progress
              </p>
            </div>
            <Button variant="secondary" size="sm">
              View details
            </Button>
          </div>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>{summary?.rms_summary.done ?? 0} done</span>
              <span>{summary?.rms_summary.expected ?? 0} expected</span>
            </div>
            <div className="h-3 w-full rounded-full bg-zinc-100">
              <div
                className={`h-3 rounded-full transition-all duration-200 ease-in-out ${coverageColor}`}
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Missing: {summary?.rms_summary.missing ?? 0}</span>
              <span>{coveragePercent}% complete</span>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl border border-zinc-200 bg-amber-50/80 p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Bell className="h-5 w-5" />
              </span>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-zinc-900">Attention required</p>
                <p className="text-sm text-zinc-600">
                  {summary?.work_orders?.open_assigned_count ?? 0} assigned work orders need
                  scheduling.
                </p>
                <Button variant="secondary" size="sm">
                  Review now
                </Button>
              </div>
            </div>
          </Card>
          <Card className="rounded-2xl border border-zinc-200 p-6 shadow-sm">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-900">Team highlights</p>
              <div className="flex items-center justify-between text-sm text-zinc-500">
                <span>RMS completed</span>
                <span className="text-zinc-900">{summary?.rms_summary.done ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-zinc-500">
                <span>RMS pending</span>
                <span className="text-zinc-900">{summary?.rms_summary.missing ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-zinc-500">
                <span>Open work orders</span>
                <span className="text-zinc-900">
                  {summary?.work_orders?.open_assigned_count ?? 0}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {summary?.rms_missing_locations?.length ? (
        <Card className="rounded-2xl border border-zinc-200 p-6 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900">Missing RMS locations</p>
              <Badge variant="secondary">
                {summary?.rms_missing_locations.length} locations
              </Badge>
            </div>
            <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
              {summary?.rms_missing_locations.map((location) => (
                <div
                  key={location.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                >
                  {location.name}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default Home
