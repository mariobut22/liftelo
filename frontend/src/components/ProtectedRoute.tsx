import type { ReactNode } from 'react'

import { Navigate } from 'react-router-dom'

import useAuthStore from '../store/authStore'

interface ProtectedRouteProps {
  children: ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoading, isAuthLoading, isCompaniesLoading, user } = useAuthStore()

  if (isLoading || isAuthLoading || isCompaniesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
      </div>
    )
  }

  if (!user || user.is_active === 0) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
