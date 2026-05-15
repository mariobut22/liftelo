import { create } from 'zustand'

import type { User } from '../types/user'
import { apiFetch, getUserCompanies } from '../services/api'
import i18n from '../i18n'

interface AuthState {
  user: User | null
  companies: Array<{ id: number; name: string; logo_path?: string | null; role: 'admin' | 'technician' | 'viewer' }>
  isCompaniesLoading: boolean
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
  isLoading: true,
  isAuthLoading: true,
  fetchSession: async () => {
    set({ isLoading: true, isAuthLoading: true })
    try {
      const response = await apiFetch<{ user: User | null }>('/api/login/check')
      console.debug('[authStore] fetchSession response', response)
      const user = response.user ?? null
      if (!user) {
        console.warn('[authStore] fetchSession user null', { user })
        set({ user: null, isLoading: false, isAuthLoading: false })
        return
      }

      const resolvedLanguage = user.language ?? 'en'

      if (i18n.language !== resolvedLanguage) {
        i18n.changeLanguage(resolvedLanguage)
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('liftelo_language', resolvedLanguage)
      }

      set({ user, isLoading: false, isAuthLoading: false })
    } catch {
      console.warn('[authStore] fetchSession failed; setting user null')
      set({ user: null, isLoading: false, isAuthLoading: false })
    }
  },
  fetchCompanies: async () => {
    set({ isCompaniesLoading: true })
    try {
      const companies = await getUserCompanies()
      console.debug('[authStore] fetchCompanies response', companies)
      set({ companies })
      console.debug('[authStore] fetchCompanies set', { length: companies.length })
    } catch (err) {
      console.error('Failed to fetch user companies', err)
    } finally {
      set({ isCompaniesLoading: false })
    }
  },
  setUser: (user) => set({ user }),
  setAuthLoading: (loading) => set({ isLoading: loading, isAuthLoading: loading }),
  logout: () => {
    set({ user: null, companies: [], isLoading: false, isAuthLoading: false })
    if (window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  },
  isAdmin: () => {
    const user = get().user
    const companies = get().companies
    const activeCompany = companies.find((company) => company.id === user?.company_id)
    return activeCompany?.role === 'admin'
  },
  isSuperadmin: () => {
    const user = get().user
    return user?.role === 'superadmin'
  },
}))

export default useAuthStore
