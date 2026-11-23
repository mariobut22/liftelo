import { useState } from 'react'
import { Images } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { API_BASE_URL } from '../../../services/api'
import { pdfUrl } from '../../../lib/pdf'
import type { LocationInterventionItem } from '../../../hooks/queries/useLocationInterventions'
import type { LocationRmsListItem } from '../../../hooks/queries/useLocationRmsList'
import { Section } from './ProfileParts'
import { formatDate, formatTime, type MonthlyRow } from './profileUtils'

const PAGE = 8
const pdfLink = 'shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-700'

function ShowMore({ total, shown, onToggle }: { total: number; shown: number; onToggle: () => void }) {
  const { t } = useTranslation()
  if (total <= PAGE) return null
  return (
    <Button variant="ghost" size="sm" className="mt-2 min-h-9" onClick={onToggle}>
      {t(shown >= total ? 'locations:locationDetail.actions.showLess' : 'locations:locationDetail.actions.showMore')}
    </Button>
  )
}

/** History tab: RMS by month (compact grid), RMS records and interventions. */
function HistoryPanel({
  monthlyRows,
  rmsList,
  interventions,
  onPhotos,
}: {
  monthlyRows: MonthlyRow[]
  rmsList: LocationRmsListItem[]
  interventions: LocationInterventionItem[]
  onPhotos: (id: number) => void
}) {
  const { t } = useTranslation()
  const [rmsAll, setRmsAll] = useState(false)
  const [intAll, setIntAll] = useState(false)
  const rmsShown = rmsAll ? rmsList : rmsList.slice(0, PAGE)
  const intShown = intAll ? interventions : interventions.slice(0, PAGE)

  return (
    <div className="space-y-4">
      <Section title={t('locations:locationDetail.historyPanel.rmsMonths')} testId="history-months">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {monthlyRows.map((row) => (
            <li key={row.label} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" data-status={row.status}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900">{row.label}</span>
                {row.status === 'done' ? (
                  <Badge className="bg-emerald-100 text-emerald-700">{t('locations:locationDetail.done')}</Badge>
                ) : row.status === 'late' ? (
                  <Badge className="bg-amber-100 text-amber-700">{t('locations:locationDetail.late')}</Badge>
                ) : row.status === 'na' ? (
                  <Badge variant="secondary">{t('common:labels.notAvailable')}</Badge>
                ) : (
                  <Badge className="bg-rose-100 text-rose-700">{t('locations:locationDetail.missing')}</Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{row.displayDate ? formatDate(row.displayDate) : '—'}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('locations:locationDetail.historyPanel.rmsRecords')} testId="history-rms">
        {rmsList.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('locations:locationDetail.noRmsRecordsLocation')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rmsShown.map((rms) => (
              <li key={rms.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="font-semibold text-zinc-900">
                    {formatDate(rms.visit_date)} {formatTime(rms.created_at)}
                  </div>
                  <div className="truncate text-xs text-zinc-500">{rms.notes_general || '—'}</div>
                </div>
                <a className={pdfLink} href={pdfUrl(`/api/rms/${rms.id}/pdf`)} target="_blank" rel="noreferrer">
                  {t('common:labels.pdf')}
                </a>
              </li>
            ))}
          </ul>
        )}
        <ShowMore total={rmsList.length} shown={rmsShown.length} onToggle={() => setRmsAll((v) => !v)} />
      </Section>

      <Section title={t('locations:locationDetail.historyPanel.interventions')} testId="history-interventions">
        {interventions.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('locations:locationDetail.noInterventionsLocation')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {intShown.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link
                    to={`/dashboard/interventions/${item.id}`}
                    className="block font-semibold text-zinc-900 hover:text-blue-700"
                    data-testid="location-intervention-link"
                  >
                    {formatDate(item.date)} {formatTime(item.created_at)}
                  </Link>
                  <div className="text-xs text-zinc-500">{item.technician || '—'}</div>
                  {item.notes ? <div className="text-xs text-zinc-500">{item.notes}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                    <div>
                      {t('locations:locationDetail.technicianSignature')}
                      {item.technician_signature_path ? (
                        <img
                          src={`${API_BASE_URL}${item.technician_signature_path}`}
                          alt={t('common:labels.signatureTechnician')}
                          className="mt-1 h-10 w-auto rounded border border-zinc-200 bg-white"
                        />
                      ) : (
                        <span className="ml-1 text-zinc-400">—</span>
                      )}
                    </div>
                    <div>
                      {t('locations:locationDetail.clientSignature')}
                      {item.client_signature_path ? (
                        <img
                          src={`${API_BASE_URL}${item.client_signature_path}`}
                          alt={t('common:labels.signatureClient')}
                          className="mt-1 h-10 w-auto rounded border border-zinc-200 bg-white"
                        />
                      ) : (
                        <span className="ml-1 text-zinc-400">—</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <a className={pdfLink} href={pdfUrl(`/api/interventions/${item.id}/pdf`)} target="_blank" rel="noreferrer">
                    {t('common:labels.pdf')}
                  </a>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                    onClick={() => onPhotos(item.id)}
                  >
                    <Images className="h-4 w-4" />
                    {t('interventions:photos.viewPhotos')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ShowMore total={interventions.length} shown={intShown.length} onToggle={() => setIntAll((v) => !v)} />
      </Section>
    </div>
  )
}

export default HistoryPanel
