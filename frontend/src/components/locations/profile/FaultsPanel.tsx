import { CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import EmptyState from '../../ui/empty-state'
import { SeverityBadge, StateBadge } from '../../findings/FindingBadges'
import type { Finding } from '../../../services/api'
import { Section } from './ProfileParts'
import { sortFaults, type ElevatorRow } from './profileUtils'

export function FaultRow({ finding, showElevator }: { finding: Finding; showElevator?: boolean }) {
  return (
    <Link
      to={`/dashboard/findings?id=${finding.id}`}
      className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
    >
      <SeverityBadge severity={finding.severity} />
      <StateBadge state={finding.state} />
      {showElevator ? <span className="text-xs font-semibold text-zinc-900">{finding.elevator_label}</span> : null}
      <span className="min-w-0 flex-1 basis-40 truncate">{finding.description}</span>
    </Link>
  )
}

function ElevatorFindings({ elevator, findings }: { elevator: ElevatorRow; findings: Finding[] }) {
  const { t } = useTranslation('findings')
  return (
    <div className="space-y-2" data-testid="elevator-findings" data-elevator={elevator.label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{elevator.label}</h3>
        <Link
          to={`/dashboard/findings?elevator=${elevator.id}&state=all`}
          className="inline-flex min-h-9 items-center text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
        >
          {t('elevator.history')}
        </Link>
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-zinc-500">{t('elevator.none')}</p>
      ) : (
        sortFaults(findings).map((finding) => <FaultRow key={finding.id} finding={finding} />)
      )}
    </div>
  )
}

/** Faults tab: open faults grouped by elevator, with a link to the elevator's full fault history. */
function FaultsPanel({ locationId, elevators, faults }: { locationId: number; elevators: ElevatorRow[]; faults: Finding[] }) {
  const { t } = useTranslation()
  const belongs = (f: Finding, e: ElevatorRow) => f.elevator_id === e.id || (f.elevator_id === null && f.elevator_label === e.label)
  return (
    <div className="space-y-4">
      <Section
        title={t('locations:locationDetail.faultsPanel.title')}
        action={
          <Link
            to={`/dashboard/findings?location=${locationId}&state=all`}
            className="inline-flex min-h-9 items-center text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            {t('locations:locationDetail.actions.viewAllFaults')}
          </Link>
        }
      >
        {faults.length === 0 ? (
          <EmptyState
            compact
            icon={CheckCircle2}
            title={t('locations:locationDetail.overview.noFaults')}
            description={t('locations:locationDetail.overview.noFaultsText')}
            testId="faults-empty"
          />
        ) : (
        <div className="divide-y divide-zinc-100 [&>*]:py-4 first:[&>*]:pt-0 last:[&>*]:pb-0">
          {elevators.map((elevator) => (
            <ElevatorFindings key={elevator.id} elevator={elevator} findings={faults.filter((f) => belongs(f, elevator))} />
          ))}
        </div>
        )}
      </Section>
    </div>
  )
}

export default FaultsPanel
