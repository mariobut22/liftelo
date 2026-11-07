import { useEffect, useState } from 'react'
import { AlertTriangle, CloudUpload, Download, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { useOnline, useOutbox, useSenderState } from '../hooks/useOutbox'
import { currentOwner } from '../lib/offline/enqueue'
import type { OutboxItem } from '../lib/offline/outboxCore'
import { resetOutboxItem, retryOutboxItem, runOutbox } from '../lib/offline/outboxSender'
import { deleteOutboxItem, exportOutboxJson, requestPersistentStorage } from '../lib/offline/outboxStore'
import { useFormat } from '../lib/format'
import i18n from '../i18n'

/** "Waiting to send": everything saved on this device that has not reached the server, with retry / discard / export. */
function Outbox() {
  const { t } = useTranslation('offline')
  const format = useFormat()
  const online = useOnline()
  const senderState = useSenderState()
  const { items, otherAccountCount, all, reload } = useOutbox()
  const [discarding, setDiscarding] = useState<OutboxItem | null>(null)
  const [persisted, setPersisted] = useState(false)

  useEffect(() => {
    void requestPersistentStorage().then(setPersisted)
  }, [])

  const reasonFor = (item: OutboxItem): string | null => {
    if (item.lastErrorStatus == null) return null
    const code = item.lastErrorCode
    if (code && i18n.exists(`common:apiErrors.codes.${code}`)) return t(`common:apiErrors.codes.${code}`)
    if (item.lastErrorStatus === 0) return t('outbox.reason.network')
    if (item.lastErrorStatus >= 500) return t('outbox.reason.server')
    return t('outbox.reason.generic')
  }

  const retryNow = async (item: OutboxItem) => {
    await retryOutboxItem(item, currentOwner())
    await reload()
  }

  const retryAll = async () => {
    for (const item of items.filter((candidate) => candidate.status === 'needs_attention')) {
      await resetOutboxItem(item) // one forced run below sends everything in order
    }
    await runOutbox(currentOwner(), { force: true })
    await reload()
  }

  const confirmDiscard = async () => {
    if (!discarding) return
    await deleteOutboxItem(discarding.id)
    setDiscarding(null)
    await reload()
  }

  const exportAll = async () => {
    try {
      const blob = await exportOutboxJson(all)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `liftelo-waiting-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[outbox] export failed', error)
      toast.error(t('outbox.exportFailed'))
    }
  }

  return (
    <div className="space-y-4" data-testid="outbox-page">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('outbox.title')}</h1>
        <p className="text-sm text-zinc-500">{t('outbox.subtitle')}</p>
      </div>

      {items.length > 0 || otherAccountCount > 0 ? (
        <Card className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{t('outbox.storage.warningTitle')}</p>
              <p>{t('outbox.storage.warning')}</p>
              <p className="text-xs text-amber-800">
                {persisted ? `${t('outbox.storage.persisted')} ` : ''}
                {t('outbox.storage.exportHint')}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 shadow-sm">
          <div className="flex items-center gap-3">
            <CloudUpload className="h-5 w-5" aria-hidden="true" />
            {t('outbox.empty')}
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const needsAttention = item.status === 'needs_attention'
            const reason = reasonFor(item)
            return (
              <li key={item.id} data-testid="outbox-item">
                <Card className={`rounded-xl border p-4 shadow-sm ${needsAttention ? 'border-rose-200' : 'border-zinc-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-zinc-400">{t(`outbox.kind.${item.kind}`)}</p>
                      <p className="break-words text-sm font-semibold text-zinc-900">{item.label}</p>
                      <p className="text-xs text-zinc-500">
                        {t('outbox.saved', { when: format.formatDateTime(new Date(item.createdAt).toISOString()) })}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        needsAttention ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700'
                      }`}
                    >
                      {needsAttention ? t('outbox.status.needsAttention') : senderState === 'sending' ? t('outbox.status.sending') : t('outbox.status.pending')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {[
                      item.photos.length > 0 ? t('outbox.photos', { count: item.photos.length }) : null,
                      item.signatures ? t('outbox.signed') : null,
                      item.signatures && !item.signatures.client ? t('signature:outbox.signLater') : null,
                      item.attempts > 0 ? t('outbox.attempts', { n: item.attempts }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {reason ? (
                    <p className={`mt-2 text-sm ${needsAttention ? 'text-rose-700' : 'text-zinc-600'}`} data-testid="outbox-reason">
                      {reason}
                      {needsAttention && item.lastErrorStep ? ` (${t('outbox.failedAt', { step: t(`outbox.step.${item.lastErrorStep}`) })})` : ''}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant={needsAttention ? 'default' : 'outline'} onClick={() => void retryNow(item)} disabled={!online}>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('outbox.actions.retry')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDiscarding(item)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('outbox.actions.discard')}
                    </Button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {otherAccountCount > 0 ? (
        <p className="text-sm text-zinc-600" data-testid="outbox-other-account">
          {t('outbox.otherAccount', { n: otherAccountCount })}
        </p>
      ) : null}

      {all.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.some((item) => item.status === 'needs_attention') ? (
            <Button variant="outline" onClick={() => void retryAll()} disabled={!online}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('outbox.actions.retryAll')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void exportAll()}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('outbox.actions.export')}
          </Button>
        </div>
      ) : null}

      <Dialog open={discarding !== null} onOpenChange={(open) => !open && setDiscarding(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogTitle>{t('outbox.actions.discardConfirmTitle')}</DialogTitle>
          <DialogDescription className="mt-2">{t('outbox.actions.discardConfirmText')}</DialogDescription>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setDiscarding(null)}>
              {t('outbox.actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmDiscard()} data-testid="outbox-discard-confirm">
              {t('outbox.actions.discardYes')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Outbox
