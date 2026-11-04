import type { TFunction } from 'i18next'

/** Label for a location's `rms_frequency` (1 = every month, 2 = every 2 months, 3 = every 3 months); unknown values fall back to monthly. */
export const rmsFrequencyLabel = (t: TFunction, value?: number | null): string => {
  if (value === 3) return t('common:rmsFrequency.everyThreeMonths')
  if (value === 2) return t('common:rmsFrequency.everyTwoMonths')
  return t('common:rmsFrequency.monthly')
}
