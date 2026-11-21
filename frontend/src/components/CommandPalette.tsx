import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  AlertCircle,
  Car,
  ClipboardList,
  Loader2,
  MapPin,
  MoveVertical,
  Search,
  Wrench,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import useGlobalSearch, { SEARCH_MIN_LENGTH } from '../hooks/queries/useGlobalSearch'
import { useFormat } from '../lib/format'

const DEBOUNCE_MS = 250

type ResultItem = {
  key: string
  title: string
  subtitle?: string
  href: string
}

type ResultGroup = {
  id: string
  titleKey: string
  icon: LucideIcon
  items: ResultItem[]
  start?: number
}

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Global search dialog (GET /api/search). Opened from the header button or Ctrl/Cmd+K; state is owned by AppLayout. */
function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const { formatDate } = useFormat()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const trimmed = query.trim()
  const valid = trimmed.length >= SEARCH_MIN_LENGTH
  const { data, isFetching, isError } = useGlobalSearch(debounced)
  const pending = valid && (debounced.trim() !== trimmed || (isFetching && !data))
  const showData = valid && debounced.trim() === trimmed && data

  const groups = useMemo<ResultGroup[]>(() => {
    if (!showData || !data) return []
    const withDate = (name: string, date: string | null) => (date ? `${name} · ${formatDate(date)}` : name)
    const all: ResultGroup[] = [
      {
        id: 'locations',
        titleKey: 'nav:items.locations',
        icon: MapPin,
        items: data.locations.map((row) => ({ key: `l${row.id}`, title: row.name, subtitle: row.address, href: `/dashboard/locations/${row.id}` })),
      },
      {
        id: 'elevators',
        titleKey: 'common:labels.elevators',
        icon: MoveVertical,
        items: data.elevators.map((row) => ({
          key: `e${row.id}`,
          title: row.label,
          subtitle: [row.serial_number, row.location_name].filter(Boolean).join(' · '),
          href: `/dashboard/locations/${row.location_id}`,
        })),
      },
      {
        id: 'vehicles',
        titleKey: 'nav:items.vehicles',
        icon: Car,
        items: data.vehicles.map((row) => ({ key: `v${row.id}`, title: row.name, href: '/dashboard/vehicles' })),
      },
      {
        id: 'rms',
        titleKey: 'nav:items.rms',
        icon: Activity,
        items: data.rms.map((row) => ({
          key: `r${row.id}`,
          title: t('nav:commandPalette.rmsVisit', { id: row.id }),
          subtitle: withDate(row.location_name, row.date),
          href: `/dashboard/rms/${row.id}`,
        })),
      },
      {
        id: 'interventions',
        titleKey: 'nav:items.interventions',
        icon: Wrench,
        items: data.interventions.map((row) => ({
          key: `i${row.id}`,
          title: t('nav:commandPalette.intervention', { id: row.id }),
          subtitle: withDate(row.location_name, row.date),
          href: `/dashboard/interventions/${row.id}`,
        })),
      },
      {
        id: 'work_orders',
        titleKey: 'nav:items.workOrders',
        icon: ClipboardList,
        items: data.work_orders.map((row) => ({
          key: `w${row.id}`,
          title: t('nav:commandPalette.workOrder', { id: row.id }),
          subtitle: withDate(row.location_name, row.due_date),
          href: `/dashboard/work-orders/${row.id}`,
        })),
      },
    ]
    const nonEmpty = all.filter((group) => group.items.length > 0)
    return nonEmpty.map((group, index) => ({
      ...group,
      start: nonEmpty.slice(0, index).reduce((sum, previous) => sum + previous.items.length, 0),
    }))
  }, [data, showData, t, formatDate])

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const active = Math.min(activeIndex, Math.max(flat.length - 1, 0))

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open, flat])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('')
      setDebounced('')
      setActiveIndex(0)
    }
    onOpenChange(next)
  }

  const handleSelect = (href: string) => {
    handleOpenChange(false)
    navigate(href)
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && flat.length > 0) {
      event.preventDefault()
      setActiveIndex((active + 1) % flat.length)
    } else if (event.key === 'ArrowUp' && flat.length > 0) {
      event.preventDefault()
      setActiveIndex((active - 1 + flat.length) % flat.length)
    } else if (event.key === 'Home' && flat.length > 0) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && flat.length > 0) {
      event.preventDefault()
      setActiveIndex(flat.length - 1)
    } else if (event.key === 'Enter' && flat[active]) {
      event.preventDefault()
      handleSelect(flat[active].href)
    }
  }

  const optionId = (key: string) => `global-search-option-${key}`
  const listboxId = 'global-search-listbox'

  let statusText: string | null = null
  if (!valid) statusText = t('nav:commandPalette.hint', { n: SEARCH_MIN_LENGTH })
  else if (pending) statusText = t('common:states.loading')
  else if (isError) statusText = t('nav:commandPalette.error')
  else if (showData && flat.length === 0) statusText = t('nav:commandPalette.noResults', { query: trimmed })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-4 max-h-[85dvh] translate-y-0 p-0 sm:top-[12%]" data-testid="global-search">
        <DialogTitle className="sr-only">{t('nav:commandPalette.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('nav:commandPalette.description')}</DialogDescription>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-2">
            <div className="flex items-center gap-3">
              {pending ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-zinc-400" aria-hidden="true" />
              ) : (
                <Search className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />
              )}
              <input
                value={query}
                autoFocus
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={handleInputKeyDown}
                placeholder={t('nav:commandPalette.placeholder')}
                aria-label={t('nav:commandPalette.title')}
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={listboxId}
                aria-activedescendant={flat[active] ? optionId(flat[active].key) : undefined}
                aria-autocomplete="list"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="h-11 w-full bg-transparent text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                data-testid="global-search-input"
              />
            </div>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <div role="status" aria-live="polite">
              {statusText ? (
                <p
                  className={`flex items-center justify-center gap-2 px-4 py-6 text-center text-sm ${isError && valid && !pending ? 'text-rose-600' : 'text-zinc-500'}`}
                  data-testid="global-search-status"
                >
                  {isError && valid && !pending ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  {statusText}
                </p>
              ) : null}
            </div>
            <div id={listboxId} role="listbox" aria-label={t('nav:commandPalette.title')} hidden={groups.length === 0}>
              {groups.map((group) => {
                const start = group.start ?? 0
                const Icon = group.icon
                const headingId = `global-search-group-${group.id}`
                return (
                  <div key={group.id} role="group" aria-labelledby={headingId} className="mb-2 last:mb-0">
                    <p id={headingId} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {t(group.titleKey)}
                    </p>
                    {group.items.map((item, index) => {
                      const selected = start + index === active
                      return (
                        <div
                          key={item.key}
                          id={optionId(item.key)}
                          role="option"
                          aria-selected={selected}
                          onClick={() => handleSelect(item.href)}
                          onMouseMove={() => {
                            if (!selected) setActiveIndex(start + index)
                          }}
                          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 transition-colors ${selected ? 'bg-zinc-100' : ''}`}
                          data-testid="global-search-option"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-zinc-900">{item.title}</span>
                            {item.subtitle ? <span className="block truncate text-xs text-zinc-500">{item.subtitle}</span> : null}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CommandPalette
