import { useMemo } from 'react'
import { Calendar, ClipboardList, Download, MapPin, User } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import PhotoGallery, { type GalleryPhoto } from '../components/photos/PhotoGallery'
import FindingCard from '../components/findings/FindingCard'
import WorkLinesTable from '../components/work-lines/WorkLinesTable'
import ReportSignaturePanel from '../components/signature/ReportSignaturePanel'
import useIntervention from '../hooks/queries/useIntervention'
import { useFindings } from '../hooks/queries/useFindings'
import { API_BASE_URL, getInterventionPhotos } from '../services/api'
import { getLocale } from '../i18n'
import { pdfUrl } from '../lib/pdf'
import { RMS_STATUS, rmsStatusLabel } from '../lib/rmsStatus'

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(getLocale()) : '—'

const statusStyles: Record<string, string> = {
  [RMS_STATUS.ok]: 'bg-emerald-100 text-emerald-700',
  [RMS_STATUS.repairInService]: 'bg-amber-100 text-amber-700',
  [RMS_STATUS.repairOutOfService]: 'bg-rose-100 text-rose-700',
}

/** Everything about one intervention in the app (no PDF needed): header, texts, photos, work table, signature, faults. */
function InterventionDetailPage() {
  const { t } = useTranslation()
  const { t: tSig } = useTranslation('signature')
  const { t: tLines } = useTranslation('workLines')
  const navigate = useNavigate()
  const { id } = useParams()
  const { data, isLoading: loading, error } = useIntervention(id)
  const interventionId = data?.id

  const photosQuery = useQuery({
    queryKey: ['intervention-photos', interventionId],
    queryFn: () => getInterventionPhotos(interventionId as number),
    enabled: typeof interventionId === 'number',
  })
  const findingsQuery = useFindings(
    { state: 'all', source_type: 'intervention', source_id: interventionId, limit: 50 },
    typeof interventionId === 'number'
  )

  const photos = useMemo<GalleryPhoto[]>(
    () =>
      (photosQuery.data?.photos ?? []).map((photo) => ({
        src: `${API_BASE_URL}${photo.file_path}`,
        kind: photo.kind,
        caption: photo.caption,
        takenAt: photo.taken_at,
      })),
    [photosQuery.data]
  )

  if (loading) {
    return (
      <div className="space-y-6" data-testid="intervention-detail-loading">
        <div className="h-6 w-64 animate-pulse rounded-md bg-zinc-200/70" />
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`intervention-detail-skeleton-${index}`} className="p-6 shadow-sm">
              <div className="h-4 w-32 animate-pulse rounded-md bg-zinc-200/70" />
              <div className="mt-4 h-4 w-40 animate-pulse rounded-md bg-zinc-200/70" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card
        className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm"
        data-testid="intervention-detail-error"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <ClipboardList className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('interventions:detail.error.title')}</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {error instanceof Error ? error.message : t('interventions:detail.error.loadFailed')}
        </p>
        <Button className="mt-4" size="sm" variant="secondary" onClick={() => navigate('/dashboard/interventions')}>
          {t('common:labels.interventions')}
        </Button>
      </Card>
    )
  }

  if (!data) {
    return <div className="p-6 text-sm text-zinc-500">{t('interventions:detail.empty.noData')}</div>
  }

  const interventionPdfUrl = pdfUrl(`/api/interventions/${data.id}/pdf`)
  const findings = findingsQuery.data?.items ?? []
  const photosTitle = t('interventions:detail.photosTitle')
  const noText = t('interventions:detail.noText')

  return (
    <div className="space-y-6" data-testid="intervention-detail">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">{t('interventions:detail.title')}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-500">
            <div className="flex min-w-0 items-center gap-1">
              <MapPin className="h-4 w-4 shrink-0 text-zinc-400" />
              <Link
                to={`/dashboard/locations/${data.location_id}`}
                title={t('interventions:detail.viewLocation')}
                data-testid="intervention-location-link"
                className="min-w-0 break-words font-medium text-blue-600 hover:text-blue-700"
              >
                {data.location_name || `#${data.location_id}`}
              </Link>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>
                {t('interventions:detail.date')}: {formatDate(data.date)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>
                {t('interventions:detail.created')}: {formatDate(data.created_at)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-500">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4 text-zinc-400" />
              <span>
                {t('common:labels.technician')}: {data.technician || '—'}
              </span>
            </div>
            {data.second_technician ? (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4 text-zinc-400" />
                <span>
                  {t('interventions:detail.secondTechnician')}: {data.second_technician}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2" data-testid="intervention-badges">
            {data.type ? (
              <Badge variant="secondary" data-testid="intervention-type">
                {t(`interventions:detail.type.${data.type}`, { defaultValue: data.type })}
              </Badge>
            ) : null}
            {data.status ? (
              <Badge className={statusStyles[data.status] ?? 'bg-zinc-100 text-zinc-700'} data-testid="intervention-status">
                {rmsStatusLabel(t, data.status)}
              </Badge>
            ) : null}
            {data.resolved ? (
              <Badge className="bg-emerald-100 text-emerald-700" data-testid="intervention-resolved">
                {t('interventions:detail.resolved')}
              </Badge>
            ) : null}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
          onClick={() => window.open(interventionPdfUrl, '_blank', 'noopener,noreferrer')}
          data-testid="intervention-pdf"
        >
          <Download className="h-4 w-4" />
          {t('common:actions.downloadPdf')}
        </Button>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">{tSig('panel.title')}</h2>
        <ReportSignaturePanel type="intervention" id={data.id} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900">{t('interventions:detail.description')}</h2>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm text-zinc-600" data-testid="intervention-description">
            {data.description || noText}
          </p>
          <h2 className="mt-6 text-sm font-semibold text-zinc-900">{t('interventions:detail.notes')}</h2>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm text-zinc-600" data-testid="intervention-notes">
            {data.notes || noText}
          </p>
        </Card>
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">{t('interventions:detail.elevatorsTitle')}</h2>
          <div className="mt-4 divide-y divide-zinc-100">
            {data.items?.length ? (
              data.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-1 py-3 text-sm">
                  <span className="font-medium text-zinc-900">{item.elevator_label}</span>
                  {item.comment ? <p className="break-words text-zinc-500">{item.comment}</p> : null}
                </div>
              ))
            ) : (
              <div className="py-3 text-sm text-zinc-500">{t('interventions:detail.elevatorsEmpty')}</div>
            )}
          </div>
        </Card>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">{tLines('view.title')}</h2>
        <div className="mt-4">
          <WorkLinesTable lines={data.work_lines ?? []} />
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">{photosTitle}</h2>
        <div className="mt-4">
          {photosQuery.isLoading ? (
            <p className="text-sm text-zinc-500">{t('common:states.loading')}</p>
          ) : photosQuery.error ? (
            <p className="text-sm text-rose-600">
              {photosQuery.error instanceof Error ? photosQuery.error.message : t('common:apiErrors.generic')}
            </p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-zinc-500" data-testid="photos-empty">
              {t('interventions:photos.none')}
            </p>
          ) : (
            <PhotoGallery photos={photos} title={photosTitle} />
          )}
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">{t('interventions:detail.findingsTitle')}</h2>
        <div className="mt-4 space-y-2" data-testid="intervention-findings">
          {findingsQuery.isLoading ? (
            <p className="text-sm text-zinc-500">{t('common:states.loading')}</p>
          ) : findingsQuery.error ? (
            <p className="text-sm text-rose-600">{t('interventions:detail.findingsLoadFailed')}</p>
          ) : findings.length === 0 ? (
            <p className="text-sm text-zinc-500" data-testid="findings-empty">
              {t('interventions:detail.findingsEmpty')}
            </p>
          ) : (
            findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                compact
                onOpen={(findingId) => navigate(`/dashboard/findings?id=${findingId}`)}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

export default InterventionDetailPage
