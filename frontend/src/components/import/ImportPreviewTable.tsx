import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import type { ImportPreviewRow, ImportRowMessage, ImportRowStatus } from '../../lib/locationImport'

const STATUS_CLASSES: Record<ImportRowStatus, { badge: string; row: string }> = {
  ok: { badge: 'bg-emerald-100 text-emerald-700', row: '' },
  warning: { badge: 'bg-amber-100 text-amber-800', row: 'bg-amber-50/50' },
  error: { badge: 'bg-rose-100 text-rose-700', row: 'bg-rose-50/60' },
}

/** Row-by-row validation result. Horizontally scrollable on a phone; messages are translated by code. */
function ImportPreviewTable({ rows, onlyProblems }: { rows: ImportPreviewRow[]; onlyProblems: boolean }) {
  const { t, i18n } = useTranslation('import')

  const visible = useMemo(() => (onlyProblems ? rows.filter((row) => row.status !== 'ok') : rows), [rows, onlyProblems])

  const messageText = (message: ImportRowMessage) => {
    const key = `rowMessages.${message.code}`
    if (!i18n.exists(`import:${key}`)) return message.code
    const field = message.params?.field ? t(`fields.${message.params.field}`, { defaultValue: message.params.field }) : ''
    return t(key, { field, max: message.params?.max, label: message.params?.label })
  }

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600" data-testid="import-no-problems">
        {t('preview.noProblems')}
      </p>
    )
  }

  return (
    <div className="max-h-[28rem] overflow-auto rounded-xl border border-zinc-200" data-testid="import-table-scroll">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm" data-testid="import-table">
        <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">{t('preview.table.row')}</th>
            <th className="px-3 py-2 font-medium">{t('preview.table.status')}</th>
            <th className="px-3 py-2 font-medium">{t('preview.table.building')}</th>
            <th className="px-3 py-2 font-medium">{t('preview.table.address')}</th>
            <th className="px-3 py-2 font-medium">{t('preview.table.elevator')}</th>
            <th className="px-3 py-2 font-medium">{t('preview.table.notes')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {visible.map((row) => (
            <tr key={row.row} data-status={row.status} className={cn('align-top', STATUS_CLASSES[row.status].row)}>
              <td className="px-3 py-2 text-zinc-500">{row.row}</td>
              <td className="px-3 py-2">
                <Badge className={STATUS_CLASSES[row.status].badge}>{t(`preview.status.${row.status}`)}</Badge>
              </td>
              <td className="px-3 py-2 font-medium text-zinc-900">{row.name || '—'}</td>
              <td className="px-3 py-2 text-zinc-600">{row.address || '—'}</td>
              <td className="px-3 py-2 text-zinc-600">{row.elevator || '—'}</td>
              <td className="px-3 py-2 text-xs text-zinc-600">
                {row.messages.length === 0 ? (
                  '—'
                ) : (
                  <ul className="space-y-1">
                    {row.messages.map((message, index) => (
                      <li
                        key={`${message.code}-${index}`}
                        className={cn(message.level === 'error' ? 'text-rose-700' : message.level === 'warning' ? 'text-amber-800' : 'text-zinc-500')}
                      >
                        {messageText(message)}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ImportPreviewTable
