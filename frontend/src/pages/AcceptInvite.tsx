import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import LanguageSwitcher from '../components/LanguageSwitcher'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import useAuthStore from '../store/authStore'
import { acceptInvitation } from '../services/api'
import { useTranslation } from 'react-i18next'

function AcceptInvite() {
  const { t } = useTranslation()

  const location = useLocation()
  const navigate = useNavigate()
  const fetchSession = useAuthStore((state) => state.fetchSession)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('token')
  }, [location.search])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) {
      setError(t('auth:acceptInvite.invalidInvitationToken'))
      return
    }
    if (password.length < 8) {
      setError(t('auth:acceptInvite.passwordMustAtLeast8'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('auth:common.passwordsMismatch'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await acceptInvitation({ token, password })
      await fetchSession()
      toast.success(t('auth:common.accountActivated'))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth:acceptInvite.invalidOrExpiredInvitation'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-20">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <LanguageSwitcher />
      </div>
        <Card className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">{t('auth:acceptInvite.invitationLinkInvalid')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('auth:acceptInvite.invitationTokenMissingOrInvalid')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-20">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">{t('auth:acceptInvite.acceptInvitation')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('auth:acceptInvite.setPasswordActivateAccount')}</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              {t('common:labels.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="confirm-password">
              {t('auth:common.confirmPassword')}
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm"
              required
            />
          </div>
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t('auth:common.activating') : t('auth:common.activateAccount')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default AcceptInvite
