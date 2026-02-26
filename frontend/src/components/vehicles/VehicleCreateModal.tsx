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
import useAuthStore from '../../store/authStore'
import { useCreateVehicle } from '../../hooks/mutations/useCreateVehicle'

type VehicleFormValues = {
  name: string
  year: string
  last_registration_date: string
  registration_expiry_date: string
  image: FileList
}

interface VehicleCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const getToday = () => new Date().toISOString().slice(0, 10)

function VehicleCreateModal({ open, onOpenChange }: VehicleCreateModalProps) {
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const createVehicle = useCreateVehicle()
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
      name: '',
      year: String(new Date().getFullYear()),
      last_registration_date: getToday(),
      registration_expiry_date: getToday(),
    },
  })

  const imageFiles = watch('image')
  const selectedImage = useMemo(() => imageFiles?.[0] ?? null, [imageFiles])

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
    if (!isAdmin) return
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
      await createVehicle.mutateAsync({
        name: values.name.trim(),
        year: Number(values.year),
        last_registration_date: values.last_registration_date,
        registration_expiry_date: values.registration_expiry_date,
        image: selectedImage ?? null,
      })
      toast.success('Vozilo je dodano.')
      reset()
      setPreviewUrl(null)
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

  if (!isAdmin) return null

  return (
    <Dialog open={open} onOpenChange={closeModal}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={onSubmit} className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
            <DialogTitle>Novo vozilo</DialogTitle>
            <DialogDescription>Dodajte vozilo kao u v1 obrascu.</DialogDescription>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FormSection title="Podaci o vozilu">
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-name">Naziv</FormLabel>
                  <Input id="vehicle-name" {...register('name')} />
                  {errors.name ? <FormError>{errors.name.message}</FormError> : null}
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-year">Godina</FormLabel>
                  <Input id="vehicle-year" type="number" {...register('year')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-last">Zadnja registracija</FormLabel>
                  <Input id="vehicle-last" type="date" {...register('last_registration_date')} />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="vehicle-expiry">Registracija vrijedi do</FormLabel>
                  <Input id="vehicle-expiry" type="date" {...register('registration_expiry_date')} />
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
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                      Nema slike
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <FormLabel htmlFor="vehicle-image">Dodaj sliku</FormLabel>
                  <Input id="vehicle-image" type="file" accept="image/png,image/jpeg" {...register('image')} />
                  <p className="text-xs text-zinc-500">PNG ili JPG, max 1MB.</p>
                </div>
              </div>
            </FormSection>
          </div>

          <FormActions>
            <Button type="button" variant="ghost" onClick={() => closeModal(false)}>
              Odustani
            </Button>
            <Button type="submit" disabled={createVehicle.isPending}>
              Spremi
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default VehicleCreateModal
