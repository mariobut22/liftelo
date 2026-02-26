import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
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
import useUsers from '../../hooks/queries/useUsers'
import useLocationElevators from '../../hooks/queries/useLocationElevators'
import { useCreateWorkOrder } from '../../hooks/mutations/useCreateWorkOrder'
import useAuthStore from '../../store/authStore'
import { uploadWorkOrderAttachment } from '../../services/api'

interface WorkOrderFormValues {
  locationName: string
  issuedDate: string
  dueDate: string
  generalComment: string
  items: Array<{ description: string }>
  elevatorIds: string[]
  assignedUserIds: string[]
}

interface WorkOrderCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultItem = { description: '' }
const today = () => new Date().toISOString().slice(0, 10)

function WorkOrderCreateModal({ open, onOpenChange }: WorkOrderCreateModalProps) {
  const { data: locations } = useLocations()
  const { data: users } = useUsers()
  const createWorkOrder = useCreateWorkOrder()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const [locationSearch, setLocationSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<WorkOrderFormValues>({
    defaultValues: {
      locationName: '',
      issuedDate: today(),
      dueDate: '',
      generalComment: '',
      items: [defaultItem],
      elevatorIds: [],
      assignedUserIds: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const { data: elevators } = useLocationElevators(selectedLocationId ?? undefined)

  useEffect(() => {
    if (open && !watch('issuedDate')) {
      setValue('issuedDate', today())
    }
  }, [open, setValue, watch])

  const attachmentPreviews = useMemo(
    () =>
      attachmentFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [attachmentFiles]
  )

  useEffect(() => {
    return () => {
      attachmentPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [attachmentPreviews])

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
      setValue('locationName', location.name)
      setLocationSearch(location.name)
    } else {
      setSelectedLocationId(null)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const location = resolveLocation(values.locationName)
    if (!location) {
      setError('locationName', { message: 'Odaberite lokaciju.' })
      return
    }

    const items = values.items.filter((item) => item.description.trim())
    if (items.length === 0) {
      setError('items', { message: 'Dodajte barem jednu stavku.' })
      return
    }

    try {
      const createdWorkOrder = await createWorkOrder.mutateAsync({
        location_id: location.id,
        issued_date: values.issuedDate || undefined,
        due_date: values.dueDate || undefined,
        general_comment: values.generalComment || undefined,
        items: items.map((item, index) => ({
          description: item.description,
          sort_order: index + 1,
        })),
        elevator_ids: values.elevatorIds.map(Number),
        assigned_user_ids: values.assignedUserIds.map(Number),
      })
      const createdId = typeof createdWorkOrder === 'object' && createdWorkOrder
        ? (createdWorkOrder as { id?: number }).id
        : undefined
      if (createdId && attachmentFiles.length > 0) {
        setIsUploading(true)
        setUploadProgress({ current: 0, total: attachmentFiles.length })
        for (let index = 0; index < attachmentFiles.length; index += 1) {
          const file = attachmentFiles[index]
          setUploadProgress({ current: index + 1, total: attachmentFiles.length })
          await uploadWorkOrderAttachment(createdId, file)
        }
        await queryClient.invalidateQueries({ queryKey: ['workOrder', String(createdId)] })
      }
      toast.success('Radni nalog kreiran.')
      reset({
        locationName: '',
        issuedDate: today(),
        dueDate: '',
        generalComment: '',
        items: [defaultItem],
        elevatorIds: [],
        assignedUserIds: [],
      })
      setLocationSearch('')
      setSelectedLocationId(null)
      setAttachmentFiles([])
      setUploadProgress(null)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Neuspješno spremanje naloga.')
    } finally {
      setIsUploading(false)
    }
  })

  const closeModal = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset({
        locationName: '',
        issuedDate: today(),
        dueDate: '',
        generalComment: '',
        items: [defaultItem],
        elevatorIds: [],
        assignedUserIds: [],
      })
      setLocationSearch('')
      setSelectedLocationId(null)
      setAttachmentFiles([])
      setUploadProgress(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={closeModal}>
      <DialogContent className="max-w-3xl p-0">
        <form onSubmit={onSubmit} className="flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-zinc-200 shrink-0">
            <DialogTitle>Novi radni nalog</DialogTitle>
            <DialogDescription>Forma i ponašanje prate v1.</DialogDescription>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <FormSection title="Osnovno" description="Lokacija i rokovi.">
              <FormGrid columns={2}>
                <div className="space-y-2 md:col-span-2">
                  <FormLabel htmlFor="wo-location">Lokacija</FormLabel>
                  <Input
                    id="wo-location"
                    autoComplete="off"
                    list="wo-locations"
                    {...register('locationName', {
                      required: 'Odaberite lokaciju.',
                      onChange: (event) => setLocationSearch(event.target.value),
                      onBlur: (event) => handleLocationSelect(event.target.value),
                    })}
                  />
                  <datalist id="wo-locations">
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
                  <FormError>{errors.locationName?.message}</FormError>
                </div>

                <div className="space-y-2">
                  <FormLabel htmlFor="wo-issued">Datum izdavanja</FormLabel>
                  <Input id="wo-issued" type="date" {...register('issuedDate')} />
                </div>

                <div className="space-y-2">
                  <FormLabel htmlFor="wo-due" optional>
                    Rok
                  </FormLabel>
                  <Input id="wo-due" type="date" {...register('dueDate')} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <FormLabel htmlFor="wo-comment" optional>
                    Opći komentar
                  </FormLabel>
                  <textarea
                    id="wo-comment"
                    rows={3}
                    {...register('generalComment')}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                  />
                </div>
              </FormGrid>
            </FormSection>

          <FormSection title="Stavke" description="Dodaj stavke naloga.">
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center">
                  <Input
                    id={`wo-item-${field.id}`}
                    placeholder="Opis stavke"
                    {...register(`items.${index}.description` as const)}
                  />
                  <Button type="button" variant="secondary" onClick={() => remove(index)}>
                    Ukloni
                  </Button>
                </div>
              ))}
              <FormError>{errors.items?.message}</FormError>
              <Button type="button" variant="secondary" onClick={() => append(defaultItem)}>
                Dodaj stavku
              </Button>
            </div>
          </FormSection>

          {isAdmin && (
            <FormSection title="Prilozi" description="Dodajte fotografije radnog naloga.">
              <div className="space-y-3">
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setAttachmentFiles(Array.from(event.target.files ?? []))}
                />
                {attachmentPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {attachmentPreviews.map((preview) => (
                      <div key={`${preview.file.name}-${preview.file.lastModified}`} className="h-24 w-24 overflow-hidden rounded-xl border border-zinc-200">
                        <img
                          src={preview.url}
                          alt={preview.file.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormSection>
          )}

          <FormSection title="Dizala" description="Odaberite dizala.">
            <div className="space-y-2">
              {(elevators ?? []).length === 0 ? (
                <div className="text-sm text-zinc-500">Nema dizala za lokaciju.</div>
              ) : (
                <div className="grid gap-2">
                  {(elevators ?? []).map((elevator) => (
                    <label key={elevator.id} className="flex items-center gap-2 text-sm text-zinc-700">
                      <input type="checkbox" value={String(elevator.id)} {...register('elevatorIds')} />
                      <span>{elevator.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </FormSection>

          <FormSection title="Dodijeljeni korisnici" description="Odaberite korisnike.">
            <div className="space-y-2">
              {(users ?? []).length === 0 ? (
                <div className="text-sm text-zinc-500">Nema korisnika.</div>
              ) : (
                <div className="grid gap-2">
                  {(users ?? []).map((user) => (
                    <label key={user.id} className="flex items-center gap-2 text-sm text-zinc-700">
                      <input type="checkbox" value={String(user.id)} {...register('assignedUserIds')} />
                      <span>{user.username}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </FormSection>

          </div>

          <div className="px-6 py-4 border-t border-zinc-200 shrink-0 bg-white">
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => closeModal(false)}>
                Odustani
              </Button>
              <Button type="submit" disabled={createWorkOrder.isPending || isUploading}>
                {createWorkOrder.isPending
                  ? 'Spremanje...'
                  : isUploading && uploadProgress
                    ? `Upload ${uploadProgress.current}/${uploadProgress.total}`
                    : 'Spremi nalog'}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default WorkOrderCreateModal
