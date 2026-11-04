import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useAuthStore from '../store/authStore'
import useCompany from '../hooks/queries/useCompany'
import {
  activateBillingPlan,
  cancelBillingAtPeriodEnd,
  createBillingCheckoutSession,
  createBillingPortalSession,
  createCompany,
  getCompanySettings,
  resumeBilling,
  getSessionSettings,
  updateCompanySettings,
  updateSessionSettings,
} from '../services/api'
import useEmailSettings from '../hooks/queries/useEmailSettings'
import useUpdateEmailSettings from '../hooks/mutations/useUpdateEmailSettings'
import useSendTestEmail from '../hooks/mutations/useSendTestEmail'
import useUploadCompanyLogo from '../hooks/mutations/useUploadCompanyLogo'
import useBillingCurrent from '../hooks/queries/useBillingCurrent'
import useBillingPlans from '../hooks/queries/useBillingPlans'
import CompanyEditModal from '../components/company/CompanyEditModal'
import { MULTI_COMPANY_ENABLED } from '../config/features'
import CreateCompanyModal from '../components/company/CreateCompanyModal'
import { API_BASE_URL } from '../services/api'
import { useQueryClient } from '@tanstack/react-query'
import { getLocale } from '../i18n'
import { useTranslation } from 'react-i18next'

const formatLimit = (value?: number | null, unlimited = '∞') => (value === null || value === undefined ? unlimited : String(value))
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(getLocale()) : '—')

