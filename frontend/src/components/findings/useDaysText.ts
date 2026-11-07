import { useTranslation } from 'react-i18next'

import type { Finding } from '../../services/api'

/** Text for "open for N days" (or "fixed after N days" for resolved ones). */
export const useDaysText = () => {
  const { t } = useTranslation('findings')
  return (finding: Pick<Finding, 'days_open' | 'state'>) => {
    if (finding.state === 'resolved') return t('card.daysResolved', { count: finding.days_open })
    if (finding.days_open === 0) return t('card.openedToday')
    return t('card.daysOpen', { count: finding.days_open })
  }
}
