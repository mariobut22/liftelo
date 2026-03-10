import { useMemo, useState, useEffect } from 'react'
import { ClipboardList, Download } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import DataTable from '../components/table/DataTable'
import useUsers from '../hooks/queries/useUsers'
import { API_BASE_URL, filterRecords } from '../services/api'

type FilteredRmsRecord = {
  id: number
  date: string
  created_at?: string
  technician?: string
  location_name?: string
  status?: string | null
  document_name?: string | null
}

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : '-')

function Rms() {
  const navigate = useNavigate()
  const { t } = useTranslation('rms')
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = useMemo(() => searchParams, [searchParams])
  const { data: users } = useUsers()
  const [dateFrom, setDateFrom] = useState(() => initialParams.get('date_from') ?? '')
  const [dateTo, setDateTo] = useState(() => initialParams.get('date_to') ?? '')
  const [technician, setTechnician] = useState(() => initialParams.get('technician') ?? '')
  const [status, setStatus] = useState(() => initialParams.get('status') ?? '')
  const [records, setRecords] = useState<FilteredRmsRecord[]>([])

  const filterMutation = useMutation({
    mutationFn: (payload: {
      type: 'rms'
      date_from?: string
      date_to?: string
      technician?: string
      status?: string
    }) => filterRecords(payload),
    onSuccess: (data) => {
      setRecords(data as FilteredRmsRecord[])
    },
  })

  useEffect(() => {
    filterMutation.mutate({
      type: 'rms',
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      technician: technician || undefined,
      status: status || undefined,
    })
  }, [])

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

  const columns = useMemo<ColumnDef<FilteredRmsRecord>[]>(
    () => [
      {
        accessorKey: 'location_name',
        header: t('table.location'),
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => navigate(`/dashboard/rms/${row.original.id}`)}
            className="text-left font-medium text-zinc-900"
          >
            {row.original.location_name}
          </button>
        ),
      },
      {
        accessorKey: 'date',
        header: t('table.visitDate'),
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDate(row.original.date)}</span>,
      },
      {
        accessorKey: 'document_name',
        header: t('table.document'),
        cell: ({ row }) => <span className="text-sm text-zinc-600">{row.original.document_name ?? '-'}</span>,
      },
      {
        accessorKey: 'technician',
        header: t('table.technician'),
        cell: ({ row }) => <span className="text-sm text-zinc-600">{row.original.technician ?? '-'}</span>,
      },
      {
        id: 'pdf',
        header: '',
        cell: ({ row }) => (
          <a
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            href={`${API_BASE_URL}/api/rms/${row.original.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            {t('table.pdf')}
          </a>
        ),
      },
    ],
    [navigate, t]
  )

  const handleFilter = () => {
    filterMutation.mutate({
      type: 'rms',
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
    filterMutation.mutate({ type: 'rms' })
  }

  const exportCsv = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (technician) params.set('technician', technician)
    if (status) params.set('status', status)
    window.open(`/export/rms?${params.toString()}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('subtitle')}</p>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">{t('filters.dateFrom')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">{t('filters.dateTo')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">{t('filters.technician')}</label>
            <select
              value={technician}
              onChange={(event) => setTechnician(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            >
              <option value="">{t('filters.all')}</option>
              {(users ?? []).map((user) => (
                <option key={user.id} value={user.username}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-500">{t('filters.status')}</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            >
              <option value="">{t('filters.all')}</option>
              <option value="O.K.">O.K.</option>
              <option value="Potreban popravak - Dizalo u funkciji">Potreban popravak - Dizalo u funkciji</option>
              <option value="Potreban popravak - Dizalo nije u funkciji">Potreban popravak - Dizalo nije u funkciji</option>
            </select>
          </div>
          <div className="flex items-end justify-end gap-2">
            <Button size="sm" onClick={handleFilter} disabled={filterMutation.isPending}>
              {t('actions.filter')}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleReset}>
              {t('actions.reset')}
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              {t('actions.exportCsv')}
            </Button>
          </div>
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={records}
        isLoading={filterMutation.isPending}
        columnVisibilityKey="liftelo:rms:columns"
        onRowClick={(row) => navigate(`/dashboard/rms/${row.id}`)}
      />

      {!filterMutation.isPending && filterMutation.error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('error.title')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {filterMutation.error instanceof Error
              ? filterMutation.error.message
              : t('error.loadFailed')}
          </p>
        </Card>
      ) : null}

      {!filterMutation.isPending && !filterMutation.error && records.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">{t('empty.noRecords')}</p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default Rms
