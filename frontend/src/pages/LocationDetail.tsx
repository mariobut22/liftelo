import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Link2, MapPin, MoreHorizontal, Pencil, Plus, QrCode, Wrench } from 'lucide-react'
import { Link, useLocation as useRouterLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu'
import { CardSkeleton } from '../components/ui/skeletons'
import InterventionPhotosDialog from '../components/interventions/InterventionPhotosDialog'
import InterventionCreateModal from '../components/interventions/InterventionCreateModal'
import RmsCreateModal from '../components/rms/RmsCreateModal'
import ProfileTabs from '../components/locations/profile/ProfileTabs'
import OverviewPanel from '../components/locations/profile/OverviewPanel'
import ElevatorsPanel from '../components/locations/profile/ElevatorsPanel'
import FaultsPanel from '../components/locations/profile/FaultsPanel'
import HistoryPanel from '../components/locations/profile/HistoryPanel'
import InfoPanel from '../components/locations/profile/InfoPanel'
import { ElevatorFormDialog, EditLocationDialog } from '../components/locations/profile/ProfileDialogs'
import { RmsStatusBadge } from '../components/locations/profile/ProfileParts'
import {
  SEVERITY_CHIP,
  TAB_IDS,
  emptyElevatorForm,
  tabButtonId,
  tabPanelId,
  type ElevatorFormValues,
  type LocationFormValues,
  buildMonthlyRows,
  nextRmsDue,
  worstSeverity,
  type ElevatorRow,
  type TabId,
} from '../components/locations/profile/profileUtils'
import useAuthStore from '../store/authStore'
import { createLocationElevator, deleteElevator, updateElevator, updateLocation } from '../services/api'
import useLocation from '../hooks/queries/useLocation'
import useLocationActiveStatus from '../hooks/queries/useLocationActiveStatus'
import useLocationElevators from '../hooks/queries/useLocationElevators'
import { useFindings } from '../hooks/queries/useFindings'
import useLocationInterventions from '../hooks/queries/useLocationInterventions'
import useLocationLatestRms from '../hooks/queries/useLocationLatestRms'
import useLocationRmsList from '../hooks/queries/useLocationRmsList'
import useLocationRmsVisits from '../hooks/queries/useLocationRmsVisits'
import { useFindingsRole } from '../lib/findings'

const chipBase = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400'

type Preset = { elevatorId: number | null } | null

function LocationDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const locationId = Number(id)
  const validId = Number.isNaN(locationId) ? undefined : locationId
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const routerLocation = useRouterLocation()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const canWrite = useFindingsRole() !== 'viewer'

  const [photosForIntervention, setPhotosForIntervention] = useState<number | null>(null)
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false)
  const [isAddElevatorOpen, setIsAddElevatorOpen] = useState(false)
  const [elevatorToEdit, setElevatorToEdit] = useState<ElevatorRow | null>(null)
  const [rmsPreset, setRmsPreset] = useState<Preset>(null)
  const [interventionPreset, setInterventionPreset] = useState<Preset>(null)

  // The active tab lives in the URL hash (#faults, ...) so deep links and the back button keep it; no/unknown hash = overview.
  const hash = routerLocation.hash.replace('#', '')
  const activeTab: TabId = (TAB_IDS as readonly string[]).includes(hash) ? (hash as TabId) : 'overview'
  const setTab = useCallback(
    (tab: TabId) => navigate({ hash: tab === 'overview' ? '' : `#${tab}` }, { replace: true }),
    [navigate]
  )

  const { data: location, isLoading: loading, error } = useLocation(validId)
  const { data: activeStatus } = useLocationActiveStatus(validId)
  const { data: elevators, isLoading: elevatorsLoading } = useLocationElevators(validId)
  const { data: openFindings } = useFindings({ location_id: locationId, state: 'open', limit: 200 }, !Number.isNaN(locationId))
  const { data: latestRms } = useLocationLatestRms(validId)
  const { data: monthlyVisits } = useLocationRmsVisits(validId)
  const { data: rmsList } = useLocationRmsList(validId)
  const { data: interventions } = useLocationInterventions(validId)

  const updateLocationMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateLocation>[1]) => updateLocation(locationId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['location', locationId] }),
  })
  const createElevatorMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createLocationElevator>[1]) => createLocationElevator(locationId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['location-elevators', locationId] }),
  })
  const updateElevatorMutation = useMutation({
    mutationFn: (payload: { id: number; data: Parameters<typeof updateElevator>[1] }) => updateElevator(payload.id, payload.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['location-elevators', locationId] }),
  })
  const deleteElevatorMutation = useMutation({
    mutationFn: (elevatorId: number) => deleteElevator(elevatorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['location-elevators', locationId] }),
  })

  const elevatorList = useMemo(() => elevators ?? [], [elevators])
  const faults = useMemo(() => openFindings?.items ?? [], [openFindings])
  const monthlyRows = useMemo(() => buildMonthlyRows(monthlyVisits ?? [], location?.rms_frequency ?? 1), [monthlyVisits, location?.rms_frequency])
  const sortedRms = useMemo(
    () => [...(rmsList ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rmsList]
  )
  const lastStatusByLabel = useMemo(() => new Map((latestRms?.items ?? []).map((item) => [item.elevator_label, item.status])), [latestRms])

  const editLocationInitial = useMemo<LocationFormValues>(
    () => ({
      name: location?.name ?? '',
      address: location?.address ?? '',
      contact_person: location?.contact_person ?? '',
      contact_phone: location?.contact_phone ?? '',
      upravitelj: location?.upravitelj ?? '',
      kljuc_strojarnice: location?.kljuc_strojarnice ?? '',
      notes: location?.notes ?? '',
      rms_frequency: location?.rms_frequency ?? 1,
    }),
    [location]
  )
  const editElevatorInitial = useMemo<ElevatorFormValues>(
    () =>
      elevatorToEdit
        ? {
            label: elevatorToEdit.label ?? '',
            serial_number: elevatorToEdit.serial_number ?? '',
            control_group_type: elevatorToEdit.control_group_type ?? '',
            cabin_door_type: elevatorToEdit.cabin_door_type ?? '',
            lock_type: elevatorToEdit.lock_type ?? '',
            machine_room_key: elevatorToEdit.machine_room_key ?? '',
            comment: elevatorToEdit.comment ?? '',
          }
        : emptyElevatorForm,
    [elevatorToEdit]
  )

  if (loading) {
    return (
      <div className="space-y-4" data-testid="location-loading" aria-label={t('locations:locationDetail.loadingLocation')}>
        <CardSkeleton rows={1} />
        <CardSkeleton rows={3} />
      </div>
    )
  }

  if (error || !location) {
    return (
      <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <MapPin className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('common:states.error')}</h2>
        <p className="mt-2 text-sm text-zinc-500">{t('locations:locationDetail.weCanTLoadLocation')}</p>
        <Link to="/dashboard/locations" className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('locations:locationDetail.backToLocations')}
        </Link>
      </Card>
    )
  }

  const worst = worstSeverity(faults)
  const currentMonth = monthlyRows[0]
  const nextDue = nextRmsDue(monthlyRows, location.rms_frequency ?? 1)

  const tabs = [
    { id: 'overview' as const, label: t('locations:locationDetail.tabs.overview') },
    { id: 'elevators' as const, label: t('locations:locationDetail.tabs.elevators'), count: elevatorList.length },
    { id: 'faults' as const, label: t('locations:locationDetail.tabs.faults'), count: faults.length },
    { id: 'history' as const, label: t('locations:locationDetail.tabs.history') },
    { id: 'info' as const, label: t('locations:locationDetail.tabs.info') },
  ]

  const rmsChip =
    currentMonth?.status === 'done'
      ? { text: t('locations:locationDetail.chips.rmsDone'), cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 }
      : currentMonth?.status === 'late'
        ? { text: t('locations:locationDetail.chips.rmsLate'), cls: 'border-amber-200 bg-amber-50 text-amber-700', icon: AlertTriangle }
        : currentMonth?.status === 'missing'
          ? { text: t('locations:locationDetail.chips.rmsMissing'), cls: 'border-rose-200 bg-rose-50 text-rose-700', icon: AlertTriangle }
          : { text: t('locations:locationDetail.chips.rmsNotDue'), cls: 'border-zinc-200 bg-zinc-50 text-zinc-700', icon: ClipboardList }
  const RmsIcon = rmsChip.icon

  const confirmDelete = (elevator: ElevatorRow) => {
    if (!window.confirm(t('locations:locationDetail.deleteElevator'))) return
    deleteElevatorMutation.mutate(elevator.id)
  }

  return (
    <div className="space-y-4">
      <Link to="/dashboard/locations" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900" data-testid="back-to-locations">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('locations:locationDetail.backToLocations')}
      </Link>

      <header className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5" data-testid="location-header">
        <h1 className="break-words text-xl font-semibold text-zinc-900 sm:text-2xl">{location.name}</h1>
        {location.address ? (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-zinc-500">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{location.address}</span>
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="location-chips">
          {activeStatus?.status ? (
            <span className="inline-flex min-h-9 items-center" data-testid="chip-status">
              <RmsStatusBadge status={activeStatus.status} t={t} />
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setTab('faults')}
            data-testid="chip-faults"
            data-severity={worst ?? 'none'}
            className={`${chipBase} ${worst ? SEVERITY_CHIP[worst] : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
          >
            {worst ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            {faults.length > 0 ? t('locations:locationDetail.chips.openFaults', { count: faults.length }) : t('locations:locationDetail.chips.noOpenFaults')}
          </button>
          <button type="button" onClick={() => setTab('history')} data-testid="chip-rms" data-status={currentMonth?.status} className={`${chipBase} ${rmsChip.cls}`}>
            <RmsIcon className="h-3.5 w-3.5" aria-hidden />
            {rmsChip.text}
          </button>
          <button type="button" onClick={() => setTab('elevators')} data-testid="chip-elevators" className={`${chipBase} border-zinc-200 bg-zinc-50 text-zinc-700`}>
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            {t('locations:locationDetail.chips.elevators', { count: elevatorList.length })}
          </button>
        </div>

        {canWrite || isAdmin ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="location-actions">
            {canWrite ? (
              <>
                <Button className="h-12 min-w-[9rem] flex-1 sm:h-11 sm:flex-none" onClick={() => setRmsPreset({ elevatorId: null })} data-testid="action-new-rms">
                  <ClipboardList className="h-4 w-4" />
                  {t('locations:locationDetail.actions.newRms')}
                </Button>
                <Button
                  className="h-12 min-w-[9rem] flex-1 sm:h-11 sm:flex-none"
                  onClick={() => setInterventionPreset({ elevatorId: null })}
                  data-testid="action-new-intervention"
                >
                  <Wrench className="h-4 w-4" />
                  {t('locations:locationDetail.actions.newIntervention')}
                </Button>
              </>
            ) : null}
            {isAdmin ? (
              <>
                <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => navigate(`/dashboard/qr-labels?location=${locationId}`)}>
                  <QrCode className="h-4 w-4" />
                  {t('locations:qr.action.qrLabels')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-11 w-11 shrink-0 p-0" aria-label={t('locations:locationDetail.actions.more')} data-testid="location-more">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setIsEditLocationOpen(true)}>
                      <Pencil className="h-4 w-4" />
                      {t('locations:locationDetail.editLocation')}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setIsAddElevatorOpen(true)}>
                      <Plus className="h-4 w-4" />
                      {t('locations:locationDetail.addElevator')}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setTab('info')}>
                      <Link2 className="h-4 w-4" />
                      {t('locations:locationDetail.actions.shareLink')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      <ProfileTabs tabs={tabs} active={activeTab} onChange={setTab} label={t('locations:locationDetail.tabsLabel')} />

      <div role="tabpanel" id={tabPanelId(activeTab)} aria-labelledby={tabButtonId(activeTab)} tabIndex={0} data-testid={`location-panel-${activeTab}`} className="focus-visible:outline-none">
        {activeTab === 'overview' ? (
          <OverviewPanel
            location={location}
            faults={faults}
            currentMonth={currentMonth}
            nextDue={nextDue}
            lastRms={sortedRms[0]}
            interventions={interventions ?? []}
            onTab={setTab}
          />
        ) : null}
        {activeTab === 'elevators' ? (
          <ElevatorsPanel
            elevators={elevatorList}
            loading={elevatorsLoading}
            faults={faults}
            lastStatusByLabel={lastStatusByLabel}
            isAdmin={isAdmin}
            canWrite={canWrite}
            onNewRms={(elevatorId) => setRmsPreset({ elevatorId })}
            onNewIntervention={(elevatorId) => setInterventionPreset({ elevatorId })}
            onAdd={() => setIsAddElevatorOpen(true)}
            onEdit={setElevatorToEdit}
            onDelete={confirmDelete}
            onQrLabel={(elevator) => navigate(`/dashboard/qr-labels?location=${locationId}&elevator=${elevator.id}`)}
            onOpenFaults={() => setTab('faults')}
          />
        ) : null}
        {activeTab === 'faults' ? <FaultsPanel locationId={locationId} elevators={elevatorList} faults={faults} /> : null}
        {activeTab === 'history' ? (
          <HistoryPanel monthlyRows={monthlyRows} rmsList={sortedRms} interventions={interventions ?? []} onPhotos={setPhotosForIntervention} />
        ) : null}
        {activeTab === 'info' ? <InfoPanel location={location} locationId={locationId} isAdmin={isAdmin} onEdit={() => setIsEditLocationOpen(true)} /> : null}
      </div>

      {isAdmin ? (
        <>
          <EditLocationDialog
            open={isEditLocationOpen}
            onOpenChange={setIsEditLocationOpen}
            initial={editLocationInitial}
            pending={updateLocationMutation.isPending}
            onSubmit={async (values) => {
              try {
                await updateLocationMutation.mutateAsync({
                  name: values.name,
                  address: values.address,
                  contact_person: values.contact_person || null,
                  contact_phone: values.contact_phone || null,
                  upravitelj: values.upravitelj || null,
                  kljuc_strojarnice: values.kljuc_strojarnice || null,
                  notes: values.notes || null,
                  rms_frequency: Number(values.rms_frequency) || 1,
                })
                toast.success(t('locations:locationDetail.locationUpdated'))
                setIsEditLocationOpen(false)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t('locations:locationDetail.failedSaveLocation'))
              }
            }}
          />
          <ElevatorFormDialog
            mode="add"
            open={isAddElevatorOpen}
            onOpenChange={setIsAddElevatorOpen}
            initial={emptyElevatorForm}
            pending={createElevatorMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createElevatorMutation.mutateAsync({ ...values })
                toast.success(t('locations:locationDetail.elevatorAdded'))
                setIsAddElevatorOpen(false)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t('locations:locationDetail.failedAddElevator'))
              }
            }}
          />
          <ElevatorFormDialog
            mode="edit"
            open={elevatorToEdit !== null}
            onOpenChange={(open) => {
              if (!open) setElevatorToEdit(null)
            }}
            initial={editElevatorInitial}
            pending={updateElevatorMutation.isPending}
            onSubmit={async (values) => {
              if (!elevatorToEdit) return
              try {
                await updateElevatorMutation.mutateAsync({ id: elevatorToEdit.id, data: { ...values } })
                toast.success(t('locations:locationDetail.elevatorUpdated'))
                setElevatorToEdit(null)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t('locations:locationDetail.failedUpdateElevator'))
              }
            }}
          />
        </>
      ) : null}

      {canWrite ? (
        <>
          <RmsCreateModal
            open={rmsPreset !== null}
            onOpenChange={(open) => {
              if (!open) setRmsPreset(null)
            }}
            presetLocationId={locationId}
            presetElevatorId={rmsPreset?.elevatorId ?? null}
          />
          <InterventionCreateModal
            open={interventionPreset !== null}
            onOpenChange={(open) => {
              if (!open) setInterventionPreset(null)
            }}
            presetLocationId={locationId}
            presetElevatorId={interventionPreset?.elevatorId ?? null}
          />
        </>
      ) : null}

      <InterventionPhotosDialog interventionId={photosForIntervention} locationName={location?.name} onClose={() => setPhotosForIntervention(null)} />
    </div>
  )
}

export default LocationDetailPage
