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

const parseDevice = (userAgent: string) => {
  const ua = userAgent.toLowerCase()
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS'
  if (ua.includes('android')) return 'Android'
  if (ua.includes('macintosh')) return 'macOS'
  if (ua.includes('windows')) return 'Windows'
  if (ua.includes('linux')) return 'Linux'
  return 'Unknown'
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes}`
}

function Sessions() {
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
        header: 'User',
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-900">{row.original.username}</span>
            {row.original.is_current ? (
              <Badge className="w-fit border-emerald-200 bg-emerald-100 text-emerald-700">
                Current session
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'ip_address',
        header: 'IP address',
        cell: ({ row }) => <span className="text-sm text-zinc-600">{row.original.ip_address}</span>,
      },
      {
        id: 'device',
        header: 'Device',
        cell: ({ row }) => (
          <span className="text-sm text-zinc-600">{parseDevice(row.original.user_agent)}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Created at',
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDateTime(row.original.created_at)}</span>,
      },
      {
        accessorKey: 'last_activity',
        header: 'Last activity',
        cell: ({ row }) => <span className="text-sm text-zinc-600">{formatDateTime(row.original.last_activity)}</span>,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Action</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(row.original)}
              disabled={row.original.is_current || row.original.user_id === currentUser?.id}
            >
              Force logout
            </Button>
          </div>
        ),
      },
    ],
    [currentUser?.id]
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
            <h1 className="text-2xl font-semibold text-zinc-900">Active Sessions</h1>
            <p className="text-sm text-zinc-500">Monitor and terminate active sessions.</p>
          </div>
          {isAdmin ? (
            <div className="text-right">
              <Button variant="destructive" onClick={() => setConfirmAllOpen(true)}>
                <AlertTriangle className="h-4 w-4" />
                Force Logout All Sessions
              </Button>
              <p className="mt-1 text-xs text-zinc-500">Use only in case of security incidents.</p>
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
            <h2 className="text-lg font-semibold text-zinc-900">No active sessions</h2>
            <p className="mt-1 text-sm text-zinc-500">Active sessions will show up here.</p>
          </div>
        </Card>
      ) : null}

      {!isLoading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Unable to load sessions</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : 'Please try again in a moment.'}
          </p>
        </Card>
      ) : null}

      {sessions.length > 0 ? (
        <DataTable columns={columns} data={sessions} isLoading={isLoading} />
      ) : null}

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="max-w-md p-0">
          <div className="border-b border-zinc-200 px-6 py-4">
            <DialogTitle>Force logout</DialogTitle>
            <DialogDescription>
              Are you sure you want to terminate this session for {confirming?.username}?
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!confirming) return
                try {
                  await terminateSession.mutateAsync(confirming.id)
                  toast.success('Session terminated.')
                  setConfirming(null)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to terminate session.')
                }
              }}
              disabled={terminateSession.isPending}
            >
              Force logout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <DialogContent className="max-w-md p-0">
          <div className="border-b border-zinc-200 px-6 py-4">
            <DialogTitle>⚠ Force logout all users?</DialogTitle>
            <DialogDescription>
              This will immediately terminate all active sessions in the system.
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="ghost" onClick={() => setConfirmAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  const result = await terminateAllSessions.mutateAsync()
                  toast.success(`All sessions terminated (${result.terminated} sessions)`) 
                  setConfirmAllOpen(false)
                  if (currentUser) {
                    logout()
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to terminate sessions.')
                }
              }}
              disabled={terminateAllSessions.isPending}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Sessions
