import { useMemo } from 'react'
import { Bell } from 'lucide-react'

import { Badge } from '../ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import useNotifications from '../../hooks/queries/useNotifications'
import NotificationDropdown from './NotificationDropdown'

function NotificationBell() {
  const { data } = useNotifications()

  const unreadCount = useMemo(
    () => (data ?? []).filter((item) => !item.read_at).length,
    [data]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-[20px] justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">
              {unreadCount}
            </Badge>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="border-none bg-transparent shadow-none">
        <NotificationDropdown />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationBell
