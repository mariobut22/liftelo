import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import api from '../services/api'
import useAuthStore from '../store/authStore'

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
            className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Nastavi s Google računom
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
        </form>
      </div>
    </div>
  )
}

export default Login
