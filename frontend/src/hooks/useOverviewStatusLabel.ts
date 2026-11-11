import { useTranslation } from 'react-i18next'

import type { OverviewStatus } from '../lib/superadminOverview'

const STATUS_KEY: Record<OverviewStatus, string> = {
  trial: 'trial',
  trial_expired: 'trialExpired',
  active: 'active',
  past_due: 'pastDue',
  canceled: 'canceled',
  suspended: 'suspended',
  none: 'none',
}

/** Translated label of a superadmin overview status (trial, trial_expired, active, past_due, canceled, suspended, none). */
export const useOverviewStatusLabel = () => {
  const { t } = useTranslation('superadmin')
  return (status: OverviewStatus) => t(`superadminDashboard.status.${STATUS_KEY[status]}`)
}

