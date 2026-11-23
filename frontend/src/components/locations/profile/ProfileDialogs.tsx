import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '../../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../ui/dialog'
import { Input } from '../../ui/input'
import type { ElevatorFormValues, LocationFormValues } from './profileUtils'

const labelClass = 'text-xs font-semibold text-zinc-500'

function DialogFooter({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 px-6 py-4">
      <Button type="button" variant="secondary" onClick={onCancel}>
        {t('common:actions.cancel')}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? t('common:states.saving') : t('common:actions.save')}
      </Button>
    </div>
  )
}

/** Admin dialog: edit the basic information of the location. The caller does the save and shows toasts. */
export function EditLocationDialog({
  open,
  onOpenChange,
  initial,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: LocationFormValues
  pending: boolean
  onSubmit: (values: LocationFormValues) => Promise<void>
}) {
  const { t } = useTranslation()
  const form = useForm<LocationFormValues>({ defaultValues: initial })

  useEffect(() => {
    if (open) form.reset(initial)
  }, [open, initial, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
            <DialogTitle>{t('locations:locationDetail.editLocation')}</DialogTitle>
            <DialogDescription>{t('locations:locationDetail.updateBasicInformationAboutLocation')}</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t('locations:locationDetail.locationName')}</label>
                <Input {...form.register('name', { required: true })} />
              </div>
              <div>
                <label className={labelClass}>{t('common:labels.address')}</label>
                <Input {...form.register('address', { required: true })} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.contactPerson2')}</label>
                <Input {...form.register('contact_person')} />
              </div>
              <div>
                <label className={labelClass}>{t('common:labels.phone')}</label>
                <Input {...form.register('contact_phone')} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.propertyManager2')}</label>
                <Input {...form.register('upravitelj')} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.machineRoomKey2')}</label>
                <Input {...form.register('kljuc_strojarnice')} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.rmsFrequency2')}</label>
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                  {...form.register('rms_frequency')}
                >
                  <option value={1}>{t('locations:locationDetail.everyMonth')}</option>
                  <option value={2}>{t('locations:locationDetail.every2Months')}</option>
                  <option value={3}>{t('locations:locationDetail.every3Months')}</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('common:labels.comment')}</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                  rows={3}
                  {...form.register('notes')}
                />
              </div>
            </div>
          </div>
          <DialogFooter pending={pending} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Admin dialog shared by "add elevator" and "edit elevator" (same fields). */
export function ElevatorFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'add' | 'edit'
  initial: ElevatorFormValues
  pending: boolean
  onSubmit: (values: ElevatorFormValues) => Promise<void>
}) {
  const { t } = useTranslation()
  const form = useForm<ElevatorFormValues>({ defaultValues: initial })

  useEffect(() => {
    if (open) form.reset(initial)
  }, [open, initial, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-6 py-4">
            <DialogTitle>{t(mode === 'add' ? 'locations:locationDetail.addElevator' : 'locations:locationDetail.editElevator')}</DialogTitle>
            <DialogDescription>
              {t(mode === 'add' ? 'locations:locationDetail.enterElevatorDetails' : 'locations:locationDetail.updateElevatorDetails')}
            </DialogDescription>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t('locations:locationDetail.label')}</label>
                <Input {...form.register('label', { required: true })} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.serialNumber2')}</label>
                <Input {...form.register('serial_number')} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.controlType2')}</label>
                <Input {...form.register('control_group_type')} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.cabinDoors2')}</label>
                <Input {...form.register('cabin_door_type')} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.lockType2')}</label>
                <Input {...form.register('lock_type')} />
              </div>
              <div>
                <label className={labelClass}>{t('locations:locationDetail.machineRoomKey2')}</label>
                <Input {...form.register('machine_room_key')} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('common:labels.comment')}</label>
                <Input {...form.register('comment')} />
              </div>
            </div>
          </div>
          <DialogFooter pending={pending} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
