import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import FormSection from '../form/FormSection'
import FormGrid from '../form/FormGrid'
import FormLabel from '../form/FormLabel'
import FormError from '../form/FormError'
import FormActions from '../form/FormActions'
import useUsers from '../../hooks/queries/useUsers'
import useLocationElevators from '../../hooks/queries/useLocationElevators'
import { updateWorkOrder } from '../../services/api'
import type { WorkOrderDetail } from '../../types/work-order-detail'

interface WorkOrderEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workOrder: WorkOrderDetail
}

interface WorkOrderEditValues {
  issuedDate: string
  dueDate: string
  generalComment: string
  items: Array<{ itemId?: number; description: string; isCompleted?: boolean }>
  elevatorIds: string[]
  assignedUserIds: string[]
}

const defaultItem = { description: '' }

function WorkOrderEditModal({ open, onOpenChange, workOrder }: WorkOrderEditModalProps) {
  const queryClient = useQueryClient()
  const { data: users } = useUsers()
  const { data: elevators } = useLocationElevators(workOrder.location_id ?? undefined)

  const updateMutation = useMutation({
    mutationFn: async (payload: WorkOrderEditValues) =>
      updateWorkOrder(workOrder.id, {
        issued_date: payload.issuedDate || undefined,
        due_date: payload.dueDate || undefined,
        general_comment: payload.generalComment || undefined,
        items: payload.items.map((item, index) => ({
          id: item.itemId,
          description: item.description,
          sort_order: index + 1,
          is_completed: item.isCompleted,
        })),
        elevator_ids: payload.elevatorIds.map(Number),
        assigned_user_ids: payload.assignedUserIds.map(Number),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', String(workOrder.id)] })
      queryClient.invalidateQueries({ queryKey: ['workOrders'] })
      toast.success('Nalog je ažuriran.')
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Neuspješno spremanje naloga.')
    },
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<WorkOrderEditValues>({
    defaultValues: {
      issuedDate: '',
      dueDate: '',
      generalComment: '',
      items: [defaultItem],
      elevatorIds: [],
      assignedUserIds: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  useEffect(() => {
    if (!open) return
    reset({
      issuedDate: workOrder.issued_date?.slice(0, 10) ?? '',
      dueDate: workOrder.due_date?.slice(0, 10) ?? '',
      generalComment: workOrder.general_comment ?? '',
      items:
        (workOrder.items ?? []).map((item) => ({
          itemId: item.id,
          description: item.description ?? item.text ?? '',
          isCompleted: item.is_completed,
        })) || [defaultItem],
      elevatorIds: (workOrder.elevators ?? []).map((elevator) => String(elevator.id)),
      assignedUserIds: (workOrder.assigned_users ?? []).map((user) => String(user.id)),
    })
  }, [open, reset, workOrder])

  const onSubmit = handleSubmit(async (values) => {
    const items = values.items.filter((item) => item.description.trim())
    if (items.length === 0) {
      setError('items', { message: 'Dodajte barem jednu stavku.' })
      return
    }
    await updateMutation.mutateAsync({ ...values, items })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <form onSubmit={onSubmit} className="flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-zinc-200 shrink-0">
            <DialogTitle>Uredi radni nalog</DialogTitle>
            <DialogDescription>Izmijenite detalje naloga.</DialogDescription>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <FormSection title="Osnovno" description="Rokovi i komentari.">
              <FormGrid columns={2}>
                <div className="space-y-2">
                  <FormLabel htmlFor="wo-edit-issued">Datum izdavanja</FormLabel>
                  <Input id="wo-edit-issued" type="date" {...register('issuedDate')} />
                </div>

                <div className="space-y-2">
                  <FormLabel htmlFor="wo-edit-due" optional>
                    Rok
                  </FormLabel>
                  <Input id="wo-edit-due" type="date" {...register('dueDate')} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <FormLabel htmlFor="wo-edit-comment" optional>
                    Opći komentar
                  </FormLabel>
                  <textarea
                    id="wo-edit-comment"
                    rows={3}
                    {...register('generalComment')}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                  />
                </div>
              </FormGrid>
            </FormSection>

            <FormSection title="Stavke" description="Uredite stavke naloga.">
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center">
                    <input
                      type="checkbox"
                      checked={!!field.isCompleted}
                      readOnly
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <Input
                      id={`wo-edit-item-${field.id}`}
                      placeholder="Opis stavke"
                      {...register(`items.${index}.description` as const)}
                      className={field.isCompleted ? 'line-through text-zinc-400' : undefined}
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
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Odustani
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Spremanje...' : 'Spremi promjene'}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default WorkOrderEditModal
