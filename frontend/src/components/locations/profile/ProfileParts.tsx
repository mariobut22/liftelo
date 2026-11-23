import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'

import { Badge } from '../../ui/badge'
import { RMS_STATUS, rmsStatusLabel } from '../../../lib/rmsStatus'
import { cn } from '../../../lib/utils'

export function RmsStatusBadge({ status, t }: { status: string | null | undefined; t: TFunction }) {
  if (!status) return <Badge variant="secondary">—</Badge>
  if (status === RMS_STATUS.ok) return <Badge className="bg-emerald-100 text-emerald-700">{rmsStatusLabel(t, status)}</Badge>
  if (status === RMS_STATUS.repairInService) return <Badge className="bg-amber-100 text-amber-700">{rmsStatusLabel(t, status)}</Badge>
  if (status === RMS_STATUS.repairOutOfService) return <Badge className="bg-rose-100 text-rose-700">{rmsStatusLabel(t, status)}</Badge>
  return <Badge variant="secondary">{status}</Badge>
}

/** Section block used by every tab: a heading row and content, one border, no cards inside cards. */
export function Section({
  title,
  action,
  children,
  className,
  testId,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section data-testid={testId} className={cn('min-w-0 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[9rem_1fr]">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-900">{children}</dd>
    </div>
  )
}
