import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import useAuthStore from '../../store/authStore'
import useCreateLocation from '../../hooks/mutations/useCreateLocation'

type LocationCreateModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: number) => void
}

type CreateLocationForm = {
  name: string
  address: string
  contact_person: string
  contact_phone: string
  notes: string
  rms_frequency: number
}

type GooglePlacesAutocomplete = new (
  input: HTMLInputElement,
  options?: { types?: string[]; componentRestrictions?: { country?: string } }
) => {
  addListener: (event: string, handler: () => void) => void
  getPlace: () => { formatted_address?: string }
}

const V1_GOOGLE_MAPS_KEY = 'AIzaSyC_bv1yYLg0ZZqby-XRWC9vOFQ_bQX-elw'

const getGoogleMapsKey = () => {
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_KEY
  return envKey && typeof envKey === 'string' && envKey.length > 0 ? envKey : V1_GOOGLE_MAPS_KEY
}

const loadGoogleMaps = (key: string) => {
  if (typeof window === 'undefined') return Promise.resolve()
  const mapsApi = window.google?.maps
  if (mapsApi) return Promise.resolve()
  if (window.__locationsMapPromise) return window.__locationsMapPromise

  window.__locationsMapPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })

  return window.__locationsMapPromise
}

function LocationCreateModal({ open, onOpenChange, onCreated }: LocationCreateModalProps) {
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const addressRef = useRef<HTMLInputElement | null>(null)
  const mapsKey = useMemo(() => getGoogleMapsKey(), [])

  const form = useForm<CreateLocationForm>({
    defaultValues: {
      name: '',
      address: '',
      contact_person: '',
      contact_phone: '',
      notes: '',
      rms_frequency: 1,
    },
  })

  const createLocation = useCreateLocation()
  const { ref: addressFieldRef, ...addressField } = form.register('address', { required: true })

  useEffect(() => {
    if (!open) return
    form.reset({
      name: '',
      address: '',
      contact_person: '',
      contact_phone: '',
      notes: '',
      rms_frequency: 1,
    })
  }, [form, open])

  useEffect(() => {
    if (!open || !mapsKey || !addressRef.current) return

    let isMounted = true
    let autocomplete: null | InstanceType<GooglePlacesAutocomplete> = null

    loadGoogleMaps(mapsKey)
      .then(() => {
        if (!isMounted || !addressRef.current) return
        const autocompleteCtor = (window.google as unknown as { maps?: { places?: { Autocomplete?: GooglePlacesAutocomplete } } })
          ?.maps?.places?.Autocomplete
        if (!autocompleteCtor) return
        autocomplete = new autocompleteCtor(addressRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'hr' },
        })
        if (!autocomplete) return
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete?.getPlace()
          if (place?.formatted_address) {
            form.setValue('address', place.formatted_address)
          }
        })
      })
      .catch(() => {
        // Autocomplete is optional; form still works without it.
      })

    return () => {
      isMounted = false
    }
  }, [form, mapsKey, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form
          onSubmit={form.handleSubmit(async (values) => {
            if (!isAdmin) return
            try {
              const result = await createLocation.mutateAsync({
                name: values.name,
                address: values.address,
                contact_person: values.contact_person || null,
                contact_phone: values.contact_phone || null,
                notes: values.notes || null,
                rms_frequency: Number(values.rms_frequency) || 1,
              })
              toast.success('Lokacija je dodana.')
              onOpenChange(false)
              onCreated(result.id)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Greška pri spremanju lokacije.')
            }
          })}
          className="flex max-h-[90vh] flex-col"
        >
          <div className="border-b border-zinc-200 px-6 py-4 shrink-0">
            <DialogTitle>Nova lokacija</DialogTitle>
            <DialogDescription>Unesite podatke o lokaciji.</DialogDescription>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-zinc-500">Naziv lokacije</label>
                <Input {...form.register('name', { required: true })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500">Adresa</label>
                <Input
                  {...addressField}
                  ref={(element) => {
                    addressRef.current = element
                    addressFieldRef(element)
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500">Kontakt osoba</label>
                <Input {...form.register('contact_person')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500">Telefon</label>
                <Input {...form.register('contact_phone')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500">RMS frekvencija</label>
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                  {...form.register('rms_frequency')}
                >
                  <option value={1}>Svaki mjesec</option>
                  <option value={2}>Svaka 2 mjeseca</option>
                  <option value={3}>Svaka 3 mjeseca</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-zinc-500">Komentar</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                  rows={3}
                  {...form.register('notes')}
                />
              </div>
            </div>
          </div>
          <div className="border-t border-zinc-200 px-6 py-4 flex justify-end gap-2 shrink-0">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Odustani
            </Button>
            <Button type="submit" disabled={createLocation.isPending}>
              {createLocation.isPending ? 'Spremanje...' : 'Spremi'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default LocationCreateModal
