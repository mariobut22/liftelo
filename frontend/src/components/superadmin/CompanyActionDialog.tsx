import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { ApiError, runSuperadminAction } from '../../services/api'
import type { CompanyMemberRole, SuperadminActionPath, SuperadminCompanyDetail, SuperadminMember } from '../../types/superadmin'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import FormError from '../form/FormError'

export type CompanyAction =
  | { kind: 'plan' | 'trial' | 'grant' | 'limits' | 'suspend' | 'unsuspend' | 'cancel' }
  | { kind: 'userDisable' | 'userEnable' | 'userRemove' | 'userRole'; member: SuperadminMember }

const DANGEROUS = new Set<CompanyAction['kind']>(['suspend', 'cancel', 'userDisable', 'userRemove'])
const ROLES: CompanyMemberRole[] = ['admin', 'technician', 'viewer']
const SELECT_CLASS = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900'
const LABEL_CLASS = 'block text-sm font-medium text-zinc-700'

interface Props {
  company: SuperadminCompanyDetail
  action: CompanyAction | null
  onClose: () => void
  onDone: () => void
}

const todayPlus = (days: number) => {
  const date = new Date(Date.now() + days * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function CompanyActionDialog({ company, action, onClose, onDone }: Props) {
  // remount per action so every dialog starts with fresh fields
  return (
    <Dialog open={action !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {action ? <DialogBody key={action.kind + ('member' in action ? action.member.id : '')} company={company} action={action} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  )
}

function DialogBody({ company, action, onClose, onDone }: Omit<Props, 'action'> & { action: CompanyAction }) {
  const { t } = useTranslation('superadmin')
  const sub = company.subscription
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // change plan
  const [planCode, setPlanCode] = useState(sub?.plan_code ?? company.plans[0]?.code ?? '')
  const [statusChoice, setStatusChoice] = useState<'keep' | 'active' | 'trial'>('keep')
  const [endDate, setEndDate] = useState('')
  // extend trial
  const [trialMode, setTrialMode] = useState<'days' | 'date'>('days')
  const [days, setDays] = useState('7')
  const [trialDate, setTrialDate] = useState(() => todayPlus(14))
  // grant free period
  const [months, setMonths] = useState('1')
  const [grantPlan, setGrantPlan] = useState('keep')
  // limits
  const [adminPlanLimit, setAdminPlanLimit] = useState(!company.limits.admin_override)
  const [techPlanLimit, setTechPlanLimit] = useState(!company.limits.technician_override)
  const [adminValue, setAdminValue] = useState(String(company.limits.admin ?? 0))
  const [techValue, setTechValue] = useState(String(company.limits.technician ?? 0))
  // role
  const member = 'member' in action ? action.member : null
  const [role, setRole] = useState<CompanyMemberRole>(member ? ROLES.find((r) => r !== member.role) ?? 'viewer' : 'viewer')

  const dangerous = DANGEROUS.has(action.kind)
  const effectiveStatus = statusChoice === 'keep' ? sub?.status : statusChoice
  const intInRange = (value: string, min: number, max: number) => /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max

  const fieldsValid = useMemo(() => {
    switch (action.kind) {
      case 'plan':
        return Boolean(planCode)
      case 'trial':
        return trialMode === 'days' ? intInRange(days, 1, 90) : Boolean(trialDate)
      case 'grant':
        return intInRange(months, 1, 12)
      case 'limits':
        return (adminPlanLimit || intInRange(adminValue, 0, 1000)) && (techPlanLimit || intInRange(techValue, 0, 1000))
      default:
        return true
    }
  }, [action.kind, planCode, trialMode, days, trialDate, months, adminPlanLimit, adminValue, techPlanLimit, techValue])

  const reasonValid = reason.trim().length >= 5
  const canSubmit = fieldsValid && reasonValid && password.length > 0 && !submitting

  const buildRequest = (): { path: SuperadminActionPath; fields: Record<string, unknown> } => {
    switch (action.kind) {
      case 'plan': {
        const fields: Record<string, unknown> = { plan_code: planCode }
        if (statusChoice !== 'keep') fields.status = statusChoice
        if (endDate) fields[effectiveStatus === 'trial' ? 'trial_ends_at' : 'period_end'] = endDate
        return { path: 'plan', fields }
      }
      case 'trial':
        return { path: 'trial', fields: trialMode === 'days' ? { days: Number(days) } : { trial_ends_at: trialDate } }
      case 'grant':
        return { path: 'grant-free-period', fields: { months: Number(months), ...(grantPlan !== 'keep' ? { plan_code: grantPlan } : {}) } }
      case 'limits':
        return {
          path: 'limits',
          fields: {
            admin_limit_override: adminPlanLimit ? null : Number(adminValue),
            technician_limit_override: techPlanLimit ? null : Number(techValue),
          },
        }
      case 'suspend':
        return { path: 'suspend', fields: {} }
      case 'unsuspend':
        return { path: 'unsuspend', fields: {} }
      case 'cancel':
        return { path: 'cancel', fields: {} }
      case 'userDisable':
        return { path: `users/${action.member.id}/disable`, fields: {} }
      case 'userEnable':
        return { path: `users/${action.member.id}/enable`, fields: {} }
      case 'userRemove':
        return { path: `users/${action.member.id}/remove`, fields: {} }
      case 'userRole':
      default:
        return { path: `users/${(action as { member: SuperadminMember }).member.id}/role`, fields: { role } }
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { path, fields } = buildRequest()
      await runSuperadminAction(company.id, path, { ...fields, reason: reason.trim(), password })
      toast.success(t('companyDetail.actionDone'))
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('companyDetail.actionFailed'))
      // a wrong password must be retyped; never keep it around
      if (err instanceof ApiError && (err.code === 'invalid_password' || err.code === 'too_many_attempts')) setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  const userLabel = member ? member.full_name || member.email || `#${member.id}` : ''
  const params = { company: company.name, user: userLabel }
  const showOtherCompaniesWarning = member && member.other_companies > 0 && (action.kind === 'userDisable' || action.kind === 'userEnable')

  return (
    <DialogContent className="max-w-lg">
      <div className="space-y-2 border-b border-zinc-200 px-6 py-4">
        <DialogTitle>{t(`companyDetail.actions.${action.kind}.title`, params)}</DialogTitle>
        <DialogDescription>{t(`companyDetail.actions.${action.kind}.description`, params)}</DialogDescription>
      </div>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {dangerous ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t('companyDetail.dangerNotice')}</p>
          ) : null}
          {showOtherCompaniesWarning ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('companyDetail.otherCompaniesWarning', { count: member?.other_companies })}
            </p>
          ) : null}

          {action.kind === 'plan' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="sa-plan" className={LABEL_CLASS}>{t('companyDetail.fields.plan')}</label>
                <select id="sa-plan" className={SELECT_CLASS} value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
                  {company.plans.map((plan) => (
                    <option key={plan.code} value={plan.code}>{plan.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="sa-status" className={LABEL_CLASS}>{t('companyDetail.fields.statusAfter')}</label>
                <select id="sa-status" className={SELECT_CLASS} value={statusChoice} onChange={(e) => { setStatusChoice(e.target.value as 'keep' | 'active' | 'trial'); setEndDate('') }}>
                  <option value="keep">{t('companyDetail.fields.keepStatus')}</option>
                  <option value="active">{t('superadminDashboard.status.active')}</option>
                  <option value="trial">{t('superadminDashboard.status.trial')}</option>
                </select>
              </div>
              {effectiveStatus === 'trial' || effectiveStatus === 'active' ? (
                <div className="space-y-1.5">
                  <label htmlFor="sa-end" className={LABEL_CLASS}>
                    {effectiveStatus === 'trial' ? t('companyDetail.fields.trialEndOptional') : t('companyDetail.fields.periodEndOptional')}
                  </label>
                  <Input id="sa-end" type="date" min={todayPlus(1)} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              ) : null}
            </>
          ) : null}

          {action.kind === 'trial' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="sa-trial-mode" className={LABEL_CLASS}>{t('companyDetail.fields.trialMode')}</label>
                <select id="sa-trial-mode" className={SELECT_CLASS} value={trialMode} onChange={(e) => setTrialMode(e.target.value as 'days' | 'date')}>
                  <option value="days">{t('companyDetail.fields.trialModeDays')}</option>
                  <option value="date">{t('companyDetail.fields.trialModeDate')}</option>
                </select>
              </div>
              {trialMode === 'days' ? (
                <div className="space-y-1.5">
                  <label htmlFor="sa-days" className={LABEL_CLASS}>{t('companyDetail.fields.days')}</label>
                  <Input id="sa-days" type="number" inputMode="numeric" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
                  <p className="text-xs text-zinc-500">{t('companyDetail.fields.daysHint')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="sa-trial-date" className={LABEL_CLASS}>{t('companyDetail.fields.trialEnd')}</label>
                  <Input id="sa-trial-date" type="date" min={todayPlus(1)} value={trialDate} onChange={(e) => setTrialDate(e.target.value)} />
                </div>
              )}
            </>
          ) : null}

          {action.kind === 'grant' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="sa-months" className={LABEL_CLASS}>{t('companyDetail.fields.months')}</label>
                <Input id="sa-months" type="number" inputMode="numeric" min={1} max={12} value={months} onChange={(e) => setMonths(e.target.value)} />
                <p className="text-xs text-zinc-500">{t('companyDetail.fields.monthsHint')}</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="sa-grant-plan" className={LABEL_CLASS}>{t('companyDetail.fields.plan')}</label>
                <select id="sa-grant-plan" className={SELECT_CLASS} value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)}>
                  <option value="keep">{t('companyDetail.fields.keepPlan', { plan: sub?.plan_name ?? '' })}</option>
                  {company.plans.map((plan) => (
                    <option key={plan.code} value={plan.code}>{plan.name}</option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {action.kind === 'limits' ? (
            <>
              {(
                [
                  ['admin', t('superadminDashboard.admins'), adminPlanLimit, setAdminPlanLimit, adminValue, setAdminValue, company.plan_limits.admin],
                  ['technician', t('superadminDashboard.technicians'), techPlanLimit, setTechPlanLimit, techValue, setTechValue, company.plan_limits.technician],
                ] as const
              ).map(([key, label, usePlan, setUsePlan, value, setValue, planLimit]) => (
                <div key={key} className="space-y-1.5 rounded-lg border border-zinc-200 p-3">
                  <label htmlFor={`sa-limit-${key}`} className={LABEL_CLASS}>{label}</label>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input type="checkbox" checked={usePlan} onChange={(e) => setUsePlan(e.target.checked)} className="h-4 w-4" />
                    {t('companyDetail.fields.usePlanLimit', { limit: planLimit === null ? t('superadminDashboard.unlimited') : planLimit })}
                  </label>
                  <Input
                    id={`sa-limit-${key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1000}
                    disabled={usePlan}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
              ))}
              <p className="text-xs text-zinc-500">{t('companyDetail.fields.limitsHint')}</p>
            </>
          ) : null}

          {action.kind === 'userRole' ? (
            <div className="space-y-1.5">
              <label htmlFor="sa-role" className={LABEL_CLASS}>{t('companyDetail.fields.newRole')}</label>
              <select id="sa-role" className={SELECT_CLASS} value={role} onChange={(e) => setRole(e.target.value as CompanyMemberRole)}>
                {ROLES.filter((r) => r !== member?.role).map((r) => (
                  <option key={r} value={r}>{t(`common:roles.${r}`)}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="sa-reason" className={LABEL_CLASS}>{t('companyDetail.fields.reason')}</label>
            <textarea
              id="sa-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('companyDetail.fields.reasonPlaceholder')}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
            <p className="text-xs text-zinc-500">{t('companyDetail.fields.reasonHint')}</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sa-password" className={LABEL_CLASS}>{t('companyDetail.fields.password')}</label>
            <Input
              id="sa-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-xs text-zinc-500">{t('companyDetail.fields.passwordHint')}</p>
          </div>
          {error ? <FormError>{error}</FormError> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" variant={dangerous ? 'destructive' : 'default'} disabled={!canSubmit}>
            {submitting ? t('companyDetail.working') : t(`companyDetail.actions.${action.kind}.confirm`)}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}
