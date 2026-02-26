import { useEffect, useMemo, useState } from 'react'
import { Building2, MapPin } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import DataTable from '../components/table/DataTable'
import LocationsMap from '../components/maps/LocationsMap'
import LocationCreateModal from '../components/locations/LocationCreateModal'
import useLocationsWithActivity from '../hooks/queries/useLocationsWithActivity'
import useAuthStore from '../store/authStore'
import type { LocationWithActivity } from '../types/location'

const rmsFrequencyLabels: Record<number, string> = {
  1: 'Monthly',
  2: 'Every 2 months',
  3: 'Every 3 months',
}

function Locations() {
  const [errorMessage] = useState('Ne možemo učitati lokacije trenutno.')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const initialParams = useMemo(() => searchParams, [searchParams])
  const [search, setSearch] = useState(() => initialParams.get('search') ?? '')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>(() => {
    const sortParam = initialParams.get('sort')
    const orderParam = initialParams.get('order')
    return sortParam ? [{ id: sortParam, desc: orderParam === 'desc' }] : []
  })
  const { data, isLoading: loading, error, refetch } = useLocationsWithActivity()
  const locations = data ?? []
  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return locations
    return locations.filter((location) =>
      [location.name, location.address, location.elevator_search]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [locations, search])

  const getStatusDotClass = (status?: string) => {
    if (status === 'O.K.') return 'bg-emerald-500'
    if (status === 'Potreban popravak - Dizalo u funkciji') return 'bg-amber-500'
    if (status === 'Potreban popravak - Dizalo nije u funkciji') return 'bg-rose-500'
    return 'bg-zinc-300'
  }

  const columns = useMemo<ColumnDef<LocationWithActivity>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Naziv',
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
        accessorKey: 'address',
        header: 'Adresa',
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">{row.original.address ?? '—'}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
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
                  title={`${item.elevator_label}: ${item.status}`}
                />
              ))}
            </div>
          )
        },
      },
      {
        accessorKey: 'last_activity',
        header: 'Zadnji unos',
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">
            {row.original.last_activity ? new Date(row.original.last_activity).toLocaleDateString('hr-HR') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'rms_frequency',
        header: 'RMS',
        cell: ({ row }) => (
          <Badge variant="secondary">
            {rmsFrequencyLabels[row.original.rms_frequency] ?? 'RMS'}
          </Badge>
        ),
      },
    ],
    [navigate]
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
    setSearchParams(params, { replace: true })
  }, [search, sorting, searchParams, setSearchParams])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Lokacije</h1>
          <p className="text-sm text-zinc-500">Pregled svih zgrada i njihovog statusa</p>
        </div>
        {isAdmin ? (
          <Button size="sm" onClick={() => setCreateModalOpen(true)}>
            ➕ Nova lokacija
          </Button>
        ) : null}
      </div>

      {isAdmin ? (
        <LocationCreateModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onCreated={(id) => navigate(`/dashboard/locations/${id}`)}
        />
      ) : null}

      <LocationsMap locations={filteredLocations} />

      <DataTable
        columns={columns}
        data={filteredLocations}
        isLoading={loading}
        searchValue={search}
        onSearchChange={setSearch}
        sorting={sorting}
        onSortingChange={setSorting}
        columnVisibilityKey="liftelo:locations:columns"
        onRowClick={(row) => navigate(`/dashboard/locations/${row.id}`)}
      />

      {!loading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <MapPin className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : errorMessage}
          </p>
          <Button size="sm" className="mt-4" onClick={() => refetch()}>
            Pokušaj ponovno
          </Button>
        </Card>
      ) : null}

      {!loading && !error && locations.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">Nemate nijednu lokaciju</p>
            <p className="mt-1 text-sm text-zinc-500">Dodajte prvu lokaciju za početak.</p>
          </div>
          <Button size="sm">Dodaj prvu lokaciju</Button>
        </Card>
      ) : null}
    </div>
  )
}

export default Locations
