import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useAuthStore from '../store/authStore'
import useCompany from '../hooks/queries/useCompany'
import { getCompanySettings, getSessionSettings, updateCompanySettings, updateSessionSettings } from '../services/api'
import useEmailSettings from '../hooks/queries/useEmailSettings'
import useUpdateEmailSettings from '../hooks/mutations/useUpdateEmailSettings'
import useSendTestEmail from '../hooks/mutations/useSendTestEmail'
import useUploadCompanyLogo from '../hooks/mutations/useUploadCompanyLogo'
import CompanyEditModal from '../components/company/CompanyEditModal'
import { API_BASE_URL } from '../services/api'

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('hr-HR') : '—')

function Settings() {
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const { data: company, isLoading: companyLoading, error: companyError } = useCompany()
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
  const emailSettings = useEmailSettings()
  const updateEmail = useUpdateEmailSettings()
  const sendTest = useSendTestEmail()

  const resolveImageUrl = (imagePath?: string | null) => {
    if (!imagePath) return null
    if (/^https?:\/\//i.test(imagePath)) return imagePath

    const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`
    if (normalizedPath.startsWith('/uploads')) {
      if (/^https?:\/\//i.test(API_BASE_URL)) {
        const apiOrigin = API_BASE_URL.replace(/\/api\/?$/i, '')
        return `${apiOrigin}${normalizedPath}`
      }
      return normalizedPath
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
      toast.success('Logo je uspješno spremljen.')
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
        previewRef.current = null
      }
      setPreviewUrl(null)
      setSelectedFile(null)
      setUploadedLogoPath(response.path)
      setLogoVersion((prev) => prev + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška pri uploadu logotipa.')
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
        toast.error(err instanceof Error ? err.message : 'Failed to load session settings.')
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
  }, [])

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
        <Card className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 shadow-sm">
          Samo admin može mijenjati postavke emaila.
        </Card>
      </div>
    )
  }

  const smtpConfigured = emailSettings.data?.smtp_configured ?? false
  const emailLoading = emailSettings.isLoading

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500">Postavke tvrtke, sesija i email notifikacija.</p>
      </div>

      {companyLoading ? (
        <Card className="rounded-xl border border-zinc-200 p-6 text-center shadow-sm">Učitavanje tvrtke...</Card>
      ) : null}

      {!companyLoading && companyError ? (
        <Card className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
            <Building2 className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">Greška</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {companyError instanceof Error ? companyError.message : 'Ne možemo učitati tvrtku trenutno.'}
          </p>
        </Card>
      ) : null}

      {!companyLoading && !companyError && company ? (
        <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Tvrtka</h2>
              <p className="text-sm text-zinc-500">Podaci i vizual tvrtke.</p>
            </div>
            <Button variant="secondary" onClick={() => setCompanyEditOpen(true)}>
              Uredi
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Naziv</p>
                  <p className="text-sm font-semibold text-zinc-900">{company.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">ID</p>
                  <p className="text-sm font-semibold text-zinc-900">{company.id ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Kreirano</p>
                  <p className="text-sm font-semibold text-zinc-900">{formatDate(company.created_at)}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Adresa</p>
                  <p className="text-sm text-zinc-700">{company.address || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Kontakt osoba</p>
                  <p className="text-sm text-zinc-700">{company.contact_person || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Kontakt telefon</p>
                  <p className="text-sm text-zinc-700">{company.contact_phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">OIB</p>
                  <p className="text-sm text-zinc-700">{company.oib || '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Napomene</p>
                <p className="text-sm text-zinc-700">{company.notes || '—'}</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 p-6 text-center">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50">
                {previewUrl ? (
                  <img src={previewUrl} alt="Logo preview" className="h-full w-full object-contain" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Logo tvrtke" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-zinc-400">Logo nije postavljen</span>
                )}
              </div>

              <div className="space-y-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-600">
                  <ImagePlus className="h-4 w-4" />
                  Odaberi logo
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
                    Upload logo
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">PNG ili JPG, max 1MB</p>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">Session timeout</h2>
          <p className="text-sm text-zinc-500">
            Default is 720 hours (30 days). Users remain logged in until session expires.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="session-timeout">
              Session timeout (hours)
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
                toast.error('Please enter a valid number of hours.')
                return
              }
              setSaving(true)
              try {
                const response = await updateSessionSettings({ session_timeout_hours: value })
                setSessionTimeoutHours(String(response.session_timeout_hours))
                toast.success('Session timeout updated.')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to update session settings.')
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">Company default language</h2>
          <p className="text-sm text-zinc-500">
            PDFs will always render in the company’s default language.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="company-language">
              Default language
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
                toast.success('Company language updated.')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to update company language.')
              } finally {
                setLanguageSaving(false)
              }
            }}
            disabled={languageSaving || loading}
          >
            {languageSaving ? 'Saving...' : 'Save language'}
          </Button>
        </div>
      </Card>

      <Card className="rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Email notifikacije</h2>
            <p className="text-sm text-zinc-500">
              Omogućite slanje email obavijesti za sve korisnike.
            </p>
          </div>
          <Badge
            className={
              smtpConfigured
                ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                : 'border-amber-200 bg-amber-100 text-amber-700'
            }
          >
            {smtpConfigured ? 'SMTP configured' : 'SMTP not configured'}
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
                    toast.success('Email postavke ažurirane.')
                  },
                  onError: (err) => {
                    setEmailEnabled(!next)
                    toast.error(err instanceof Error ? err.message : 'Greška pri spremanju postavki.')
                  },
                })
              }}
              disabled={emailLoading || updateEmail.isPending}
            />
            Enable company email notifications
          </label>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await sendTest.mutateAsync()
                  toast.success('Test email queued')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Ne mogu poslati test email.')
                }
              }}
              disabled={!smtpConfigured || !emailEnabled || sendTest.isPending}
            >
              Send test email
            </Button>
            <span className="text-xs text-zinc-500">Test email is queued for delivery.</span>
          </div>
        </div>
      </Card>

      <CompanyEditModal open={companyEditOpen} company={company ?? null} onOpenChange={setCompanyEditOpen} />
    </div>
  )
}

export default Settings
