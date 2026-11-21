import { useCallback, useState } from 'react'
import { Building2, FileSpreadsheet, UserPlus, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/button'
import { Card } from '../ui/card'
import LocationCreateModal from '../locations/LocationCreateModal'
import useLocations from '../../hooks/queries/useLocations'
import { cn } from '../../lib/utils'
import useAuthStore from '../../store/authStore'

const storageKey = (userId: number | string | undefined) => `liftelo:getStarted:dismissed:${userId ?? 'anon'}`

const readDismissed = (userId: number | string | undefined) => {
  try {
    return window.localStorage.getItem(storageKey(userId)) === '1'
  } catch {
    return false // storage blocked (private mode): the card simply stays visible
  }
}

type GuideStep = {
  key: 'import' | 'manual' | 'invite'
  icon: LucideIcon
  onClick?: () => void
  locked?: boolean
  primary?: boolean
}

/**
 * First-run guide on Home: only for admins of a company with ZERO locations, dismissible per user (localStorage),
 * gone by itself as soon as a location exists. Self-contained (own data, own modal) so Home layout code stays untouched.
 */
function GetStartedCard() {
  const { t } = useTranslation('import')
  const navigate = useNavigate()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const userId = useAuthStore((state) => state.user?.id)
  const { data: locations } = useLocations()
  const [dismissed, setDismissed] = useState(() => readDismissed(userId))
  const [createOpen, setCreateOpen] = useState(false)

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(storageKey(userId), '1')
    } catch {
      // ignore: hidden for this visit only
    }
  }, [userId])

  // renders nothing until the list is known and really empty (no flash for companies that already have buildings)
  if (!isAdmin || dismissed || !locations || locations.length > 0) return null

  const steps: GuideStep[] = [
    { key: 'import', icon: FileSpreadsheet, onClick: () => navigate('/dashboard/import'), primary: true },
    { key: 'manual', icon: Building2, onClick: () => setCreateOpen(true) },
    { key: 'invite', icon: UserPlus, onClick: () => navigate('/dashboard/users') },
  ]

  return (
    <Card data-testid="get-started-card" className="rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900">{t('guide.title')}</h2>
            <p className="text-sm text-zinc-500">{t('guide.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            data-testid="get-started-dismiss"
            aria-label={t('guide.dismiss')}
            title={t('guide.dismiss')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="grid gap-3 lg:grid-cols-2">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <li
                key={step.key}
                data-testid={`get-started-step-${step.key}`}
                className={cn(
                  'flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center',
                  step.locked ? 'border-zinc-200 bg-zinc-50 opacity-70' : 'border-zinc-200 bg-white'
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-500">{t('guide.step', { number: index + 1 })}</p>
                    <p className="text-sm font-semibold text-zinc-900">{t(`guide.${step.key}.title`)}</p>
                    <p className="text-xs text-zinc-500">{step.locked ? t('guide.qr.locked') : t(`guide.${step.key}.description`)}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={step.primary ? 'default' : 'outline'}
                  disabled={step.locked}
                  onClick={step.onClick}
                  className="w-full shrink-0 sm:w-auto"
                >
                  {t(`guide.${step.key}.action`)}
                </Button>
              </li>
            )
          })}
        </ol>
      </div>
      <LocationCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/dashboard/locations/${id}`)}
      />
    </Card>
  )
}

export default GetStartedCard
