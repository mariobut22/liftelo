import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import FormActions from '../form/FormActions'
import FormError from '../form/FormError'
import FormGrid from '../form/FormGrid'
import FormLabel from '../form/FormLabel'
import FormSection from '../form/FormSection'
import type { Vehicle } from '../../types/vehicle'
import useAuthStore from '../../store/authStore'
import { useUpdateVehicle } from '../../hooks/mutations/useUpdateVehicle'
import { API_BASE_URL } from '../../services/api'

type VehicleFormValues = {
  name: string
  year: string
  last_registration_date: string
  registration_expiry_date: string
  image: FileList
}

interface VehicleEditModalProps {
  open: boolean
  vehicle: Vehicle | null
  onOpenChange: (open: boolean) => void
}

const toDateInput = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function VehicleEditModal({ open, vehicle, onOpenChange }: VehicleEditModalProps) {
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const updateVehicle = useUpdateVehicle(vehicle?.id ?? 0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    defaultValues: {
      name: vehicle?.name ?? '',
      year: vehicle?.year ? String(vehicle.year) : '',
      last_registration_date: toDateInput(vehicle?.last_registration_date),
      registration_expiry_date: toDateInput(vehicle?.registration_expiry_date),
    },
  })

  useEffect(() => {
    if (!open || !vehicle) return
    reset({
      name: vehicle.name ?? '',
      year: vehicle.year ? String(vehicle.year) : '',
      last_registration_date: toDateInput(vehicle.last_registration_date),
      registration_expiry_date: toDateInput(vehicle.registration_expiry_date),
    })
    setPreviewUrl(null)
  }, [open, reset, vehicle])

  const imageFiles = watch('image')
  const selectedImage = useMemo(() => imageFiles?.[0] ?? null, [imageFiles])

  useEffect(() => {
    if (vehicle?.image_path) {
      console.log('Vehicle edit image path:', vehicle.image_path)
    }
  }, [vehicle?.image_path])

  const apiBaseUrl = API_BASE_URL
  const resolveImageUrl = (path?: string | null) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    if (path.startsWith('/uploads')) return `${apiBaseUrl}${path}`
    return path
  }

  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(selectedImage)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedImage])

  const onSubmit = handleSubmit(async (values) => {
    if (!isAdmin || !vehicle) return
    if (!values.name.trim() || !values.year || !values.last_registration_date || !values.registration_expiry_date) {
      setError('name', { message: 'Popuni sva obavezna polja.' })
      return
    }

    const lastDate = new Date(values.last_registration_date)
    const expiryDate = new Date(values.registration_expiry_date)
    if (Number.isNaN(lastDate.getTime()) || Number.isNaN(expiryDate.getTime())) {
      setError('registration_expiry_date', { message: 'Neispravni datumi registracije.' })
      return
    }
    if (expiryDate <= lastDate) {
      setError('registration_expiry_date', {
        message: 'Datum isteka registracije mora biti nakon datuma zadnje registracije.',
      })
      return
    }

    try {
      await updateVehicle.mutateAsync({
        name: values.name.trim(),
        year: Number(values.year),
        last_registration_date: values.last_registration_date,
        registration_expiry_date: values.registration_expiry_date,
        image: selectedImage ?? null,
      })
      toast.success('Vozilo je ažurirano.')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Greška pri spremanju vozila.')
    }
  })

  const closeModal = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset()
      setPreviewUrl(null)
    }
    onOpenChange(nextOpen)
  }

  if (!isAdmin || !vehicle) return null

  return (
    <Dialog open={open} onOpenChange={closeModal}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={onSubmit} className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
            <DialogTitle>Uredi vozilo</DialogTitle>
            <DialogDescription>Ažurirajte podatke kao u v1.</DialogDescription>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FormSection title="Podaci o vozilu">
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-edit-name">Naziv</FormLabel>
                  <Input id="vehicle-edit-name" {...register('name')} />
                  {errors.name ? <FormError>{errors.name.message}</FormError> : null}
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-edit-year">Godina</FormLabel>
                  <Input id="vehicle-edit-year" type="number" {...register('year')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-edit-last">Zadnja registracija</FormLabel>
                  <Input id="vehicle-edit-last" type="date" {...register('last_registration_date')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-edit-expiry">Registracija vrijedi do</FormLabel>
                  <Input id="vehicle-edit-expiry" type="date" {...register('registration_expiry_date')} />
                  {errors.registration_expiry_date ? (
                    <FormError>{errors.registration_expiry_date.message}</FormError>
                  ) : null}
                </div>
              </FormGrid>
            </FormSection>

            <FormSection title="Fotografija">
              <div className="flex items-start gap-4">
                <div className="h-24 w-32 overflow-hidden rounded-lg border border-dashed border-zinc-200 bg-zinc-50">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Odabrana fotografija" className="h-full w-full object-cover" />
                  ) : vehicle.image_path ? (
                    <img
                      src={resolveImageUrl(vehicle.image_path) ?? undefined}
                      alt={vehicle.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                      Nema slike
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <FormLabel htmlFor="vehicle-edit-image">Promijeni sliku</FormLabel>
                  <Input
                    id="vehicle-edit-image"
                    type="file"
                    accept="image/png,image/jpeg"
                    {...register('image')}
                  />
                  <p className="text-xs text-zinc-500">PNG ili JPG, max 1MB.</p>
                </div>
              </div>
            </FormSection>
          </div>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => closeModal(false)}>
              Odustani
            </Button>
            <Button type="submit" disabled={updateVehicle.isPending}>
              Spremi
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default VehicleEditModal
