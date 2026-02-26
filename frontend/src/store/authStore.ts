import { create } from 'zustand'

import type { User } from '../types/user'
import { apiFetch, getUserCompanies } from '../services/api'

interface AuthState {
  user: User | null
  companies: Array<{ id: number; name: string; logo_path?: string | null; role: 'admin' | 'technician' | 'viewer' }>
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
  isLoading: true,
  isAuthLoading: true,
  fetchSession: async () => {
    set({ isLoading: true, isAuthLoading: true })
    try {
      const response = await apiFetch<{ user: User | null }>('/api/users/session')
      console.debug('[authStore] fetchSession response', response)
      const user = response.user ?? null
      if (!user || user.is_active === 0) {
        console.warn('[authStore] fetchSession user null or inactive', { user })
        set({ user: null, isLoading: false, isAuthLoading: false })
        return
      }
      set({ user, isLoading: false, isAuthLoading: false })
    } catch {
      console.warn('[authStore] fetchSession failed; setting user null')
      set({ user: null, isLoading: false, isAuthLoading: false })
    }
  },
  fetchCompanies: async () => {
    try {
      const companies = await getUserCompanies()
      console.debug('[authStore] fetchCompanies response', companies)
      set({ companies })
      console.debug('[authStore] fetchCompanies set', { length: companies.length })
    } catch (err) {
      console.error('Failed to fetch user companies', err)
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
    return user?.global_role === 'superadmin'
  },
}))

export default useAuthStore
