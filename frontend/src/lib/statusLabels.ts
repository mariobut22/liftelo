import type { TFunction } from 'i18next'

/** Display label for an API status value (work order / project / subscription: open, in_progress, completed, cancelled, active, archived, trial, past_due...). Unknown values are shown unchanged. */
export const statusLabel = (t: TFunction, status: string | null | undefined): string => {
  if (!status) return ''
  return t(`common:status.${status}`, { defaultValue: status })
}

/** Display label for a user role (admin, technician, viewer, superadmin); unknown values are shown unchanged. */
export const roleLabel = (t: TFunction, role: string | null | undefined): string => {
  if (!role) return ''
  return t(`common:roles.${role}`, { defaultValue: role })
}
