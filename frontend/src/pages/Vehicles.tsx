import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, Truck } from 'lucide-react'

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

function Vehicles() {
  const { data, isLoading: loading, error } = useVehicles()
  const vehicles = data ?? []

  const isAdmin = useAuthStore((state) => state.isAdmin())
  const deleteVehicle = useDeleteVehicle()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null)

  const sortedVehicles = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const aDate = new Date(a.registration_expiry_date).getTime()
      const bDate = new Date(b.registration_expiry_date).getTime()
      if (aDate !== bDate) return aDate - bDate
      return a.name.localeCompare(b.name)
    })
  }, [vehicles])

  useEffect(() => {
    if (vehicles.length > 0) {
      console.log('Vehicle image path sample:', vehicles[0]?.image_path)
    }
  }, [vehicles])

  const apiBaseUrl = API_BASE_URL
  const resolveImageUrl = (path?: string | null) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    if (path.startsWith('/uploads')) return `${apiBaseUrl}${path}`
    return path
  }

  const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('hr-HR') : '—')

  const handleDelete = async (vehicle: Vehicle) => {
    if (!isAdmin) return
    const confirmed = window.confirm('Obrisati vozilo?')
    if (!confirmed) return
    try {
      await deleteVehicle.mutateAsync(vehicle.id)
      toast.success('Vozilo je obrisano.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Greška pri brisanju vozila.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Vozila</h1>
        <p className="text-sm text-zinc-500">Pregled registracija i statusa vozila</p>
      </div>

      {isAdmin ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>Novo vozilo</Button>
        </div>
      ) : null}

      {loading ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-center shadow-sm">Učitavanje...</Card>
      ) : null}

      {!loading && sortedVehicles.length > 0 ? (
        <div className="grid gap-4">
          {sortedVehicles.map((vehicle) => (
            <Card key={vehicle.id} className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 shadow-sm md:flex-row">
              <div className="h-28 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 md:h-24 md:w-32">
                {vehicle.image_path ? (
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
              <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-zinc-900">{vehicle.name}</h3>
                  <p className="text-sm text-zinc-500">Godina: {vehicle.year}</p>
                  <p className="text-sm text-zinc-500">Zadnja registracija: {formatDate(vehicle.last_registration_date)}</p>
                  <p className="text-sm text-zinc-500">Registracija vrijedi do: {formatDate(vehicle.registration_expiry_date)}</p>
                </div>
                {isAdmin ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditTarget(vehicle)}>
                      <Pencil className="h-4 w-4" />
                      Uredi
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDelete(vehicle)}>
                      <Trash2 className="h-4 w-4" />
                      Obriši
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Truck className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error ? error.message : 'Ne možemo učitati vozila trenutno.'}
          </p>
        </Card>
      ) : null}

      {!loading && !error && vehicles.length === 0 ? (
        <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">Nema vozila.</p>
            <p className="mt-1 text-sm text-zinc-500">Dodajte vozilo za početak.</p>
          </div>
        </Card>
      ) : null}

      <VehicleCreateModal open={createOpen} onOpenChange={setCreateOpen} />
      <VehicleEditModal open={!!editTarget} vehicle={editTarget} onOpenChange={(open) => !open && setEditTarget(null)} />
    </div>
  )
}

export default Vehicles
