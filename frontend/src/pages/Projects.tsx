import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FolderKanban, MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import DataTable from '../components/table/DataTable'
import type { Project } from '../types/project'
import useProjects from '../hooks/queries/useProjects'
import ProjectCreateModal from '../components/projects/ProjectCreateModal'
import { apiFetch } from '../services/api'

const statusStyles: Record<Project['status'], string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-zinc-200 text-zinc-600',
}

const statusLabels: Record<Project['status'], string> = {
  active: 'Aktivan',
  completed: 'Završen',
  archived: 'Arhiviran',
}

function Projects() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = useMemo(() => searchParams, [searchParams])
  const [statusFilter, setStatusFilter] = useState<'all' | Project['status']>(() => {
    const statusParam = initialParams.get('status')
    if (statusParam === 'active' || statusParam === 'completed' || statusParam === 'archived') {
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
  const { data, isLoading: loading, error } = useProjects()
  const projects = data ?? []
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<Project['status']>('active')

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) =>
      apiFetch('/api/projects/bulk-status', {
        method: 'PATCH',
        body: JSON.stringify({ ids, status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setSelectedIds(new Set())
    },
  })

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}.${month}.${year}`
  }

  const filteredProjects = useMemo(() => {
    if (statusFilter === 'all') return projects
    return projects.filter((project) => project.status === statusFilter)
  }, [projects, statusFilter])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (search) {
      params.set('search', search)
    } else {
      params.delete('search')
    }
    if (statusFilter !== 'all') {
      params.set('status', statusFilter)
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
  }, [search, sorting, statusFilter, searchParams, setSearchParams])

  const columns = useMemo<
    ColumnDef<Project & { progress?: { total_tasks?: number; completed_tasks?: number; percent?: number } }>[]
  >(
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
        accessorKey: 'name',
        header: 'Projekt',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => navigate(`/dashboard/projects/${row.original.id}`)}
            className="text-left font-medium text-zinc-900"
          >
            {row.original.name}
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
        id: 'progress',
        header: 'Napredak',
        cell: ({ row }) => {
          const percent = row.original.progress?.percent
          if (percent == null) {
            return <span className="text-sm text-zinc-500">-</span>
          }
          return (
            <div className="flex items-center">
              <div className="w-24 bg-zinc-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 ml-2">{percent}%</span>
            </div>
          )
        },
      },
      {
        id: 'owner',
        header: 'Odgovorna osoba',
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">
            {row.original.owner?.name || row.original.owner?.full_name || row.original.owner?.username || '-'}
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
        cell: ({ row }) => {
          const assigned = row.original.assigned_users ?? []
          if (assigned.length === 0) {
            return <span className="text-sm text-zinc-600">-</span>
          }
          const visible = assigned.slice(0, 2)
          const remaining = assigned.length - visible.length
          return (
            <span className="text-sm text-zinc-600">
              {visible.join(', ')}
              {remaining > 0 ? (
                <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  +{remaining}
                </span>
              ) : null}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/dashboard/projects/${row.original.id}`)}
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Projekti</h1>
          <p className="text-sm text-zinc-500">Pregled i praćenje aktivnih projekata</p>
        </div>
        <Button
          size="sm"
          type="button"
          onClick={() => setIsCreateOpen(true)}
        >
          + Novi projekt
        </Button>
      </div>

      {selectedIds.size > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm">
          <span className="text-sm text-zinc-600">Odabrano: {selectedIds.size}</span>
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as Project['status'])}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            <option value="active">Aktivan</option>
            <option value="completed">Završen</option>
            <option value="archived">Arhiviran</option>
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
        data={filteredProjects}
        isLoading={loading}
        searchValue={search}
        onSearchChange={setSearch}
        sorting={sorting}
        onSortingChange={setSorting}
        columnVisibilityKey="liftelo:projects:columns"
        filterRight={
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            <option value="all">Sve</option>
            <option value="active">Aktivni</option>
            <option value="completed">Završeni</option>
            <option value="archived">Arhivirani</option>
          </select>
        }
        onRowClick={(row) => navigate(`/dashboard/projects/${row.id}`)}
      />

      {!loading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <FolderKanban className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : 'Ne možemo učitati projekte trenutno.'}
          </p>
        </Card>
      ) : null}

      {!loading && !error && filteredProjects.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">Nema projekata još</p>
            <p className="mt-1 text-sm text-zinc-500">
              Dodajte prvi projekt kako biste započeli.
            </p>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={() => setIsCreateOpen(true)}
          >
            Dodaj prvi projekt
          </Button>
        </Card>
      ) : null}

      {isCreateOpen ? (
        <ProjectCreateModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      ) : null}

    </div>
  )
}

export default Projects
