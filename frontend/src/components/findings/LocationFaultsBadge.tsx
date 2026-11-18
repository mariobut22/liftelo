import { AlertTriangle, PackageSearch } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/utils'
import { faultTone } from '../../lib/findings'
import type { FindingsByLocationItem } from '../../services/api'

/**
 * Small badge for the locations list: number of OPEN faults (red when any is out of service, amber otherwise,
 * same colours as SeverityBadge) plus a "to order" hint when open faults need a part that is not ordered yet.
 * Renders nothing for a location without open faults.
 */
function LocationFaultsBadge({ summary }: { summary: FindingsByLocationItem | null | undefined }) {
  const { t } = useTranslation('findings')
  if (!summary || summary.open <= 0) return null
  const red = faultTone(summary) === 'red'
  const title =
    t('locationBadge.open', { count: summary.open }) +
    (summary.out_of_service > 0 ? `, ${t('locationBadge.outOfService', { count: summary.out_of_service })}` : '')

  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="location-faults">
      <span
        title={title}
        aria-label={title}
        data-tone={red ? 'red' : 'amber'}
        data-open={summary.open}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
          red ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
        )}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {summary.open}
      </span>
      {summary.to_order > 0 ? (
        <span
          title={t('locationBadge.toOrderTitle', { count: summary.to_order })}
          data-testid="location-to-order"
          className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
        >
          <PackageSearch className="h-3 w-3" aria-hidden="true" />
          {t('locationBadge.toOrder')}
        </span>
      ) : null}
    </span>
  )
}

export default LocationFaultsBadge
