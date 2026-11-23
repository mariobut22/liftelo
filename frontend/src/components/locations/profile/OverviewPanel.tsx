import { CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import EmptyState from '../../ui/empty-state'
import { Badge } from '../../ui/badge'
import { pdfUrl } from '../../../lib/pdf'
import { rmsFrequencyLabel } from '../../../lib/rmsFrequency'
import type { Finding } from '../../../services/api'
import type { LocationInterventionItem } from '../../../hooks/queries/useLocationInterventions'
import type { LocationRmsListItem } from '../../../hooks/queries/useLocationRmsList'
import { FaultRow } from './FaultsPanel'
import { InfoRow, Section } from './ProfileParts'
import { formatDate, sortFaults, type MonthlyRow, type TabId } from './profileUtils'

type LocationInfo = {
  contact_person?: string | null
  contact_phone?: string | null
  upravitelj?: string | null
  kljuc_strojarnice?: string | null
  notes?: string | null
  rms_frequency?: number | null
}

const linkClass =
  'inline-flex min-h-9 items-center text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400'

/** Overview tab: what a technician needs on arrival (faults, RMS state, last interventions, access and contact). */
function OverviewPanel({
  location,
  faults,
  currentMonth,
  nextDue,
  lastRms,
  interventions,
  onTab,
}: {
  location: LocationInfo
  faults: Finding[]
  currentMonth: MonthlyRow | undefined
  nextDue: string
  lastRms: LocationRmsListItem | undefined
  interventions: LocationInterventionItem[]
  onTab: (id: TabId) => void
}) {
  const { t } = useTranslation()
  const top = sortFaults(faults).slice(0, 3)
  const hasAccess = Boolean(location.kljuc_strojarnice || location.contact_person || location.contact_phone || location.upravitelj || location.notes)

  const rmsNow =
    currentMonth?.status === 'done' ? (
      <Badge className="bg-emerald-100 text-emerald-700">{t('locations:locationDetail.done')}</Badge>
    ) : currentMonth?.status === 'late' ? (
      <Badge className="bg-amber-100 text-amber-700">{t('locations:locationDetail.late')}</Badge>
    ) : currentMonth?.status === 'missing' ? (
      <Badge className="bg-rose-100 text-rose-700">{t('locations:locationDetail.missing')}</Badge>
    ) : (
      <Badge variant="secondary">{t('locations:locationDetail.overview.thisMonthNotDue')}</Badge>
    )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        testId="overview-faults"
        title={t('locations:locationDetail.overview.faults')}
        action={
          faults.length > 0 ? (
            <button type="button" className={linkClass} onClick={() => onTab('faults')}>
              {t('locations:locationDetail.actions.viewAll')}
            </button>
          ) : undefined
        }
      >
        {faults.length === 0 ? (
          <EmptyState
            compact
            icon={CheckCircle2}
            title={t('locations:locationDetail.overview.noFaults')}
            description={t('locations:locationDetail.overview.noFaultsText')}
            testId="overview-faults-empty"
          />
        ) : (
          <div className="space-y-2">
            {top.map((finding) => (
              <FaultRow key={finding.id} finding={finding} showElevator />
            ))}
            {faults.length > top.length ? (
              <button type="button" className={linkClass} onClick={() => onTab('faults')}>
                {t('locations:locationDetail.overview.moreFaults', { count: faults.length - top.length })}
              </button>
            ) : null}
          </div>
        )}
      </Section>

      <Section
        testId="overview-access"
        title={t('locations:locationDetail.overview.access')}
        action={
          <button type="button" className={linkClass} onClick={() => onTab('info')}>
            {t('locations:locationDetail.tabs.info')}
          </button>
        }
      >
        {hasAccess ? (
          <dl className="space-y-2">
            {location.kljuc_strojarnice ? <InfoRow label={t('locations:locationDetail.machineRoomKey2')}>{location.kljuc_strojarnice}</InfoRow> : null}
            {location.contact_person ? <InfoRow label={t('locations:locationDetail.contactPerson2')}>{location.contact_person}</InfoRow> : null}
            {location.contact_phone ? (
              <InfoRow label={t('common:labels.phone')}>
                <a className="font-medium underline underline-offset-2" href={`tel:${location.contact_phone.replace(/[^+\d]/g, '')}`}>
                  {location.contact_phone}
                </a>
              </InfoRow>
            ) : null}
            {location.upravitelj ? <InfoRow label={t('locations:locationDetail.propertyManager2')}>{location.upravitelj}</InfoRow> : null}
            {location.notes ? <InfoRow label={t('common:labels.comment')}>{location.notes}</InfoRow> : null}
          </dl>
        ) : (
          <p className="text-sm text-zinc-500">{t('locations:locationDetail.overview.noAccess')}</p>
        )}
      </Section>

      <Section
        testId="overview-rms"
        title={t('locations:locationDetail.overview.rms')}
        action={
          <button type="button" className={linkClass} onClick={() => onTab('history')}>
            {t('locations:locationDetail.tabs.history')}
          </button>
        }
      >
        <dl className="space-y-2">
          <InfoRow label={currentMonth?.label ?? '—'}>{rmsNow}</InfoRow>
          <InfoRow label={t('locations:locationDetail.overview.lastRms')}>
            {lastRms ? (
              <span className="flex flex-wrap items-center gap-x-3">
                <span>{formatDate(lastRms.visit_date)}</span>
                <a className="font-semibold text-blue-600 hover:text-blue-700" href={pdfUrl(`/api/rms/${lastRms.id}/pdf`)} target="_blank" rel="noreferrer">
                  {t('common:labels.pdf')}
                </a>
              </span>
            ) : (
              <span className="text-zinc-500">{t('locations:locationDetail.overview.noRmsYet')}</span>
            )}
          </InfoRow>
          <InfoRow label={t('locations:locationDetail.overview.nextRms')}>{nextDue}</InfoRow>
          <InfoRow label={t('locations:locationDetail.rmsFrequency2')}>{rmsFrequencyLabel(t, location.rms_frequency ?? 1)}</InfoRow>
        </dl>
      </Section>

      <Section
        testId="overview-interventions"
        title={t('locations:locationDetail.overview.interventions')}
        action={
          interventions.length > 0 ? (
            <button type="button" className={linkClass} onClick={() => onTab('history')}>
              {t('locations:locationDetail.actions.viewAll')}
            </button>
          ) : undefined
        }
      >
        {interventions.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('locations:locationDetail.noInterventionsLocation')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {interventions.slice(0, 3).map((item) => (
              <li key={item.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <Link to={`/dashboard/interventions/${item.id}`} className="min-w-0 flex-1 text-zinc-900 hover:text-blue-700" data-testid="location-intervention-link">
                  <span className="block font-semibold">{formatDate(item.date)}</span>
                  <span className="block truncate text-xs text-zinc-500">{[item.technician, item.notes].filter(Boolean).join(' · ') || '—'}</span>
                </Link>
                <a className="shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-700" href={pdfUrl(`/api/interventions/${item.id}/pdf`)} target="_blank" rel="noreferrer">
                  {t('common:labels.pdf')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

export default OverviewPanel
