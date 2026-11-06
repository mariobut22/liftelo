import { useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/button'
import { isIos, isStandalone, promptInstall, useCanPromptInstall } from '../../lib/pwa'
import useAuthStore from '../../store/authStore'

const DISMISS_KEY = 'liftelo.install-hint.dismissed'

const readDismissed = () => {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * "Add to home screen" hint. `banner`: shown once to technicians (dismiss = never again on this device), `card`: permanent
 * section in the profile. iOS gets the Share-menu instructions (no install prompt exists there).
 */
function InstallHint({ variant }: { variant: 'banner' | 'card' }) {
  const { t } = useTranslation('offline')
  const canPrompt = useCanPromptInstall()
  const user = useAuthStore((state) => state.user)
  const companies = useAuthStore((state) => state.companies)
  const [dismissed, setDismissed] = useState(readDismissed)

  const standalone = isStandalone()
  const activeRole = companies.find((company) => company.id === user?.company_id)?.role ?? companies[0]?.role ?? user?.role

  if (variant === 'banner') {
    if (dismissed || standalone || activeRole !== 'technician') return null
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage unavailable: hide for this visit only
    }
    setDismissed(true)
  }

  if (standalone) {
    return variant === 'card' ? <p className="text-sm text-zinc-600">{t('install.installed')}</p> : null
  }

  const text = canPrompt ? t('install.android') : isIos() ? t('install.ios') : t('install.other')
  const body = (
    <div className="flex items-start gap-3">
      <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-zinc-500" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        {variant === 'banner' ? <p className="text-sm font-semibold text-zinc-900">{t('install.title')}</p> : null}
        <p className="text-sm text-zinc-600">{text}</p>
        <div className="flex flex-wrap gap-2">
          {canPrompt ? (
            <Button size="sm" onClick={() => void promptInstall().then(dismiss)}>
              {t('install.button')}
            </Button>
          ) : null}
          {variant === 'banner' ? (
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t('install.dismiss')}
            </Button>
          ) : null}
        </div>
      </div>
      {variant === 'banner' ? (
        <button type="button" onClick={dismiss} className="rounded-lg p-2 text-zinc-400 hover:text-zinc-700" aria-label={t('install.dismiss')}>
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )

  return variant === 'banner' ? (
    <div data-testid="install-hint" className="border-b border-zinc-200 bg-white px-3 py-3 sm:px-6">
      {body}
    </div>
  ) : (
    <div data-testid="install-card">{body}</div>
  )
}

export default InstallHint
