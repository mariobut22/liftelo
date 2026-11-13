import { useTranslation } from 'react-i18next'

import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import { SeverityBadge } from './FindingBadges'
import { useDaysText } from './useDaysText'
import type { FindingsRole } from '../../lib/findings'
import type { Finding } from '../../services/api'

interface OpenFaultsNoticeProps {
  /** Unique per elevator row (ids and test hooks) */
  idPrefix: string
  elevatorLabel: string
  faults: Finding[]
  /** rms = information only; intervention = per fault "still present" (default) / "fixed" */
  mode: 'rms' | 'intervention'
  role: FindingsRole
  fixedIds: number[]
  onToggleFixed: (findingId: number, fixed: boolean) => void
}

/**
 * Notice inside the RMS / intervention form: the faults that are already open on the elevator being reported.
 * "Fixed" is only offered in the intervention flow. A technician cannot resolve a fault (admin only): the server stores
 * his answer as a comment and tells the office; an admin's answer resolves the fault with this intervention.
 */
function OpenFaultsNotice({ idPrefix, elevatorLabel, faults, mode, role, fixedIds, onToggleFixed }: OpenFaultsNoticeProps) {
  const { t } = useTranslation('findings')
  const daysText = useDaysText()
  if (faults.length === 0) return null
  const urgent = faults.some((fault) => fault.severity === 'out_of_service')
  const canAnswer = mode === 'intervention' && role !== 'viewer'

  return (
    <div
      data-testid="open-faults-notice"
      data-elevator={elevatorLabel}
      className={cn('w-full basis-full space-y-2 rounded-lg border p-3', urgent ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60')}
    >
      <div>
        <p className="text-sm font-semibold text-zinc-900">{t('notice.title', { count: faults.length })}</p>
        <p className="text-xs text-zinc-500">{canAnswer ? t('notice.hintIntervention') : t('notice.hintRms')}</p>
      </div>
      <ul className="space-y-2">
        {faults.map((fault) => {
          const fixed = fixedIds.includes(fault.id)
          return (
            <li key={fault.id} data-testid="open-fault" data-finding-id={fault.id} className="space-y-1.5 rounded-md bg-white/80 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <SeverityBadge severity={fault.severity} />
                <span className="text-xs text-zinc-500">{t(`category.${fault.category}`)}</span>
                <span className="text-xs text-zinc-500">{daysText(fault)}</span>
                {fault.needs_part ? (
                  <Badge variant="outline" className="border-sky-200 text-sky-700">
                    {fault.parts_ordered ? t('card.partOrdered') : t('card.partNeeded')}
                  </Badge>
                ) : null}
              </div>
              <p className="break-words text-sm text-zinc-800">{fault.description}</p>
              {canAnswer ? (
                <div role="radiogroup" aria-label={fault.description} className="flex flex-wrap gap-2">
                  {(['present', 'fixed'] as const).map((choice) => {
                    const selected = choice === 'fixed' ? fixed : !fixed
                    return (
                      <label
                        key={choice}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm',
                          selected ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-700'
                        )}
                      >
                        <input
                          type="radio"
                          name={`${idPrefix}-${fault.id}`}
                          data-testid={`fault-${choice}`}
                          checked={selected}
                          onChange={() => onToggleFixed(fault.id, choice === 'fixed')}
                          className="h-4 w-4"
                        />
                        {choice === 'fixed' ? t('notice.fixed') : t('notice.stillPresent')}
                      </label>
                    )
                  })}
                </div>
              ) : null}
              {canAnswer && fixed ? (
                <p className="text-xs text-zinc-500">{role === 'admin' ? t('notice.fixedAdminHint') : t('notice.fixedTechnicianHint')}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default OpenFaultsNotice
