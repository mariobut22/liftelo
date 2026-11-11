import useAuthStore from '../store/authStore'
import { RMS_STATUS } from './rmsStatus'

/** Fixed categories of a finding (stored as these strings; shown through findings:category.<value>). */
export const FINDING_CATEGORIES = [
  'doors',
  'car',
  'ropes_suspension',
  'drive_machine',
  'controller',
  'safety_devices',
  'shaft_pit',
  'intercom_emergency',
  'other',
] as const
export type FindingCategory = (typeof FINDING_CATEGORIES)[number]

export type FindingSeverity = 'out_of_service' | 'in_service' | 'recommendation'
export type FindingState = 'open' | 'waiting_part' | 'in_progress' | 'resolved'
export type FindingEventType = 'opened' | 'status_changed' | 'comment' | 'parts_ordered' | 'resolved' | 'reopened'

/** A repair status (either of the two "Potreban popravak" values) is what makes the "What is wrong?" form appear. */
export const isRepairStatus = (status: string | null | undefined): boolean =>
  status === RMS_STATUS.repairInService || status === RMS_STATUS.repairOutOfService

/** Per-elevator draft kept inside the RMS / intervention form values. */
export interface FindingDraft {
  finding_description: string
  finding_category: string
  finding_needs_part: boolean
  finding_part_note: string
}

export const emptyFindingDraft = (): FindingDraft => ({
  finding_description: '',
  finding_category: 'other',
  finding_needs_part: false,
  finding_part_note: '',
})

export interface FindingRequestEntry {
  elevator_label: string
  description: string
  category: string
  needs_part: boolean
  part_note?: string
}

/** The `findings` array sent with an RMS / intervention request: only elevators with a repair status. */
export const buildFindingEntries = (
  items: Array<{ elevator_label: string; status?: string | null } & Partial<FindingDraft>>
): FindingRequestEntry[] =>
  items
    .filter((item) => isRepairStatus(item.status))
    .map((item) => ({
      elevator_label: item.elevator_label,
      description: (item.finding_description ?? '').trim(),
      category: item.finding_category || 'other',
      needs_part: Boolean(item.finding_needs_part),
      ...(item.finding_needs_part && item.finding_part_note?.trim() ? { part_note: item.finding_part_note.trim() } : {}),
    }))

/** Labels of repair-status elevators that still have no description (blocks submit). */
export const missingFindingDescriptions = (
  items: Array<{ elevator_label: string; status?: string | null; finding_description?: string }>
): string[] =>
  items
    .filter((item) => isRepairStatus(item.status) && !(item.finding_description ?? '').trim())
    .map((item) => item.elevator_label)

export type FindingsRole = 'admin' | 'technician' | 'viewer'

/** Role of the signed-in user in the active company (superadmin counts as admin). */
export const useFindingsRole = (): FindingsRole => {
  const user = useAuthStore((state) => state.user)
  const companies = useAuthStore((state) => state.companies)
  const isAdmin = useAuthStore((state) => state.isAdmin())
  if (isAdmin) return 'admin'
  const activeCompanyId = user?.company_id ?? companies[0]?.id
  const role = companies.find((company) => company.id === activeCompanyId)?.role
  if (role === 'viewer') return 'viewer'
  return 'technician'
}
