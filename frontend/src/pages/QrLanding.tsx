import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClipboardList, MapPin, QrCode, Wrench } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import InterventionCreateModal from '../components/interventions/InterventionCreateModal'
import RmsCreateModal from '../components/rms/RmsCreateModal'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { getLocale } from '../i18n'
import { rmsStatusLabel } from '../lib/rmsStatus'
import { ApiError, getElevatorByQr } from '../services/api'
import useAuthStore from '../store/authStore'

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(getLocale()) : '—')

/**
 * Landing page of a scanned QR sticker (/q/:token). Behind ProtectedRoute: visitors who are not signed in are sent to
 * the login page and come back here afterwards (returnTo). The token only resolves inside the signed-in user's company.
 */
function QrLanding() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [rmsOpen, setRmsOpen] = useState(false)
  const [interventionOpen, setInterventionOpen] = useState(false)
  const user = useAuthStore((state) => state.user)
  const companies = useAuthStore((state) => state.companies)
  const activeCompanyId = user?.company_id ?? companies[0]?.id
  const isViewer = companies.find((company) => company.id === activeCompanyId)?.role === 'viewer'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['elevator-by-qr', token],
    queryFn: () => getElevatorByQr(token),
    retry: false,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-500">{t('locations:qr.landing.loading')}</div>
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <Card className="mx-auto max-w-lg space-y-3 rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
        <QrCode className="mx-auto h-10 w-10 text-zinc-400" />
        <h1 className="text-lg font-semibold text-zinc-900">
          {notFound ? t('locations:qr.landing.notFoundTitle') : t('common:apiErrors.generic')}
        </h1>
        <p className="text-sm text-zinc-600">
          {notFound ? t('locations:qr.landing.notFoundText') : (error as Error | null)?.message}
        </p>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
          {!notFound ? (
            <Button variant="outline" className="h-11" onClick={() => void refetch()}>
              {t('locations:qr.landing.retry')}
            </Button>
          ) : null}
          <Button className="h-11" onClick={() => navigate('/dashboard/locations')}>
            {t('locations:qr.landing.goToLocations')}
          </Button>
        </div>
      </Card>
    )
  }

  const { elevator, history } = data
  const details: Array<[string, string | null]> = [
    [t('locations:locationDetail.serialNumber'), elevator.serial_number],
    [t('locations:locationDetail.controlType'), elevator.control_group_type],
    [t('locations:locationDetail.cabinDoors'), elevator.cabin_door_type],
    [t('locations:locationDetail.lockType'), elevator.lock_type],
    [t('locations:locationDetail.machineRoomKey'), elevator.machine_room_key],
    [t('locations:locationDetail.comment'), elevator.comment],
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="space-y-4 rounded-xl border border-zinc-200 p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-zinc-100 p-2">
            <Wrench className="h-5 w-5 text-zinc-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{t('locations:qr.landing.elevator')}</p>
            <h1 className="break-words text-xl font-semibold text-zinc-900">{elevator.label}</h1>
            <p className="mt-1 flex items-start gap-1 text-sm text-zinc-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <span className="break-words">
                {elevator.location_name}
                {elevator.location_address ? ` — ${elevator.location_address}` : ''}
              </span>
            </p>
          </div>
        </div>

        {isViewer ? (
          <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">{t('locations:qr.landing.readOnly')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-12 text-base" onClick={() => setRmsOpen(true)}>
              <ClipboardList className="h-5 w-5" />
              {t('locations:qr.landing.newRms')}
            </Button>
            <Button className="h-12 text-base" variant="secondary" onClick={() => setInterventionOpen(true)}>
              <Wrench className="h-5 w-5" />
              {t('locations:qr.landing.newIntervention')}
            </Button>
          </div>
        )}
        <Button variant="outline" className="h-11 w-full" onClick={() => navigate(`/dashboard/locations/${elevator.location_id}`)}>
          {t('locations:qr.landing.openLocation')}
        </Button>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-4 shadow-sm sm:p-6">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="break-words text-zinc-900">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="space-y-3 rounded-xl border border-zinc-200 p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900">{t('locations:qr.landing.recentHistory')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('locations:qr.landing.noHistory')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {history.map((entry) => (
              <li key={`${entry.source}-${entry.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">
                    {entry.source === 'rms' ? t('locations:qr.landing.rmsEntry') : t('locations:qr.landing.interventionEntry')}
                    {' · '}
                    {formatDate(entry.date)}
                  </div>
                  {entry.comment ? <div className="break-words text-xs text-zinc-500">{entry.comment}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{rmsStatusLabel(t, entry.status)}</Badge>
                  {entry.source === 'rms' ? (
                    <Link className="text-xs font-semibold text-zinc-700 underline" to={`/dashboard/rms/${entry.id}`}>
                      {t('locations:qr.landing.viewRms')}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!isViewer ? (
        <>
          <RmsCreateModal open={rmsOpen} onOpenChange={setRmsOpen} presetLocationId={elevator.location_id} presetElevatorId={elevator.id} />
          <InterventionCreateModal
            open={interventionOpen}
            onOpenChange={setInterventionOpen}
            presetLocationId={elevator.location_id}
            presetElevatorId={elevator.id}
          />
        </>
      ) : null}
    </div>
  )
}

export default QrLanding
