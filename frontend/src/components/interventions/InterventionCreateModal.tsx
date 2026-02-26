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
import { signReport } from '../../services/api'

interface InterventionFormValues {
  technician: string
  second_technician: string
  location: string
  notes: string
  date: string
  status: string
  elevator_items: Array<{ elevator_label: string; status: string; comment: string }>
  images: FileList | null
}

interface InterventionCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const statusOptions = [
  'O.K.',
  'Potreban popravak - Dizalo u funkciji',
  'Potreban popravak - Dizalo nije u funkciji',
] as const

const today = () => new Date().toISOString().slice(0, 10)

function InterventionCreateModal({ open, onOpenChange }: InterventionCreateModalProps) {
  const { data: locations } = useLocations()
  const { data: users } = useUsers()
  const authUser = useAuthStore((state) => state.user)
  const createIntervention = useCreateIntervention()
  const [locationSearch, setLocationSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSigned, setIsSigned] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const techSignatureRef = useRef<SignaturePadHandle | null>(null)
  const clientSignatureRef = useRef<SignaturePadHandle | null>(null)

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
      images: null,
    },
  })

  const { data: elevators } = useLocationElevators(selectedLocationId ?? undefined)
  const { fields, replace } = useFieldArray({ control, name: 'elevator_items' })

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
      setError('location', { message: 'Lokacija nije pronađena.' })
      return
    }

    const payload = {
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
      images: values.images ? Array.from(values.images) : undefined,
    }

    try {
      const result = await createIntervention.mutateAsync(payload)
      const interventionId = result?.id
      if (!interventionId) {
        toast.success('Intervencija je spremljena.')
        reset({
          technician: authUser?.username || '',
          second_technician: '',
          location: '',
          notes: '',
          date: today(),
          status: 'O.K.',
          elevator_items: [],
          images: null,
        })
        setImagePreview(null)
        setLocationSearch('')
        setSelectedLocationId(null)
        onOpenChange(false)
        return
      }

      const techSignature = techSignatureRef.current?.getPngDataUrl() || null
      const clientSignature = clientSignatureRef.current?.getPngDataUrl() || null

      if (!techSignature || !clientSignature) {
        toast.error('Potrebna su oba potpisa prije zaključavanja.')
        return
      }

      setIsSigning(true)
      await signReport({
        type: 'intervention',
        id: interventionId,
        technician: techSignature,
        client: clientSignature,
      })
      setIsSigned(true)
      toast.success('Intervencija je potpisana i zaključana.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Greška pri dodavanju intervencije.')
    } finally {
      setIsSigning(false)
    }
  })

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
        images: null,
      })
      setImagePreview(null)
      setLocationSearch('')
      setSelectedLocationId(null)
      setIsSigned(false)
      setIsSigning(false)
      techSignatureRef.current?.clear()
      clientSignatureRef.current?.clear()
    }
    onOpenChange(nextOpen)
  }

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setImagePreview(url)
    setValue('images', event.target.files)
  }

  return (
    <Dialog open={open} onOpenChange={closeModal}>
      <DialogContent className="max-w-3xl p-0">
        <form onSubmit={onSubmit} className="flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-zinc-200 shrink-0">
            <DialogTitle>Nova intervencija</DialogTitle>
            <DialogDescription>Forma i ponašanje prate v1.</DialogDescription>
          </div>

          <div className="relative flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {isSigned ? (
              <div className="relative z-20 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                <span className="font-semibold">✓ Potpisano</span>
                <span>Intervencija je zaključana.</span>
              </div>
            ) : null}
            {isSigned ? <div className="absolute inset-0 z-10 bg-white/60" /> : null}
            <FormSection title="Serviseri i lokacija" description="Pretraga lokacije kao u v1.">
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="int-tech">Serviser (automatski)</FormLabel>
                  <Input id="int-tech" readOnly {...register('technician')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="int-second">Drugi serviser (opcionalno)</FormLabel>
                  <Input id="int-second" list="int-technicians" {...register('second_technician')} />
                  <datalist id="int-technicians">
                    {(users ?? []).map((user) => (
                      <option key={user.id} value={user.username} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <FormLabel htmlFor="int-location">Lokacija</FormLabel>
                  <Input
                    id="int-location"
                    autoComplete="off"
                    list="int-locations"
                    {...register('location', {
                      required: 'Odaberite lokaciju.',
                      onChange: (event) => setLocationSearch(event.target.value),
                      onBlur: (event) => handleLocationSelect(event.target.value),
                    })}
                  />
                  <datalist id="int-locations">
                    {(locations ?? []).map((location) => (
                      <option key={location.id} value={location.name} />
                    ))}
                  </datalist>
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
                  <FormError>{errors.location?.message}</FormError>
                </div>
              </FormGrid>
            </FormSection>

          <FormSection title="Opis" description="Opis / komentar.">
            <textarea
              id="int-notes"
              rows={4}
              {...register('notes')}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </FormSection>

          <FormSection title="Dizala" description="Status po dizalu (v1).">
            {(elevators ?? []).length === 0 ? (
              <div className="text-sm text-zinc-500">Nema dizala za ovu lokaciju.</div>
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
                          {option}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="Komentar (opcionalno)"
                      {...register(`elevator_items.${index}.comment` as const)}
                      className="flex-1 min-w-[220px]"
                    />
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          <FormSection title="Slike" description="Priloži slike (opcionalno).">
            <Input id="int-images" type="file" accept="image/*" multiple onChange={handleImageChange} />
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="mt-3 h-24 w-24 rounded-lg object-cover" />
            ) : null}
          </FormSection>

            <FormSection title="Datum i status" description="Datum intervencije i status.">
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="int-date">Datum</FormLabel>
                  <Input id="int-date" type="date" {...register('date')} />
                </div>
              <div className="space-y-2">
                <FormLabel htmlFor="int-status">Status</FormLabel>
                <select
                  id="int-status"
                  {...register('status')}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              </FormGrid>
            </FormSection>

            <FormSection title="Potpisi" description="Potpis tehničara i klijenta prije zaključavanja.">
              <div className="grid gap-4 md:grid-cols-2">
                <SignaturePad ref={techSignatureRef} label="Potpis tehničara" disabled={isSigned} />
                <SignaturePad ref={clientSignatureRef} label="Potpis klijenta" disabled={isSigned} />
              </div>
            </FormSection>

          </div>

          <div className="px-6 py-4 border-t border-zinc-200 shrink-0 bg-white">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => closeModal(false)}>
                Odustani
              </Button>
              <Button type="submit" disabled={createIntervention.isPending || isSigning || isSigned}>
                {isSigning ? 'Potpisujem...' : createIntervention.isPending ? 'Spremanje...' : 'Potpiši i Zaključi'}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default InterventionCreateModal
