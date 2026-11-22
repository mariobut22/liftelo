import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import useLocations from '../hooks/queries/useLocations'
import useUsers from '../hooks/queries/useUsers'
import useLocationElevators from '../hooks/queries/useLocationElevators'
import useAuthStore from '../store/authStore'
import { useFormat } from '../lib/format'
import {
  createWorkOrderRecurrence,
  deleteWorkOrderRecurrence,
  getWorkOrderRecurrences,
  setWorkOrderRecurrenceActive,
  type RecurrenceFrequency,
} from '../services/api'

const FREQUENCIES: RecurrenceFrequency[] = ['monthly', 'quarterly', 'semiannual', 'yearly']
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const selectClass = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700'

function RecurringWorkOrders() {
  const { t } = useTranslation('workOrders')
  const format = useFormat()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['workOrderRecurrences'],
    queryFn: getWorkOrderRecurrences,
    enabled: isAdmin,
  })
  const items = data?.items ?? []

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['workOrderRecurrences'] })
    void queryClient.invalidateQueries({ queryKey: ['calendar'] })
    void queryClient.invalidateQueries({ queryKey: ['workOrders'] })
  }
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setWorkOrderRecurrenceActive(id, active),
    onSuccess: () => { refresh(); toast.success(t('recurring.updated')) },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('recurring.loadFailed')),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteWorkOrderRecurrence(id),
    onSuccess: () => { setConfirmId(null); refresh(); toast.success(t('recurring.deleted')) },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('recurring.loadFailed')),
  })

  if (!isAdmin) {
    return <p data-testid="recurring-admin-only" className="text-sm text-zinc-600">{t('recurring.adminOnly')}</p>
  }

  return (
    <div className="space-y-4" data-testid="recurring-page">
      <div>
        <Link to="/dashboard/work-orders" className="text-sm text-zinc-600 underline-offset-2 hover:underline">{t('recurring.back')}</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-zinc-900">{t('recurring.title')}</h1>
            <p className="text-sm text-zinc-500">{t('recurring.subtitle')}</p>
          </div>
          <Button type="button" data-testid="recurring-new" onClick={() => setDialogOpen(true)}>{t('recurring.new')}</Button>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-zinc-500">…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error instanceof Error && error.message ? error.message : t('recurring.loadFailed')}</p> : null}
      {!isLoading && !error && items.length === 0 ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-center shadow-sm" data-testid="recurring-empty">
          <p className="font-semibold text-zinc-900">{t('recurring.empty')}</p>
          <p className="mt-1 text-sm text-zinc-500">{t('recurring.emptyHint')}</p>
        </Card>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} data-testid="recurring-item" data-active={item.is_active ? '1' : '0'} className="rounded-xl border border-zinc-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-semibold text-zinc-900">{item.description}</p>
                <p className="text-sm text-zinc-600">
                  {item.location_name ?? '-'}{item.elevator_label ? ` · ${item.elevator_label}` : ''}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                {item.is_active ? t('recurring.statusActive') : t('recurring.statusPaused')}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              {t(`recurring.frequencies.${item.frequency}`)}
              {item.assigned_user_name ? ` · ${item.assigned_user_name}` : ''}
              {' · '}
              {item.next_due_date ? t('recurring.nextDue', { date: format.formatDate(`${item.next_due_date}T00:00:00`) }) : t('recurring.finished')}
            </p>
            <p className="text-xs text-zinc-500">
              {t('recurring.created', { count: item.generated_count })}
              {item.last_work_order_id ? (
                <>
                  {' · '}
                  <Link to={`/dashboard/work-orders/${item.last_work_order_id}`} className="underline underline-offset-2">{t('recurring.lastOrder')}</Link>
                </>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="recurring-toggle"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ id: item.id, active: !item.is_active })}
              >
                {item.is_active ? t('recurring.pause') : t('recurring.resume')}
              </Button>
              {confirmId === item.id ? (
                <>
                  <span className="self-center text-sm text-rose-700">{t('recurring.confirmDelete')}</span>
                  <Button type="button" size="sm" variant="destructive" data-testid="recurring-delete-yes" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>
                    {t('recurring.confirmYes')}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                    {t('common:actions.cancel')}
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="ghost" data-testid="recurring-delete" onClick={() => setConfirmId(item.id)}>
                  {t('recurring.delete')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <RecurrenceDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={refresh} />
    </div>
  )
}

function RecurrenceDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const { t } = useTranslation('workOrders')
  const { data: locations } = useLocations()
  const { data: users } = useUsers()
  const [locationId, setLocationId] = useState('')
  const [elevatorId, setElevatorId] = useState('')
  const [description, setDescription] = useState('')
  const [comment, setComment] = useState('')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('quarterly')
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const { data: elevators } = useLocationElevators(locationId ? Number(locationId) : undefined)

  const reset = () => {
    setLocationId(''); setElevatorId(''); setDescription(''); setComment(''); setFrequency('quarterly')
    setStartDate(todayStr()); setEndDate(''); setAssigneeId('')
  }
  const save = useMutation({
    mutationFn: () =>
      createWorkOrderRecurrence({
        location_id: Number(locationId),
        elevator_id: elevatorId ? Number(elevatorId) : null,
        description: description.trim(),
        general_comment: comment.trim() || undefined,
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        assigned_user_id: assigneeId ? Number(assigneeId) : null,
      }),
    onSuccess: () => {
      toast.success(t('recurring.saved'))
      onSaved()
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('recurring.loadFailed')),
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!locationId || !description.trim() || !startDate) {
      toast.error(t('recurring.requiredFields'))
      return
    }
    save.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <DialogContent className="max-w-xl p-0">
        <form onSubmit={submit} data-testid="recurring-form" className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-4 sm:px-6">
            <DialogTitle>{t('recurring.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('recurring.dialogDescription')}</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <label className="block space-y-1 text-sm font-medium text-zinc-700">
              {t('recurring.location')}
              <select data-testid="rec-location" className={selectClass} value={locationId} onChange={(e) => { setLocationId(e.target.value); setElevatorId('') }}>
                <option value="">{t('recurring.selectLocation')}</option>
                {(locations ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-medium text-zinc-700">
              {t('recurring.elevator')}
              <select data-testid="rec-elevator" className={selectClass} value={elevatorId} onChange={(e) => setElevatorId(e.target.value)} disabled={!locationId}>
                <option value="">{t('recurring.wholeLocation')}</option>
                {(elevators ?? []).map((elevator) => <option key={elevator.id} value={elevator.id}>{elevator.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-medium text-zinc-700">
              {t('recurring.description')}
              <Input data-testid="rec-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="block space-y-1 text-sm font-medium text-zinc-700">
              {t('recurring.comment')}
              <textarea rows={2} className={selectClass} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-medium text-zinc-700">
                {t('recurring.frequency')}
                <select data-testid="rec-frequency" className={selectClass} value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`recurring.frequencies.${f}`)}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium text-zinc-700">
                {t('recurring.assignee')}
                <select data-testid="rec-assignee" className={selectClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">{t('recurring.unassigned')}</option>
                  {(users ?? []).map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium text-zinc-700">
                {t('recurring.startDate')}
                <Input data-testid="rec-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm font-medium text-zinc-700">
                {t('recurring.endDate')}
                <Input data-testid="rec-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common:actions.cancel')}</Button>
            <Button type="submit" data-testid="rec-save" disabled={save.isPending}>{save.isPending ? t('recurring.saving') : t('recurring.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default RecurringWorkOrders
