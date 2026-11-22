import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** Primary action (a Button). Leave undefined for roles that cannot create (viewers). */
  action?: ReactNode
  /** No card chrome and smaller padding: for use inside tables and Home cards. */
  compact?: boolean
  className?: string
  testId?: string
}

/** Shared empty state: icon, one sentence of guidance and an optional primary action. */
function EmptyState({ icon: Icon, title, description, action, compact, className, testId = 'empty-state' }: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'mx-auto flex w-full max-w-lg flex-col items-center text-center',
        compact ? 'gap-3 px-4 py-8' : 'gap-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500" aria-hidden="true">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-900">{title}</p>
        {description ? <p className="text-sm text-zinc-500">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}

export default EmptyState
