import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { SeverityBadge, StateBadge } from './FindingBadges'
import { useDaysText } from './useDaysText'
import type { Finding } from '../../services/api'

interface FindingCardProps {
  finding: Finding
  onOpen: (id: number) => void
  compact?: boolean
}

/** One fault in a list: severity, elevator + location, description, category, age, state. */
function FindingCard({ finding, onOpen, compact = false }: FindingCardProps) {
  const { t } = useTranslation('findings')
  const daysText = useDaysText()
  const urgent = finding.severity === 'out_of_service' && finding.state !== 'resolved'

  return (
    <button
      type="button"
      data-testid="finding-card"
      data-finding-id={finding.id}
      onClick={() => onOpen(finding.id)}
      className={cn(
        'flex w-full min-w-0 items-start justify-between gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 sm:p-4',
        urgent ? 'border-rose-300' : 'border-zinc-200',
        finding.state === 'resolved' && 'opacity-75'
      )}
    >
      <span className="min-w-0 flex-1 space-y-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={finding.severity} />
          <StateBadge state={finding.state} />
          {finding.needs_part ? (
            <Badge variant="outline" className="border-sky-200 text-sky-700">
              {finding.parts_ordered ? t('card.partOrdered') : t('card.partNeeded')}
            </Badge>
          ) : null}
        </span>
        <span className="block min-w-0">
          <span className="block truncate text-sm font-semibold text-zinc-900">
            {finding.elevator_label}
            {finding.location_name ? <span className="font-normal text-zinc-500"> · {finding.location_name}</span> : null}
          </span>
          <span className={cn('mt-1 block text-sm text-zinc-700', compact ? 'line-clamp-1' : 'line-clamp-3')}>
            {finding.description}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{t(`category.${finding.category}`)}</span>
          <span>{daysText(finding)}</span>
          {finding.needs_part && finding.part_note ? <span>{t('card.partFor', { part: finding.part_note })}</span> : null}
        </span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
    </button>
  )
}

export default FindingCard
