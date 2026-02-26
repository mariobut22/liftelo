import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Download } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import DataTable from '../components/table/DataTable'
import type { Intervention } from '../types/intervention'
import useUsers from '../hooks/queries/useUsers'
import useAuthStore from '../store/authStore'
import { filterRecords, updateInterventionStatus } from '../services/api'

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : '-'

const statusStyles: Record<string, string> = {
  'O.K.': 'bg-emerald-100 text-emerald-700',
  'Potreban popravak - Dizalo u funkciji': 'bg-amber-100 text-amber-700',
  'Potreban popravak - Dizalo nije u funkciji': 'bg-rose-100 text-rose-700',
}

function Interventions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = useMemo(() => searchParams, [searchParams])
  const [dateFrom, setDateFrom] = useState(() => initialParams.get('date_from') ?? '')
  const [dateTo, setDateTo] = useState(() => initialParams.get('date_to') ?? '')
  const [technician, setTechnician] = useState(() => initialParams.get('technician') ?? '')
  const [status, setStatus] = useState(() => initialParams.get('status') ?? '')
  const [records, setRecords] = useState<Intervention[]>([])
  const { data: users } = useUsers()
  const isAdmin = useAuthStore((state) => state.isAdmin())

  const filterMutation = useMutation({
    mutationFn: (payload: {
      type: 'intervencija'
      date_from?: string
      date_to?: string
      technician?: string
      status?: string
    }) => filterRecords(payload),
    onSuccess: (data) => {
      const normalized = (data as Array<Record<string, unknown>>).map((item) => {
        const visitDate =
          (item.visit_date as string | undefined) ??
          (item.date as string | undefined) ??
          (item.created_at as string | undefined) ??
          ''
        return {
          ...item,
          visit_date: visitDate,
        }
      })
      setRecords(normalized as Intervention[])
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: number; nextStatus: string }) =>
      updateInterventionStatus(id, nextStatus),
    onSuccess: (_data, variables) => {
      setRecords((prev) =>
        prev.map((item) => (item.id === variables.id ? { ...item, status: variables.nextStatus } : item))
      )
      toast.success('Status intervencije je ažuriran.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Greška pri ažuriranju statusa.')
    },
  })

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (dateFrom) params.set('date_from', dateFrom)
    else params.delete('date_from')
    if (dateTo) params.set('date_to', dateTo)
    else params.delete('date_to')
    if (technician) params.set('technician', technician)
    else params.delete('technician')
    if (status) params.set('status', status)
    else params.delete('status')
    setSearchParams(params, { replace: true })
  }, [dateFrom, dateTo, technician, status, searchParams, setSearchParams])

  useEffect(() => {
    filterMutation.mutate({
      type: 'intervencija',
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      technician: technician || undefined,
      status: status || undefined,
    })
  }, [])

  const columns = useMemo<ColumnDef<Intervention>[]>(
    () => [
      {
        accessorKey: 'location_name',
        header: 'Lokacija',
        cell: ({ row }) => (
          <span className="font-medium text-zinc-900">{row.original.location_name}</span>
        ),
      },
      {
        accessorKey: 'visit_date',
        header: 'Datum posjeta',
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDate(row.original.visit_date)}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status
          if (isAdmin) {
            return (
              <select
                value={status ?? ''}
                onChange={(event) => {
                  const nextStatus = event.target.value
                  if (!nextStatus || nextStatus === status) return
                  statusMutation.mutate({ id: row.original.id, nextStatus })
                }}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              >
                <option value="">N/A</option>
                <option value="O.K.">O.K.</option>
                <option value="Potreban popravak - Dizalo u funkciji">
                  Potreban popravak - Dizalo u funkciji
                </option>
                <option value="Potreban popravak - Dizalo nije u funkciji">
                  Potreban popravak - Dizalo nije u funkciji
                </option>
              </select>
            )
          }
          if (!status) {
            return <Badge variant="secondary">N/A</Badge>
          }
          return <Badge className={statusStyles[status] ?? 'bg-zinc-100 text-zinc-700'}>{status}</Badge>
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Kreirano',
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDate(row.original.created_at)}</span>,
      },
      {
        id: 'pdf',
        header: '',
        cell: ({ row }) => (
          <a
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            href={`http://localhost:3000/api/interventions/${row.original.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            PDF
          </a>
        ),
      },
    ],
    [isAdmin, statusMutation]
  )

  const handleFilter = () => {
    filterMutation.mutate({
      type: 'intervencija',
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      technician: technician || undefined,
      status: status || undefined,
    })
  }

  const handleReset = () => {
    setDateFrom('')
    setDateTo('')
    setTechnician('')
    setStatus('')
    filterMutation.mutate({ type: 'intervencija' })
  }

  const exportCsv = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (technician) params.set('technician', technician)
    if (status) params.set('status', status)
    window.open(`/export/interventions?${params.toString()}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Intervencije</h1>
        <p className="text-sm text-zinc-500">Pregled planiranih i završenih intervencija</p>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">Datum od</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">Datum do</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">Serviser</label>
            <select
              value={technician}
              onChange={(event) => setTechnician(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            >
              <option value="">Svi</option>
              {(users ?? []).map((user) => (
                <option key={user.id} value={user.username}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            >
              <option value="">Svi</option>
              <option value="O.K.">O.K.</option>
              <option value="Potreban popravak - Dizalo u funkciji">
                Potreban popravak - Dizalo u funkciji
              </option>
              <option value="Potreban popravak - Dizalo nije u funkciji">
                Potreban popravak - Dizalo nije u funkciji
              </option>
            </select>
          </div>
          <div className="flex items-end justify-end gap-2">
            <Button size="sm" onClick={handleFilter} disabled={filterMutation.isPending}>
              Filtriraj
            </Button>
            <Button size="sm" variant="secondary" onClick={handleReset}>
              Reset
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={records}
        isLoading={filterMutation.isPending}
        columnVisibilityKey="liftelo:interventions:columns"
      />

      {!filterMutation.isPending && filterMutation.error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {filterMutation.error instanceof Error
              ? filterMutation.error.message
              : 'Ne možemo učitati intervencije trenutno.'}
          </p>
        </Card>
      ) : null}

      {!filterMutation.isPending && !filterMutation.error && records.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">Još nema intervencija.</p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default Interventions
