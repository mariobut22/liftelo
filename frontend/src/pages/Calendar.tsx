import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '../components/ui/button'
import { getCalendar, type CalendarData } from '../services/api'
import useAuthStore from '../store/authStore'
import { useFormat } from '../lib/format'
import { statusLabel } from '../lib/statusLabels'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: Date, n: number) => {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  return next
}
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)) // Monday

/** Desktop (>= 768px) shows a month grid, mobile an agenda list of the current week. */
const useIsWide = () => {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true))
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = () => setWide(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return wide
}

type CalItem =
  | { kind: 'workOrder'; key: string; date: string; id: number; title: string; status: string; location: string | null; assignees: string | null; overdue: boolean }
  | { kind: 'rms'; key: string; date: string; month: string; missing: number; expected: number; locations: string[] }
  | { kind: 'recurrence'; key: string; date: string; id: number; title: string; location: string | null }

function Calendar() {
  const { t } = useTranslation('calendar')
  const { t: tc } = useTranslation()
  const format = useFormat()
  const wide = useIsWide()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const todayStr = ymd(new Date())
  const [cursor, setCursor] = useState(() => new Date())

  const range = useMemo(() => {
    if (wide) {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const from = startOfWeek(first)
      const to = addDays(startOfWeek(last), 6)
      return { from, to }
    }
    const from = startOfWeek(cursor)
    return { from, to: addDays(from, 6) }
  }, [cursor, wide])

  const fromStr = ymd(range.from)
  const toStr = ymd(range.to)
  const { data, isLoading, error } = useQuery<CalendarData>({
    queryKey: ['calendar', fromStr, toStr],
    queryFn: () => getCalendar(fromStr, toStr),
    staleTime: 60 * 1000,
  })

  const byDate = useMemo(() => {
    const map = new Map<string, CalItem[]>()
    const push = (item: CalItem) => map.set(item.date, [...(map.get(item.date) ?? []), item])
    for (const o of data?.work_orders ?? []) {
      push({
        kind: 'workOrder', key: `wo-${o.id}`, date: o.date, id: o.id, title: o.title || `#${o.id}`, status: o.status,
        location: o.location_name, assignees: o.assignees, overdue: o.status === 'open' && o.date < todayStr,
      })
    }
    for (const d of data?.rms_deadlines ?? []) {
      push({ kind: 'rms', key: `rms-${d.month}`, date: d.date, month: d.month, missing: d.missing, expected: d.expected, locations: d.missing_locations.map((l) => l.name) })
    }
    for (const r of data?.recurrences ?? []) {
      push({ kind: 'recurrence', key: `rec-${r.recurrence_id}-${r.date}`, date: r.date, id: r.recurrence_id, title: r.title, location: r.location_name })
    }
    return map
  }, [data, todayStr])

  const days = useMemo(() => {
    const list: Date[] = []
    for (let d = range.from; ymd(d) <= toStr; d = addDays(d, 1)) list.push(d)
    return list
  }, [range.from, toStr])

  const step = (direction: -1 | 1) => {
    setCursor((prev) => (wide ? new Date(prev.getFullYear(), prev.getMonth() + direction, 1) : addDays(prev, direction * 7)))
  }

  const heading = wide
    ? cursor.toLocaleDateString(format.locale, { month: 'long', year: 'numeric' })
    : t('week', { from: format.formatDate(range.from, '', { day: 'numeric', month: 'short' }), to: format.formatDate(range.to, '', { day: 'numeric', month: 'short' }) })

  const weekdayNames = useMemo(() => days.slice(0, 7).map((d) => d.toLocaleDateString(format.locale, { weekday: 'short' })), [days, format.locale])

  const renderItem = (item: CalItem, compact: boolean) => {
    const base = `block w-full rounded-md border px-2 py-1 text-left leading-tight ${compact ? 'text-[11px]' : 'text-sm'}`
    if (item.kind === 'workOrder') {
      const tone = item.status === 'completed'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : item.overdue ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-blue-200 bg-blue-50 text-blue-800'
      return (
        <Link key={item.key} to={`/dashboard/work-orders/${item.id}`} data-testid="cal-item" data-kind="work-order" data-id={item.id} className={`${base} ${tone}`}>
          <span className="block truncate font-medium">{item.title}</span>
          <span className="block truncate opacity-80">
            {item.location ? `${item.location} · ` : ''}{statusLabel(tc, item.status)}
          </span>
          {!compact && item.assignees ? <span className="block truncate opacity-80">{item.assignees}</span> : null}
        </Link>
      )
    }
    if (item.kind === 'rms') {
      const done = item.missing === 0
      const text = compact
        ? (done ? t('rmsDoneShort') : t('rmsShort', { missing: item.missing, expected: item.expected }))
        : (done ? t('rmsDone', { expected: item.expected }) : t('rmsMissing', { missing: item.missing, expected: item.expected }))
      return (
        <Link
          key={item.key}
          to={`/dashboard/rms-overview?deadline=${item.month}`}
          data-testid="cal-item"
          data-kind="rms"
          title={item.locations.join(', ')}
          className={`${base} ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          <span className="block truncate font-medium">{text}</span>
          {!compact && item.locations.length > 0 ? <span className="block truncate opacity-80">{item.locations.join(', ')}</span> : null}
        </Link>
      )
    }
    const tone = 'border-dashed border-zinc-300 bg-white text-zinc-700'
    const content = (
      <>
        <span className="block truncate font-medium">{t('recurringItem', { title: item.title })}</span>
        {!compact && item.location ? <span className="block truncate opacity-80">{item.location}</span> : null}
      </>
    )
    return isAdmin ? (
      <Link key={item.key} to="/dashboard/work-orders/recurring" data-testid="cal-item" data-kind="recurrence" className={`${base} ${tone}`}>{content}</Link>
    ) : (
      <div key={item.key} data-testid="cal-item" data-kind="recurrence" className={`${base} ${tone}`}>{content}</div>
    )
  }

  const total = Array.from(byDate.values()).reduce((sum, list) => sum + list.length, 0)

  return (
    <div className="space-y-4" data-testid="calendar-page">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('subtitle')}</p>
        {data?.role === 'technician' ? <p className="mt-1 text-xs text-zinc-500">{t('myOnly')}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" aria-label={t('previous')} data-testid="cal-prev" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" aria-label={t('next')} data-testid="cal-next" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="secondary" data-testid="cal-today" onClick={() => setCursor(new Date())}>
            {t('today')}
          </Button>
        </div>
        <h2 data-testid="cal-heading" className="text-right text-sm font-semibold capitalize text-zinc-900 sm:text-base">{heading}</h2>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-blue-200 bg-blue-50" />{t('legend.workOrder')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" />{t('legend.rms')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-zinc-300 bg-white" />{t('legend.recurring')}</span>
      </div>

      {error ? <p data-testid="cal-error" className="text-sm text-rose-600">{error instanceof Error && error.message ? error.message : t('loadFailed')}</p> : null}
      {isLoading ? <p className="text-sm text-zinc-500">…</p> : null}

      {!isLoading && !error && total === 0 ? <p data-testid="cal-empty" className="text-sm text-zinc-500">{t('empty')}</p> : null}

      {wide ? (
        <div data-testid="cal-month" className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-semibold text-zinc-500">
            {weekdayNames.map((name) => <div key={name} className="py-2 capitalize">{name}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = ymd(day)
              const items = byDate.get(key) ?? []
              const inMonth = day.getMonth() === cursor.getMonth()
              return (
                <div key={key} data-testid="cal-day" data-date={key} className={`min-h-28 space-y-1 border-b border-r border-zinc-100 p-1.5 ${inMonth ? 'bg-white' : 'bg-zinc-50/70'}`}>
                  <div className={`text-xs font-medium ${key === todayStr ? 'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1 text-white' : inMonth ? 'text-zinc-700' : 'text-zinc-400'}`}>{day.getDate()}</div>
                  {items.slice(0, 3).map((item) => renderItem(item, true))}
                  {items.length > 3 ? <p className="text-[11px] text-zinc-500">{t('moreItems', { count: items.length - 3 })}</p> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div data-testid="cal-agenda" className="space-y-2">
          {days.map((day) => {
            const key = ymd(day)
            const items = byDate.get(key) ?? []
            return (
              <section key={key} data-testid="cal-day" data-date={key} className={`rounded-xl border p-3 ${key === todayStr ? 'border-zinc-900' : 'border-zinc-200'} bg-white`}>
                <h3 className="text-sm font-semibold capitalize text-zinc-900">
                  {day.toLocaleDateString(format.locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {items.length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-400">{t('noItemsDay')}</p>
                ) : (
                  <div className="mt-2 space-y-1.5">{items.map((item) => renderItem(item, false))}</div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Calendar
