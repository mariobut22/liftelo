import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import LanguageSwitcher from '../components/LanguageSwitcher'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { setPassword } from '../services/api'
import { useTranslation } from 'react-i18next'
import LegalConsent from '../components/legal/LegalConsent'

function SetPassword() {
  const { t } = useTranslation()

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])
  const [password, setPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!token) {
      toast.error(t('auth:setPassword.activationTokenMissing'))
      return
    }

    if (!password || !confirmPassword) {
      toast.error(t('auth:setPassword.pleaseEnterPasswordTwice'))
      return
    }

    if (password !== confirmPassword) {
      toast.error(t('auth:common.passwordsMismatch'))
      return
    }

    try {
      setIsSubmitting(true)
      await setPassword({ token, password, accept_terms: acceptTerms })
      toast.success(t('auth:common.accountActivated'))
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth:setPassword.failedActivateAccount'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-20">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t('auth:common.activateAccount')}</p>
          <h1 className="text-2xl font-semibold text-zinc-900">{t('auth:setPassword.setPassword')}</h1>
          <p className="text-sm text-zinc-500">
            {t('auth:setPassword.createSecurePasswordFinishActivating')}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="password">
              {t('common:labels.password')}
            </label>
            <input
              id="password"
              type="password"
              placeholder={t('auth:setPassword.enterPassword')}
              value={password}
              onChange={(event) => setPasswordValue(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-zinc-400" htmlFor="confirm-password">
              {t('auth:common.confirmPassword')}
            </label>
            <input
              id="confirm-password"
              type="password"
              placeholder={t('auth:setPassword.repeatPassword')}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            />
          </div>
          <LegalConsent checked={acceptTerms} onChange={setAcceptTerms} />
          <Button type="submit" className="w-full" disabled={isSubmitting || !acceptTerms}>
            {isSubmitting ? t('auth:common.activating') : t('auth:common.activateAccount')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default SetPassword
