import { create } from 'zustand'

import type { User } from '../types/user'
import { ApiError, apiFetch, getUserCompanies, onlineRequestSignal, updateUserLanguage } from '../services/api'
import { cacheRead, cacheWrite, clearReadCache, scopeOf } from '../lib/offline/readCache'
import i18n, { normalizeLanguage } from '../i18n'
import { applyLanguage, clearPreloginChoice, readPreloginChoice } from '../lib/language'

interface AuthState {
  user: User | null
  companies: Array<{ id: number; name: string; logo_path?: string | null; role: 'admin' | 'technician' | 'viewer' }>
  isCompaniesLoading: boolean
  companiesLoaded: boolean // true once the companies request has finished (success or failure) for the current session
  isLoading: boolean
  isAuthLoading: boolean
  fetchSession: () => Promise<void>
  fetchCompanies: () => Promise<void>
  setUser: (user: User | null) => void
  setAuthLoading: (loading: boolean) => void
  logout: () => void
  isAdmin: () => boolean
  isSuperadmin: () => boolean
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  companies: [],
  isCompaniesLoading: false,
  companiesLoaded: false,
  isLoading: true,
  isAuthLoading: true,
  fetchSession: async () => {
    set({ isLoading: true, isAuthLoading: true })
    try {
      const response = await apiFetch<{ user: User | null }>('/api/login/check', { signal: onlineRequestSignal(20_000) })
      console.debug('[authStore] fetchSession response', response)
      const user = response.user ?? null
      if (!user) {
        console.warn('[authStore] fetchSession user null', { user })
        void clearReadCache()
        set({ user: null, companies: [], companiesLoaded: false, isLoading: false, isAuthLoading: false })
        return
      }
      void cacheWrite('session', 'device', user)

      // Language reconciliation (docs/i18n.md, "Language selection"). Runs on every session fetch, which covers password login,
      // OAuth return (full page load), invitation accept and registration auto-login.
      const accountLanguage = user.language ? normalizeLanguage(user.language) : null
      const preloginChoice = readPreloginChoice()
      let finalLanguage = normalizeLanguage(i18n.language)
      let saveToAccount = false
      if (preloginChoice) {
        // explicit choice made before login wins over the saved account language
        finalLanguage = preloginChoice
        saveToAccount = preloginChoice !== accountLanguage
      } else if (accountLanguage) {
        finalLanguage = accountLanguage
      } else {
        // account has no language yet: save the active one once so other devices match
        saveToAccount = true
      }
      applyLanguage(finalLanguage)
      clearPreloginChoice()
      if (saveToAccount) {
        void updateUserLanguage(finalLanguage)
          .then(() => {
            const current = get().user
            if (current && current.id === user.id) set({ user: { ...current, language: finalLanguage } })
          })
          .catch((error) => console.error('[authStore] save language failed', error))
      }

      set({ user, isLoading: false, isAuthLoading: false })
    } catch (error) {
      // Offline start (basement, shaft): no answer at all (status 0, not an HTTP error). Keep working with the last known
      // session so the technician can still enter data; the server session cookie is verified again as soon as a request succeeds.
      if (error instanceof ApiError && error.status === 0) {
        const cached = await cacheRead<User>('session', 'device')
        if (cached?.data) {
          console.warn('[authStore] offline: using the last known session')
          set({ user: cached.data, isLoading: false, isAuthLoading: false })
          return
        }
      }
      console.warn('[authStore] fetchSession failed; setting user null')
      set({ user: null, companies: [], companiesLoaded: false, isLoading: false, isAuthLoading: false })
    }
  },
  fetchCompanies: async () => {
    set({ isCompaniesLoading: true })
    try {
      const companies = await getUserCompanies()
      console.debug('[authStore] fetchCompanies response', companies)
      set({ companies })
      console.debug('[authStore] fetchCompanies set', { length: companies.length })
      const current = get().user
      if (current) void cacheWrite('companies', scopeOf(current.id, current.company_id), companies)
    } catch (err) {
      const current = get().user
      if (err instanceof ApiError && err.status === 0 && current) {
        const cached = await cacheRead<AuthState['companies']>('companies', scopeOf(current.id, current.company_id))
        if (cached?.data) set({ companies: cached.data })
      } else {
        console.error('Failed to fetch user companies', err)
      }
    } finally {
      set({ isCompaniesLoading: false, companiesLoaded: true })
    }
  },
  setUser: (user) => set({ user }),
  setAuthLoading: (loading) => set({ isLoading: loading, isAuthLoading: loading }),
  logout: () => {
    void clearReadCache()
    set({ user: null, companies: [], companiesLoaded: false, isLoading: false, isAuthLoading: false })
    if (window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  },
  isAdmin: () => {
    const user = get().user
    const companies = get().companies
    if (!user) return false
    if (user.role === 'superadmin') return true

    if (companies.length === 0) {
      return user.role === 'admin'
    }

    const activeCompanyId = user.company_id ?? companies[0]?.id
    const activeCompany = companies.find((company) => company.id === activeCompanyId)
    return activeCompany?.role === 'admin'
  },
  isSuperadmin: () => {
    const user = get().user
    return user?.role === 'superadmin'
  },
}))

export default useAuthStore
