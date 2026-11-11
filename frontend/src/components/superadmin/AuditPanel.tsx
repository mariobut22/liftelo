import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { getSuperadminAudit, getSuperadminCompanies } from '../../services/api'
import type { SuperadminAuditEntry, SuperadminAuditFilters, SuperadminAuditPage } from '../../types/superadmin'
import { useFormat } from '../../lib/format'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { PanelCard, QueryBoundary } from './MonitoringShared'

const PAGE_SIZE = 25
const selectClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm'

function AuditRow({ row }: { row: SuperadminAuditEntry }) {
  const { t, i18n } = useTranslation('superadmin')
  const { formatDateTime } = useFormat()
  const actionKey = `companyDetail.audit.actions.${row.action}`
  const label = i18n.exists(`superadmin:${actionKey}`) ? t(actionKey) : row.action
  const isSuperadminAction = row.action.startsWith('superadmin_')

  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-zinc-900">
          {label}
          {isSuperadminAction ? (
            <span className="ml-2 rounded-md bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">{t('monitoring.audit.superadminBadge')}</span>
          ) : null}
        </span>
        <span className="text-xs text-gray-500">{formatDateTime(row.created_at)}</span>
      </div>
      <p className="mt-0.5 break-words text-xs text-gray-500">
        {row.user_email ?? (row.user_id ? t('monitoring.audit.userId', { id: row.user_id }) : t('monitoring.audit.noUser'))}
        {' · '}
        {row.company_id ? (
          <Link to={`/superadmin/companies/${row.company_id}`} className="underline-offset-2 hover:underline">
            {row.company_name ?? t('monitoring.audit.companyId', { id: row.company_id })}
          </Link>
        ) : (
          t('monitoring.audit.noCompany')
        )}
        {isSuperadminAction ? <span className="ml-2 font-mono text-[11px] text-gray-400">{row.action}</span> : null}
      </p>
      {row.metadata && Object.keys(row.metadata).length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-gray-600 hover:text-black">{t('monitoring.audit.details')}</summary>
          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-2 text-[11px] text-gray-700">
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </details>
      ) : null}
    </li>
  )
}

export default function AuditPanel() {
  const { t } = useTranslation('superadmin')
  const [draft, setDraft] = useState<SuperadminAuditFilters>({})
  const [applied, setApplied] = useState<SuperadminAuditFilters>({})
  const [page, setPage] = useState(0)

  const companies = useQuery({ queryKey: ['superadmin', 'companies'], queryFn: getSuperadminCompanies, retry: false, staleTime: 60_000 })
  const query = useQuery<SuperadminAuditPage, Error>({
    queryKey: ['superadmin', 'audit', applied, page],
    queryFn: () => getSuperadminAudit(applied, page * PAGE_SIZE, PAGE_SIZE),
    retry: false,
    placeholderData: (previous) => previous,
  })
  // the action list only comes with the first page; keep it while paging
  const [actions, setActions] = useState<string[]>([])
  if (query.data?.actions && query.data.actions.join() !== actions.join()) setActions(query.data.actions)

  const apply = () => {
    setApplied({ ...draft })
    setPage(0)
  }
  const reset = () => {
    setDraft({})
    setApplied({})
    setPage(0)
  }
  const update = (patch: Partial<SuperadminAuditFilters>) => setDraft((current) => ({ ...current, ...patch }))
  const hasFilters = Object.values(applied).some(Boolean)
  const actionLabel = (action: string) => {
    const key = `companyDetail.audit.actions.${action}`
    return t(key, { defaultValue: action })
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PanelCard title={t('monitoring.audit.filtersTitle')}>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault()
            apply()
          }}
        >
          <label className="space-y-1 text-xs text-gray-600">
            <span>{t('monitoring.audit.company')}</span>
            <select className={selectClass} value={draft.company_id ?? ''} onChange={(event) => update({ company_id: event.target.value })}>
              <option value="">{t('monitoring.audit.allCompanies')}</option>
              {(companies.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            <span>{t('monitoring.audit.user')}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.user_id ?? ''}
              placeholder={t('monitoring.audit.userPlaceholder')}
              onChange={(event) => update({ user_id: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            <span>{t('monitoring.audit.action')}</span>
            <select className={selectClass} value={draft.action ?? ''} onChange={(event) => update({ action: event.target.value })}>
              <option value="">{t('monitoring.audit.allActions')}</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {actionLabel(action)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            <span>{t('monitoring.audit.from')}</span>
            <Input type="date" value={draft.from ?? ''} onChange={(event) => update({ from: event.target.value })} />
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            <span>{t('monitoring.audit.to')}</span>
            <Input type="date" value={draft.to ?? ''} onChange={(event) => update({ to: event.target.value })} />
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.scope === 'superadmin'}
              onChange={(event) => update({ scope: event.target.checked ? 'superadmin' : undefined })}
            />
            {t('monitoring.audit.onlySuperadmin')}
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit">{t('monitoring.audit.apply')}</Button>
            <Button type="button" variant="outline" onClick={reset}>
              {t('superadminDashboard.clearFilters')}
            </Button>
          </div>
        </form>
      </PanelCard>

      <PanelCard title={t('monitoring.audit.title')}>
        <QueryBoundary query={query}>
          {(data) =>
            data.rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">{hasFilters ? t('superadminDashboard.noResults') : t('monitoring.audit.empty')}</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100">
                  {data.rows.map((row) => (
                    <AuditRow key={row.id} row={row} />
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                    {t('monitoring.audit.previous')}
                  </Button>
                  <span className="text-xs text-gray-500">{t('monitoring.audit.pageLabel', { page: page + 1 })}</span>
                  <Button variant="outline" size="sm" disabled={!data.has_more || query.isFetching} onClick={() => setPage((current) => current + 1)}>
                    {t('monitoring.audit.next')}
                  </Button>
                </div>
              </>
            )
          }
        </QueryBoundary>
      </PanelCard>
    </div>
  )
}
