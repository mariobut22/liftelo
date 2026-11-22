import { useEffect, useMemo, useState } from 'react'
import { Building2, Download, FileSpreadsheet, MapPin, QrCode, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import DataTable from '../components/table/DataTable'
import EmptyState from '../components/ui/empty-state'
import usePersistedListState, { useSavedListState } from '../hooks/usePersistedListState'
import LocationsMap from '../components/maps/LocationsMap'
import LocationCreateModal from '../components/locations/LocationCreateModal'
import LocationFaultsBadge from '../components/findings/LocationFaultsBadge'
import { useFindingsByLocation } from '../hooks/queries/useFindings'
import { faultSortWeight } from '../lib/findings'
import useLocationsWithActivity from '../hooks/queries/useLocationsWithActivity'
import useAuthStore from '../store/authStore'
import type { LocationWithActivity } from '../types/location'
import { getLocale } from '../i18n'
import { useTranslation } from 'react-i18next'
import { rmsFrequencyLabel } from '../lib/rmsFrequency'
import { rmsStatusLabel } from '../lib/rmsStatus'

interface LocationsListState {
  search: string
  sorting: Array<{ id: string; desc: boolean }>
  faultsOnly: boolean
  pageSize: number
}

const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}` // spreadsheet formula injection
  return `"${text.replace(/"/g, '""')}"`
}

