import { CloudUpload, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useOnline, useOutbox } from '../../hooks/useOutbox'

type OfflineNoticeProps = {
  /** Only the "waiting / needs attention" count (no "you are offline" text), e.g. where being offline is explained elsewhere. */
  countOnly?: boolean
  /** `dark` for the camera screen. */
  tone?: 'light' | 'dark'
  className?: string
}

/**
 * The offline strip (OfflineBanner) sits under the header and is covered by dialogs, so the entry dialogs (RMS, intervention) and the
 * QR scanner show this compact copy inside themselves: "You are offline ..." and/or "Waiting to send (N) · N need your attention".
 * Renders nothing when online with nothing waiting. Not a link (never navigate away from an open form).
 */
function OfflineNotice({ countOnly = false, tone = 'light', className = '' }: OfflineNoticeProps) {
  const { t } = useTranslation('offline')
  const online = useOnline()
  const { count, needsAttention } = useOutbox()

  const showOffline = !online && !countOnly
  if (!showOffline && count === 0) return null

  const attention = needsAttention > 0
  const palette =
    tone === 'dark'
      ? 'bg-white/15 text-white'
      : !online
        ? 'border border-amber-200 bg-amber-50 text-amber-900'
        : attention
          ? 'border border-rose-200 bg-rose-50 text-rose-800'
          : 'border border-blue-200 bg-blue-50 text-blue-900'
  const Icon = !online && !countOnly ? WifiOff : CloudUpload

  return (
    <div
      role="status"
      data-testid="offline-notice"
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm ${palette} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {showOffline ? <p>{t('banner.offline')}</p> : null}
        {count > 0 ? (
          <p className="font-semibold" data-testid="offline-notice-count">
            {t('banner.waiting', { n: count })}
            {attention ? ` · ${t('banner.needsAttention', { n: needsAttention })}` : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default OfflineNotice
