import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { SeverityBadge, StateBadge } from './FindingBadges'
import { useDaysText } from './useDaysText'
import WorkOrderCreateModal, { type WorkOrderPrefill } from '../work-orders/WorkOrderCreateModal'
import { useFinding } from '../../hooks/queries/useFindings'
import { useAddFindingEvent } from '../../hooks/mutations/useFindingMutations'
import { useFindingsRole } from '../../lib/findings'
import { useFormat } from '../../lib/format'
import type { AddFindingEventPayload } from '../../services/api'

const dueDateForSeverity = (severity: string): string => {
  const days = severity === 'out_of_service' ? 0 : severity === 'in_service' ? 7 : 30
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

interface FindingDetailDialogProps {
  findingId: number | null
  onClose: () => void
}

/** Detail of one fault: facts, history, and the actions the signed-in role may use (admin: everything, technician: notes). */
function FindingDetailDialog({ findingId, onClose }: FindingDetailDialogProps) {
  const { t } = useTranslation('findings')
  const format = useFormat()
  const role = useFindingsRole()
  const daysText = useDaysText()
  const { data: finding, isLoading, error } = useFinding(findingId)
  const addEvent = useAddFindingEvent(findingId ?? 0)
  const [note, setNote] = useState('')
  const [workOrderOpen, setWorkOrderOpen] = useState(false)

  const run = async (payload: AddFindingEventPayload) => {
    try {
      await addEvent.mutateAsync(payload)
      setNote('')
      toast.success(t('actions.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('page.loadFailed'))
    }
  }

  const sendNote = () => {
    if (!note.trim()) return
    void run({ event_type: 'comment', note: note.trim() })
  }
  const withNote = (payload: AddFindingEventPayload): AddFindingEventPayload => (note.trim() ? { ...payload, note: note.trim() } : payload)

  const canChange = role === 'admin'
  const canComment = role === 'admin' || role === 'technician'
  const resolved = finding?.state === 'resolved'

  // One click from fault to work order: priority has no field on work orders, so severity sets the due date (urgent = today,
  // normal = +7 days, low = +30 days) and is written in the comment.
  const workOrderPrefill: WorkOrderPrefill | null = finding
    ? {
        findingId: finding.id,
        locationId: finding.location_id,
        elevatorId: finding.elevator_id,
        description: finding.description,
        comment: t('workOrder.comment', {
          elevator: finding.elevator_label,
          description: finding.description,
          priority: t(`workOrder.priority.${finding.severity}`),
        }),
        dueDate: dueDateForSeverity(finding.severity),
      }
    : null

  return (
    <>
    <Dialog open={findingId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0">
        <div data-testid="finding-detail" className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-4 sm:px-6">
            <DialogTitle>{t('detail.title')}</DialogTitle>
            <DialogDescription className="sr-only">{finding ? `${finding.elevator_label}` : t('detail.title')}</DialogDescription>
            {finding ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SeverityBadge severity={finding.severity} />
                <StateBadge state={finding.state} />
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            {isLoading ? <p className="text-sm text-zinc-500">…</p> : null}
            {error ? <p className="text-sm text-rose-600">{error instanceof Error ? error.message : t('page.loadFailed')}</p> : null}
            {finding ? (
              <>
                <p className="whitespace-pre-wrap break-words text-sm text-zinc-900">{finding.description}</p>
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-zinc-500">{t('detail.elevator')}</dt>
                    <dd className="text-zinc-900">{finding.elevator_label}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-500">{t('detail.location')}</dt>
                    <dd className="text-zinc-900">
                      <Link to={`/dashboard/locations/${finding.location_id}`} className="underline-offset-2 hover:underline">
                        {finding.location_name || t('detail.openLocation')}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-500">{t('detail.category')}</dt>
                    <dd className="text-zinc-900">{t(`category.${finding.category}`)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-500">{t('detail.daysOpen')}</dt>
                    <dd className="text-zinc-900">{daysText(finding)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-500">{t('detail.part')}</dt>
                    <dd className="text-zinc-900">
                      {finding.needs_part ? finding.part_note || t('card.partNeeded') : t('detail.noPart')}
                      {finding.needs_part ? ` · ${finding.parts_ordered ? t('card.partOrdered') : t('card.partNeeded')}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-500">{t('detail.reportedBy')}</dt>
                    <dd className="text-zinc-900">
                      {finding.created_by_name || '—'} · {t(`detail.source.${finding.source_type}`)} · {format.formatDate(finding.created_at)}
                    </dd>
                  </div>
                </dl>
                {finding.work_orders && finding.work_orders.length > 0 ? (
                  <div data-testid="finding-work-orders" className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs font-semibold text-zinc-500">{t('workOrder.linked')}</span>
                    {finding.work_orders.map((order) => (
                      <Link
                        key={order.id}
                        to={`/dashboard/work-orders/${order.id}`}
                        onClick={onClose}
                        className="rounded-full border border-zinc-200 px-2.5 py-0.5 font-medium text-zinc-800 underline-offset-2 hover:underline"
                      >
                        {t('workOrder.linkedItem', { id: order.id })}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {finding.elevator_id ? (
                  <Link
                    to={`/dashboard/findings?elevator=${finding.elevator_id}&state=all`}
                    onClick={onClose}
                    className="inline-block text-sm font-medium text-zinc-700 underline underline-offset-2"
                  >
                    {t('detail.viewElevatorHistory')}
                  </Link>
                ) : null}

                {canComment ? (
                  <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-semibold text-zinc-900">{t('actions.title')}</p>
                    <textarea
                      data-testid="finding-note"
                      rows={2}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={canChange ? t('actions.notePlaceholder') : t('actions.commentPlaceholder')}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                    />
                    <div className="flex flex-wrap gap-2">
                      {canChange && !resolved ? (
                        <>
                          {finding.state !== 'open' ? (
                            <Button type="button" size="sm" variant="secondary" disabled={addEvent.isPending} onClick={() => run(withNote({ event_type: 'status_changed', state: 'open' }))}>
                              {t('actions.setOpen')}
                            </Button>
                          ) : null}
                          {finding.state !== 'in_progress' ? (
                            <Button type="button" size="sm" variant="secondary" disabled={addEvent.isPending} onClick={() => run(withNote({ event_type: 'status_changed', state: 'in_progress' }))}>
                              {t('actions.setInProgress')}
                            </Button>
                          ) : null}
                          {finding.state !== 'waiting_part' ? (
                            <Button type="button" size="sm" variant="secondary" disabled={addEvent.isPending} onClick={() => run(withNote({ event_type: 'status_changed', state: 'waiting_part' }))}>
                              {t('actions.setWaitingPart')}
                            </Button>
                          ) : null}
                          {!finding.parts_ordered || finding.state !== 'waiting_part' ? (
                            <Button type="button" size="sm" variant="secondary" disabled={addEvent.isPending} onClick={() => run(withNote({ event_type: 'parts_ordered' }))}>
                              {t('actions.partsOrdered')}
                            </Button>
                          ) : null}
                          <Button type="button" size="sm" disabled={addEvent.isPending} onClick={() => run(withNote({ event_type: 'resolved' }))}>
                            {t('actions.resolve')}
                          </Button>
                        </>
                      ) : null}
                      {canChange && resolved ? (
                        <Button type="button" size="sm" variant="secondary" disabled={addEvent.isPending} onClick={() => run(withNote({ event_type: 'reopened' }))}>
                          {t('actions.reopen')}
                        </Button>
                      ) : null}
                      {canChange && !resolved ? (
                        <Button type="button" size="sm" variant="secondary" data-testid="finding-create-work-order" onClick={() => setWorkOrderOpen(true)}>
                          {t('workOrder.create')}
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" disabled={addEvent.isPending || !note.trim()} onClick={sendNote}>
                        {t('actions.addNote')}
                      </Button>
                    </div>
                    {!canChange ? <p className="text-xs text-zinc-500">{t('actions.adminOnly')}</p> : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-zinc-900">{t('detail.history')}</p>
                  {finding.events.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t('detail.noHistory')}</p>
                  ) : (
                    <ol data-testid="finding-history" className="space-y-2 border-l border-zinc-200 pl-3">
                      {[...finding.events].reverse().map((event) => (
                        <li key={event.id} className="text-sm">
                          <p className="font-medium text-zinc-900">
                            {t(`detail.event.${event.event_type}`, { state: event.state ? t(`state.${event.state}`) : '', id: event.work_order_id ?? '' })}
                          </p>
                          {event.note ? <p className="whitespace-pre-wrap break-words text-zinc-700">{event.note}</p> : null}
                          <p className="text-xs text-zinc-500">
                            {format.formatDateTime(event.created_at)}
                            {event.user_name ? ` · ${event.user_name}` : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end border-t border-zinc-200 px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('detail.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {canChange ? (
      <WorkOrderCreateModal open={workOrderOpen} onOpenChange={setWorkOrderOpen} prefill={workOrderPrefill} />
    ) : null}
    </>
  )
}

export default FindingDetailDialog
