import type { ReactNode } from 'react'

import { Navigate, useLocation } from 'react-router-dom'

import { readReturnTo } from '../lib/returnTo'
import useAuthStore from '../store/authStore'

interface ProtectedRouteProps {
  children: ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const { isLoading, isAuthLoading, isCompaniesLoading, companiesLoaded, user } = useAuthStore()
  const companies = useAuthStore((state) => state.companies)

  if (isLoading || isAuthLoading || isCompaniesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
      </div>
    )
  }

  // Remember where the user wanted to go (path + query + hash) so Login can send them back there.
  const from = `${location.pathname}${location.search}${location.hash}`

  if (!user || user.is_active === 0) {
    return <Navigate to="/login" replace state={{ from }} />
  }

  const isSuperadmin = user.role === 'superadmin'

  // The session arrives before the companies list; do not decide on onboarding until companies have loaded.
  if (!isSuperadmin && !companiesLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
      </div>
    )
  }

  const needsOnboarding = !isSuperadmin && companies.length === 0
  const onOnboardingRoute = location.pathname.startsWith('/onboarding')

  if (needsOnboarding && !onOnboardingRoute) {
    return <Navigate to="/onboarding" replace state={{ from }} />
  }

  if (!needsOnboarding && onOnboardingRoute) {
    return <Navigate to={readReturnTo(location.state) ?? '/dashboard/home'} replace />
  }

  return children
}

export default ProtectedRoute
