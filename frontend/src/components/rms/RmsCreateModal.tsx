import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

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
import { useCreateRms } from '../../hooks/mutations/useCreateRms'
import SignaturePad, { type SignaturePadHandle } from '../SignaturePad'
import { signReport } from '../../services/api'

const statusOptions = [
  { value: 'O.K.', labelKey: 'create.statusOptions.ok' },
  {
    value: 'Potreban popravak - Dizalo u funkciji',
    labelKey: 'create.statusOptions.repairInService',
  },
  {
    value: 'Potreban popravak - Dizalo nije u funkciji',
    labelKey: 'create.statusOptions.repairOutOfService',
  },
] as const

const componentChecks = [
  { key: 'locks', labelKey: 'create.componentChecks.locks' },
  { key: 'governors', labelKey: 'create.componentChecks.governors' },
  { key: 'motor', labelKey: 'create.componentChecks.motor' },
  { key: 'machineRoom', labelKey: 'create.componentChecks.machineRoom' },
  { key: 'lighting', labelKey: 'create.componentChecks.lighting' },
  { key: 'cabinDoors', labelKey: 'create.componentChecks.cabinDoors' },
] as const

type RmsFormValues = {
  technician: string
  secondTechnician: string
  address: string
  rms_period: string
  rms_attributed_month: string
  notes: string
  status: string
  date: string
  items: Array<{
    elevator_label: string
    status: string
    comment: string
  }>
}

interface RmsCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const buildRmsMonth = (value: string) => {
  const match = value.trim().match(/^\s*(\d{2})\/(\d{4})\s*$/)
  if (!match) return undefined
  return `${match[2]}-${match[1]}-01`
}

const getToday = () => new Date().toISOString().slice(0, 10)

