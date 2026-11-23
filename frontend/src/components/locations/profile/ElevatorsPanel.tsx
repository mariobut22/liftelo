import { useMemo, useState } from 'react'
import { ClipboardList, MoreHorizontal, Pencil, Plus, QrCode, Trash2, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu'
import EmptyState from '../../ui/empty-state'
import { Input } from '../../ui/input'
import { ListSkeleton } from '../../ui/skeletons'
import type { Finding } from '../../../services/api'
import { RmsStatusBadge, Section } from './ProfileParts'
import type { ElevatorRow } from './profileUtils'

type Props = {
  elevators: ElevatorRow[]
  loading: boolean
  faults: Finding[]
  lastStatusByLabel: Map<string, string>
  isAdmin: boolean
  canWrite: boolean
  onNewRms: (elevatorId: number) => void
  onNewIntervention: (elevatorId: number) => void
  onAdd: () => void
  onEdit: (elevator: ElevatorRow) => void
  onDelete: (elevator: ElevatorRow) => void
  onQrLabel: (elevator: ElevatorRow) => void
  onOpenFaults: () => void
}

function ElevatorsPanel({
  elevators,
  loading,
  faults,
  lastStatusByLabel,
  isAdmin,
  canWrite,
  onNewRms,
  onNewIntervention,
  onAdd,
  onEdit,
  onDelete,
  onQrLabel,
  onOpenFaults,
}: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return elevators
    return elevators.filter((e) =>
      [e.label, e.serial_number, e.control_group_type, e.cabin_door_type, e.lock_type, e.machine_room_key, e.comment]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    )
  }, [query, elevators])

  const addButton = isAdmin ? (
    <Button size="sm" variant="secondary" onClick={onAdd} data-testid="add-elevator" className="min-h-9">
      <Plus className="h-4 w-4" />
      {t('locations:locationDetail.addElevator')}
    </Button>
  ) : null

  if (loading) return <ListSkeleton rows={2} />

  if (elevators.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title={t('common:empty.noElevatorsForLocation')}
        description={isAdmin ? t('locations:locationDetail.elevatorsPanel.emptyText') : undefined}
        action={addButton}
        testId="elevators-empty"
      />
    )
  }

  return (
    <Section title={t('common:labels.elevators')} action={addButton}>
      <Input
        aria-label={t('locations:locationDetail.searchElevators')}
        placeholder={t('locations:locationDetail.searchElevators')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-4 sm:max-w-xs"
      />
      {filtered.length === 0 ? <p className="text-sm text-zinc-500">{t('locations:locationDetail.elevatorsPanel.noMatch')}</p> : null}
      <ul className="divide-y divide-zinc-100">
        {filtered.map((elevator) => {
          const own = faults.filter((f) => f.elevator_id === elevator.id || (f.elevator_id === null && f.elevator_label === elevator.label))
          const lastStatus = lastStatusByLabel.get(elevator.label)
          const details: Array<[string, string | null | undefined]> = [
            [t('locations:locationDetail.serialNumber'), elevator.serial_number],
            [t('locations:locationDetail.controlType'), elevator.control_group_type],
            [t('locations:locationDetail.cabinDoors'), elevator.cabin_door_type],
            [t('locations:locationDetail.lockType'), elevator.lock_type],
            [t('locations:locationDetail.machineRoomKey'), elevator.machine_room_key],
            [t('locations:locationDetail.comment'), elevator.comment],
          ]
          const filledDetails = details.filter(([, value]) => Boolean(value))
          return (
            <li key={elevator.id} className="py-4 first:pt-0 last:pb-0" data-testid="elevator-card" data-elevator={elevator.label}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-semibold text-zinc-900">{elevator.label}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {lastStatus ? <RmsStatusBadge status={lastStatus} t={t} /> : null}
                    <button
                      type="button"
                      onClick={onOpenFaults}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      data-testid="elevator-faults-badge"
                    >
                      {own.length > 0 ? (
                        <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                          {t('locations:locationDetail.elevatorsPanel.faultsBadge', { count: own.length })}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t('locations:locationDetail.elevatorsPanel.noFaultsBadge')}</Badge>
                      )}
                    </button>
                  </div>
                </div>
                {isAdmin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-11 w-11 shrink-0 p-0"
                        aria-label={t('locations:locationDetail.actions.elevatorActions', { label: elevator.label })}
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onQrLabel(elevator)}>
                        <QrCode className="h-4 w-4" />
                        {t('locations:qr.action.qrLabel')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onEdit(elevator)}>
                        <Pencil className="h-4 w-4" />
                        {t('common:actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="min-h-11 gap-2 text-rose-700" onSelect={() => onDelete(elevator)}>
                        <Trash2 className="h-4 w-4" />
                        {t('common:actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              {filledDetails.length > 0 ? (
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {filledDetails.map(([label, value]) => (
                    <div key={label} className="flex min-w-0 gap-2">
                      <dt className="shrink-0 text-zinc-500">{label}</dt>
                      <dd className="min-w-0 break-words text-zinc-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {canWrite ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                  <Button variant="secondary" className="h-11" onClick={() => onNewRms(elevator.id)}>
                    <ClipboardList className="h-4 w-4" />
                    {t('locations:locationDetail.actions.newRms')}
                  </Button>
                  <Button variant="secondary" className="h-11" onClick={() => onNewIntervention(elevator.id)}>
                    <Wrench className="h-4 w-4" />
                    {t('locations:locationDetail.actions.newIntervention')}
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

export default ElevatorsPanel
