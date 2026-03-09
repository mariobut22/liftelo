import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useAuthStore from '../store/authStore'
import { getCompanySettings, getSessionSettings, updateCompanySettings, updateSessionSettings } from '../services/api'
import useEmailSettings from '../hooks/queries/useEmailSettings'
import useUpdateEmailSettings from '../hooks/mutations/useUpdateEmailSettings'
import useSendTestEmail from '../hooks/mutations/useSendTestEmail'

function Settings() {
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [companyLanguage, setCompanyLanguage] = useState<'hr' | 'en'>('hr')
  const [languageSaving, setLanguageSaving] = useState(false)
  const emailSettings = useEmailSettings()
  const updateEmail = useUpdateEmailSettings()
  const sendTest = useSendTestEmail()

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
        <p className="text-sm text-zinc-500">Manage global session policies.</p>
      </div>

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
    </div>
  )
}

export default Settings
