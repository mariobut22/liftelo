import { useState } from 'react'
import { Copy, Link2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { getLocale } from '../../i18n'
import { createShareLink, getShareLinkStatus, revokeShareLink } from '../../services/api'

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(getLocale()) : '')

/**
 * Admin card in the location profile: switch the read-only "building manager" page on/off.
 * The full URL is shown ONCE right after creating it (the server keeps only a hash of the token).
 */
function ShareLinkCard({ locationId }: { locationId: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [expiresAt, setExpiresAt] = useState('')
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const queryKey = ['share-link', locationId]
  const [minDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))

  const { data, error } = useQuery({
    queryKey,
    queryFn: () => getShareLinkStatus(locationId),
    retry: false,
    refetchOnWindowFocus: false,
  })

  const createMutation = useMutation({
    mutationFn: () => createShareLink(locationId, expiresAt || null),
    onSuccess: (created) => {
      setFreshUrl(`${window.location.origin}${created.path}`)
      setExpiresAt('')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const revokeMutation = useMutation({
    mutationFn: () => revokeShareLink(locationId),
    onSuccess: () => {
      setFreshUrl(null)
      toast.success(t('share:card.revoked'))
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const link = data?.link ?? null
  const active = Boolean(data?.enabled)
  const busy = createMutation.isPending || revokeMutation.isPending

  const handleCreate = () => {
    if (active && !window.confirm(t('share:card.regenerateConfirm'))) return
    createMutation.mutate()
  }
  const handleRevoke = () => {
    if (!window.confirm(t('share:card.revokeConfirm'))) return
    revokeMutation.mutate()
  }
  const handleCopy = async () => {
    if (!freshUrl) return
    try {
      await navigator.clipboard.writeText(freshUrl)
      toast.success(t('share:card.copied'))
    } catch {
      toast.error(t('share:card.copyFailed'))
    }
  }

  let stateText = t('share:card.off')
  if (link?.expired) stateText = t('share:card.expired', { expires: formatDate(link.expires_at) })
  else if (active && link?.expires_at) stateText = t('share:card.onExpires', { date: formatDate(link.created_at), expires: formatDate(link.expires_at) })
  else if (active && link) stateText = t('share:card.on', { date: formatDate(link.created_at) })

  return (
    <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm" data-testid="share-link-card">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-zinc-400" />
        <p className="text-sm font-semibold text-zinc-900">{t('share:card.title')}</p>
      </div>
      <p className="mt-2 text-sm text-zinc-600">{t('share:card.description')}</p>
      {error ? (
        <p className="mt-3 text-sm text-red-600">{(error as Error).message || t('share:card.loadFailed')}</p>
      ) : (
        <p className="mt-3 text-sm font-medium text-zinc-800" data-testid="share-state">{stateText}</p>
      )}

      {freshUrl ? (
        <div className="mt-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3" data-testid="share-fresh">
          <p className="text-sm font-semibold text-emerald-900">{t('share:card.created')}</p>
          <p className="text-xs text-emerald-800">{t('share:card.showOnce')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={freshUrl} aria-label={t('share:card.linkLabel')} onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" className="h-11 sm:h-9" onClick={() => void handleCopy()}>
              <Copy className="h-4 w-4" />
              {t('share:card.copy')}
            </Button>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setFreshUrl(null)}>
            {t('share:card.close')}
          </Button>
        </div>
      ) : null}

      {!error ? (
        <div className="mt-4 space-y-3">
          <label className="block text-sm text-zinc-700">
            <span className="font-medium">{t('share:card.expiresLabel')}</span>
            <Input
              type="date"
              className="mt-1 sm:max-w-xs"
              min={minDate}
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <span className="mt-1 block text-xs text-zinc-500">{t('share:card.expiresHelp')}</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="h-11 sm:h-9" disabled={busy} onClick={handleCreate}>
              {active ? t('share:card.regenerate') : t('share:card.enable')}
            </Button>
            {link ? (
              <Button type="button" variant="secondary" className="h-11 sm:h-9" disabled={busy} onClick={handleRevoke}>
                {t('share:card.revoke')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

export default ShareLinkCard
