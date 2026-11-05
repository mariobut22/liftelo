import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, MapPin, Pencil, Plus, Wrench } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import useAuthStore from '../store/authStore'
import {
  API_BASE_URL,
  createLocationElevator,
  deleteElevator,
  updateElevator,
  updateLocation,
} from '../services/api'
import useLocation from '../hooks/queries/useLocation'
import useLocationActiveStatus from '../hooks/queries/useLocationActiveStatus'
import useLocationElevators from '../hooks/queries/useLocationElevators'
import useLocationInterventions from '../hooks/queries/useLocationInterventions'
import useLocationLatestRms from '../hooks/queries/useLocationLatestRms'
import useLocationRmsList from '../hooks/queries/useLocationRmsList'
import useLocationRmsVisits from '../hooks/queries/useLocationRmsVisits'
import { getLocale } from '../i18n'
import { pdfUrl } from '../lib/pdf'
import type { TFunction } from 'i18next'
import { RMS_STATUS, rmsStatusLabel } from '../lib/rmsStatus'
import { rmsFrequencyLabel } from '../lib/rmsFrequency'
import { useTranslation } from 'react-i18next'

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(getLocale()) : '—'

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(getLocale()) : '—'

const getStatusBadge = (status: string | null | undefined, t: TFunction) => {
  if (!status) return <Badge variant="secondary">—</Badge>
  if (status === RMS_STATUS.ok) return <Badge className="bg-emerald-100 text-emerald-700">{rmsStatusLabel(t, status)}</Badge>
  if (status === RMS_STATUS.repairInService) {
    return <Badge className="bg-amber-100 text-amber-700">{rmsStatusLabel(t, status)}</Badge>
  }
  if (status === RMS_STATUS.repairOutOfService) {
    return <Badge className="bg-rose-100 text-rose-700">{rmsStatusLabel(t, status)}</Badge>
  }
  return <Badge variant="secondary">{status}</Badge>
}

type MonthlyRow = {
  label: string
  status: 'done' | 'late' | 'missing' | 'na'
  displayDate?: string | null
}

const buildMonthlyRows = (
  visits: Array<{ visit_date: string; rms_month?: string | null }> = [],
  frequency = 1
) => {
  const now = new Date()
  const months: Array<{ year: number; month: number }> = []
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: date.getFullYear(), month: date.getMonth() + 1 })
  }

  const visitLookup = new Map<string, { visit_date: string; rms_month?: string | null }>()
  visits.forEach((visit) => {
    const effective = visit.rms_month || visit.visit_date
    const parsed = new Date(effective)
    if (Number.isNaN(parsed.getTime())) return
    const key = `${parsed.getFullYear()}-${parsed.getMonth() + 1}`
    const existing = visitLookup.get(key)
    if (!existing || new Date(existing.visit_date) < new Date(visit.visit_date)) {
      visitLookup.set(key, visit)
    }
  })

  const isExpected = (month: number) => ((month - 1) % (frequency || 1)) === 0

  return months.map(({ year, month }): MonthlyRow => {
    const key = `${year}-${month}`
    const nextKey = month === 12 ? `${year + 1}-1` : `${year}-${month + 1}`
    const visit = visitLookup.get(key)
    const nextVisit = visitLookup.get(nextKey)
    const expected = isExpected(month)
    const status = expected ? (visit ? 'done' : nextVisit ? 'late' : 'missing') : 'na'
    const displayDate = status === 'na' ? null : visit?.rms_month || visit?.visit_date || nextVisit?.rms_month || nextVisit?.visit_date || null
    const label = `${String(month).padStart(2, '0')}/${year}`
    return { label, status, displayDate }
  })
}

