import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Card } from '../ui/card'
import useNotifications from '../../hooks/queries/useNotifications'
import { markAllNotificationsRead, markNotificationRead } from '../../services/api'

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('hr-HR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function NotificationDropdown() {
  const { data, isLoading } = useNotifications()
  const navigate = useNavigate()

  const notifications = data ?? []
  const unreadIds = useMemo(
    () => notifications.filter((item) => !item.read_at).map((item) => item.id),
    [notifications]
  )

  return (
    <Card className="w-96 border border-zinc-200 bg-white p-0 shadow-lg">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Obavijesti</p>
          <p className="text-xs text-zinc-500">{notifications.length} ukupno</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await markAllNotificationsRead()
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Ne mogu označiti sve obavijesti.')
            }
          }}
          disabled={unreadIds.length === 0}
        >
          Označi sve kao pročitano
        </Button>
      </div>

      <div className="max-h-96 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="space-y-2 px-2 py-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-zinc-100" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-500">Nema novih obavijesti</div>
        ) : (
          <div className="space-y-2">
            {notifications.map((item) => {
              const isUnread = !item.read_at
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    try {
                      if (isUnread) {
                        await markNotificationRead(item.id)
                      }
                      if (item.link) {
                        navigate(item.link)
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Ne mogu otvoriti obavijest.')
                    }
                  }}
                  className={`flex w-full flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left transition-all duration-200 hover:border-zinc-200 hover:bg-zinc-50 animate-fade-in ${
                    isUnread ? 'bg-white' : 'bg-zinc-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${isUnread ? 'font-semibold text-zinc-900' : 'text-zinc-500'}`}>
                      {item.title ?? 'Nova obavijest'}
                    </span>
                    <span className="text-xs text-zinc-400">{formatDate(item.created_at)}</span>
                  </div>
                  {item.body ? (
                    <p className={`text-xs ${isUnread ? 'text-zinc-700' : 'text-zinc-400'}`}>
                      {item.body}
                    </p>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

export default NotificationDropdown
