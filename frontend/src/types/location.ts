export interface Elevator {
  id: number
  label: string
  serial_number?: string | null
  control_group_type?: string | null
  cabin_door_type?: string | null
  lock_type?: string | null
  machine_room_key?: string | null
  comment?: string | null
}

export interface Location {
  id: number
  name: string
  address?: string | null
  rms_frequency: number
  contact_person?: string | null
  contact_phone?: string | null
  upravitelj?: string | null
  kljuc_strojarnice?: string | null
  notes?: string | null
  latitude?: string | number | null
  longitude?: string | number | null
  elevators?: Elevator[]
  status?: string
}

export type LocationElevatorStatus = {
  elevator_label: string
  status: string
  source?: string
}

export type LocationWithActivity = Location & {
  last_activity?: string | null
  elevator_statuses?: LocationElevatorStatus[]
  elevator_search?: string | null
}
