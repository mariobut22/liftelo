import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import ProtectedRoute from '../components/ProtectedRoute'
import AppLayout from '../layouts/AppLayout'
import Users from '../pages/Users'
import UserDetail from '../pages/UserDetail'
import Profile from '../pages/Profile'
import Home from '../pages/Home'
import Interventions from '../pages/Interventions'
import Locations from '../pages/Locations'
import LocationDetailPage from '../pages/LocationDetail'
import Login from '../pages/Login'
import Register from '../pages/Register'
import ProjectDetailPage from '../pages/ProjectDetail'
import Projects from '../pages/Projects'
import Rms from '../pages/Rms'
import RmsDetailPage from '../pages/RmsDetail'
import InterventionDetailPage from '../pages/InterventionDetail'
import RmsOverview from '../pages/RmsOverview'
import Stats from '../pages/Stats'
import Vehicles from '../pages/Vehicles'
import WorkOrders from '../pages/WorkOrders'
import WorkOrderDetailPage from '../pages/WorkOrderDetail'
import SetPassword from '../pages/SetPassword'
import UserActivityPage from '../pages/UserActivity'
import Sessions from '../pages/Sessions'
import Settings from '../pages/Settings'
import useAuthStore from '../store/authStore'
import SuperadminDashboard from '../pages/SuperadminDashboard'
import SuperadminCompanyDetail from '../pages/SuperadminCompanyDetail'
import AcceptInvite from '../pages/AcceptInvite'
import Onboarding from '../pages/Onboarding'
import QrLabels from '../pages/QrLabels'
import QrLanding from '../pages/QrLanding'
import Outbox from '../pages/Outbox'
import Findings from '../pages/Findings'

function App() {
  const { t } = useTranslation('common')
  const fetchSession = useAuthStore((state) => state.fetchSession)
  const fetchCompanies = useAuthStore((state) => state.fetchCompanies)
  useEffect(() => {
    const init = async () => {
      await fetchSession()
      const currentUser = useAuthStore.getState().user
      if (currentUser) {
        await fetchCompanies()
      }
    }
    void init()
  }, [fetchCompanies, fetchSession])

  const user = useAuthStore((state) => state.user)

  return (
    <>
      <span style={{ display: 'none' }}>{t('appName')}</span>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/activate" element={<SetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin"
          element={
            <ProtectedRoute>
              {user?.role === 'superadmin' ? <SuperadminDashboard /> : <Navigate to="/dashboard" replace />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/companies/:id"
          element={
            <ProtectedRoute>
              {user?.role === 'superadmin' ? <SuperadminCompanyDetail /> : <Navigate to="/dashboard" replace />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/q"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path=":token" element={<QrLanding />} />
        </Route>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="locations" element={<Locations />} />
          <Route path="locations/:id" element={<LocationDetailPage />} />
          <Route path="qr-labels" element={<QrLabels />} />
          <Route path="rms" element={<Rms />} />
          <Route path="rms-overview" element={<RmsOverview />} />
          <Route path="rms/:id" element={<RmsDetailPage />} />
          <Route path="interventions" element={<Interventions />} />
          <Route path="interventions/:id" element={<InterventionDetailPage />} />
          <Route path="findings" element={<Findings />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="work-orders" element={<WorkOrders />} />
          <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />
          <Route path="vehicles" element={<Vehicles />} />
          <Route path="stats" element={<Stats />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="users/activity" element={<UserActivityPage />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="outbox" element={<Outbox />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  )
}

export default App
