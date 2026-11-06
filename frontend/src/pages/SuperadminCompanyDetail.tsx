import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

import { ApiError, getSuperadminCompany } from '../services/api'
import type { SuperadminAuditRow, SuperadminCompanyDetail, SuperadminMember } from '../types/superadmin'
import { Button } from '../components/ui/button'
import CompanyActionDialog, { type CompanyAction } from '../components/superadmin/CompanyActionDialog'
import { PlanBadge, StatusCell } from '../components/superadmin/CompanyCells'
import { useOverviewStatusLabel } from '../hooks/useOverviewStatusLabel'
import { useFormat } from '../lib/format'
import { cn } from '../lib/utils'
import { getOverviewStatus, limitState, type LimitState } from '../lib/superadminOverview'

const LIMIT_STYLE: Record<LimitState, string> = {
  ok: 'text-zinc-900',
  at: 'text-zinc-900',
  over: 'font-semibold text-red-600',
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-gray-700">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-zinc-900">{children}</dd>
    </div>
  )
}

const AUDIT_FIELD_KEYS = [
  'plan_code',
  'status',
  'trial_ends_at',
  'current_period_end',
  'admin_limit_override',
  'technician_limit_override',
  'role',
  'is_active',
] as const

function AuditEntry({ row }: { row: SuperadminAuditRow }) {
  const { t, i18n } = useTranslation('superadmin')
  const { formatDateTime, formatDate } = useFormat()
  const statusLabel = useOverviewStatusLabel()

  const actionKey = `companyDetail.audit.actions.${row.action}`
  const label = i18n.exists(`superadmin:${actionKey}`) ? t(actionKey) : row.action

  const formatValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'boolean') return value ? t('companyDetail.yes') : t('companyDetail.no')
    if (field === 'status' && typeof value === 'string') return statusLabel(value as Parameters<typeof statusLabel>[0])
    if (field === 'role' && typeof value === 'string') return t(`common:roles.${value}`, { defaultValue: value })
    if ((field === 'trial_ends_at' || field === 'current_period_end') && typeof value === 'string') return formatDate(value)
    return String(value)
  }

  const meta = row.metadata
  const changes: string[] = []
  if (meta?.before && meta?.after) {
    for (const field of AUDIT_FIELD_KEYS) {
      const before = (meta.before as Record<string, unknown>)[field]
      const after = (meta.after as Record<string, unknown>)[field]
      if (before !== after && (field in meta.before || field in meta.after)) {
        changes.push(`${t(`companyDetail.audit.fields.${field}`)}: ${formatValue(field, before)} → ${formatValue(field, after)}`)
      }
    }
  }

  return (
    <li className="border-l-2 border-zinc-200 pl-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-zinc-900">{label}</span>
        <span className="text-xs text-zinc-500">{formatDateTime(row.created_at)}</span>
      </div>
      <div className="break-words text-xs text-zinc-500">
        {row.user_email ?? t('companyDetail.audit.unknownUser')}
        {meta?.target_email ? ` · ${meta.target_email}` : ''}
        {meta?.attempted_action ? ` · ${meta.attempted_action}` : ''}
      </div>
      {meta?.reason ? <div className="mt-1 break-words text-xs text-zinc-700">“{meta.reason}”</div> : null}
      {changes.length ? (
        <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
          {changes.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function MemberActions({ member, onAction }: { member: SuperadminMember; onAction: (action: CompanyAction) => void }) {
  const { t } = useTranslation('superadmin')
  if (member.is_self) return <span className="text-xs text-zinc-400">{t('companyDetail.members.you')}</span>
  if (member.is_superadmin) return <span className="text-xs text-zinc-400">{t('companyDetail.members.superadminLocked')}</span>
  const disabled = !member.is_active || member.disabled_at !== null
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'userRole', member })}>
        {t('companyDetail.members.changeRole')}
      </Button>
      {disabled ? (
        <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'userEnable', member })}>
          {t('companyDetail.members.enable')}
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'userDisable', member })}>
          {t('companyDetail.members.disable')}
        </Button>
      )}
      <Button size="sm" variant="outline" className="text-red-600" onClick={() => onAction({ kind: 'userRemove', member })}>
        {t('companyDetail.members.remove')}
      </Button>
    </div>
  )
}