function Settings() {
  const { t } = useTranslation()

  const isAdmin = useAuthStore((state) => state.isAdmin())
  const companies = useAuthStore((state) => state.companies)
  const activeCompanyId = useAuthStore((state) => state.user?.company_id)
  const fetchCompanies = useAuthStore((state) => state.fetchCompanies)
  const fetchSession = useAuthStore((state) => state.fetchSession)
  const queryClient = useQueryClient()
  const { data: company, isLoading: companyLoading, error: companyError } = useCompany()
  const billingQuery = useBillingCurrent()
  const billingPlansQuery = useBillingPlans()
  const uploadLogo = useUploadCompanyLogo()
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [companyLanguage, setCompanyLanguage] = useState<'hr' | 'en'>('hr')
  const [languageSaving, setLanguageSaving] = useState(false)
  const [companyEditOpen, setCompanyEditOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const [logoVersion, setLogoVersion] = useState(0)
  const [uploadedLogoPath, setUploadedLogoPath] = useState<string | null>(null)
  const [billingActionPending, setBillingActionPending] = useState<string | null>(null)
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false)
  const emailSettings = useEmailSettings()
  const updateEmail = useUpdateEmailSettings()
  const sendTest = useSendTestEmail()
  const billing = billingQuery.data ?? null
  const billingPlans = billingPlansQuery.data ?? []
  const billingLoading = billingQuery.isLoading || billingPlansQuery.isLoading

  const resolveImageUrl = (imagePath?: string | null) => {
    if (!imagePath) return null
    if (/^https?:\/\//i.test(imagePath)) return imagePath

    const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`
    if (normalizedPath.startsWith('/uploads')) {
      const apiBase = API_BASE_URL.replace(/\/$/, '')
      return `${apiBase}${normalizedPath}`
    }
    return normalizedPath
  }

  const logoUrl = useMemo(() => {
    const path = uploadedLogoPath ?? company?.logo ?? company?.logo_path
    if (!path) return null
    return `${resolveImageUrl(path)}?v=${logoVersion}`
  }, [company?.logo, company?.logo_path, logoVersion, uploadedLogoPath])

  useEffect(() => {
    const enabled = emailSettings.data?.company_email_enabled ?? false
    setEmailEnabled(enabled)
  }, [emailSettings.data?.company_email_enabled])

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
      }
    }
  }, [])

  const handleLogoChange = (file?: File | null) => {
    if (!file) {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
        previewRef.current = null
      }
      setPreviewUrl(null)
      setSelectedFile(null)
      return
    }

    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
    }

    const url = URL.createObjectURL(file)
    previewRef.current = url
    setPreviewUrl(url)
    setSelectedFile(file)
  }

  const handleLogoUpload = async () => {
    if (!selectedFile || !isAdmin) return
    try {
      const response = await uploadLogo.mutateAsync(selectedFile)
      toast.success(t('settings:settings.logoSavedSuccessfully'))
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
        previewRef.current = null
      }
      setPreviewUrl(null)
      setSelectedFile(null)
      setUploadedLogoPath(response.path)
      setLogoVersion((prev) => prev + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings:settings.failedUploadLogo'))
    }
  }

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [sessionResponse, companyResponse] = await Promise.all([
          getSessionSettings(),
          getCompanySettings(),
        ])
        setSessionTimeoutHours(String(sessionResponse.session_timeout_hours ?? ''))
        setCompanyLanguage(companyResponse.default_language ?? 'hr')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('settings:settings.failedLoadSessionSettings'))
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
    // load once; the error toast text is translated at the time of the failure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-zinc-900">{t('settings:settings.settings')}</h1>
        <Card className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 shadow-sm">
          {t('settings:settings.onlyAdminCanChangeEmail')}
        </Card>
      </div>
    )
  }

  const smtpConfigured = emailSettings.data?.smtp_configured ?? false
  const emailLoading = emailSettings.isLoading

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{t('settings:settings.settings')}</h1>
        <p className="text-sm text-zinc-500">{t('settings:settings.companySessionEmailNotificationSettings')}</p>
      </div>

      {companyLoading ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-center shadow-sm">{t('settings:settings.loadingCompany')}</Card>
      ) : null}

      {!companyLoading && companyError ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Building2 className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">{t('common:states.error')}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {companyError instanceof Error ? companyError.message : t('settings:settings.weCanTLoadCompany')}
          </p>
        </Card>
      ) : null}

      {!companyLoading && !companyError && company ? (
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">{t('common:labels.company')}</h2>
              <p className="text-sm text-zinc-500">{t('settings:settings.companyDetailsBranding')}</p>
            </div>
            <Button variant="secondary" onClick={() => setCompanyEditOpen(true)}>
              {t('common:actions.edit')}
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.name')}</p>
                  <p className="text-sm font-semibold text-zinc-900">{company.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.id')}</p>
                  <p className="text-sm font-semibold text-zinc-900">{company.id ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.created')}</p>
                  <p className="text-sm font-semibold text-zinc-900">{formatDate(company.created_at)}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.address')}</p>
                  <p className="text-sm text-zinc-700">{company.address || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('settings:settings.contactPerson')}</p>
                  <p className="text-sm text-zinc-700">{company.contact_person || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('settings:settings.contactPhone')}</p>
                  <p className="text-sm text-zinc-700">{company.contact_phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">{t('settings:settings.companyIdOib')}</p>
                  <p className="text-sm text-zinc-700">{company.oib || '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">{t('common:labels.notes')}</p>
                <p className="text-sm text-zinc-700">{company.notes || '—'}</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 p-6 text-center">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50">
                {previewUrl ? (
                  <img src={previewUrl} alt={t('settings:settings.logoPreview')} className="h-full w-full object-contain" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt={t('settings:settings.companyLogo')} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-zinc-400">{t('settings:settings.noLogoSet')}</span>
                )}
              </div>

              <div className="space-y-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-600">
                  <ImagePlus className="h-4 w-4" />
                  {t('settings:settings.chooseLogo')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => handleLogoChange(event.target.files?.[0])}
                  />
                </label>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleLogoUpload}
                    disabled={uploadLogo.isPending || !selectedFile}
                  >
                    {t('settings:settings.uploadLogo')}
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">{t('settings:settings.pngOrJpgMax1')}</p>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card id="billing" className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="mb-6 space-y-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t('settings:settings.workspaceSubscription')}</h2>
            <p className="text-sm text-zinc-500">{t('settings:settings.activeWorkspaceBillingStatusNew')}</p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">{t('settings:settings.activeCompany')}</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">{company?.name || '—'}</p>
          <p className="mt-1 text-xs text-zinc-500">{t('settings:settings.signedUserWorksCompaniesThey')}</p>
        </div>

        {MULTI_COMPANY_ENABLED && companies.length > 0 ? (
          <div className="mb-6 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{t('settings:settings.myWorkspaces')}</p>
            <div className="flex flex-wrap gap-2">
              {companies.map((workspace) => (
                <span
                  key={workspace.id}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    workspace.id === activeCompanyId
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-600'
                  }`}
                >
                  {workspace.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {billingLoading ? (
          <p className="text-sm text-zinc-500">{t('settings:settings.loadingSubscription')}</p>
        ) : billing ? (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{t('common:labels.plan')}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">{billing.subscription?.plan.name ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{t('common:labels.status')}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">{billing.subscription?.status ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{t('settings:settings.trialEnds')}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">{formatDate(billing.subscription?.trial_ends_at)}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{t('common:labels.users')}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">
                {t('settings:settings.admins', { admins: billing.usage.admins })}{formatLimit(billing.usage.admin_limit)}
              </p>
              <p className="text-sm font-semibold text-zinc-900">
                {t('settings:settings.technicians', { technicians: billing.usage.technicians })}{formatLimit(billing.usage.technician_limit)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{t('settings:settings.pendingInvites', { pending_invites: billing.usage.pending_invites })}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t('settings:settings.billingDetailsAreCurrentlyUnavailable')}</p>
        )}

        {billing ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{t('settings:settings.planManagement')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={billingActionPending !== null || !billing.subscription?.stripe_customer_id}
                onClick={async () => {
                  setBillingActionPending('portal')
                  try {
                    const session = await createBillingPortalSession({ return_path: '/dashboard/settings#billing' })
                    window.location.href = session.url
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('settings:settings.failedOpenBillingPortal'))
                  } finally {
                    setBillingActionPending(null)
                  }
                }}
              >
                {billingActionPending === 'portal' ? t('settings:settings.opening') : t('settings:settings.manageBilling')}
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {billingPlans.map((plan) => {
                const isCurrent = billing.subscription?.plan.code === plan.code
                const isStripePlan = Boolean(plan.stripe_price_id)
                return (
                  <div key={plan.id} className="rounded-lg border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{plan.name}</p>
                        <p className="text-xs text-zinc-500">
                          {formatLimit(plan.admin_limit, t('settings:settings.unlimited'))} {t('settings:settings.admins2')} {formatLimit(plan.technician_limit, t('settings:settings.unlimited'))} {t('settings:settings.technicians2')}
                        </p>
                        {plan.trial_days > 0 ? (
                          <p className="text-xs text-zinc-500">{t('settings:settings.daysFree', { trial_days: plan.trial_days })}</p>
                        ) : null}
                      </div>
                      {isCurrent ? (
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">{t('settings:settings.current')}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-zinc-500">{plan.price_cents === 0 ? t('settings:settings.free') : t('settings:settings.month', { value: (plan.price_cents / 100).toFixed(0) })}</p>
                      <Button
                        size="sm"
                        variant={isCurrent ? 'secondary' : 'outline'}
                        disabled={isCurrent || billingActionPending !== null}
                        onClick={async () => {
                          setBillingActionPending(`activate:${plan.code}`)
                          try {
                            if (isStripePlan) {
                              const checkout = await createBillingCheckoutSession({
                                plan_code: plan.code,
                                success_path: '/dashboard/settings#billing',
                                cancel_path: '/dashboard/settings#billing',
                              })
                              window.location.href = checkout.url
                              return
                            }

                            const current = await activateBillingPlan(plan.code)
                            queryClient.setQueryData(['billing', 'current', activeCompanyId], current)
                            toast.success(t('settings:settings.planActivated', { name: plan.name }))
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : t('settings:settings.failedActivatePlan'))
                          } finally {
                            setBillingActionPending(null)
                          }
                        }}
                      >
                        {billingActionPending === `activate:${plan.code}`
                          ? isStripePlan
                            ? t('settings:settings.openingBilling')
                            : t('settings:settings.activating')
                          : isCurrent
                            ? t('common:status.active')
                            : isStripePlan
                              ? t('settings:settings.upgrade')
                              : t('settings:settings.activate')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {billing.subscription?.cancel_at_period_end ? (
                <Button
                  variant="outline"
                  disabled={billingActionPending !== null}
                  onClick={async () => {
                    setBillingActionPending('resume')
                    try {
                      const current = await resumeBilling()
                      queryClient.setQueryData(['billing', 'current', activeCompanyId], current)
                      toast.success(t('settings:settings.subscriptionResumed'))
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t('settings:settings.failedResumeSubscription'))
                    } finally {
                      setBillingActionPending(null)
                    }
                  }}
                >
                  {billingActionPending === 'resume' ? t('common:states.saving') : t('settings:settings.resumeSubscription')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={billingActionPending !== null}
                  onClick={async () => {
                    setBillingActionPending('cancel')
                    try {
                      const current = await cancelBillingAtPeriodEnd()
                      queryClient.setQueryData(['billing', 'current', activeCompanyId], current)
                      toast.success(t('settings:settings.subscriptionWillCanceledAtEnd'))
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t('settings:settings.failedCancelSubscription'))
                    } finally {
                      setBillingActionPending(null)
                    }
                  }}
                >
                  {billingActionPending === 'cancel' ? t('common:states.saving') : t('settings:settings.cancelAtPeriodEnd')}
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {MULTI_COMPANY_ENABLED ? (
        <div className="mt-6 flex items-start justify-between gap-4 rounded-lg border border-dashed border-zinc-300 p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900">{t('settings:settings.newCompanyOptional')}</p>
            <p className="text-xs text-zinc-500">{t('settings:settings.createAdditionalWorkspaceIfWant')}</p>
          </div>
          <Button variant="outline" disabled={creatingCompany} onClick={() => setCreateCompanyOpen(true)}>
            {t('settings:settings.createCompany')}
          </Button>
        </div>
        ) : null}
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">{t('settings:settings.sessionTimeout')}</h2>
          <p className="text-sm text-zinc-500">
            {t('settings:settings.default720Hours30Days')}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="session-timeout">
              {t('settings:settings.sessionTimeoutHours')}
            </label>
            <input
              id="session-timeout"
              type="number"
              min={1}
              value={sessionTimeoutHours}
              onChange={(event) => setSessionTimeoutHours(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              disabled={loading}
            />
          </div>
          <Button
            onClick={async () => {
              const value = Number(sessionTimeoutHours)
              if (!Number.isFinite(value) || value <= 0) {
                toast.error(t('settings:settings.pleaseEnterValidNumberHours'))
                return
              }
              setSaving(true)
              try {
                const response = await updateSessionSettings({ session_timeout_hours: value })
                setSessionTimeoutHours(String(response.session_timeout_hours))
                toast.success(t('settings:settings.sessionTimeoutUpdated'))
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t('settings:settings.failedUpdateSessionSettings'))
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving || loading}
          >
            {saving ? t('common:states.saving') : t('common:actions.saveChanges')}
          </Button>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">{t('settings:settings.companyDefaultLanguage')}</h2>
          <p className="text-sm text-zinc-500">
            {t('settings:settings.pdfsWillAlwaysRenderCompany')}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="company-language">
              {t('settings:settings.defaultLanguage')}
            </label>
            <select
              id="company-language"
              value={companyLanguage}
              onChange={(event) => setCompanyLanguage(event.target.value as 'hr' | 'en')}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              disabled={loading}
            >
              <option value="hr">Hrvatski (hr)</option>
              <option value="en">English (en)</option>
            </select>
          </div>
          <Button
            onClick={async () => {
              setLanguageSaving(true)
              try {
                const response = await updateCompanySettings({ default_language: companyLanguage })
                setCompanyLanguage(response.default_language)
                toast.success(t('settings:settings.companyLanguageUpdated'))
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t('settings:settings.failedUpdateCompanyLanguage'))
              } finally {
                setLanguageSaving(false)
              }
            }}
            disabled={languageSaving || loading}
          >
            {languageSaving ? t('common:states.saving') : t('settings:settings.saveLanguage')}
          </Button>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t('settings:settings.emailNotifications')}</h2>
            <p className="text-sm text-zinc-500">
              {t('settings:settings.enableSendingEmailNotificationsAll')}
            </p>
          </div>
          <Badge
            className={
              smtpConfigured
                ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                : 'border-amber-200 bg-amber-100 text-amber-700'
            }
          >
            {smtpConfigured ? t('settings:settings.smtpConfigured') : t('settings:settings.smtpNotConfigured')}
          </Badge>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 text-sm text-zinc-700" htmlFor="email-enabled">
            <input
              id="email-enabled"
              type="checkbox"
              className="h-5 w-5 rounded border-zinc-300 text-zinc-900"
              checked={emailEnabled}
              onChange={(event) => {
                const next = event.target.checked
                setEmailEnabled(next)
                updateEmail.mutate(next, {
                  onSuccess: () => {
                    toast.success(t('settings:settings.emailSettingsUpdated'))
                  },
                  onError: (err) => {
                    setEmailEnabled(!next)
                    toast.error(err instanceof Error ? err.message : t('settings:settings.failedSaveSettings'))
                  },
                })
              }}
              disabled={emailLoading || updateEmail.isPending}
            />
            {t('settings:settings.enableCompanyEmailNotifications')}
          </label>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await sendTest.mutateAsync()
                  toast.success(t('settings:settings.testEmailQueued'))
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t('settings:settings.couldNotSendTestEmail'))
                }
              }}
              disabled={!smtpConfigured || !emailEnabled || sendTest.isPending}
            >
              {t('settings:settings.sendTestEmail')}
            </Button>
            <span className="text-xs text-zinc-500">{t('settings:settings.testEmailQueuedDelivery')}</span>
          </div>
        </div>
      </Card>

      <CompanyEditModal open={companyEditOpen} company={company ?? null} onOpenChange={setCompanyEditOpen} />
      <CreateCompanyModal
        open={createCompanyOpen}
        pending={creatingCompany}
        onOpenChange={setCreateCompanyOpen}
        onCreate={async (name) => {
          setCreatingCompany(true)
          try {
            await createCompany({ name })
            await Promise.all([fetchCompanies(), fetchSession()])
            await queryClient.invalidateQueries({ queryKey: ['billing'] })
            toast.success(t('settings:settings.newCompanyHasBeenCreated'))
            setCreateCompanyOpen(false)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t('settings:settings.failedCreateCompany'))
          } finally {
            setCreatingCompany(false)
          }
        }}
      />
    </div>
  )
}

export default Settings
