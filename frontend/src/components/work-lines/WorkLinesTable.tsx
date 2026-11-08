import { useTranslation } from 'react-i18next'

import { totalWorkHours, workUnitLabel, type WorkLine } from '../../lib/workLines'
import { getLocale } from '../../i18n'

interface WorkLinesTableProps {
  lines: WorkLine[]
  emptyText?: string
}

const format = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : value.toLocaleString(getLocale(), { maximumFractionDigits: 2 })

/** Read-only table of work / material rows (detail views). */
function WorkLinesTable({ lines, emptyText }: WorkLinesTableProps) {
  const { t } = useTranslation('workLines')
  if (lines.length === 0) {
    return <p className="text-sm text-zinc-500" data-testid="work-lines-none">{emptyText ?? t('view.none')}</p>
  }
  const total = totalWorkHours(lines)
  return (
    <div className="overflow-x-auto" data-testid="work-lines-table">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-[62px] sm:w-24" />
          <col className="w-[66px] sm:w-24" />
          <col className="w-[46px] sm:w-20" />
        </colgroup>
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
            <th className="w-8 py-2 pr-2 font-semibold">{t('columns.number')}</th>
            <th className="py-2 pr-2 font-semibold">{t('columns.name')}</th>
            <th className="py-2 pr-1.5 text-right font-semibold [overflow-wrap:anywhere]">{t('columns.quantity')}</th>
            <th className="py-2 pr-1.5 pl-1.5 font-semibold [overflow-wrap:anywhere]">{t('columns.unitShort')}</th>
            <th className="py-2 text-right font-semibold [overflow-wrap:anywhere]">{t('columns.hours')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id ?? index} className="border-b border-zinc-100 align-top">
              <td className="py-2 pr-2 text-zinc-500">{index + 1}</td>
              <td className="py-2 pr-2 text-zinc-900 [overflow-wrap:anywhere]">{line.name}</td>
              <td className="py-2 pr-1.5 text-right tabular-nums">{format(line.quantity)}</td>
              <td className="py-2 pr-1.5 pl-1.5 [overflow-wrap:anywhere]">{workUnitLabel(t, line.unit)}</td>
              <td className="py-2 text-right tabular-nums">{format(line.hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > 0 ? (
        <p className="mt-2 text-right text-sm font-semibold text-zinc-800" data-testid="work-lines-total-view">
          {t('view.totalHours', { n: format(total) })}
        </p>
      ) : null}
    </div>
  )
}

export default WorkLinesTable
