import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Card } from '../ui/card'
import {
  PushError,
  disablePush,
  enablePush,
  getCurrentSubscription,
  getPushConfig,
  getPushSupport,
  permissionState,
  sendTestPush,
} from '../../lib/push'

type State = 'loading' | 'on' | 'off' | 'denied' | 'unsupported' | 'ios_install'

/**
 * Profile card: "Push notifications on this device". Hidden completely while the server has push disabled (VAPID env not set).
 * States: unsupported / needs install (iOS) / denied (blocked in the browser) / off / on. The permission prompt only appears on click.
 */
function PushToggle() {
  const { t } = useTranslation('push')
  const config = useQuery({ queryKey: ['push-config'], queryFn: getPushConfig, staleTime: 5 * 60 * 1000, retry: false })
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const support = getPushSupport()
    if (support === 'ios_needs_install') return setState('ios_install')
    if (support === 'unsupported') return setState('unsupported')
    if (permissionState() === 'denied') return setState('denied')
    try {
      // also re-registers an existing subscription for the current user/company (shared device, company switch)
      const subscription = await getCurrentSubscription(true)
      setState(subscription && permissionState() === 'granted' ? 'on' : 'off')
    } catch {
      setState('off')
    }
  }, [])

  const enabledOnServer = config.data?.enabled === true
  useEffect(() => {
    if (enabledOnServer) void refresh()
  }, [enabledOnServer, refresh])

  if (!enabledOnServer) return null

  const toggle = async () => {
    setBusy(true)
    try {
      if (state === 'on') {
        await disablePush()
        setState('off')
        toast.success(t('toast.disabled'))
      } else {
        await enablePush(config.data?.public_key ?? null)
        setState('on')
        toast.success(t('toast.enabled'))
      }
    } catch (error) {
      if (error instanceof PushError && error.code === 'denied') {
        setState(permissionState() === 'denied' ? 'denied' : 'off')
        toast.error(t('toast.denied'))
      } else {
        toast.error(error instanceof Error && error.message && !(error instanceof PushError) ? error.message : t('toast.failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const result = await sendTestPush()
      toast[result.sent > 0 ? 'success' : 'error'](result.sent > 0 ? t('toast.testSent') : t('toast.testNone'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toast.failed'))
    } finally {
      setBusy(false)
    }
  }

  const stateLabel: Record<State, string> = {
    loading: t('state.loading'),
    on: t('state.on'),
    off: t('state.off'),
    denied: t('state.denied'),
    unsupported: t('state.unsupported'),
    ios_install: t('state.iosInstall'),
  }
  const canToggle = state === 'on' || state === 'off'
  const hint =
    state === 'denied' ? t('hint.denied') : state === 'unsupported' ? t('hint.unsupported') : state === 'ios_install' ? t('hint.ios') : null

  return (
    <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm" id="push" data-testid="push-card" data-push-state={state}>
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 flex-shrink-0 text-zinc-500" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{t('title')}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t('description')}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <span id="push-toggle-label" className="text-sm text-zinc-700">
                {t('toggle')}
              </span>
              <p className="text-xs text-zinc-500" data-testid="push-state">
                {stateLabel[state]}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state === 'on'}
              aria-labelledby="push-toggle-label"
              disabled={!canToggle || busy}
              onClick={toggle}
              data-testid="push-switch"
              className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                state === 'on' ? 'bg-emerald-600' : 'bg-zinc-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  state === 'on' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {hint ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900" data-testid="push-hint">
              {hint}
            </p>
          ) : null}
          {state === 'on' ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={test} disabled={busy} data-testid="push-test">
                {t('test')}
              </Button>
              <span className="text-xs text-zinc-500">{t('hint.update')}</span>
            </div>
          ) : null}
          <p className="text-xs text-zinc-500">{t('hint.perDevice')}</p>
        </div>
      </div>
    </Card>
  )
}

export default PushToggle