function MemberStatus({ member }: { member: SuperadminMember }) {
  const { t } = useTranslation('superadmin')
  const disabled = !member.is_active || member.disabled_at !== null
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
      {disabled ? t('companyDetail.members.disabled') : t('companyDetail.members.activeStatus')}
    </span>
  )
}

function SuperadminCompanyPage() {
  const { t } = useTranslation('superadmin')
  const { id } = useParams()
  const companyId = Number(id)
  const queryClient = useQueryClient()
  const { formatDate, formatDateTime, formatNumber, formatCurrency } = useFormat()
  const [action, setAction] = useState<CompanyAction | null>(null)
  const statusLabel = useOverviewStatusLabel()

  const query = useQuery<SuperadminCompanyDetail, Error>({
    queryKey: ['superadmin', 'company', companyId],
    queryFn: () => getSuperadminCompany(companyId),
    enabled: Number.isInteger(companyId) && companyId > 0,
    retry: false,
  })
  const company = query.data
  const [now] = useState(() => Date.now())
  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: ['superadmin', 'company', companyId] })
  }

  const backLink = (
    <Link to="/superadmin" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-black">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {t('companyDetail.back')}
    </Link>
  )

  if (query.isLoading) {
    return (
      <div className="min-h-full w-full max-w-full overflow-x-clip bg-gray-50">
        <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
          {backLink}
          <p className="py-10 text-center text-sm text-gray-500">{t('companyDetail.loading')}</p>
        </div>
      </div>
    )
  }

  if (query.isError || !company) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <div className="min-h-full w-full max-w-full overflow-x-clip bg-gray-50">
        <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
          {backLink}
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-rose-600">{notFound ? t('companyDetail.notFound') : t('companyDetail.loadError')}</p>
            {!notFound ? (
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('superadminDashboard.retry')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const sub = company.subscription
  const stripeManaged = Boolean(sub?.stripe_managed)
  const status = sub?.status
  const suspended = status === 'suspended'
  const price = sub && sub.price_cents !== null ? formatCurrency(sub.price_cents / 100) : '—'
  const pendingByRole = { admin: 0, technician: 0, viewer: 0 }
  for (const invite of company.invitations) pendingByRole[invite.role] += 1

  const limitRows = [
    { key: 'admin', label: t('superadminDashboard.admins'), used: company.usage.admins, limit: company.limits.admin, planLimit: company.plan_limits.admin, override: company.limits.admin_override },
    { key: 'technician', label: t('superadminDashboard.technicians'), used: company.usage.technicians, limit: company.limits.technician, planLimit: company.plan_limits.technician, override: company.limits.technician_override },
  ] as const

  const counts: Array<[string, number]> = [
    [t('superadminDashboard.users'), company.total_users],
    [t('superadminDashboard.locations'), company.total_locations],
    [t('companyDetail.counts.elevators'), company.total_elevators],
    ['RMS', company.total_rms],
    [t('common:labels.interventions'), company.total_interventions],
    [t('companyDetail.counts.workOrders'), company.total_work_orders],
  ]

  const planActionsDisabled = stripeManaged
  const stripeHint = stripeManaged ? t('companyDetail.stripeManagedShort') : undefined

  return (
    <div className="min-h-full w-full max-w-full overflow-x-clip bg-gray-50">
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        {backLink}

        <header className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="break-words text-2xl font-semibold tracking-tight text-zinc-900">{company.name}</h1>
              <PlanBadge company={company} />
              <p className="text-xs text-zinc-500">
                {t('companyDetail.createdOn', { date: formatDate(company.created_at) })}
                {' · '}#{company.id}
              </p>
            </div>
            <StatusCell company={company} now={now} />
          </div>
          {company.access.locked ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {t(company.access.reason === 'trial_expired' ? 'companyDetail.lockedTrialExpired' : 'companyDetail.lockedInactive')}
            </p>
          ) : null}
          {stripeManaged ? (
            <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">{t('companyDetail.stripeManaged')}</p>
          ) : null}
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {counts.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">{formatNumber(value)}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
          <Section title={t('companyDetail.subscription.title')}>
            {sub ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label={t('superadminDashboard.plan')}>{sub.plan_name}</Field>
                <Field label={t('companyDetail.subscription.price')}>{price}</Field>
                <Field label={t('superadminDashboard.statusColumn')}>
                  {statusLabel(getOverviewStatus(company))}
                </Field>
                <Field label={t('companyDetail.subscription.trialEnds')}>{formatDateTime(sub.trial_ends_at)}</Field>
                <Field label={t('companyDetail.subscription.periodStart')}>{formatDateTime(sub.current_period_start)}</Field>
                <Field label={t('companyDetail.subscription.periodEnd')}>{formatDateTime(sub.current_period_end)}</Field>
                <Field label={t('companyDetail.subscription.cancelAtEnd')}>{sub.cancel_at_period_end ? t('companyDetail.yes') : t('companyDetail.no')}</Field>
                <Field label={t('superadminDashboard.stripeLinked')}>{sub.has_stripe ? t('companyDetail.linked') : t('companyDetail.notLinked')}</Field>
              </dl>
            ) : (
              <p className="text-sm text-zinc-500">{t('companyDetail.subscription.none')}</p>
            )}
            {sub ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                <Button size="sm" variant="outline" disabled={planActionsDisabled} title={stripeHint} onClick={() => setAction({ kind: 'plan' })}>
                  {t('companyDetail.subscription.changePlan')}
                </Button>
                {status === 'trial' ? (
                  <Button size="sm" variant="outline" disabled={planActionsDisabled} title={stripeHint} onClick={() => setAction({ kind: 'trial' })}>
                    {t('companyDetail.subscription.extendTrial')}
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" disabled={planActionsDisabled} title={stripeHint} onClick={() => setAction({ kind: 'grant' })}>
                  {t('companyDetail.subscription.grantFree')}
                </Button>
                {suspended ? (
                  <Button size="sm" variant="outline" disabled={planActionsDisabled} title={stripeHint} onClick={() => setAction({ kind: 'unsuspend' })}>
                    {t('companyDetail.subscription.unsuspend')}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="text-red-600" disabled={planActionsDisabled} title={stripeHint} onClick={() => setAction({ kind: 'suspend' })}>
                    {t('companyDetail.subscription.suspend')}
                  </Button>
                )}
                {status !== 'canceled' ? (
                  <Button size="sm" variant="outline" className="text-red-600" disabled={planActionsDisabled} title={stripeHint} onClick={() => setAction({ kind: 'cancel' })}>
                    {t('companyDetail.subscription.cancel')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section
            title={t('companyDetail.limits.title')}
            aside={
              sub ? (
                <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'limits' })}>
                  {t('companyDetail.limits.edit')}
                </Button>
              ) : null
            }
          >
            <div className="space-y-3">
              {limitRows.map((row) => {
                const state = limitState(row.used, row.limit)
                return (
                  <div key={row.key} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900">{row.label}</span>
                      <span className={cn('text-sm tabular-nums', LIMIT_STYLE[state])}>
                        {row.used}/{row.limit === null ? '∞' : row.limit}
                        {state === 'over' ? ` · ${t('superadminDashboard.limitOver')}` : state === 'at' ? ` · ${t('superadminDashboard.limitAt')}` : ''}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.override
                        ? t('companyDetail.limits.overrideActive', { plan: row.planLimit === null ? t('superadminDashboard.unlimited') : row.planLimit })
                        : t('companyDetail.limits.fromPlan')}
                      {pendingByRole[row.key] > 0 ? ` · ${t('companyDetail.limits.pending', { count: pendingByRole[row.key] })}` : ''}
                    </div>
                  </div>
                )
              })}
              <div className="flex items-baseline justify-between gap-2 rounded-lg border border-gray-200 p-3">
                <span className="text-sm font-medium text-zinc-900">{t('superadminDashboard.viewers')}</span>
                <span className="text-sm tabular-nums text-zinc-900">
                  {company.usage.viewers} · {t('superadminDashboard.unlimited')}
                </span>
              </div>
            </div>
          </Section>
        </div>

        <Section title={t('companyDetail.members.title', { total: company.members.length })}>
          {company.members.length === 0 ? (
            <p className="text-sm text-zinc-500">{t('companyDetail.members.none')}</p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {company.members.map((member) => (
                  <li key={member.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="break-words text-sm font-medium text-zinc-900">{member.full_name || member.email}</div>
                    {member.full_name ? <div className="break-all text-xs text-zinc-500">{member.email}</div> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">{t(`common:roles.${member.is_superadmin ? 'superadmin' : member.role}`)}</span>
                      <MemberStatus member={member} />
                      <span className="text-zinc-500">
                        {t('companyDetail.members.lastLogin')}: {member.last_login_at ? formatDateTime(member.last_login_at) : t('companyDetail.members.never')}
                      </span>
                    </div>
                    {member.other_companies > 0 ? (
                      <div className="mt-1 text-xs text-amber-700">{t('companyDetail.members.otherCompanies', { count: member.other_companies })}</div>
                    ) : null}
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <MemberActions member={member} onAction={setAction} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">{t('companyDetail.members.user')}</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">{t('companyDetail.members.role')}</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">{t('superadminDashboard.statusColumn')}</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">{t('companyDetail.members.lastLogin')}</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">{t('companyDetail.members.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {company.members.map((member) => (
                      <tr key={member.id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900">{member.full_name || member.email}</div>
                          {member.full_name ? <div className="text-xs text-zinc-500">{member.email}</div> : null}
                          {member.other_companies > 0 ? (
                            <div className="text-xs text-amber-700">{t('companyDetail.members.otherCompanies', { count: member.other_companies })}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{t(`common:roles.${member.is_superadmin ? 'superadmin' : member.role}`)}</td>
                        <td className="px-4 py-3">
                          <MemberStatus member={member} />
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{member.last_login_at ? formatDateTime(member.last_login_at) : t('companyDetail.members.never')}</td>
                        <td className="px-4 py-3">
                          <MemberActions member={member} onAction={setAction} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {company.invitations.length > 0 ? (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <h3 className="mb-2 text-sm font-medium text-zinc-700">{t('companyDetail.invitations.title', { total: company.invitations.length })}</h3>
              <ul className="space-y-1.5">
                {company.invitations.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
                    <span className="min-w-0 break-all text-zinc-900">{invite.email}</span>
                    <span className="text-xs text-zinc-500">
                      {t(`common:roles.${invite.role}`)} · {t('companyDetail.invitations.expires', { date: formatDate(invite.expires_at) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        <Section title={t('companyDetail.audit.title')}>
          {company.audit.length === 0 ? (
            <p className="text-sm text-zinc-500">{t('companyDetail.audit.none')}</p>
          ) : (
            <ul className="space-y-4">
              {company.audit.map((row) => (
                <AuditEntry key={row.id} row={row} />
              ))}
            </ul>
          )}
        </Section>

        <CompanyActionDialog company={company} action={action} onClose={() => setAction(null)} onDone={refetch} />
      </div>
    </div>
  )
}

export default SuperadminCompanyPage
