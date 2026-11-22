import { useTranslation } from 'react-i18next'

import { Skeleton } from './skeleton'
import { Card } from './card'

/** Screen-reader announcement used by every skeleton block. */
function LoadingAnnouncement() {
  const { t } = useTranslation()
  return (
    <span role="status" className="sr-only">
      {t('common:states.loading')}
    </span>
  )
}

/** Placeholder rows for a table body (same cell padding as real rows, so little shifts when data arrives). */
export function TableSkeletonRows({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} data-testid="skeleton-row" className="border-b border-zinc-100">
          {Array.from({ length: columns }).map((__, cellIndex) => (
            <td key={cellIndex} className="p-4 align-middle">
              <Skeleton className="h-5 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Placeholder for a list of cards (vehicles, findings, ...). */
export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={className ?? 'grid gap-3'} aria-busy="true" data-testid="list-skeleton">
      <LoadingAnnouncement />
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index} className="flex h-28 items-center gap-4 rounded-xl border border-zinc-200 p-4 shadow-sm">
          <Skeleton className="h-20 w-24 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  )
}

/** Placeholder for a Home card (title, subtitle and a few rows). */
export function CardSkeleton({ rows = 2, className }: { rows?: number; className?: string }) {
  return (
    <Card className={className ?? 'rounded-2xl border border-zinc-200 p-4 shadow-sm sm:p-6'} aria-busy="true" data-testid="card-skeleton">
      <LoadingAnnouncement />
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </Card>
  )
}

/** Placeholder for the four Home KPI tiles (same grid as the real ones). */
export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-4" aria-busy="true" data-testid="kpi-skeleton">
      <LoadingAnnouncement />
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="rounded-2xl border border-zinc-200 p-4 shadow-sm sm:p-6">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-3 h-8 w-1/3 sm:mt-5" />
        </Card>
      ))}
    </div>
  )
}
