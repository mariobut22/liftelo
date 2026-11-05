import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import api, { ApiError } from '../services/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { readReturnTo } from '../lib/returnTo'
import useAuthStore from '../store/authStore'
import { useTranslation } from 'react-i18next'

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.2-1.9 2.9l3 2.3c1.7-1.6 2.8-3.9 2.8-6.8 0-.6-.1-1.2-.2-1.8H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.5 0 4.5-.8 6-2.2l-3-2.3c-.8.5-1.9.9-3 .9-2.3 0-4.2-1.5-4.9-3.6H4v2.3C5.5 20.1 8.5 22 12 22z"
      />
      <path
        fill="#4A90E2"
        d="M7.1 14.8c-.2-.5-.3-1.1-.3-1.8s.1-1.3.3-1.8V8.9H4C3.4 10 3 11 3 12s.4 2 .9 3.1l3.2-2.3z"
      />
      <path
        fill="#FBBC05"
        d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.5-2.5C16.5 4 14.5 3 12 3 8.5 3 5.5 4.9 4 7.9l3.2 2.3c.7-2.1 2.6-3.6 4.8-3.6z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.8 12.6c0-2 1.6-3 1.7-3.1-1-1.5-2.7-1.7-3.2-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.1 9.1.7 1.1 1.6 2.3 2.8 2.2 1.1 0 1.6-.7 2.9-.7 1.4 0 1.8.7 2.9.7 1.2 0 2-.9 2.7-2 .9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-4.1z" />
      <path d="M14.5 6.4c.6-.7 1.1-1.7 1-2.7-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.7-1 2.6 1 0 1.9-.5 2.5-1.2z" />
    </svg>
  )
}

function Login() {
  const { t } = useTranslation()

  const navigate = useNavigate()
  const location = useLocation()
  const fetchSession = useAuthStore((state) => state.fetchSession)
  const fetchCompanies = useAuthStore((state) => state.fetchCompanies)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const oauthError = new URLSearchParams(location.search).get('oauth_error')
  const oauthMessageByCode: Record<string, string> = {
    google_auth_denied: t('auth:login.googleSignWasCancelled'),
    google_state_mismatch: t('auth:login.googleSignNotValidTry'),
    google_state_expired: t('auth:login.googleSignHasExpiredStart'),
    google_token_exchange_failed: t('auth:login.googleAuthorizationErrorTryAgain'),
    google_missing_id_token: t('auth:login.googleResponseIncompleteTryAgain'),
    google_token_validation_failed: t('auth:login.googleTokenNotValidTry'),
    google_claims_invalid: t('auth:login.googleAccountCannotVerifiedLiftelo'),
    google_nonce_mismatch: t('auth:login.securityCheckFailedStartSign'),
    google_account_not_allowed: t('auth:login.googleAccountHasNoAccess'),
    google_account_inactive: t('auth:login.userAccountInactive'),
    google_no_company_access: t('auth:login.userHasNoAccessAny'),
    google_callback_failed: t('auth:login.googleSignFailedTryAgain'),
    apple_auth_denied: t('auth:login.appleSignWasCancelled'),
    apple_state_mismatch: t('auth:login.appleSignNotValidTry'),
    apple_state_expired: t('auth:login.appleSignHasExpiredStart'),
    apple_token_exchange_failed: t('auth:login.appleAuthorizationErrorTryAgain'),
    apple_missing_id_token: t('auth:login.appleResponseIncompleteTryAgain'),
    apple_claims_invalid: t('auth:login.appleAccountCannotVerifiedLiftelo'),
    apple_nonce_mismatch: t('auth:login.securityCheckFailedStartSign'),
    apple_account_not_allowed: t('auth:login.appleAccountHasNoAccess'),
    apple_account_inactive: t('auth:login.userAccountInactive'),
    apple_no_company_access: t('auth:login.userHasNoAccessAny'),
    apple_callback_failed: t('auth:login.appleSignFailedTryAgain'),
  }
  const oauthMessage = oauthError ? oauthMessageByCode[oauthError] || oauthMessageByCode.google_callback_failed : null

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await api.post<{ success: boolean; user: { global_role?: string } }>(
        '/api/login',
        { email, password }
      )
      await fetchSession()
      const globalRole = response.data?.user?.global_role
      if (globalRole === 'superadmin') {
        navigate('/superadmin', { replace: true })
        return
      }

      await fetchCompanies()
      const companiesLength = useAuthStore.getState().companies.length
      if (companiesLength === 0) {
        navigate('/onboarding', { replace: true, state: location.state })
        return
      }

      navigate(readReturnTo(location.state) ?? '/dashboard', { replace: true })
    } catch (requestError) {
      // ApiError messages are already translated (by backend error code)
      setError(
        requestError instanceof ApiError && requestError.code
          ? requestError.message
          : t('auth:login.signFailedCheckDetailsTry')
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-20">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold text-slate-900">Liftelo</div>
          <p className="mt-2 text-sm text-slate-500">{t('auth:login.signAccount')}</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={() => {
              window.location.href = `/api/auth/google/start?return_to=${encodeURIComponent(readReturnTo(location.state) ?? '/dashboard/home')}`
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <GoogleIcon />
            {t('auth:login.continueGoogle')}
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = `/api/auth/apple/start?return_to=${encodeURIComponent(readReturnTo(location.state) ?? '/dashboard/home')}`
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <AppleIcon />
            {t('auth:login.continueApple')}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">{t('auth:login.or')}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              {t('common:labels.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              {t('common:labels.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : null}

          {oauthMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {oauthMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? t('auth:login.signing') : t('auth:login.sign')}
          </button>

          <div className="text-center text-sm text-slate-600">
            {t('auth:login.newLiftelo')}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="font-semibold text-slate-900 underline underline-offset-2"
            >
              {t('auth:common.register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login
