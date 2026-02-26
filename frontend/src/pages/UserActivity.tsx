import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import DataTable from '../components/table/DataTable'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import useAuthStore from '../store/authStore'
import useUsers from '../hooks/queries/useUsers'
import useUserActivity from '../hooks/queries/useUserActivity'
import { exportUserActivity } from '../services/api'
import type { Activity } from '../types/activity'

const actionSelectOptions = ['invite', 'disable', 'enable', 'reset_password', 'role_change']

const entityRoutes: Record<string, (id: number) => string> = {
  project: (id) => `/dashboard/projects/${id}`,
  work_order: (id) => `/dashboard/work-orders/${id}`,
  location: (id) => `/dashboard/locations/${id}`,
  user: (id) => `/dashboard/users/${id}`,
}

function UserActivityPage() {
  const { t } = useTranslation('users')
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: users } = useUsers()

  const actionLabelMap: Record<string, string> = {
    invite: t('activity.actions.invite'),
    disable: t('activity.actions.disable'),
    enable: t('activity.actions.enable'),
    reset_password: t('activity.actions.reset_password'),
    role_change: t('activity.actions.role_change'),
  }

  const page = Number(searchParams.get('page') ?? 1)
  const limit = Number(searchParams.get('limit') ?? 10)
  const userIdParam = searchParams.get('user_id')
  const actionParam = searchParams.get('action')
  const dateFromParam = searchParams.get('date_from')
  const dateToParam = searchParams.get('date_to')

  const { data, isLoading, error } = useUserActivity({
    page,
    limit,
    user_id: userIdParam ? Number(userIdParam) : undefined,
    action: actionParam ?? undefined,
    date_from: dateFromParam ?? undefined,
    date_to: dateToParam ?? undefined,
  })

  const formatDateTime = (value?: string | null) => {
    if (!value) return t('activity.emptyValue')
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return t('activity.emptyValue')
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} ${hours}:${minutes}`
  }

  const getSeverityClasses = (action: string) => {
    const lower = action.toLowerCase()
    if (lower.includes('delete')) return 'border-rose-200 bg-rose-100 text-rose-700'
    if (lower.includes('disable')) return 'border-amber-200 bg-amber-100 text-amber-700'
    if (lower.includes('create')) return 'border-emerald-200 bg-emerald-100 text-emerald-700'
    return 'border-zinc-200 bg-zinc-100 text-zinc-700'
  }

  const columns = useMemo<ColumnDef<Activity>[]>(
    () => [
      {
        accessorKey: 'username',
        header: t('activity.columns.actor'),
        cell: ({ row }) => <span className="text-sm font-medium text-zinc-900">{row.original.username}</span>,
      },
      {
        id: 'target',
        header: t('activity.columns.entity'),
        cell: ({ row }) => {
          const { entity_type, entity_id } = row.original
          if (entity_type && entity_id && entityRoutes[entity_type]) {
            return (
              <Link
                to={entityRoutes[entity_type](entity_id)}
                className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline"
              >
                {entity_type} #{entity_id}
              </Link>
            )
          }
          return <span className="text-sm text-zinc-500">{t('activity.emptyValue')}</span>
        },
      },
      {
        accessorKey: 'action',
        header: t('activity.columns.action'),
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <Badge className={`animate-fade-in ${getSeverityClasses(row.original.action)}`}>
            {actionLabelMap[row.original.action] ?? row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: 'created_at',
        header: t('activity.columns.date'),
        enableGlobalFilter: false,
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDateTime(row.original.created_at)}</span>,
      },
    ],
    [actionLabelMap, t]
  )

  if (!isAdmin) {
    return <Navigate to="/dashboard/home" replace />
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.min(page, totalPages)

  const updateParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams)
    if (!value) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    next.set('page', '1')
    setSearchParams(next)
  }

  const handleExport = async () => {
    try {
      const response = await exportUserActivity({
        page: currentPage,
        limit,
        user_id: userIdParam ? Number(userIdParam) : undefined,
        action: actionParam ?? undefined,
        date_from: dateFromParam ?? undefined,
        date_to: dateToParam ?? undefined,
      })
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'user-activity.csv'
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t('activity.title')}</h1>
          <p className="text-sm text-zinc-500">{t('activity.description')}</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4" />
          {t('activity.export')}
        </Button>
      </div>

      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="activity-user">
              {t('activity.filters.user')}
            </label>
            <select
              id="activity-user"
              value={userIdParam ?? ''}
              onChange={(event) => updateParam('user_id', event.target.value || undefined)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
            >
              <option value="">{t('activity.filters.allUsers')}</option>
              {(users ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="activity-action">
              {t('activity.filters.action')}
            </label>
            <select
              id="activity-action"
              value={actionParam ?? ''}
              onChange={(event) => updateParam('action', event.target.value || undefined)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
            >
              <option value="">{t('activity.filters.allActions')}</option>
              {actionSelectOptions.map((action) => (
                <option key={action} value={action}>
                  {actionLabelMap[action] ?? action}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="activity-from">
              {t('activity.filters.from')}
            </label>
            <input
              id="activity-from"
              type="date"
              value={dateFromParam ?? ''}
              onChange={(event) => updateParam('date_from', event.target.value || undefined)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="activity-to">
              {t('activity.filters.to')}
            </label>
            <input
              id="activity-to"
              type="date"
              value={dateToParam ?? ''}
              onChange={(event) => updateParam('date_to', event.target.value || undefined)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setSearchParams(new URLSearchParams())
            }}
          >
            {t('activity.filters.clear')}
          </Button>
        </div>
      </div>

      {!isLoading && !error && (data?.data ?? []).length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 rounded-xl border border-zinc-200 p-12 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t('activity.empty')}</h2>
          </div>
        </Card>
      ) : null}

      {!isLoading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('activity.errorTitle')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : t('activity.errorDescription')}
          </p>
        </Card>
      ) : null}

      {(data?.data ?? []).length > 0 ? (
        <div className="space-y-3">
          <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-500">{t('activity.pagination', { current: currentPage, total: totalPages })}</div>
            <div className="flex items-center gap-2">
              <select
                value={String(limit)}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams)
                  next.set('limit', event.target.value)
                  next.set('page', '1')
                  setSearchParams(next)
                }}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.set('page', String(Math.max(1, currentPage - 1)))
                  setSearchParams(next)
                }}
                disabled={currentPage <= 1}
              >
                {t('activity.paginationPrev')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.set('page', String(Math.min(totalPages, currentPage + 1)))
                  setSearchParams(next)
                }}
                disabled={currentPage >= totalPages}
              >
                {t('activity.paginationNext')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default UserActivityPage
