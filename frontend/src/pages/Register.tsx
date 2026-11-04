import { useState } from 'react'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'

import api from '../services/api'
import useAuthStore from '../store/authStore'
import { useTranslation } from 'react-i18next'

function Register() {
  const { t } = useTranslation()

  const navigate = useNavigate()
  const location = useLocation()
  const fetchSession = useAuthStore((state) => state.fetchSession)
  const fetchCompanies = useAuthStore((state) => state.fetchCompanies)
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const oauthProvider = query.get('oauth_provider')
  const oauthEmail = query.get('oauth_email') || ''
  const oauthName = query.get('oauth_name') || ''
  const [companyName, setCompanyName] = useState('')
  const [fullName, setFullName] = useState(oauthName)
  const [email, setEmail] = useState(oauthEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await api.post('/api/signup', {
        company_name: companyName,
        full_name: fullName,
        email,
        password,
      })

      await fetchSession()
      await fetchCompanies()
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      const fallback = t('auth:register.registrationFailedCheckDetailsTry')
      const apiError =
        (requestError as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
      setError(apiError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold text-slate-900">Liftelo</div>
          <p className="mt-2 text-sm text-slate-500">{t('auth:register.createAccountFirstWorkspace')}</p>
        </div>

        {oauthProvider ? (
          <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            {oauthProvider === 'google'
              ? t('auth:register.googleAccountWasNotFound')
              : t('auth:register.appleAccountWasNotFound')}
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="company_name">
              {t('common:labels.companyName')}
            </label>
            <input
              id="company_name"
              name="company_name"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="full_name">
              {t('auth:register.fullName')}
            </label>
            <input
              id="full_name"
              name="full_name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              required
            />
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
              readOnly={Boolean(oauthEmail)}
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
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? t('auth:register.registering') : t('auth:common.register')}
          </button>

          <div className="text-center text-sm text-slate-600">
            {t('auth:register.alreadyHaveAccount')}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="font-semibold text-slate-900 underline underline-offset-2"
            >
              {t('auth:common.signIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Register