function RmsCreateModal({ open, onOpenChange }: RmsCreateModalProps) {
  const { t } = useTranslation('rms')
  const { data: locations } = useLocations()
  const { data: users } = useUsers()
  const authUser = useAuthStore((state) => state.user)
  const createRms = useCreateRms()
  const [locationSearch, setLocationSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [isSigned, setIsSigned] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const techSignatureRef = useRef<SignaturePadHandle | null>(null)
  const clientSignatureRef = useRef<SignaturePadHandle | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<RmsFormValues>({
    defaultValues: {
      technician: '',
      secondTechnician: '',
      address: '',
      rms_period: '',
      rms_attributed_month: '',
      notes: '',
      status: 'O.K.',
      date: getToday(),
      items: [],
    },
  })

  const { data: elevators, isLoading: elevatorsLoading } = useLocationElevators(selectedLocationId ?? undefined)
  const { fields, replace } = useFieldArray({ control, name: 'items' })

  useEffect(() => {
    if (authUser?.username) {
      setValue('technician', authUser.username)
    }
  }, [authUser, setValue])

  useEffect(() => {
    if (open && !watch('date')) {
      setValue('date', getToday())
    }
  }, [open, setValue, watch])

  useEffect(() => {
    if (!elevators || elevators.length === 0) {
      replace([])
      return
    }

    replace(
      elevators.map((elevator) => ({
        elevator_label: elevator.label,
        status: 'O.K.',
        comment: '',
      }))
    )
  }, [elevators, replace])

  const filteredLocations = useMemo(() => {
    const list = locations ?? []
    const query = locationSearch.trim().toLowerCase()
    if (!query) return []
    return list.filter((location) =>
      (location.address || '').toLowerCase().includes(query) ||
      (location.name || '').toLowerCase().includes(query)
    )
  }, [locationSearch, locations])

  const resolveLocation = (value: string) => {
    const list = locations ?? []
    const target = value.trim().toLowerCase()
    return list.find((location) =>
      (location.address || '').toLowerCase() === target ||
      (location.name || '').toLowerCase() === target
    )
  }

  const handleLocationSelect = (value: string) => {
    const location = resolveLocation(value)
    if (location) {
      setSelectedLocationId(location.id)
      setValue('address', location.address || location.name)
      setLocationSearch(location.address || location.name)
    } else {
      setSelectedLocationId(null)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const location = resolveLocation(values.address)
    if (!location) {
      setError('address', { message: t('create.errors.locationNotFound') })
      return
    }

    if (fields.length === 0 && !values.notes.trim()) {
      setError('notes', { message: t('create.errors.noteOrElevatorsRequired') })
      return
    }

    try {
      const result = await createRms.mutateAsync({
        location_id: location.id,
        visit_date: values.date,
        rms_month: buildRmsMonth(values.rms_attributed_month),
        notes_general: values.notes || undefined,
        items: values.items.map((item) => ({
          elevator_label: item.elevator_label,
          status: item.status as (typeof statusOptions)[number]['value'],
          comment: item.comment || '',
        })),
      })
      const rmsId = result?.id
      if (!rmsId) {
        toast.success(t('create.toast.saved'))
        reset()
        setLocationSearch('')
        setSelectedLocationId(null)
        onOpenChange(false)
        return
      }

      const techSignature = techSignatureRef.current?.getPngDataUrl() || null
      const clientSignature = clientSignatureRef.current?.getPngDataUrl() || null

      if (!techSignature || !clientSignature) {
        toast.error(t('create.toast.signaturesRequired'))
        return
      }

      setIsSigning(true)
      await signReport({
        type: 'rms',
        id: rmsId,
        technician: techSignature,
        client: clientSignature,
      })
      setIsSigned(true)
      toast.success(t('create.toast.signed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('create.toast.saveFailed'))
    } finally {
      setIsSigning(false)
    }
  })

  const closeModal = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset()
      setLocationSearch('')
      setSelectedLocationId(null)
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
            <DialogTitle>{t('create.title')}</DialogTitle>
            <DialogDescription>{t('create.description')}</DialogDescription>
          </div>

          <div className="relative flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {isSigned ? (
              <div className="relative z-20 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                <span className="font-semibold">{t('create.status.signed')}</span>
                <span>{t('create.status.locked')}</span>
              </div>
            ) : null}
            {isSigned ? <div className="absolute inset-0 z-10 bg-white/60" /> : null}
            <FormSection title={t('create.sections.technicians.title')} description={t('create.sections.technicians.description')}>
                <FormGrid columns={2}>
                  <div className="space-y-2">
                    <FormLabel htmlFor="rms-technician">{t('create.labels.technician')}</FormLabel>
                    <Input id="rms-technician" readOnly {...register('technician')} />
                  </div>
                  <div className="space-y-2">
                    <FormLabel htmlFor="rms-second">{t('create.labels.secondTechnician')}</FormLabel>
                    <Input id="rms-second" list="rms-technicians" {...register('secondTechnician')} />
                    <datalist id="rms-technicians">
                      {(users ?? []).map((user) => (
                        <option key={user.id} value={user.username} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <FormLabel htmlFor="rms-address">{t('create.labels.address')}</FormLabel>
                    <Input
                      id="rms-address"
                      autoComplete="off"
                      list="rms-locations"
                      {...register('address', {
                        required: t('create.errors.locationRequired'),
                        onChange: (event) => setLocationSearch(event.target.value),
                        onBlur: (event) => handleLocationSelect(event.target.value),
                      })}
                    />
                    <datalist id="rms-locations">
                      {(locations ?? []).map((location) => (
                        <option key={location.id} value={location.address || location.name} />
                      ))}
                    </datalist>
                    <ul className="mt-2 rounded-lg border border-zinc-200 bg-white text-sm">
                      {filteredLocations.slice(0, 5).map((location) => (
                        <li
                          key={location.id}
                          className="cursor-pointer px-3 py-2 hover:bg-zinc-50"
                          onClick={() => handleLocationSelect(location.address || location.name)}
                        >
                          <strong>{location.name}</strong>
                          <div className="text-xs text-zinc-500">{location.address}</div>
                        </li>
                      ))}
                    </ul>
                    <FormError>{errors.address?.message}</FormError>
                  </div>
                </FormGrid>
              </FormSection>

            <FormSection title={t('create.sections.periods.title')} description={t('create.sections.periods.description')}>
                <FormGrid columns={2}>
                  <div className="space-y-2">
                    <FormLabel htmlFor="rms-period">{t('create.labels.period')}</FormLabel>
                    <Input id="rms-period" placeholder={t('create.placeholders.period')} {...register('rms_period')} />
                  </div>
                  <div className="space-y-2">
                    <FormLabel htmlFor="rms-attributed">{t('create.labels.attributedMonth')}</FormLabel>
                    <Input id="rms-attributed" placeholder={t('create.placeholders.attributedMonth')} {...register('rms_attributed_month')} />
                  </div>
                </FormGrid>
              </FormSection>

              <FormSection title={t('create.sections.components.title')} description={t('create.sections.components.description')}>
                <div className="space-y-2">
                  {componentChecks.map((check) => (
                    <div key={check.key} className="grid grid-cols-[2fr_1fr_1fr_2fr] items-center gap-2">
                      <div className="text-sm font-medium text-zinc-700">{t(check.labelKey)}</div>
                      <input type="radio" name={`${check.key}_status`} value="radi" />
                      <input type="radio" name={`${check.key}_status`} value="ne_radi" />
                      <Input name={`${check.key}_comment`} placeholder={t('create.placeholders.comment')} />
                    </div>
                  ))}
                </div>
              </FormSection>

              <FormSection title={t('create.sections.elevators.title')} description={t('create.sections.elevators.description')}>
                {elevatorsLoading ? (
                  <div className="text-sm text-zinc-500">{t('create.loading.elevators')}</div>
                ) : fields.length === 0 ? (
                  <div className="text-sm text-zinc-500">{t('create.empty.elevators')}</div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-3">
                        <span className="text-sm font-semibold text-zinc-700">{field.elevator_label}</span>
                        <select
                          {...register(`items.${index}.status` as const)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {t(option.labelKey)}
                            </option>
                          ))}
                        </select>
                        <Input
                          placeholder={t('create.placeholders.optionalComment')}
                          {...register(`items.${index}.comment` as const)}
                          className="flex-1 min-w-[220px]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </FormSection>

              <FormSection title={t('create.sections.notes.title')} description={t('create.sections.notes.description')}>
                <FormGrid columns={2}>
                  <div className="space-y-2">
                    <FormLabel htmlFor="rms-notes" optional>
                      {t('create.labels.generalNote')}
                    </FormLabel>
                    <textarea
                      id="rms-notes"
                      rows={4}
                      {...register('notes')}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                    />
                    <FormError>{errors.notes?.message}</FormError>
                  </div>
                  <div className="space-y-2">
                    <FormLabel htmlFor="rms-status">{t('create.labels.status')}</FormLabel>
                    <select
                      id="rms-status"
                      {...register('status')}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </FormGrid>
              </FormSection>

              <FormSection title={t('create.sections.documents.title')} description={t('create.sections.documents.description')}>
                <Input type="file" multiple />
              </FormSection>

            <FormSection title={t('create.sections.date.title')} description={t('create.sections.date.description')}>
              <div className="space-y-2">
                <FormLabel htmlFor="rms-date">{t('create.labels.date')}</FormLabel>
                <Input id="rms-date" type="date" {...register('date', { required: t('create.errors.dateRequired') })} />
                <FormError>{errors.date?.message}</FormError>
              </div>
            </FormSection>

            <FormSection title={t('create.sections.signatures.title')} description={t('create.sections.signatures.description')}>
              <div className="grid gap-4 md:grid-cols-2">
                <SignaturePad
                  ref={techSignatureRef}
                  label={t('create.labels.signatureTechnician')}
                  clearLabel={t('create.actions.clearSignature')}
                  disabled={isSigned}
                />
                <SignaturePad
                  ref={clientSignatureRef}
                  label={t('create.labels.signatureClient')}
                  clearLabel={t('create.actions.clearSignature')}
                  disabled={isSigned}
                />
              </div>
            </FormSection>

          </div>

          <div className="px-6 py-4 border-t border-zinc-200 shrink-0 bg-white">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => closeModal(false)}>
                {t('create.actions.cancel')}
              </Button>
              <Button type="submit" disabled={createRms.isPending || isSigning || isSigned}>
                {isSigning ? t('create.actions.signing') : createRms.isPending ? t('create.actions.saving') : t('create.actions.submit')}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default RmsCreateModal