function LocationDetailPage() {
  const { t } = useTranslation()

  const { id } = useParams()
  const locationId = Number(id)
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())

  const [elevatorSearch, setElevatorSearch] = useState('')
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false)
  const [isAddElevatorOpen, setIsAddElevatorOpen] = useState(false)
  const [isEditElevatorOpen, setIsEditElevatorOpen] = useState(false)
  const [elevatorToEdit, setElevatorToEdit] = useState<
    | {
        id: number
        label: string
        serial_number?: string | null
        control_group_type?: string | null
        cabin_door_type?: string | null
        lock_type?: string | null
        machine_room_key?: string | null
        comment?: string | null
      }
    | null
  >(null)

  const { data: location, isLoading: loading, error } = useLocation(Number.isNaN(locationId) ? undefined : locationId)
  const { data: activeStatus } = useLocationActiveStatus(Number.isNaN(locationId) ? undefined : locationId)
  const { data: elevators } = useLocationElevators(Number.isNaN(locationId) ? undefined : locationId)
  const { data: latestRms } = useLocationLatestRms(Number.isNaN(locationId) ? undefined : locationId)
  const { data: monthlyVisits } = useLocationRmsVisits(Number.isNaN(locationId) ? undefined : locationId)
  const { data: rmsList } = useLocationRmsList(Number.isNaN(locationId) ? undefined : locationId)
  const { data: interventions } = useLocationInterventions(Number.isNaN(locationId) ? undefined : locationId)

  const updateLocationMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      address: string
      contact_person?: string | null
      contact_phone?: string | null
      upravitelj?: string | null
      kljuc_strojarnice?: string | null
      notes?: string | null
      rms_frequency?: number
    }) => updateLocation(locationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location', locationId] })
    },
  })

  const createElevatorMutation = useMutation({
    mutationFn: async (payload: {
      label: string
      serial_number?: string
      control_group_type?: string
      cabin_door_type?: string
      lock_type?: string
      machine_room_key?: string
      comment?: string
    }) => createLocationElevator(locationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-elevators', locationId] })
    },
  })

  const updateElevatorMutation = useMutation({
    mutationFn: async (payload: {
      id: number
      data: {
        label: string
        serial_number?: string
        control_group_type?: string
        cabin_door_type?: string
        lock_type?: string
        machine_room_key?: string
        comment?: string
      }
    }) => updateElevator(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-elevators', locationId] })
    },
  })

  const deleteElevatorMutation = useMutation({
    mutationFn: async (elevatorId: number) => deleteElevator(elevatorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-elevators', locationId] })
    },
  })

  const locationForm = useForm({
    defaultValues: {
      name: '',
      address: '',
      contact_person: '',
      contact_phone: '',
      upravitelj: '',
      kljuc_strojarnice: '',
      notes: '',
      rms_frequency: 1,
    },
  })

  const addElevatorForm = useForm({
    defaultValues: {
      label: '',
      serial_number: '',
      control_group_type: '',
      cabin_door_type: '',
      lock_type: '',
      machine_room_key: '',
      comment: '',
    },
  })

  const editElevatorForm = useForm({
    defaultValues: {
      label: '',
      serial_number: '',
      control_group_type: '',
      cabin_door_type: '',
      lock_type: '',
      machine_room_key: '',
      comment: '',
    },
  })

  const filteredElevators = useMemo(() => {
    const list = elevators ?? []
    const query = elevatorSearch.trim().toLowerCase()
    if (!query) return list
    return list.filter((elevator) =>
      [
        elevator.label,
        elevator.serial_number,
        elevator.control_group_type,
        elevator.cabin_door_type,
        elevator.lock_type,
        elevator.machine_room_key,
        elevator.comment,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [elevatorSearch, elevators])

  const monthlyRows = useMemo(
    () => buildMonthlyRows(monthlyVisits ?? [], location?.rms_frequency ?? 1),
    [monthlyVisits, location?.rms_frequency]
  )

  useEffect(() => {
    if (!location) return
    locationForm.reset({
      name: location.name ?? '',
      address: location.address ?? '',
      contact_person: location.contact_person ?? '',
      contact_phone: location.contact_phone ?? '',
      upravitelj: location.upravitelj ?? '',
      kljuc_strojarnice: location.kljuc_strojarnice ?? '',
      notes: location.notes ?? '',
      rms_frequency: location.rms_frequency ?? 1,
    })
  }, [location, locationForm])

  useEffect(() => {
    if (!isAddElevatorOpen) return
    addElevatorForm.reset({
      label: '',
      serial_number: '',
      control_group_type: '',
      cabin_door_type: '',
      lock_type: '',
      machine_room_key: '',
      comment: '',
    })
  }, [addElevatorForm, isAddElevatorOpen])

  useEffect(() => {
    if (!elevatorToEdit) return
    editElevatorForm.reset({
      label: elevatorToEdit.label ?? '',
      serial_number: elevatorToEdit.serial_number ?? '',
      control_group_type: elevatorToEdit.control_group_type ?? '',
      cabin_door_type: elevatorToEdit.cabin_door_type ?? '',
      lock_type: elevatorToEdit.lock_type ?? '',
      machine_room_key: elevatorToEdit.machine_room_key ?? '',
      comment: elevatorToEdit.comment ?? '',
    })
  }, [editElevatorForm, elevatorToEdit])

  if (loading) {
    return <div className="p-6 text-sm text-zinc-500">{t('locations:locationDetail.loadingLocation')}</div>
  }

  if (error || !location) {
    return (
      <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <MapPin className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('common:states.error')}</h2>
        <p className="mt-2 text-sm text-zinc-500">{t('locations:locationDetail.weCanTLoadLocation')}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{location.name}</h1>
          <p className="text-sm text-zinc-500">{t('locations:locationDetail.locationProfile')}</p>
        </div>
      </div>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-900">{t('locations:locationDetail.currentStatus')}</p>
            <p className="text-xs text-zinc-500">{formatDateTime(activeStatus?.updatedAt)}</p>
          </div>
          {getStatusBadge(activeStatus?.status, t)}
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">{t('locations:locationDetail.basicInformation')}</p>
            <div className="text-sm text-zinc-600">
              <div><strong>{t('locations:locationDetail.address')}</strong> {location.address || '—'}</div>
              <div><strong>{t('locations:locationDetail.contactPerson')}</strong> {location.contact_person || '—'}</div>
              <div><strong>{t('locations:locationDetail.phone')}</strong> {location.contact_phone || '—'}</div>
              <div><strong>{t('locations:locationDetail.propertyManager')}</strong> {location.upravitelj || '—'}</div>
              <div><strong>{t('locations:locationDetail.machineRoomKey')}</strong> {location.kljuc_strojarnice || '—'}</div>
              <div><strong>{t('locations:locationDetail.rmsFrequency')}</strong> {rmsFrequencyLabel(t, location.rms_frequency)}</div>
              <div><strong>{t('locations:locationDetail.comment')}</strong> {location.notes || '—'}</div>
            </div>
          </div>
          {isAdmin ? (
            <Button size="sm" variant="secondary" onClick={() => setIsEditLocationOpen(true)}>
              <Pencil className="h-4 w-4" />
              {t('locations:locationDetail.editLocation')}
            </Button>
          ) : null}
        </div>
        <Dialog open={isEditLocationOpen} onOpenChange={setIsEditLocationOpen}>
          <DialogContent className="max-w-2xl p-0">
            <form
              onSubmit={locationForm.handleSubmit(async (values) => {
                if (!isAdmin) return
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
              })}
              className="flex max-h-[90vh] flex-col"
            >
              <div className="border-b border-zinc-200 px-6 py-4 shrink-0">
                <DialogTitle>{t('locations:locationDetail.editLocation')}</DialogTitle>
                <DialogDescription>{t('locations:locationDetail.updateBasicInformationAboutLocation')}</DialogDescription>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.locationName')}</label>
                    <Input {...locationForm.register('name', { required: true })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('common:labels.address')}</label>
                    <Input {...locationForm.register('address', { required: true })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.contactPerson2')}</label>
                    <Input {...locationForm.register('contact_person')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('common:labels.phone')}</label>
                    <Input {...locationForm.register('contact_phone')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.propertyManager2')}</label>
                    <Input {...locationForm.register('upravitelj')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.machineRoomKey2')}</label>
                    <Input {...locationForm.register('kljuc_strojarnice')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.rmsFrequency2')}</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                      {...locationForm.register('rms_frequency')}
                    >
                      <option value={1}>{t('locations:locationDetail.everyMonth')}</option>
                      <option value={2}>{t('locations:locationDetail.every2Months')}</option>
                      <option value={3}>{t('locations:locationDetail.every3Months')}</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-500">{t('common:labels.comment')}</label>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                      rows={3}
                      {...locationForm.register('notes')}
                    />
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-200 px-6 py-4 flex justify-end gap-2 shrink-0">
                <Button type="button" variant="secondary" onClick={() => setIsEditLocationOpen(false)}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={updateLocationMutation.isPending}>
                  {updateLocationMutation.isPending ? t('common:states.saving') : t('common:actions.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-900">{t('common:labels.elevators')}</p>
          </div>
          <Input
            className="sm:max-w-xs"
            placeholder={t('locations:locationDetail.searchElevators')}
            value={elevatorSearch}
            onChange={(event) => setElevatorSearch(event.target.value)}
          />
        </div>
        <div className="mt-4 space-y-3">
          {filteredElevators.length === 0 ? (
            <div className="text-sm text-zinc-500">{t('common:empty.noElevatorsForLocation')}</div>
          ) : (
            filteredElevators.map((elevator) => (
              <div key={elevator.id} className="rounded-lg border border-zinc-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="text-sm text-zinc-600">
                    <div className="text-base font-semibold text-zinc-900">{elevator.label}</div>
                    <div>{t('locations:locationDetail.serialNumber')} {elevator.serial_number || '—'}</div>
                    <div>{t('locations:locationDetail.controlType')} {elevator.control_group_type || '—'}</div>
                    <div>{t('locations:locationDetail.cabinDoors')} {elevator.cabin_door_type || '—'}</div>
                    <div>{t('locations:locationDetail.lockType')} {elevator.lock_type || '—'}</div>
                    <div>{t('locations:locationDetail.machineRoomKey')} {elevator.machine_room_key || '—'}</div>
                    <div>{t('locations:locationDetail.comment')} {elevator.comment || '—'}</div>
                  </div>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setElevatorToEdit(elevator)
                          setIsEditElevatorOpen(true)
                        }}
                      >
                        {t('common:actions.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (!window.confirm(t('locations:locationDetail.deleteElevator'))) return
                          deleteElevatorMutation.mutate(elevator.id)
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        {isAdmin ? (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsAddElevatorOpen(true)}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-900 transition hover:opacity-70"
            >
              <Plus className="h-4 w-4" />
              {t('locations:locationDetail.addElevator')}
            </button>
            {/* Right-side add button removed to avoid duplicate trigger */}
          </div>
        ) : null}
        <Dialog open={isAddElevatorOpen} onOpenChange={setIsAddElevatorOpen}>
          <DialogContent className="max-w-2xl p-0">
            <form
              onSubmit={addElevatorForm.handleSubmit(async (values) => {
                if (!isAdmin) return
                try {
                  await createElevatorMutation.mutateAsync({
                    label: values.label,
                    serial_number: values.serial_number || '',
                    control_group_type: values.control_group_type || '',
                    cabin_door_type: values.cabin_door_type || '',
                    lock_type: values.lock_type || '',
                    machine_room_key: values.machine_room_key || '',
                    comment: values.comment || '',
                  })
                  toast.success(t('locations:locationDetail.elevatorAdded'))
                  setIsAddElevatorOpen(false)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t('locations:locationDetail.failedAddElevator'))
                }
              })}
              className="flex max-h-[90vh] flex-col"
            >
              <div className="border-b border-zinc-200 px-6 py-4 shrink-0">
                <DialogTitle>{t('locations:locationDetail.addElevator')}</DialogTitle>
                <DialogDescription>{t('locations:locationDetail.enterElevatorDetails')}</DialogDescription>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.label')}</label>
                    <Input {...addElevatorForm.register('label', { required: true })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.serialNumber2')}</label>
                    <Input {...addElevatorForm.register('serial_number')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.controlType2')}</label>
                    <Input {...addElevatorForm.register('control_group_type')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.cabinDoors2')}</label>
                    <Input {...addElevatorForm.register('cabin_door_type')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.lockType2')}</label>
                    <Input {...addElevatorForm.register('lock_type')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.machineRoomKey2')}</label>
                    <Input {...addElevatorForm.register('machine_room_key')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-500">{t('common:labels.comment')}</label>
                    <Input {...addElevatorForm.register('comment')} />
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-200 px-6 py-4 flex justify-end gap-2 shrink-0">
                <Button type="button" variant="secondary" onClick={() => setIsAddElevatorOpen(false)}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={createElevatorMutation.isPending}>
                  {createElevatorMutation.isPending ? t('common:states.saving') : t('common:actions.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={isEditElevatorOpen}
          onOpenChange={(open) => {
            setIsEditElevatorOpen(open)
            if (!open) setElevatorToEdit(null)
          }}
        >
          <DialogContent className="max-w-2xl p-0">
            <form
              onSubmit={editElevatorForm.handleSubmit(async (values) => {
                if (!isAdmin || !elevatorToEdit) return
                try {
                  await updateElevatorMutation.mutateAsync({
                    id: elevatorToEdit.id,
                    data: {
                      label: values.label,
                      serial_number: values.serial_number || '',
                      control_group_type: values.control_group_type || '',
                      cabin_door_type: values.cabin_door_type || '',
                      lock_type: values.lock_type || '',
                      machine_room_key: values.machine_room_key || '',
                      comment: values.comment || '',
                    },
                  })
                  toast.success(t('locations:locationDetail.elevatorUpdated'))
                  setIsEditElevatorOpen(false)
                  setElevatorToEdit(null)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t('locations:locationDetail.failedUpdateElevator'))
                }
              })}
              className="flex max-h-[90vh] flex-col"
            >
              <div className="border-b border-zinc-200 px-6 py-4 shrink-0">
                <DialogTitle>{t('locations:locationDetail.editElevator')}</DialogTitle>
                <DialogDescription>{t('locations:locationDetail.updateElevatorDetails')}</DialogDescription>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.label')}</label>
                    <Input {...editElevatorForm.register('label', { required: true })} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.serialNumber2')}</label>
                    <Input {...editElevatorForm.register('serial_number')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.controlType2')}</label>
                    <Input {...editElevatorForm.register('control_group_type')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.cabinDoors2')}</label>
                    <Input {...editElevatorForm.register('cabin_door_type')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.lockType2')}</label>
                    <Input {...editElevatorForm.register('lock_type')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500">{t('locations:locationDetail.machineRoomKey2')}</label>
                    <Input {...editElevatorForm.register('machine_room_key')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-500">{t('common:labels.comment')}</label>
                    <Input {...editElevatorForm.register('comment')} />
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-200 px-6 py-4 flex justify-end gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsEditElevatorOpen(false)
                    setElevatorToEdit(null)
                  }}
                >
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={updateElevatorMutation.isPending}>
                  {updateElevatorMutation.isPending ? t('common:states.saving') : t('common:actions.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-900">{t('locations:locationDetail.statusPerElevator')}</p>
        </div>
        <div className="mt-4 space-y-2">
          {latestRms?.items?.length ? (
            latestRms.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div>
                  <strong>{item.elevator_label}</strong>
                  {item.comment ? <div className="text-xs text-zinc-500">{item.comment}</div> : null}
                </div>
                {getStatusBadge(item.status, t)}
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500">{t('locations:locationDetail.noRmsVisits')}</div>
          )}
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-900">{t('locations:locationDetail.rmsInspections')}</p>
        </div>
        <div className="mt-4 space-y-2">
          {rmsList && rmsList.length > 0 ? (
            rmsList.map((rms) => (
              <div key={rms.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-sm">
                <div>
                  <div className="font-semibold text-zinc-900">
                    {formatDate(rms.visit_date)} {rms.created_at ? new Date(rms.created_at).toLocaleTimeString(getLocale()) : ''}
                  </div>
                  <div className="text-xs text-zinc-500">{rms.notes_general || '—'}</div>
                </div>
                <a
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                  href={pdfUrl(`/api/rms/${rms.id}/pdf`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('common:labels.pdf')}
                </a>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500">{t('locations:locationDetail.noRmsRecordsLocation')}</div>
          )}
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">{t('locations:locationDetail.rmsByMonth')}</p>
        <div className="mt-4 space-y-2">
          {monthlyRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span>{row.label}</span>
              <div className="flex items-center gap-2">
                {row.status === 'done' ? (
                  <Badge className="bg-emerald-100 text-emerald-700">{t('locations:locationDetail.done')}</Badge>
                ) : row.status === 'late' ? (
                  <Badge className="bg-amber-100 text-amber-700">{t('locations:locationDetail.late')}</Badge>
                ) : row.status === 'na' ? (
                  <Badge variant="secondary">{t('common:labels.notAvailable')}</Badge>
                ) : (
                  <Badge className="bg-rose-100 text-rose-700">{t('locations:locationDetail.missing')}</Badge>
                )}
                <span className="text-zinc-500">{row.displayDate ? formatDate(row.displayDate) : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-900">{t('common:labels.interventions')}</p>
        </div>
        <div className="mt-4 space-y-2">
          {interventions && interventions.length > 0 ? (
            interventions.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-sm">
                <div>
                  <div className="font-semibold text-zinc-900">
                    {formatDate(item.date)} {item.created_at ? new Date(item.created_at).toLocaleTimeString(getLocale()) : ''}
                  </div>
                  <div className="text-xs text-zinc-500">{item.technician || '—'}</div>
                  {item.notes ? <div className="text-xs text-zinc-500">{item.notes}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                    <div>
                      {t('locations:locationDetail.technicianSignature')}
                      {item.technician_signature_path ? (
                        <img
                          src={`${API_BASE_URL}${item.technician_signature_path}`}
                          alt={t('common:labels.signatureTechnician')}
                          className="mt-1 h-12 w-auto rounded border border-zinc-200 bg-white"
                        />
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                    <div>
                      {t('locations:locationDetail.clientSignature')}
                      {item.client_signature_path ? (
                        <img
                          src={`${API_BASE_URL}${item.client_signature_path}`}
                          alt={t('common:labels.signatureClient')}
                          className="mt-1 h-12 w-auto rounded border border-zinc-200 bg-white"
                        />
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                  </div>
                </div>
                <a
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                  href={pdfUrl(`/api/interventions/${item.id}/pdf`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('common:labels.pdf')}
                </a>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500">{t('locations:locationDetail.noInterventionsLocation')}</div>
          )}
        </div>
      </Card>
    </div>
  )
}

export default LocationDetailPage
