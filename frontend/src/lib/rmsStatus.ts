import type { TFunction } from 'i18next'

/** Status strings stored in the database / sent to the API for RMS visit items and interventions. NEVER translate these values. */
export const RMS_STATUS = {
  ok: 'O.K.',
  repairInService: 'Potreban popravak - Dizalo u funkciji',
  repairOutOfService: 'Potreban popravak - Dizalo nije u funkciji',
} as const

export const RMS_STATUS_VALUES = [RMS_STATUS.ok, RMS_STATUS.repairInService, RMS_STATUS.repairOutOfService] as const

const LABEL_KEYS: Record<string, string> = {
  [RMS_STATUS.ok]: 'common:rmsStatus.ok',
  [RMS_STATUS.repairInService]: 'common:rmsStatus.repairInService',
  [RMS_STATUS.repairOutOfService]: 'common:rmsStatus.repairOutOfService',
}

/** Display label for an API status value in the active language; unknown values are shown unchanged. */
export const rmsStatusLabel = (t: TFunction, status: string | null | undefined): string => {
  if (!status) return ''
  const key = LABEL_KEYS[status]
  return key ? t(key) : status
}
