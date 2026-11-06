import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import FormSection from '../form/FormSection'
import FormGrid from '../form/FormGrid'
import FormLabel from '../form/FormLabel'
import FormError from '../form/FormError'
import FormActions from '../form/FormActions'
import useLocations from '../../hooks/queries/useLocations'
import useLocationElevators from '../../hooks/queries/useLocationElevators'
import useUsers from '../../hooks/queries/useUsers'
import useAuthStore from '../../store/authStore'
import { useCreateIntervention } from '../../hooks/mutations/useCreateIntervention'
import SignaturePad, { type SignaturePadHandle } from '../SignaturePad'
import PhotoPicker from '../photos/PhotoPicker'
import { usePhotoQueue } from '../../hooks/usePhotoQueue'
import { signReport, type CreateInterventionPayload } from '../../services/api'
import { canQueueOffline, enqueueItem, isNetworkFailure, isOffline, newRecordId, signatureBlob } from '../../lib/offline/enqueue'
import { RMS_STATUS_VALUES, rmsStatusLabel } from '../../lib/rmsStatus'
import { useTranslation } from 'react-i18next'

interface InterventionFormValues {
  technician: string
  second_technician: string
  location: string
  notes: string
  date: string
  status: string
  elevator_items: Array<{ elevator_label: string; status: string; comment: string }>
}

interface InterventionCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional: preselect this location when the dialog opens (used by the QR landing page). */
  presetLocationId?: number | null
  /** Optional: with presetLocationId, start with only this elevator in the list (QR scan); the rest can be added. */
  presetElevatorId?: number | null
}

const statusOptions = RMS_STATUS_VALUES

const today = () => new Date().toISOString().slice(0, 10)

