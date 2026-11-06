import { CloudUpload, Loader2, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useOnline, useOutbox, useSenderState } from '../../hooks/useOutbox'

/**
 * Thin strip under the header: "Offline" and/or "Waiting to send (N)". Tapping it opens the list (retry, discard, errors).
 * Renders nothing when online with nothing waiting.
 */
function OfflineBanner() {
  const { t } = useTranslation('offline')
  const online = useOnline()
  const { count, needsAttention } = useOutbox()
  const senderState = useSenderState()

  if (online && count === 0) return null

  const attention = needsAttention > 0
  const tone = !online
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : attention || senderState === 'auth_required'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-blue-200 bg-blue-50 text-blue-900'
  const Icon = !online ? WifiOff : senderState === 'sending' ? Loader2 : CloudUpload

  return (
    <div role="status" data-testid="offline-banner" className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-xs sm:px-6 sm:text-sm ${tone}`}>
      <Icon className={`h-4 w-4 flex-shrink-0 ${senderState === 'sending' && online ? 'animate-spin' : ''}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {!online ? <p>{t('banner.offline')}</p> : null}
        {count > 0 ? (
          <p className="font-semibold" data-testid="outbox-count">
            {t('banner.waiting', { n: count })}
            {online && senderState === 'sending' ? ` · ${t('banner.sending')}` : ''}
            {attention ? ` · ${t('banner.needsAttention', { n: needsAttention })}` : ''}
          </p>
        ) : null}
        {online && senderState === 'auth_required' ? <p>{t('banner.authRequired')}</p> : null}
      </div>
      {count > 0 ? (
        <Link to="/dashboard/outbox" className="flex-shrink-0 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold hover:bg-white/60">
          {t('banner.view')}
        </Link>
      ) : null}
    </div>
  )
}

export default OfflineBanner
