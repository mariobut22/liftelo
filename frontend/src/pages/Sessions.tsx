import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, Monitor, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import DataTable from '../components/table/DataTable'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import useAuthStore from '../store/authStore'
import useSessions from '../hooks/queries/useSessions'
import useTerminateSession from '../hooks/mutations/useTerminateSession'
import useTerminateAllSessions from '../hooks/mutations/useTerminateAllSessions'
import type { Session } from '../types/session'
import { useTranslation } from 'react-i18next'
import { getLocale } from '../i18n'

const parseDevice = (userAgent: string, unknownLabel: string) => {
  const ua = userAgent.toLowerCase()
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS'
  if (ua.includes('android')) return 'Android'
  if (ua.includes('macintosh')) return 'macOS'
  if (ua.includes('windows')) return 'Windows'
  if (ua.includes('linux')) return 'Linux'
  return unknownLabel
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Sessions() {
  const { t } = useTranslation()

  const isAdmin = useAuthStore((state) => state.isAdmin())
  const currentUser = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const { data, isLoading, error } = useSessions()
  const terminateSession = useTerminateSession()
  const terminateAllSessions = useTerminateAllSessions()
  const [confirming, setConfirming] = useState<Session | null>(null)
  const [confirmAllOpen, setConfirmAllOpen] = useState(false)

  const columns = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        accessorKey: 'username',
        header: t('settings:sessions.user'),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900">{row.original.username}</span>
            {row.original.is_current ? (
              <Badge className="w-fit border-emerald-200 bg-emerald-100 text-emerald-700">
                {t('settings:sessions.currentSession')}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'ip_address',
        header: t('settings:sessions.ipAddress'),
        cell: ({ row }) => <span className="text-sm text-zinc-600">{row.original.ip_address}</span>,
      },
      {
        id: 'device',
        header: t('settings:sessions.device'),
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">{parseDevice(row.original.user_agent, t('common:states.unknown'))}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: t('settings:sessions.createdAt'),
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDateTime(row.original.created_at)}</span>,
      },
      {
        accessorKey: 'last_activity',
        header: t('settings:sessions.lastActivity'),
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDateTime(row.original.last_activity)}</span>,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">{t('settings:sessions.action')}</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(row.original)}
              disabled={row.original.is_current || row.original.user_id === currentUser?.id}
            >
              {t('settings:sessions.forceLogout')}
            </Button>
          </div>
        ),
      },
    ],
    [currentUser?.id, t]
  )

  if (!isAdmin) {
    return <Navigate to="/dashboard/home" replace />
  }

  const sessions = data?.sessions ?? []

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 bg-zinc-50/80 pb-4 pt-2 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{t('settings:sessions.activeSessions')}</h1>
            <p className="text-sm text-zinc-500">{t('settings:sessions.monitorTerminateActiveSessions')}</p>
          </div>
          {isAdmin ? (
            <div className="text-right">
              <Button variant="destructive" onClick={() => setConfirmAllOpen(true)}>
                <AlertTriangle className="h-4 w-4" />
                {t('settings:sessions.forceLogoutAllSessions')}
              </Button>
              <p className="mt-1 text-xs text-zinc-500">{t('settings:sessions.useOnlyCaseSecurityIncidents')}</p>
            </div>
          ) : null}
        </div>
      </div>

      {!isLoading && !error && sessions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 rounded-xl border border-zinc-200 p-12 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t('settings:sessions.noActiveSessions')}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t('settings:sessions.activeSessionsWillShowUp')}</p>
          </div>
        </Card>
      ) : null}

      {!isLoading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('settings:sessions.unableLoadSessions')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : t('settings:sessions.pleaseTryAgainMoment')}
          </p>
        </Card>
      ) : null}

      {sessions.length > 0 ? (
        <DataTable columns={columns} data={sessions} isLoading={isLoading} />
      ) : null}

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="max-w-md p-0">
          <div className="border-b border-zinc-200 px-6 py-4">
            <DialogTitle>{t('settings:sessions.forceLogout')}</DialogTitle>
            <DialogDescription>
              {t('settings:sessions.areSureWantTerminateSession', { username: confirming?.username })}
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!confirming) return
                try {
                  await terminateSession.mutateAsync(confirming.id)
                  toast.success(t('settings:sessions.sessionTerminated'))
                  setConfirming(null)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t('settings:sessions.failedTerminateSession'))
                }
              }}
              disabled={terminateSession.isPending}
            >
              {t('settings:sessions.forceLogout')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <DialogContent className="max-w-md p-0">
          <div className="border-b border-zinc-200 px-6 py-4">
            <DialogTitle>{t('settings:sessions.forceLogoutAllUsers')}</DialogTitle>
            <DialogDescription>
              {t('settings:sessions.willImmediatelyTerminateAllActive')}
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="ghost" onClick={() => setConfirmAllOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  const result = await terminateAllSessions.mutateAsync()
                  toast.success(t('settings:sessions.allSessionsTerminated', { terminated: result.terminated })) 
                  setConfirmAllOpen(false)
                  if (currentUser) {
                    logout()
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t('settings:sessions.failedTerminateSessions'))
                }
              }}
              disabled={terminateAllSessions.isPending}
            >
              {t('common:actions.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Sessions
