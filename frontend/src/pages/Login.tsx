import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import api from '../services/api'
import useAuthStore from '../store/authStore'

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
    google_auth_denied: 'Google prijava je otkazana.',
    google_state_mismatch: 'Google prijava nije valjana. Pokušajte ponovno.',
    google_state_expired: 'Google prijava je istekla. Pokrenite prijavu ponovno.',
    google_token_exchange_failed: 'Greška pri Google autorizaciji. Pokušajte ponovno.',
    google_missing_id_token: 'Google odgovor je nepotpun. Pokušajte ponovno.',
    google_token_validation_failed: 'Google token nije valjan. Pokušajte ponovno.',
    google_claims_invalid: 'Google račun nije moguće potvrditi za Liftelo prijavu.',
    google_nonce_mismatch: 'Sigurnosna provjera nije prošla. Pokrenite prijavu ponovno.',
    google_account_not_allowed: 'Ovaj Google račun nema pristup Liftelo workspaceu.',
    google_account_inactive: 'Korisnički račun je neaktivan.',
    google_no_company_access: 'Korisnik nema pristup nijednoj tvrtki.',
    google_callback_failed: 'Google prijava nije uspjela. Pokušajte ponovno.',
    apple_auth_denied: 'Apple prijava je otkazana.',
    apple_state_mismatch: 'Apple prijava nije valjana. Pokušajte ponovno.',
    apple_state_expired: 'Apple prijava je istekla. Pokrenite prijavu ponovno.',
    apple_token_exchange_failed: 'Greška pri Apple autorizaciji. Pokušajte ponovno.',
    apple_missing_id_token: 'Apple odgovor je nepotpun. Pokušajte ponovno.',
    apple_claims_invalid: 'Apple račun nije moguće potvrditi za Liftelo prijavu.',
    apple_nonce_mismatch: 'Sigurnosna provjera nije prošla. Pokrenite prijavu ponovno.',
    apple_account_not_allowed: 'Ovaj Apple račun nema pristup Liftelo workspaceu.',
    apple_account_inactive: 'Korisnički račun je neaktivan.',
    apple_no_company_access: 'Korisnik nema pristup nijednoj tvrtki.',
    apple_callback_failed: 'Apple prijava nije uspjela. Pokušajte ponovno.',
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
        navigate('/onboarding', { replace: true })
        return
      }

      navigate('/dashboard', { replace: true })
    } catch {
      setError('Prijava nije uspjela. Provjerite podatke i pokušajte ponovno.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold text-slate-900">Liftelo</div>
          <p className="mt-2 text-sm text-slate-500">Prijavite se u svoj račun</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/api/auth/google/start?return_to=/dashboard/home'
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <GoogleIcon />
            Nastavi s Google
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = '/api/auth/apple/start?return_to=/dashboard/home'
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <AppleIcon />
            Nastavi s Apple
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">ili</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              Email
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
              Lozinka
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
            {submitting ? 'Prijava...' : 'Prijavi se'}
          </button>

          <div className="text-center text-sm text-slate-600">
            Novi ste na Liftelo?{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="font-semibold text-slate-900 underline underline-offset-2"
            >
              Registriraj se
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login
