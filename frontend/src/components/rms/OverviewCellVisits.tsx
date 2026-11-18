import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ExternalLink, FileText } from 'lucide-react'

import { Badge } from '../ui/badge'
import SignatureStateBadge from '../signature/SignatureStateBadge'
import { getRmsOverviewVisits } from '../../services/api'
import { useFormat } from '../../lib/format'
import { pdfUrl } from '../../lib/pdf'

type Props = {
  locationId: number
  year: number
  month: number
  /** Date shown in the overview cell (ISO string or YYYY-MM-DD), null when the cell is empty. */
  serviceDate?: string | null
}

// 'YYYY-MM-DD' -> local Date (no time zone shift)
const parseDay = (value?: string | null): Date | null => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

const linkBase =
  'inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400'

/** "RMS records in this month": every RMS visit behind one overview cell, each linked to its record page and PDF. */
function OverviewCellVisits({ locationId, year, month, serviceDate }: Props) {
  const { t } = useTranslation('rms')
  const { formatDate } = useFormat()
  const { data, isLoading, error } = useQuery({
    queryKey: ['rms-overview-visits', locationId, year, month],
    queryFn: () => getRmsOverviewVisits(locationId, year, month),
  })

  const cellDay = serviceDate ? serviceDate.slice(0, 10) : null
  const visits = data ?? []
  // the visit the cell date comes from: newest visit whose effective date equals the shown date
  const sourceId = cellDay ? visits.find((visit) => visit.effective_date === cellDay)?.id ?? null : null

  return (
    <section className="space-y-3" data-testid="overview-visits">
      <h3 className="text-sm font-semibold text-zinc-900">{t('overview.visits.title')}</h3>

      {isLoading ? (
        <p className="text-sm text-zinc-500">{t('overview.visits.loading')}</p>
      ) : error ? (
        <p className="text-sm text-red-600">{t('overview.visits.error')}</p>
      ) : visits.length === 0 ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${serviceDate ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}
          data-testid={serviceDate ? 'overview-visits-manual' : 'overview-visits-empty'}
        >
          {serviceDate ? t('overview.visits.manualHint') : t('overview.visits.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {visits.map((visit) => {
            const isSource = visit.id === sourceId
            const effective = parseDay(visit.effective_date)
            const real = parseDay(visit.visit_date)
            const attributed = visit.rms_month && visit.effective_date !== visit.visit_date
            return (
              <li
                key={visit.id}
                className={`rounded-lg border p-3 ${isSource ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white'}`}
                data-testid={`overview-visit-${visit.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">{formatDate(effective)}</span>
                  {isSource ? (
                    <Badge className="bg-zinc-900 text-white" data-testid="overview-visit-source">
                      {t('overview.visits.shownInOverview')}
                    </Badge>
                  ) : null}
                  <SignatureStateBadge state={visit.signature_state} />
                  {visit.repair_count > 0 ? (
                    <Badge className="bg-amber-100 text-amber-800">
                      {t('overview.visits.repair', { count: visit.repair_count })}
                    </Badge>
                  ) : visit.item_count > 0 ? (
                    <Badge className="bg-emerald-100 text-emerald-700">{t('overview.visits.allOk')}</Badge>
                  ) : null}
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
                  <div>
                    {t('overview.visits.technician')}: {visit.technician_name || '—'}
                  </div>
                  {attributed ? (
                    <div>{t('overview.visits.performedOn', { date: formatDate(real) })}</div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/dashboard/rms/${visit.id}`}
                    className={`${linkBase} bg-zinc-900 text-white hover:bg-zinc-800`}
                    data-testid={`overview-open-rms-${visit.id}`}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    {t('overview.visits.open')}
                  </Link>
                  <a
                    href={pdfUrl(`/api/rms/${visit.id}/pdf`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${linkBase} border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50`}
                    data-testid={`overview-pdf-rms-${visit.id}`}
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {t('overview.visits.pdf')}
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {visits.length > 0 && serviceDate && sourceId === null ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="overview-visits-edited">
          {t('overview.visits.editedHint')}
        </p>
      ) : null}
    </section>
  )
}

export default OverviewCellVisits
