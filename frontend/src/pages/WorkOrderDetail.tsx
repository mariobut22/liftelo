import { useMemo, useState } from 'react'
import { Calendar, ClipboardList, Download, ImagePlus } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import {
  apiFetch,
  closeWorkOrder,
  toggleWorkOrderItem,
  updateWorkOrderStatus,
  uploadWorkOrderAttachment,
} from '../services/api'
import type { WorkOrderDetail } from '../types/work-order-detail'
import useWorkOrder from '../hooks/queries/useWorkOrder'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import useAuthStore from '../store/authStore'
import WorkOrderEditModal from '../components/work-orders/WorkOrderEditModal'

function StatusBadge({ status }: { status: WorkOrderDetail['status'] | string }) {
  const map: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {String(status).replace('_', ' ').toUpperCase()}
    </span>
  )
}

function WorkOrderDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [editOpen, setEditOpen] = useState(false)
  const activityLabels: Record<string, string> = {
    status_changed: 'Promijenjen status',
    item_toggled: 'Označena stavka',
    edited: 'Uređen nalog',
    attachment_added: 'Dodan prilog',
  }
  const {
    data: workOrder,
    isLoading: loading,
    error,
  } = useWorkOrder(id)

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}.${month}.${year}`
  }

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} ${hours}:${minutes}`
  }

  const closeMutation = useMutation({
    mutationFn: async (workOrderId: number) => closeWorkOrder(workOrderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrders'] })
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['workOrder', id] })
      }
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ workOrderId, status }: { workOrderId: number; status: string }) =>
      updateWorkOrderStatus(workOrderId, status),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['workOrder', id] })
      }
      queryClient.invalidateQueries({ queryKey: ['workOrders'] })
    },
  })

  const uploadAttachmentMutation = useMutation({
    mutationFn: async ({ workOrderId, file }: { workOrderId: number; file: File }) =>
      uploadWorkOrderAttachment(workOrderId, file),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['workOrder', id] })
      }
    },
  })

  const toggleItemMutation = useMutation({
    mutationFn: async (itemId: number) => toggleWorkOrderItem(itemId),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['workOrder', id] })
      }
    },
  })

  const {
    data: activities,
    isLoading: activityLoading,
  } = useQuery({
    queryKey: ['workOrderActivity', id],
    queryFn: () => apiFetch<Array<{
      id: number
      action: string
      created_at: string
      user?: { name?: string | null; full_name?: string | null; username?: string | null }
      user_name?: string | null
    }>>(`/api/work-orders/${id}/activity`),
    enabled: Boolean(id),
  })

  const assignedUsers = useMemo(() => workOrder?.assigned_users ?? [], [workOrder])
  const elevators = useMemo(() => workOrder?.elevators ?? [], [workOrder])
  const items = useMemo(() => workOrder?.items ?? [], [workOrder])
  const canToggleItems = useMemo(() => {
    if (!workOrder) return false
    if (isAdmin) return true
    return assignedUsers.some((user) => user.id === currentUserId)
  }, [assignedUsers, currentUserId, isAdmin, workOrder])
  const totalItems = items.length
  const completedItems = useMemo(
    () => items.filter((item) => item.is_completed).length,
    [items]
  )
  const progressPercent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100)

  const isOverdue = useMemo(() => {
    if (!workOrder?.due_date || workOrder.status !== 'open') {
      return false
    }
    return new Date(workOrder.due_date).getTime() < new Date().getTime()
  }, [workOrder])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-64 animate-pulse rounded-md bg-zinc-200/70" />
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`workorder-detail-skeleton-${index}`} className="p-6 shadow-sm">
              <div className="h-4 w-32 animate-pulse rounded-md bg-zinc-200/70" />
              <div className="mt-4 h-4 w-40 animate-pulse rounded-md bg-zinc-200/70" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <ClipboardList className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {error instanceof Error ? error.message : 'Ne možemo učitati nalog trenutno.'}
        </p>
      </Card>
    )
  }

  if (!workOrder) {
    return <div className="p-6 text-sm text-zinc-500">Učitavanje...</div>
  }

  const handleClose = async () => {
    if (!workOrder || closeMutation.isPending) return

    const previous = workOrder
    queryClient.setQueryData<WorkOrderDetail | undefined>(['workOrder', id], {
      ...workOrder,
      status: 'completed',
    })

    try {
      await closeMutation.mutateAsync(workOrder.id)
    } catch (err) {
      queryClient.setQueryData(['workOrder', id], previous)
      console.error('Failed to close work order', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900">{workOrder.location_name}</h1>
            {isAdmin ? (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                Uredi nalog
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <div className="flex items-center gap-2">
              <StatusBadge status={workOrder.status} />
              {isAdmin ? (
                <select
                  value={workOrder.status}
                  onChange={async (event) => {
                    const nextStatus = event.target.value
                    if (!workOrder) return
                    try {
                      await statusMutation.mutateAsync({ workOrderId: workOrder.id, status: nextStatus })
                    } catch (err) {
                      console.error(err)
                    }
                  }}
                  className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm"
                >
                  <option value="open">OPEN</option>
                  <option value="in_progress">IN PROGRESS</option>
                  <option value="completed">COMPLETED</option>
                  <option value="cancelled">CANCELLED</option>
                </select>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>Issued: {formatDate(workOrder.issued_date)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>Rok: {formatDate(workOrder.due_date)}</span>
            </div>
            {isOverdue ? (
              <Badge className="bg-rose-100 text-rose-700">Kasni</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {workOrder.status === 'open' ? (
            <Button
              size="sm"
              className="transition-colors duration-300"
              disabled={closeMutation.isPending}
              onClick={handleClose}
            >
              {closeMutation.isPending ? 'Zatvaranje...' : 'Zatvori nalog'}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              window.open(
                `http://localhost:3000/api/work-orders/${workOrder.id}/pdf`,
                '_blank',
                'noopener,noreferrer'
              )
            }
          >
            <Download className="h-4 w-4" />
            Preuzmi PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Dodijeljeni korisnici</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {assignedUsers.length === 0 ? (
              <span className="text-sm text-zinc-500">-</span>
            ) : (
              assignedUsers.map((user) => (
                <Badge key={user.id} variant="secondary">
                  {user.name ?? user.full_name}
                </Badge>
              ))
            )}
          </div>
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Dizala</h2>
          <div className="mt-4 space-y-2 text-sm text-zinc-500">
            {elevators.length === 0 ? (
              <span>-</span>
            ) : (
              elevators.map((elevator) => (
                <div key={elevator.id}>{elevator.name ?? elevator.label}</div>
              ))
            )}
          </div>
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900">Opći komentar</h2>
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-base leading-relaxed">
            {workOrder.general_comment || '-'}
          </div>
        </Card>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Stavke naloga</h2>
        <div className="mt-4 divide-y divide-zinc-100">
          {items.length === 0 ? (
            <div className="py-3 text-sm text-zinc-500">Nema stavki za ovaj nalog.</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={async () => {
                  if (!canToggleItems || toggleItemMutation.isPending) return
                  try {
                    await toggleItemMutation.mutateAsync(item.id)
                  } catch (err) {
                    console.error(err)
                  }
                }}
                className={`flex w-full items-start gap-3 py-3 text-left text-sm transition ${
                  canToggleItems ? 'hover:bg-zinc-50' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!item.is_completed}
                  readOnly
                  className="mt-1 h-4 w-4 rounded border-zinc-300"
                />
                <div className={item.is_completed ? 'text-zinc-400 line-through' : 'text-zinc-900'}>
                  {item.text ?? item.description}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm text-zinc-500">
            <span>Napredak</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-semibold text-zinc-900">Aktivnosti</h3>
          <div className="mt-4 space-y-4">
            {activityLoading ? (
              <div className="text-sm text-zinc-500">Učitavanje aktivnosti...</div>
            ) : activities && activities.length > 0 ? (
              activities.map((activity, index) => {
                const isLast = index === activities.length - 1
                const userName =
                  activity.user?.name ||
                  activity.user?.full_name ||
                  activity.user?.username ||
                  activity.user_name ||
                  '-'
                return (
                  <div key={activity.id} className="relative pl-6">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-zinc-300" />
                    {!isLast ? (
                      <span className="absolute left-[3px] top-4 h-full w-px bg-zinc-200" />
                    ) : null}
                    <div className="text-sm text-zinc-700">{userName}</div>
                    <div className="text-xs text-zinc-500">
                      {activityLabels[activity.action] ?? activity.action} · {formatDateTime(activity.created_at)}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-sm text-zinc-500">Nema aktivnosti.</div>
            )}
          </div>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Privitci</h2>
            <p className="text-xs text-zinc-500">Prilozi uz radni nalog.</p>
          </div>
          {isAdmin ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-blue-600">
              <ImagePlus className="h-4 w-4" />
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file || !workOrder) return
                  try {
                    await uploadAttachmentMutation.mutateAsync({ workOrderId: workOrder.id, file })
                  } catch (err) {
                    console.error(err)
                  } finally {
                    event.currentTarget.value = ''
                  }
                }}
              />
            </label>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(workOrder.attachments ?? []).length === 0 ? (
            <div className="col-span-full text-sm text-zinc-500">Nema privitaka.</div>
          ) : (
            workOrder.attachments?.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}
                className="h-[100px] w-[100px] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
              >
                <img src={attachment.url} alt="Attachment" className="h-full w-full object-cover" />
              </button>
            ))
          )}
        </div>
      </Card>

      {isAdmin ? (
        <WorkOrderEditModal open={editOpen} onOpenChange={setEditOpen} workOrder={workOrder} />
      ) : null}
    </div>
  )
}

export default WorkOrderDetailPage
