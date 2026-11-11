import { useTranslation } from 'react-i18next'

import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import type { FindingSeverity, FindingState } from '../../lib/findings'

const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  out_of_service: 'bg-rose-100 text-rose-700',
  in_service: 'bg-amber-100 text-amber-700',
  recommendation: 'bg-zinc-100 text-zinc-700',
}

const STATE_CLASS: Record<FindingState, string> = {
  open: 'border-zinc-300 text-zinc-700',
  waiting_part: 'border-sky-200 bg-sky-50 text-sky-700',
  in_progress: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

export function SeverityBadge({ severity, className }: { severity: FindingSeverity; className?: string }) {
  const { t } = useTranslation('findings')
  return (
    <Badge className={cn(SEVERITY_CLASS[severity] ?? SEVERITY_CLASS.recommendation, className)} data-severity={severity}>
      {t(`severity.${severity}`)}
    </Badge>
  )
}

export function StateBadge({ state, className }: { state: FindingState; className?: string }) {
  const { t } = useTranslation('findings')
  return (
    <Badge variant="outline" className={cn(STATE_CLASS[state] ?? STATE_CLASS.open, className)} data-state={state}>
      {t(`state.${state}`)}
    </Badge>
  )
}
