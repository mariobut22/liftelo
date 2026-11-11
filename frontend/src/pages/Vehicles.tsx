import { useMemo, useState } from 'react'
import { CalendarClock, CarFront, Pencil, Plus, Trash2, Truck } from 'lucide-react'

import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import type { Vehicle } from '../types/vehicle'
import useVehicles from '../hooks/queries/useVehicles'
import useAuthStore from '../store/authStore'
import { useDeleteVehicle } from '../hooks/mutations/useDeleteVehicle'
import { toast } from 'sonner'
import VehicleCreateModal from '../components/vehicles/VehicleCreateModal'
import VehicleEditModal from '../components/vehicles/VehicleEditModal'
import { API_BASE_URL } from '../services/api'
import { getLocale } from '../i18n'
import { useTranslation } from 'react-i18next'

function Vehicles() {
  const { t } = useTranslation()

  const { data, isLoading: loading, error } = useVehicles()
  const vehicles = data ?? []

  const isAdmin = useAuthStore((state) => state.isAdmin())
  const deleteVehicle = useDeleteVehicle()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null)
  const canManageVehicles = isAdmin

  const sortedVehicles = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const aDate = new Date(a.registration_expiry_date).getTime()
      const bDate = new Date(b.registration_expiry_date).getTime()
      if (aDate !== bDate) return aDate - bDate
      return a.name.localeCompare(b.name)
    })
  }, [vehicles])

  const apiBaseUrl = API_BASE_URL
  const resolveImageUrl = (path?: string | null) => {
    if (!path) return null
    if (/^https?:\/\//i.test(path)) return path

    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    if (normalizedPath.startsWith('/uploads')) {
      const apiBase = apiBaseUrl.replace(/\/$/, '')
      return `${apiBase}${normalizedPath}`
    }

    return normalizedPath
  }

  const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(getLocale()) : '—')

  const getRegistrationState = (expiryValue?: string | null) => {
    if (!expiryValue) {
      return { label: t('common:states.unknown'), className: 'bg-zinc-100 text-zinc-700' }
    }
    const expiry = new Date(expiryValue)
    if (Number.isNaN(expiry.getTime())) {
      return { label: t('common:states.unknown'), className: 'bg-zinc-100 text-zinc-700' }
    }
    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / dayMs)

    if (daysLeft < 0) {
      return { label: t('vehicles:vehicles.expired'), className: 'bg-rose-100 text-rose-700' }
    }
    if (daysLeft <= 30) {
      return { label: t('vehicles:vehicles.expiresSoon'), className: 'bg-amber-100 text-amber-800' }
    }
    return { label: t('vehicles:vehicles.active'), className: 'bg-emerald-100 text-emerald-700' }
  }

  const handleDelete = async (vehicle: Vehicle) => {
    if (!isAdmin) return
    const confirmed = window.confirm(t('vehicles:vehicles.deleteVehicle'))
    if (!confirmed) return
    try {
      await deleteVehicle.mutateAsync(vehicle.id)
      toast.success(t('vehicles:vehicles.vehicleDeleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('vehicles:vehicles.failedDeleteVehicle'))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('common:labels.vehicles')}</h1>
        <p className="text-sm text-zinc-500">{t('vehicles:vehicles.overviewVehicleRegistrationsStatus')}</p>
      </div>

      {canManageVehicles ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('vehicles:vehicles.newVehicle')}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-center shadow-sm">{t('common:states.loading')}</Card>
      ) : null}

      {!loading && sortedVehicles.length > 0 ? (
        <div className="grid gap-4">
          {sortedVehicles.map((vehicle) => {
            const registrationState = getRegistrationState(vehicle.registration_expiry_date)
            return (
              <Card key={vehicle.id} className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 shadow-sm md:flex-row md:items-center">
               <div className="h-28 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 md:h-24 md:w-32">
                {vehicle.image_path ? (
                  <img
                    src={resolveImageUrl(vehicle.image_path) ?? undefined}
                    alt={vehicle.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                    {t('common:empty.noImage')}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-zinc-900">{vehicle.name}</h3>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${registrationState.className}`}>
                      {registrationState.label}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500">{t('vehicles:vehicles.year', { year: vehicle.year })}</p>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4" />
                      {t('vehicles:vehicles.lastRegistration')} {formatDate(vehicle.last_registration_date)}
                    </span>
                    <span>{t('vehicles:vehicles.registrationValidUntil')} {formatDate(vehicle.registration_expiry_date)}</span>
                  </div>
                </div>
                {canManageVehicles ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditTarget(vehicle)}>
                      <Pencil className="h-4 w-4" />
                      {t('common:actions.edit')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDelete(vehicle)}>
                      <Trash2 className="h-4 w-4" />
                      {t('common:actions.delete')}
                    </Button>
                  </div>
                ) : null}
              </div>
              </Card>
            )
          })}
        </div>
      ) : null}

      {!loading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Truck className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('common:states.error')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : t('vehicles:vehicles.weCanTLoadVehicles')}
          </p>
        </Card>
      ) : null}

      {!loading && !error && vehicles.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Truck className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-zinc-900">{t('vehicles:vehicles.noVehicles')}</p>
            <p className="mt-1 text-sm text-zinc-500">{t('vehicles:vehicles.addVehicleGetStarted')}</p>
          </div>
          {canManageVehicles ? (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <CarFront className="h-4 w-4" />
              {t('vehicles:vehicles.addFirstVehicle')}
            </Button>
          ) : null}
        </Card>
      ) : null}

      <VehicleCreateModal open={createOpen} onOpenChange={setCreateOpen} />
      <VehicleEditModal open={!!editTarget} vehicle={editTarget} onOpenChange={(open) => !open && setEditTarget(null)} />
    </div>
  )
}

export default Vehicles