function InterventionCreateModal({ open, onOpenChange, presetLocationId, presetElevatorId }: InterventionCreateModalProps) {
  const { t } = useTranslation()

  const { data: locations } = useLocations()
  const { data: users } = useUsers()
  const authUser = useAuthStore((state) => state.user)
  const createIntervention = useCreateIntervention()
  const [locationSearch, setLocationSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const photos = usePhotoQueue()
  // set once the intervention exists, so a retry after a failed photo/signature never creates a second one
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [isSigned, setIsSigned] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const techSignatureRef = useRef<SignaturePadHandle | null>(null)
  const clientSignatureRef = useRef<SignaturePadHandle | null>(null)
  // one id per record: every retry (also after a lost connection) re-sends it, so the server never stores it twice
  const requestIdRef = useRef<string>(newRecordId())
  // what was submitted, so "save on this device" can be done from any step (create / photos / sign)
  const draftRef = useRef<{ payload: CreateInterventionPayload; label: string } | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<InterventionFormValues>({
    defaultValues: {
      technician: '',
      second_technician: '',
      location: '',
      notes: '',
      date: today(),
      status: 'O.K.',
      elevator_items: [],
    },
  })

  const { data: elevators } = useLocationElevators(selectedLocationId ?? undefined)
  const { fields, replace, append } = useFieldArray({ control, name: 'elevator_items' })
  // Exact-elevator preselection (QR scan): only that elevator, until the user adds the others
  const [showAllElevators, setShowAllElevators] = useState(false)
  const showAllRef = useRef(false)
  const onlyElevatorId =
    presetElevatorId && presetLocationId && selectedLocationId === presetLocationId && !showAllElevators ? presetElevatorId : null
  const presetFound = Boolean(onlyElevatorId && elevators?.some((elevator) => elevator.id === onlyElevatorId))
  const hiddenElevators = presetFound ? (elevators ?? []).filter((elevator) => elevator.id !== onlyElevatorId) : []

  useEffect(() => {
    if (authUser?.username) {
      setValue('technician', authUser.username)
    }
  }, [authUser, setValue])

  useEffect(() => {
    if (open && !watch('date')) {
      setValue('date', today())
    }
  }, [open, setValue, watch])

  useEffect(() => {
    if (!elevators || elevators.length === 0) {
      replace([])
      return
    }

    const only =
      presetElevatorId && presetLocationId && selectedLocationId === presetLocationId && !showAllRef.current
        ? elevators.find((elevator) => elevator.id === presetElevatorId)
        : undefined
    replace(
      (only ? [only] : elevators).map((elevator) => ({
        elevator_label: elevator.label,
        status: 'O.K.',
        comment: '',
      }))
    )
  }, [elevators, replace, presetElevatorId, presetLocationId, selectedLocationId])

  const addOtherElevators = () => {
    showAllRef.current = true
    setShowAllElevators(true)
    append(hiddenElevators.map((elevator) => ({ elevator_label: elevator.label, status: 'O.K.', comment: '' })))
  }

  useEffect(() => {
    if (!open || !presetLocationId || selectedLocationId === presetLocationId) return
    const preset = (locations ?? []).find((location) => location.id === presetLocationId)
    if (!preset) return
    setSelectedLocationId(preset.id)
    setValue('location', preset.name)
  }, [open, presetLocationId, locations, selectedLocationId, setValue])

  const filteredLocations = useMemo(() => {
    const list = locations ?? []
    const query = locationSearch.trim().toLowerCase()
    if (!query) return []
    return list.filter((location) =>
      (location.name || '').toLowerCase().includes(query) ||
      (location.address || '').toLowerCase().includes(query)
    )
  }, [locationSearch, locations])

  const resolveLocation = (value: string) => {
    const list = locations ?? []
    const target = value.trim()
    return list.find((location) => location.name === target) || null
  }

  const handleLocationSelect = (value: string) => {
    const location = resolveLocation(value)
    if (location) {
      setSelectedLocationId(location.id)
      setValue('location', location.name)
      setLocationSearch(location.name)
    } else {
      setSelectedLocationId(null)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const location = resolveLocation(values.location)
    if (!location) {
      setError('location', { message: t('interventions:interventionCreateModal.locationNotFound') })
      return
    }

    if (photos.items.some((item) => item.status === 'processing')) {
      toast.error(t('interventions:photos.status.processing'))
      return
    }

    // Both signatures are needed to lock; check BEFORE anything is created so nothing is left half-done
    if (!techSignatureRef.current?.getPngDataUrl() || !clientSignatureRef.current?.getPngDataUrl()) {
      toast.error(t('interventions:interventionCreateModal.bothSignaturesAreRequiredBefore'))
      return
    }

    const payload: CreateInterventionPayload = {
      technician: values.technician,
      second_technician: values.second_technician || undefined,
      location: location.name,
      notes: values.notes || undefined,
      date: values.date,
      status: values.status || undefined,
      elevator_items: values.elevator_items.map((item) => ({
        elevator_label: item.elevator_label,
        status: item.status || 'O.K.',
        comment: item.comment || '',
      })),
      client_request_id: requestIdRef.current,
    }
    draftRef.current = { payload, label: location.name }

    // No connection: keep the whole entry (form data, compressed photos, both signatures) on this device
    if (isOffline() && canQueueOffline() && !createdId) {
      await saveOnDevice(null, false)
      return
    }

    try {
      let interventionId = createdId
      if (!interventionId) {
        const result = await createIntervention.mutateAsync(payload)
        interventionId = result?.id ?? null
        if (!interventionId) {
          toast.success(t('common:toast.sentSuccessfully'))
          closeModal(false)
          return
        }
        setCreatedId(interventionId)
      }
      await completeReport(interventionId)
    } catch (error) {
      if (isNetworkFailure(error) && canQueueOffline()) {
        await saveOnDevice(createdId, true)
        return
      }
      toast.error(error instanceof Error ? error.message : t('interventions:interventionCreateModal.failedAddIntervention'))
    }
  })

  // Stores the entry in the outbox (resumable: serverId + per-photo done flags) and closes the form.
  async function saveOnDevice(serverId: number | null, afterFailedAttempt: boolean) {
    const draft = draftRef.current
    const techSignature = techSignatureRef.current?.getPngDataUrl() || null
    const clientSignature = clientSignatureRef.current?.getPngDataUrl() || null
    if (!draft || !techSignature || !clientSignature) {
      toast.error(t('offline:toast.saveFailed'))
      return
    }
    try {
      const { client_request_id: _id, images: _images, ...rest } = draft.payload
      void _id
      void _images
      await enqueueItem({
        id: requestIdRef.current,
        kind: 'intervention',
        payload: rest as unknown as Record<string, unknown>,
        photos: photos.snapshot(),
        signatures: { technician: signatureBlob(techSignature), client: signatureBlob(clientSignature) },
        serverId: serverId ?? createdId,
        label: draft.label,
        afterFailedAttempt,
      })
      toast.success(t('offline:toast.saved'))
      closeModal(false)
    } catch (error) {
      console.error('[intervention] could not save on device', error)
      toast.error(t('offline:toast.saveFailed'))
    }
  }

  // After the intervention exists: photos one by one (progress + retry per photo), then signing, which locks the report.
  // Also used by the per-photo "try again" button, so a retry that succeeds finishes the whole flow.
  async function completeReport(interventionId: number) {
    const techSignature = techSignatureRef.current?.getPngDataUrl() || null
    const clientSignature = clientSignatureRef.current?.getPngDataUrl() || null
    if (!techSignature || !clientSignature) {
      toast.error(t('interventions:interventionCreateModal.bothSignaturesAreRequiredBefore'))
      return
    }
    const upload = await photos.uploadAll(interventionId)
    if (upload.pending > 0) {
      if (upload.network > 0 && canQueueOffline()) {
        await saveOnDevice(interventionId, true)
        return
      }
      toast.error(t('interventions:photos.someFailed'))
      return
    }
    setIsSigning(true)
    try {
      await signReport({ type: 'intervention', id: interventionId, technician: techSignature, client: clientSignature })
      toast.success(t('common:toast.sentSuccessfully'))
      closeModal(false)
    } catch (error) {
      if (isNetworkFailure(error) && canQueueOffline()) {
        await saveOnDevice(interventionId, true)
        return
      }
      toast.error(error instanceof Error ? error.message : t('interventions:interventionCreateModal.failedAddIntervention'))
    } finally {
      setIsSigning(false)
    }
  }

  const retryPhotos = async () => {
    if (!createdId) return
    try {
      await completeReport(createdId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('interventions:interventionCreateModal.failedAddIntervention'))
    }
  }

  const closeModal = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset({
        technician: authUser?.username || '',
        second_technician: '',
        location: '',
        notes: '',
        date: today(),
        status: 'O.K.',
        elevator_items: [],
      })
      photos.reset()
      requestIdRef.current = newRecordId()
      draftRef.current = null
      setCreatedId(null)
      setLocationSearch('')
      setSelectedLocationId(null)
      setShowAllElevators(false)
      showAllRef.current = false
      setIsSigned(false)
      setIsSigning(false)
      techSignatureRef.current?.clear()
      clientSignatureRef.current?.clear()
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={closeModal}>
      <DialogContent className="max-w-3xl p-0">
        <form onSubmit={onSubmit} className="flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-zinc-200 shrink-0">
            <DialogTitle>{t('interventions:interventionCreateModal.newIntervention')}</DialogTitle>
            <DialogDescription>{t('interventions:interventionCreateModal.enterDetailsNewIntervention')}</DialogDescription>
          </div>

          <div className="relative flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {isSigned ? (
              <div className="relative z-20 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                <span className="font-semibold">{t('common:labels.signed')}</span>
                <span>{t('interventions:interventionCreateModal.interventionLocked')}</span>
              </div>
            ) : null}
            {isSigned ? <div className="absolute inset-0 z-10 bg-white/60" /> : null}
            <FormSection title={t('interventions:interventionCreateModal.techniciansLocation')} description={t('interventions:interventionCreateModal.selectTechniciansLocation')}>
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="int-tech">{t('interventions:interventionCreateModal.technicianAuto')}</FormLabel>
                  <Input id="int-tech" readOnly {...register('technician')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="int-second">{t('interventions:interventionCreateModal.secondTechnicianOptional')}</FormLabel>
                  <Input id="int-second" list="int-technicians" {...register('second_technician')} />
                  <datalist id="int-technicians">
                    {(users ?? []).map((user) => (
                      <option key={user.id} value={user.username} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <FormLabel htmlFor="int-location">{t('common:labels.location')}</FormLabel>
                  <Input
                    id="int-location"
                    autoComplete="off"
                    {...register('location', {
                      required: t('common:validation.selectLocation'),
                      onChange: (event) => setLocationSearch(event.target.value),
                      onBlur: (event) => handleLocationSelect(event.target.value),
                    })}
                  />
                  {filteredLocations.length > 0 ? (
                    <ul className="mt-2 rounded-lg border border-zinc-200 bg-white text-sm">
                      {filteredLocations.slice(0, 5).map((location) => (
                        <li
                          key={location.id}
                          className="cursor-pointer px-3 py-2 hover:bg-zinc-50"
                          onClick={() => handleLocationSelect(location.name)}
                        >
                          <strong>{location.name}</strong>
                          <div className="text-xs text-zinc-500">{location.address}</div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <FormError>{errors.location?.message}</FormError>
                </div>
              </FormGrid>
            </FormSection>

          <FormSection title={t('common:labels.description')} description={t('interventions:interventionCreateModal.descriptionComment')}>
            <textarea
              id="int-notes"
              rows={4}
              {...register('notes')}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </FormSection>

          <FormSection title={t('common:labels.elevators')} description={t('interventions:interventionCreateModal.statusPerElevator')}>
            {(elevators ?? []).length === 0 ? (
              <div className="text-sm text-zinc-500">{t('common:empty.noElevatorsForLocation')}</div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-3">
                    <span className="text-sm font-semibold text-zinc-700">{field.elevator_label}</span>
                    <select
                      {...register(`elevator_items.${index}.status` as const)}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {rmsStatusLabel(t, option)}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder={t('common:labels.commentOptional')}
                      {...register(`elevator_items.${index}.comment` as const)}
                      className="flex-1 min-w-[220px]"
                    />
                  </div>
                ))}
                {hiddenElevators.length > 0 ? (
                  <Button type="button" variant="outline" className="h-11 w-full" onClick={addOtherElevators}>
                    {t('interventions:interventionCreateModal.addOtherElevators', { n: hiddenElevators.length })}
                  </Button>
                ) : null}
              </div>
            )}
          </FormSection>

          <FormSection title={t('common:labels.images')} description={t('interventions:interventionCreateModal.attachImagesOptional')}>
            <PhotoPicker queue={photos} disabled={isSigned || isSigning || createIntervention.isPending} onRetry={retryPhotos} />
          </FormSection>

            <FormSection title={t('interventions:interventionCreateModal.dateStatus')} description={t('interventions:interventionCreateModal.interventionDateStatus')}>
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="int-date">{t('common:labels.date')}</FormLabel>
                  <Input id="int-date" type="date" {...register('date')} />
                </div>
              <div className="space-y-2">
                <FormLabel htmlFor="int-status">{t('common:labels.status')}</FormLabel>
                <select
                  id="int-status"
                  {...register('status')}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {rmsStatusLabel(t, option)}
                    </option>
                  ))}
                </select>
              </div>
              </FormGrid>
            </FormSection>

            <FormSection title={t('common:labels.signatures')} description={t('interventions:interventionCreateModal.technicianClientSignaturesBeforeLocking')}>
              <div className="grid gap-4 md:grid-cols-2">
                <SignaturePad ref={techSignatureRef} label={t('common:labels.signatureTechnician')} disabled={isSigned} />
                <SignaturePad ref={clientSignatureRef} label={t('common:labels.signatureClient')} disabled={isSigned} />
              </div>
            </FormSection>

          </div>

          <div className="px-6 py-4 border-t border-zinc-200 shrink-0 bg-white">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => closeModal(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={createIntervention.isPending || isSigning || isSigned || photos.items.some((item) => item.status === 'processing' || item.status === 'uploading')}>
                {isSigning ? t('common:states.signing') : createIntervention.isPending ? t('common:states.saving') : t('interventions:interventionCreateModal.signLock')}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default InterventionCreateModal