function Locations() {
  const { t } = useTranslation()

  const [errorMessage] = useState(t('locations:locations.weCanTLoadLocations'))
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const initialParams = useMemo(() => searchParams, [searchParams])
  const [createModalOpen, setCreateModalOpen] = useState(false)
  // Remembered per user (localStorage); query params in the URL win over the saved state.
  const saved = useSavedListState<LocationsListState>('locations', ['search', 'sort', 'order', 'faults'])
  const [search, setSearch] = useState(() => initialParams.get('search') ?? saved.search ?? '')
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>(() => {
    const sortParam = initialParams.get('sort')
    const orderParam = initialParams.get('order')
    if (sortParam) return [{ id: sortParam, desc: orderParam === 'desc' }]
    return Array.isArray(saved.sorting) ? saved.sorting : []
  })
  const [faultsOnly, setFaultsOnly] = useState(() => (initialParams.has('faults') ? initialParams.get('faults') === '1' : saved.faultsOnly === true))
  const [pageSize, setPageSize] = useState(() => (typeof saved.pageSize === 'number' ? saved.pageSize : 10))
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const { isActive: filtersActive } = usePersistedListState<LocationsListState>({
    page: 'locations',
    current: { search, sorting, faultsOnly, pageSize },
    defaults: { search: '', sorting: [], faultsOnly: false, pageSize: 10 },
  })
  const resetFilters = () => {
    setSearch('')
    setSorting([])
    setFaultsOnly(false)
  }
  const { data, isLoading: loading, error, refetch } = useLocationsWithActivity()
  const locations = useMemo(() => data ?? [], [data])
  // open faults per location (one request); unavailable/offline = no badges, the page keeps working
  const { data: faultData } = useFindingsByLocation()
  const faultsByLocation = useMemo(
    () => new Map((faultData?.items ?? []).map((item) => [item.location_id, item])),
    [faultData]
  )
  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase()
    return locations.filter((location) => {
      if (faultsOnly && !faultsByLocation.has(location.id)) return false
      if (!query) return true
      return [location.name, location.address, location.elevator_search]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [locations, search, faultsOnly, faultsByLocation])

  const getStatusDotClass = (status?: string) => {
    if (status === 'O.K.') return 'bg-emerald-500'
    if (status === 'Potreban popravak - Dizalo u funkciji') return 'bg-amber-500'
    if (status === 'Potreban popravak - Dizalo nije u funkciji') return 'bg-rose-500'
    return 'bg-zinc-300'
  }

  const columns = useMemo<ColumnDef<LocationWithActivity>[]>(
    () => [
      ...(isAdmin
        ? [
            {
              id: 'select',
              enableSorting: false,
              meta: { hideFromColumns: true },
              header: ({ table }) => {
                const pageRows = table.getRowModel().rows
                const allSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.original.id))
                return (
                  <input
                    type="checkbox"
                    data-testid="select-all-page"
                    aria-label={t('locations:bulk.selectAll')}
                    checked={allSelected}
                    onChange={(event) => {
                      const next = new Set(selected)
                      pageRows.forEach((row) => (event.target.checked ? next.add(row.original.id) : next.delete(row.original.id)))
                      setSelected(next)
                    }}
                    className="h-5 w-5 rounded border-zinc-300"
                  />
                )
              },
              cell: ({ row }) => (
                <input
                  type="checkbox"
                  data-testid="select-row"
                  aria-label={t('locations:bulk.selectRow', { name: row.original.name })}
                  checked={selected.has(row.original.id)}
                  onChange={(event) => {
                    const next = new Set(selected)
                    if (event.target.checked) next.add(row.original.id)
                    else next.delete(row.original.id)
                    setSelected(next)
                  }}
                  className="h-5 w-5 rounded border-zinc-300"
                />
              ),
            } satisfies ColumnDef<LocationWithActivity>,
          ]
        : []),
      {
        accessorKey: 'name',
        header: t('common:labels.name'),
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => navigate(`/dashboard/locations/${row.original.id}`)}
            className="text-left font-medium text-zinc-900"
          >
            {row.original.name}
          </button>
        ),
      },
      {
        id: 'faults',
        header: t('findings:locationBadge.column'),
        accessorFn: (row) => faultSortWeight(faultsByLocation.get(row.id)),
        sortDescFirst: true,
        cell: ({ row }) => {
          const summary = faultsByLocation.get(row.original.id)
          return summary ? <LocationFaultsBadge summary={summary} /> : <span className="text-sm text-zinc-400">—</span>
        },
      },
      {
        accessorKey: 'address',
        header: t('common:labels.address'),
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">{row.original.address ?? '—'}</span>
        ),
      },
      {
        id: 'status',
        header: t('common:labels.status'),
        cell: ({ row }) => {
          const statuses = row.original.elevator_statuses ?? []
          if (!statuses.length) {
            return <span className="text-sm text-zinc-400">—</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {statuses.map((item, index) => (
                <span
                  key={`${row.original.id}-status-${index}`}
                  className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(item.status)}`}
                  title={`${item.elevator_label}: ${rmsStatusLabel(t, item.status)}`}
                />
              ))}
            </div>
          )
        },
      },
      {
        accessorKey: 'last_activity',
        header: t('locations:locations.lastEntry'),
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">
            {row.original.last_activity ? new Date(row.original.last_activity).toLocaleDateString(getLocale()) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'rms_frequency',
        header: 'RMS',
        cell: ({ row }) => (
          <Badge variant="secondary">
            {rmsFrequencyLabel(t, row.original.rms_frequency)}
          </Badge>
        ),
      },
    ],
    [navigate, t, faultsByLocation, isAdmin, selected]
  )

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
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
    if (faultsOnly) {
      params.set('faults', '1')
    } else {
      params.delete('faults')
    }
    setSearchParams(params, { replace: true })
  }, [search, sorting, faultsOnly, searchParams, setSearchParams])

  const selectedIds = useMemo(() => locations.filter((location) => selected.has(location.id)).map((location) => location.id), [locations, selected])

  const exportSelectedCsv = () => {
    const header = [t('common:labels.name'), t('common:labels.address'), t('locations:locations.lastEntry'), 'RMS', t('locations:bulk.csvElevators')]
    const lines = locations
      .filter((location) => selected.has(location.id))
      .map((location) =>
        [
          location.name,
          location.address ?? '',
          location.last_activity ? new Date(location.last_activity).toLocaleDateString(getLocale()) : '',
          rmsFrequencyLabel(t, location.rms_frequency),
          location.elevator_statuses?.length ?? 0,
        ]
          .map(csvCell)
          .join(',')
      )
    const blob = new Blob(['\uFEFF' + [header.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${t('locations:bulk.csvFile')}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t('common:labels.locations')}</h1>
          <p className="text-sm text-zinc-500">{t('locations:locations.overviewAllBuildingsTheirStatus')}</p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate('/dashboard/qr-labels')}>
              <QrCode className="h-4 w-4" />
              {t('locations:qr.action.allLabels')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate('/dashboard/import')} data-testid="locations-import-button">
              <FileSpreadsheet className="h-4 w-4" />
              {t('import:entry.button')}
            </Button>
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>
              {t('locations:locations.newLocation')}
            </Button>
          </div>
        ) : null}
      </div>

      {isAdmin ? (
        <LocationCreateModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onCreated={(id) => navigate(`/dashboard/locations/${id}`)}
        />
      ) : null}

      <LocationsMap locations={filteredLocations} faultsByLocation={faultsByLocation} />

      <DataTable
        columns={columns}
        data={filteredLocations}
        isLoading={loading}
        searchValue={search}
        onSearchChange={setSearch}
        sorting={sorting}
        onSortingChange={setSorting}
        columnVisibilityKey="liftelo:locations:columns"
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        filtersActive={filtersActive}
        onResetFilters={resetFilters}
        emptyState={
          error ? undefined : (
            <EmptyState
              compact
              icon={Building2}
              title={t('locations:locations.haveNoLocations')}
              description={isAdmin ? t('import:entry.emptyHint') : t('locations:locations.addFirstLocationGetStarted')}
              action={
                isAdmin ? (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" data-testid="locations-empty-actions">
                    <Button size="sm" onClick={() => navigate('/dashboard/import')} data-testid="locations-empty-import">
                      <FileSpreadsheet className="h-4 w-4" />
                      {t('import:entry.emptyTitle')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCreateModalOpen(true)}>
                      {t('locations:locations.addFirstLocation')}
                    </Button>
                  </div>
                ) : undefined
              }
            />
          )
        }
        filterRight={
          <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              data-testid="faults-only-filter"
              checked={faultsOnly}
              onChange={(event) => setFaultsOnly(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            {t('findings:locationFilter.only')}
            {faultsByLocation.size > 0 ? <span className="text-xs text-zinc-400">({faultsByLocation.size})</span> : null}
          </label>
        }
        onRowClick={(row) => navigate(`/dashboard/locations/${row.id}`)}
      />

      {!loading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <MapPin className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('common:states.error')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : errorMessage}
          </p>
          <Button size="sm" className="mt-4" onClick={() => refetch()}>
            {t('common:actions.tryAgain')}
          </Button>
        </Card>
      ) : null}

      {isAdmin && selectedIds.length > 0 ? <div className="h-32 sm:h-20" aria-hidden="true" /> : null}

      {isAdmin && selectedIds.length > 0 ? (
        <div
          role="region"
          aria-label={t('locations:bulk.barLabel')}
          data-testid="bulk-bar"
          className="fixed inset-x-3 bottom-20 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 shadow-lg sm:inset-x-auto sm:bottom-6 sm:right-24 sm:max-w-[calc(100vw-3rem)]"
        >
          <span className="mr-auto text-sm font-medium text-zinc-700" aria-live="polite">
            {t('locations:bulk.selected', { count: selectedIds.length })}
          </span>
          <Button
            size="sm"
            className="min-h-11 gap-2"
            data-testid="bulk-print-qr"
            onClick={() => navigate(`/dashboard/qr-labels?locations=${selectedIds.join(',')}`)}
          >
            <QrCode className="h-4 w-4" />
            {t('locations:bulk.printQr')}
          </Button>
          <Button size="sm" variant="secondary" className="min-h-11 gap-2" data-testid="bulk-export" onClick={exportSelectedCsv}>
            <Download className="h-4 w-4" />
            {t('locations:bulk.exportCsv')}
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11 gap-2" data-testid="bulk-clear" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" />
            {t('locations:bulk.clear')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default Locations
