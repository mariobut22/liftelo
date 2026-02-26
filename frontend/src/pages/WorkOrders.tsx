import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, MoreHorizontal } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import DataTable from '../components/table/DataTable'
import type { WorkOrder } from '../types/work-order'
import useWorkOrders from '../hooks/queries/useWorkOrders'
import { apiFetch } from '../services/api'

const statusLabels: Record<WorkOrder['status'], string> = {
  open: 'Otvoren',
  completed: 'Završen',
}

const statusStyles: Record<WorkOrder['status'], string> = {
  open: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

type WorkOrderFilter = 'all' | 'open' | 'completed' | 'overdue'

function WorkOrders() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = useMemo(() => searchParams, [searchParams])
  const [filter, setFilter] = useState<WorkOrderFilter>(() => {
    const statusParam = initialParams.get('status')
    if (statusParam === 'open' || statusParam === 'completed' || statusParam === 'overdue') {
      return statusParam
    }
    return 'all'
  })
  const [search, setSearch] = useState(() => initialParams.get('search') ?? '')
  const [sorting, setSorting] = useState<
    Array<{ id: string; desc: boolean }>
  >(() => {
    const sortParam = initialParams.get('sort')
    const orderParam = initialParams.get('order')
    return sortParam ? [{ id: sortParam, desc: orderParam === 'desc' }] : []
  })
  const { data, isLoading: loading, error } = useWorkOrders()
  const workOrders = data ?? []
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('open')

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) =>
      apiFetch('/api/work-orders/bulk-status', {
        method: 'PATCH',
        body: JSON.stringify({ ids, status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrders'] })
      setSelectedIds(new Set())
    },
  })

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}.${month}.${year}`
  }


  const counts = useMemo(() => {
    const open = workOrders.filter((order) => order.status === 'open')
    const completed = workOrders.filter((order) => order.status === 'completed')
    const overdue = workOrders.filter((order) => {
      if (order.status !== 'open') return false
      if (!order.due_date) return false
      return new Date(order.due_date) < new Date()
    })

    return {
      all: workOrders.length,
      open: open.length,
      completed: completed.length,
      overdue: overdue.length,
    }
  }, [workOrders])

  const filteredOrders = useMemo(() => {
    return workOrders.filter((order) => {
      if (filter === 'open') return order.status === 'open'
      if (filter === 'completed') return order.status === 'completed'
      if (filter === 'overdue') {
        if (order.status !== 'open') return false
        if (!order.due_date) return false
        return new Date(order.due_date) < new Date()
      }
      return true
    })
  }, [filter, workOrders])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (search) {
      params.set('search', search)
    } else {
      params.delete('search')
    }
    if (filter !== 'all') {
      params.set('status', filter)
    } else {
      params.delete('status')
    }
    if (sorting[0]) {
      params.set('sort', sorting[0].id)
      params.set('order', sorting[0].desc ? 'desc' : 'asc')
    } else {
      params.delete('sort')
      params.delete('order')
    }
    setSearchParams(params, { replace: true })
  }, [filter, search, searchParams, setSearchParams, sorting])

  const columns = useMemo<ColumnDef<WorkOrder>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <div onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={
                table.getRowModel().rows.length > 0 &&
                table.getRowModel().rows.every((row) => selectedIds.has(row.original.id))
              }
              onChange={(event) => {
                const next = new Set(selectedIds)
                if (event.target.checked) {
                  table.getRowModel().rows.forEach((row) => next.add(row.original.id))
                } else {
                  table.getRowModel().rows.forEach((row) => next.delete(row.original.id))
                }
                setSelectedIds(next)
              }}
              className="h-4 w-4 rounded border-zinc-300"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={selectedIds.has(row.original.id)}
              onChange={(event) => {
                const next = new Set(selectedIds)
                if (event.target.checked) {
                  next.add(row.original.id)
                } else {
                  next.delete(row.original.id)
                }
                setSelectedIds(next)
              }}
              className="h-4 w-4 rounded border-zinc-300"
            />
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'location_name',
        header: 'Lokacija',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => navigate(`/dashboard/work-orders/${row.original.id}`)}
            className="text-left font-medium text-zinc-900"
          >
            {row.original.location_name}
          </button>
        ),
      },
      {
        accessorKey: 'due_date',
        header: 'Rok',
        cell: ({ row }) => {
          const isOverdue =
            !!row.original.due_date &&
            row.original.status !== 'completed' &&
            new Date(row.original.due_date) < new Date()

          return (
            <span className={isOverdue ? 'text-sm text-red-600 font-semibold' : 'text-sm text-zinc-600'}>
              {formatDate(row.original.due_date)}
              {isOverdue ? (
                <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                  Kasni
                </span>
              ) : null}
            </span>
          )
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Kreirano',
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge className={statusStyles[row.original.status]}>
            {statusLabels[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'assignees',
        header: 'Dodijeljeni',
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">
            {row.original.assigned_users?.length
              ? row.original.assigned_users.join(', ')
              : '-'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/dashboard/work-orders/${row.original.id}`)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [navigate, selectedIds]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Radni nalozi</h1>
        <p className="text-sm text-zinc-500">Praćenje otvorenih i završenih naloga</p>
      </div>

      {!loading && !error ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('all')}
          >
            Svi ({counts.all})
          </Button>
          <Button
            size="sm"
            variant={filter === 'open' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('open')}
          >
            Otvoreni ({counts.open})
          </Button>
          <Button
            size="sm"
            variant={filter === 'completed' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('completed')}
          >
            Završeni ({counts.completed})
          </Button>
          <Button
            size="sm"
            variant={filter === 'overdue' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('overdue')}
          >
            Zakašnjeli ({counts.overdue})
          </Button>
        </div>
      ) : null}

      {selectedIds.size > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm">
          <span className="text-sm text-zinc-600">Odabrano: {selectedIds.size}</span>
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            <option value="open">Otvoren</option>
            <option value="completed">Završen</option>
          </select>
          <Button
            size="sm"
            disabled={bulkMutation.isPending}
            onClick={() =>
              bulkMutation.mutateAsync({
                ids: Array.from(selectedIds),
                status: bulkStatus,
              })
            }
          >
            {bulkMutation.isPending ? 'Primjena...' : 'Primijeni'}
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={filteredOrders}
        isLoading={loading}
        searchValue={search}
        onSearchChange={setSearch}
        sorting={sorting}
        onSortingChange={setSorting}
        columnVisibilityKey="liftelo:work-orders:columns"
        filterRight={
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as WorkOrderFilter)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            <option value="all">Svi</option>
            <option value="open">Otvoreni</option>
            <option value="completed">Završeni</option>
            <option value="overdue">Zakašnjeli</option>
          </select>
        }
        onRowClick={(row) => navigate(`/dashboard/work-orders/${row.id}`)}
      />

      {!loading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : 'Ne možemo učitati radne naloge trenutno.'}
          </p>
        </Card>
      ) : null}

      {!loading && !error && filteredOrders.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">Nema radnih naloga.</p>
            <p className="mt-1 text-sm text-zinc-500">Svi nalozi su riješeni.</p>
          </div>
        </Card>
      ) : null}

    </div>
  )
}

export default WorkOrders
