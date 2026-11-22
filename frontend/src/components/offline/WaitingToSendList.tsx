import { useEffect, useRef } from 'react'
import { CloudUpload, Loader2, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Badge } from '../ui/badge'
import { Card } from '../ui/card'
import { getLocale } from '../../i18n'
import { useOutbox, useSenderState } from '../../hooks/useOutbox'
import { waitingForList, type OutboxKind } from '../../lib/offline/outboxCore'

interface WaitingToSendListProps {
  kind: OutboxKind
  /** ids of the records already shown in the list below (an entry that reached the server is not shown twice) */
  listedIds: Array<number | string | null | undefined>
  /** called when an entry of this kind left the outbox (sent): the list reloads and shows the real record */
  onSynced: () => void
}

/** Entries saved on this device (IndexedDB outbox) that are not on the server yet, shown above the RMS / intervention list. */
function WaitingToSendList({ kind, listedIds, onSynced }: WaitingToSendListProps) {
  const { t } = useTranslation('offline')
  const { items } = useOutbox()
  const senderState = useSenderState()
  const rows = waitingForList(items, kind, listedIds)
  const ofKind = items.filter((item) => item.kind === kind).length
  const previous = useRef(ofKind)
  const onSyncedRef = useRef(onSynced)
  useEffect(() => {
    onSyncedRef.current = onSynced
  })

  useEffect(() => {
    if (ofKind < previous.current) onSyncedRef.current()
    previous.current = ofKind
  }, [ofKind])

  if (rows.length === 0) return null

  return (
    <Card className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3 shadow-sm" data-testid="waiting-to-send-list">
      <ul className="space-y-2">
        {rows.map((item) => {
          const attention = item.status === 'needs_attention'
          const date = String(item.payload.visit_date ?? item.payload.date ?? '')
          const dateText = date ? new Date(date).toLocaleDateString(getLocale()) : ''
          return (
            <li
              key={item.id}
              data-testid="waiting-row"
              data-status={attention ? 'needs_attention' : 'pending'}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2"
            >
              <span className="min-w-0 flex-1 break-words text-sm font-medium text-zinc-900">{item.label}</span>
              {dateText ? <span className="text-xs text-zinc-500">{dateText}</span> : null}
              {attention ? (
                <Badge variant="outline" className="gap-1 border-rose-200 bg-rose-50 text-rose-700" data-testid="waiting-badge">
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  {t('list.failedBadge')}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-800" data-testid="waiting-badge">
                  {senderState === 'sending' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <CloudUpload className="h-3 w-3" aria-hidden="true" />}
                  {senderState === 'sending' ? t('list.sendingBadge') : t('list.waitingBadge')}
                </Badge>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-zinc-500">
        {t('list.waitingHint')}{' '}
        <Link to="/dashboard/outbox" className="font-semibold text-blue-700 underline">
          {t('list.openOutbox')}
        </Link>
      </p>
    </Card>
  )
}

export default WaitingToSendList
