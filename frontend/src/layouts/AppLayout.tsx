import {
  Activity,
  BarChart3,
  Building2,
  Car,
  ChevronLeft,
  ChevronDown,
  Menu,
  X,
  FolderKanban,
  Home,
  MapPin,
  Users,
  Wrench,
  ClipboardList,
  Monitor,
  QrCode,
  Settings,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

import CommandPalette from '../components/CommandPalette'
import useAuthStore from '../store/authStore'
import { Button } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { Avatar } from '../components/ui/avatar'
import NotificationBell from '../components/notifications/NotificationBell'
import { switchCompany } from '../services/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { onPaymentRequired, type PaymentRequiredKind } from '../services/billingEvents'
import { MULTI_COMPANY_ENABLED } from '../config/features'
import AccessDialog from '../components/billing/AccessDialog'
import LegalAcceptanceDialog from '../components/legal/LegalAcceptanceDialog'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import OfflineBanner from '../components/offline/OfflineBanner'
import InstallHint from '../components/offline/InstallHint'
import { useOutboxRunner } from '../hooks/useOutbox'
import { applyUpdate, usePwaUpdateAvailable } from '../lib/pwa'
import RmsCreateModal from '../components/rms/RmsCreateModal'
import WorkOrderCreateModal from '../components/work-orders/WorkOrderCreateModal'
import InterventionCreateModal from '../components/interventions/InterventionCreateModal'
import VehicleCreateModal from '../components/vehicles/VehicleCreateModal'
import QrScanFlow from '../components/qr/QrScanFlow'
import useQrScanStore from '../store/qrScanStore'
import useBillingCurrent from '../hooks/queries/useBillingCurrent'

const navigationItems = [
  { labelKey: 'nav:items.home', to: '/dashboard/home', icon: Home, superadminOnly: false },
  { labelKey: 'nav:items.locations', to: '/dashboard/locations', icon: MapPin, superadminOnly: false },
  { labelKey: 'nav:items.rms', to: '/dashboard/rms', icon: Activity, superadminOnly: false },
  { labelKey: 'nav:items.rmsOverview', to: '/dashboard/rms-overview', icon: BarChart3, superadminOnly: false },
  { labelKey: 'nav:items.interventions', to: '/dashboard/interventions', icon: Wrench, superadminOnly: false },
  { labelKey: 'nav:items.workOrders', to: '/dashboard/work-orders', icon: ClipboardList, superadminOnly: false },
  { labelKey: 'nav:items.projects', to: '/dashboard/projects', icon: FolderKanban, superadminOnly: false },
  { labelKey: 'nav:items.vehicles', to: '/dashboard/vehicles', icon: Car, superadminOnly: false },
  { labelKey: 'nav:items.users', to: '/dashboard/users', icon: Users, adminOnly: true, superadminOnly: false },
  { labelKey: 'nav:items.sessions', to: '/dashboard/sessions', icon: Monitor, adminOnly: true, superadminOnly: false },
  { labelKey: 'nav:items.settings', to: '/dashboard/settings', icon: Settings, adminOnly: true, superadminOnly: false },
  { labelKey: 'nav:items.profile', to: '/dashboard/profile', icon: Users, superadminOnly: false },
  { labelKey: 'nav:items.stats', to: '/dashboard/stats', icon: BarChart3, superadminOnly: false },
  { labelKey: 'nav:items.superadminDashboard', to: '/superadmin', icon: Home, superadminOnly: true },
  { labelKey: 'nav:items.companies', to: '/superadmin', icon: Building2, superadminOnly: true },
]

const pageTitleKeys: Record<string, string> = {
  '/dashboard/home': 'nav:items.home',
  '/dashboard/locations': 'nav:items.locations',
  '/dashboard/rms': 'nav:items.rms',
  '/dashboard/rms-overview': 'nav:items.rmsOverview',
  '/dashboard/interventions': 'nav:items.interventions',
  '/dashboard/work-orders': 'nav:items.workOrders',
  '/dashboard/projects': 'nav:items.projects',
  '/dashboard/vehicles': 'nav:items.vehicles',
  '/dashboard/users': 'nav:items.users',
  '/dashboard/sessions': 'nav:items.sessions',
  '/dashboard/settings': 'nav:items.settings',
  '/dashboard/profile': 'nav:items.profile',
  '/dashboard/stats': 'nav:items.stats',
  '/dashboard/outbox': 'offline:outbox.title',
}

const roleBadgeClass: Record<'admin' | 'technician' | 'viewer', string> = {
  admin: 'border-purple-200 bg-purple-100 text-purple-700',
  technician: 'border-blue-200 bg-blue-100 text-blue-700',
  viewer: 'border-zinc-200 bg-zinc-100 text-zinc-600',
}

const getStorage = () => (typeof window === 'undefined' ? null : window.localStorage)
const isDesktopViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
const getInitialCollapsed = () => {
  const desktop = isDesktopViewport()
  if (!desktop) return true
  const storage = getStorage()
  if (!storage) return false
  const stored = storage.getItem('liftelo.sidebar.collapsed')
  if (stored === null) return false
  return stored === 'true'
}

const SidebarNavItem = ({
  label,
  to,
  icon: Icon,
  collapsed,
  onNavigate,
}: {
  label: string
  to: string
  icon: typeof Home
  collapsed: boolean
  onNavigate?: () => void
}) => (
  <NavLink
    to={to}
    onClick={onNavigate}
    className={({ isActive }) =>
      `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
        isActive
          ? 'bg-blue-600/10 text-white'
          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
      }`
    }
  >
    {({ isActive }) => (
      <>
        <span
          className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-blue-600 transition-opacity ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <Icon className="h-4 w-4" />
        {!collapsed ? <span>{label}</span> : null}
        {collapsed ? (
          <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
            {label}
          </span>
        ) : null}
      </>
    )}
  </NavLink>
)

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const companies = useAuthStore((state) => state.companies)
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [switchingCompanyId, setSwitchingCompanyId] = useState<number | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const companyMenuRef = useRef<HTMLDivElement | null>(null)
  const companyItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const fetchSession = useAuthStore((state) => state.fetchSession)
  const fetchCompanies = useAuthStore((state) => state.fetchCompanies)
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAdmin())
  const isSuperadmin = useAuthStore((state) => state.isSuperadmin())
  const isAuthenticated = Boolean(user)
  useOutboxRunner()
  const pwaUpdateAvailable = usePwaUpdateAvailable()
  const activeCompany = companies.find((company) => company.id === user?.company_id) ?? companies[0]

  const filteredNavigationItems = useMemo(
    () =>
      navigationItems.filter((item) => {
        if (item.superadminOnly) return isSuperadmin
        if (isSuperadmin) return false
        return !item.adminOnly || isAdmin
      }),
    [isAdmin, isSuperadmin]
  )

  // A new app version is ready: ask, never reload by itself (an open form would be lost)
  useEffect(() => {
    if (!pwaUpdateAvailable) return
    toast(t('offline:update.available'), {
      id: 'pwa-update',
      description: t('offline:update.hint'),
      duration: Infinity,
      action: { label: t('offline:update.action'), onClick: applyUpdate },
    })
  }, [pwaUpdateAvailable, t])

  useEffect(() => {
    console.debug('[AppLayout] auth state', {
      user,
      companiesLength: companies.length,
      activeCompany,
    })
  }, [user, companies.length, activeCompany])

  useEffect(() => {
    if (companies.length === 0) return
    console.debug('[AppLayout] isAdmin()', {
      isAdmin,
      companiesLength: companies.length,
      user,
    })
  }, [companies.length, isAdmin, user])

  useEffect(() => {
    console.debug('[AppLayout] navigation items', {
      beforeFilter: navigationItems.map((item) => item.labelKey),
      afterFilter: filteredNavigationItems.map((item) => item.labelKey),
      isAdmin,
      isSuperadmin,
    })
  }, [filteredNavigationItems, isAdmin, isSuperadmin])

  const closeCompanyMenu = useCallback(() => {
    setCompanyMenuOpen(false)
  }, [])

  useEffect(() => {
    if (!companyMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!companyMenuRef.current?.contains(event.target as Node)) {
        closeCompanyMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCompanyMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeCompanyMenu, companyMenuOpen])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = companyItemRefs.current.filter(Boolean) as HTMLButtonElement[]
    if (items.length === 0) return

    const currentIndex = items.findIndex((item) => item === document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length
      items[nextIndex].focus()
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
      items[prevIndex].focus()
    }
  }
  const [rmsModalOpen, setRmsModalOpen] = useState(false)
  const [interventionModalOpen, setInterventionModalOpen] = useState(false)
  const [workOrderModalOpen, setWorkOrderModalOpen] = useState(false)
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false)
  const openQrScanner = useQrScanStore((state) => state.openScanner)
  const billingState = useBillingCurrent().data ?? null
  const [runtimeReadOnlyMessage, setRuntimeReadOnlyMessage] = useState<string | null>(null)
  const [accessDialogKind, setAccessDialogKind] = useState<PaymentRequiredKind | null>(null)
  const canSwitchCompany = MULTI_COMPANY_ENABLED && companies.length > 1
  const accessLocked = billingState?.access?.locked === true

  useEffect(() => {
    const storage = getStorage()
    if (!storage) return
    if (!isDesktopViewport()) return
    storage.setItem('liftelo.sidebar.collapsed', String(collapsed))
  }, [collapsed])

  useEffect(() => {
    if (!isDesktopViewport()) return
    const storage = getStorage()
    const stored = storage?.getItem('liftelo.sidebar.collapsed')
    if (stored === null && collapsed) {
      setCollapsed(false)
    }
  }, [collapsed])

  const billingBanner = useMemo(() => {
    if (runtimeReadOnlyMessage) {
      return {
        className: 'border border-rose-200 bg-rose-50 text-rose-700',
        text: runtimeReadOnlyMessage,
      }
    }

    if (!billingState?.subscription) return null

    const status = billingState.subscription.status
    if (billingState.access?.locked) {
      return {
        className: 'border border-rose-200 bg-rose-50 text-rose-700',
        text:
          billingState.access.reason === 'trial_expired'
            ? t('nav:appLayout.trialPeriodHasEndedApplication')
            : t('nav:appLayout.subscriptionBlockedApplicationReadOnly'),
      }
    }

    if (!billingState.usage.can_add_admin || !billingState.usage.can_add_technician) {
      return {
        className: 'border border-amber-200 bg-amber-50 text-amber-800',
        text: t('nav:appLayout.adminOrTechnicianLimitPlan'),
      }
    }

    if (status === 'trial' && billingState.subscription.trial_ends_at) {
      const trialEnd = new Date(billingState.subscription.trial_ends_at)
      const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      if (Number.isFinite(daysLeft) && daysLeft <= 5) {
        return {
          className: 'border border-blue-200 bg-blue-50 text-blue-700',
          text: t('nav:billingBanner.trialEndsInDays', { count: Math.max(0, daysLeft) }),
        }
      }
    }

    return null
  }, [billingState, runtimeReadOnlyMessage, t])

  useEffect(() => {
    return onPaymentRequired(({ kind, message }) => {
      if (kind === 'subscription_locked') setRuntimeReadOnlyMessage(message)
      setAccessDialogKind(kind)
    })
  }, [])

  // Admins see the buy/renew popup once per session when the workspace is locked
  useEffect(() => {
    if (!accessLocked || !isAdmin || !activeCompany?.id) return
    try {
      const key = `liftelo.access-dialog.${activeCompany?.id}`
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch {
      // sessionStorage unavailable: still show the dialog
    }
    setAccessDialogKind('subscription_locked')
  }, [accessLocked, isAdmin, activeCompany?.id])

  useEffect(() => {
    if (!billingState?.subscription) return
    if (billingState.access?.locked) {
      return
    }
    setRuntimeReadOnlyMessage(null)
  }, [billingState?.subscription?.status, billingState?.access?.locked])

  const breadcrumb = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/superadmin')) {
      return t('nav:breadcrumb.superadmin')
    }
    const base = Object.keys(pageTitleKeys).find((route) => path.startsWith(route))
    return base ? t(pageTitleKeys[base]) : t('nav:breadcrumb.dashboard')
  }, [location.pathname, t])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 min-w-0 overflow-x-hidden">
      <aside
        className={`hidden flex-col bg-zinc-950 px-4 py-6 text-zinc-100 transition-all duration-200 ease-out lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white">
              L
            </div>
            {!collapsed ? <span className="text-sm font-semibold">Liftelo</span> : null}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-zinc-200 transition-colors duration-200 hover:text-white ${
              collapsed ? 'mx-auto' : ''
            }`}
            title={collapsed ? t('nav:appLayout.expandSidebar') : t('nav:appLayout.collapseSidebar')}
          >
            <ChevronLeft className={`h-5 w-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <nav className="mt-8 flex flex-1 flex-col space-y-1">
          {filteredNavigationItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                label={t(item.labelKey)}
                to={item.to}
                icon={item.icon}
                collapsed={collapsed}
              />
            ))}
        </nav>
        {!collapsed ? (
          <div className="mt-auto rounded-xl bg-white/5 p-3 text-xs text-zinc-400">
            Liftelo v2
          </div>
        ) : null}
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={t('nav:appLayout.closeMenu')}
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative flex h-full w-72 max-w-[80%] flex-col bg-zinc-950 px-4 py-6 text-zinc-100 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white">
                  L
                </div>
                <span className="text-sm font-semibold">Liftelo</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1 text-zinc-400 transition-colors duration-200 hover:text-white"
                aria-label={t('nav:appLayout.closeNavigation')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="mt-8 flex flex-1 flex-col space-y-1">
              {filteredNavigationItems.map((item) => (
                  <SidebarNavItem
                    key={item.to}
                    label={t(item.labelKey)}
                    to={item.to}
                    icon={item.icon}
                    collapsed={false}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                ))}
            </nav>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col min-w-0 overflow-x-hidden">
        <CommandPalette />
        <Toaster position="top-right" richColors />
        <header className="sticky top-0 z-10 flex h-16 min-w-0 items-center justify-between border-b border-zinc-200 bg-white/70 px-3 backdrop-blur-md sm:px-6 transition-all duration-200 ease-out">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex-shrink-0 rounded-lg p-2.5 text-zinc-600 transition-colors hover:bg-zinc-100 lg:hidden"
              aria-label={t('nav:appLayout.openNavigation')}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-sm font-semibold text-white lg:hidden">
              L
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="hidden text-xs font-medium uppercase tracking-wide text-zinc-400 sm:block">{t('nav:header.dashboard')}</p>
              <p className="truncate text-sm font-semibold text-zinc-900">{breadcrumb}</p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-3">
            <LanguageSwitcher />
            <NotificationBell />
            <div className="relative" ref={companyMenuRef}>
              <button
                type="button"
                onClick={() => {
                  if (canSwitchCompany) setCompanyMenuOpen((prev) => !prev)
                }}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-2.5 text-xs sm:px-3 sm:py-2 text-zinc-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                aria-haspopup={canSwitchCompany}
                aria-expanded={canSwitchCompany ? companyMenuOpen : undefined}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="max-w-[64px] truncate sm:max-w-[140px] text-sm font-medium text-zinc-700">
                    {activeCompany?.name ?? t('common:labels.company')}
                  </span>
                  {activeCompany?.role ? (
                    <span
                      className={`hidden rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase sm:inline-flex ${roleBadgeClass[activeCompany.role]}`}
                    >
                      {t(`common:roles.${activeCompany.role}`, { defaultValue: activeCompany.role })}
                    </span>
                  ) : null}
                </div>
                {canSwitchCompany ? (
                  <ChevronDown className="h-3 w-3 text-zinc-400" />
                ) : null}
              </button>
              {companyMenuOpen && canSwitchCompany ? (
                <div
                  role="menu"
                  tabIndex={-1}
                  onKeyDown={handleMenuKeyDown}
                  className="absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-1.5rem)] origin-top-right rounded-xl border border-zinc-200 bg-white py-2 shadow-lg transition duration-150 ease-out animate-in fade-in-0 zoom-in-95"
                >
                  {companies.map((company, index) => {
                    const isActive = company.id === activeCompany?.id
                    return (
                      <button
                        key={company.id}
                        type="button"
                        role="menuitem"
                        ref={(node) => {
                          companyItemRefs.current[index] = node
                        }}
                        className={`relative flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                          isActive ? 'bg-gray-100 font-medium' : 'text-zinc-700'
                        }`}
                        disabled={switchingCompanyId !== null}
                        onClick={async () => {
                          if (isActive) {
                            closeCompanyMenu()
                            return
                          }
                          setSwitchingCompanyId(company.id)
                          try {
                            await switchCompany(company.id)
                            await fetchSession()
                            await fetchCompanies()
                            queryClient.invalidateQueries()
                          } finally {
                            setSwitchingCompanyId(null)
                            closeCompanyMenu()
                          }
                        }}
                      >
                        {isActive ? (
                          <span className="absolute left-0 top-0 h-full w-1 rounded-r bg-black" />
                        ) : null}
                        <div className="flex min-w-0 items-center gap-2 pr-2">
                          <span className="truncate">{company.name}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${roleBadgeClass[company.role]}`}>
                            {t(`common:roles.${company.role}`, { defaultValue: company.role })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">
                              {t('common:status.active')}
                            </span>
                          ) : null}
                          {switchingCompanyId === company.id ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                  {user?.role === 'superadmin' ? (
                    <>
                      <div className="my-2 border-t border-zinc-200" />
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      >
                        {t('nav:appLayout.addCompany')}
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      >
                        {t('nav:appLayout.manageCompanies')}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-full p-1 text-sm text-zinc-600 sm:px-2 transition-all duration-200 ease-in-out hover:bg-zinc-100"
                    type="button"
                  >
                    <Avatar className="h-8 w-8">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700">
                        {user.username?.[0]?.toUpperCase() ?? 'U'}
                      </span>
                    </Avatar>
                    <span className="hidden text-sm font-medium text-zinc-700 sm:block">{user.username}</span>
                    <ChevronDown className="hidden h-4 w-4 text-zinc-400 sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8}>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/profile')}>{t('common:labels.profile')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => logout()}>{t('common:actions.signOut')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </header>

        <OfflineBanner />
        <InstallHint variant="banner" />

        <LegalAcceptanceDialog />

        {accessDialogKind ? (
          <AccessDialog
            open
            kind={accessDialogKind}
            isAdmin={isAdmin}
            reason={billingState?.access?.reason ?? null}
            onClose={() => setAccessDialogKind(null)}
            onChoosePlan={() => {
              setAccessDialogKind(null)
              navigate('/dashboard/settings#billing')
            }}
          />
        ) : null}

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 transition-opacity sm:p-8 sm:pb-8 duration-200 ease-out min-w-0">
          {billingBanner ? (
            <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${billingBanner.className}`}>
              <span>{billingBanner.text}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/dashboard/settings#billing')}
                className="border-current bg-white/70 text-current hover:bg-white"
              >
                {t('nav:appLayout.manageSubscription')}
              </Button>
            </div>
          ) : null}
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>

        {isAuthenticated ? (
          <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="lg"
                  className="h-12 w-12 rounded-full text-white shadow-lg transition-transform hover:scale-105"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none block select-none text-[24px] font-normal leading-[1] text-white"
                  >
                    +
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={12}>
                <DropdownMenuItem onClick={openQrScanner}>
                  <QrCode className="mr-2 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
                  {t('nav:appLayout.scanQr')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRmsModalOpen(true)}>{t('nav:appLayout.createRms')}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setInterventionModalOpen(true)}>{t('nav:appLayout.createIntervention')}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWorkOrderModalOpen(true)}>{t('nav:appLayout.createWorkOrder')}</DropdownMenuItem>
                {isAdmin ? (
                  <DropdownMenuItem onClick={() => setVehicleModalOpen(true)}>{t('nav:appLayout.newVehicle')}</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        <QrScanFlow />
        <RmsCreateModal open={rmsModalOpen} onOpenChange={setRmsModalOpen} />
        <InterventionCreateModal open={interventionModalOpen} onOpenChange={setInterventionModalOpen} />
        <WorkOrderCreateModal open={workOrderModalOpen} onOpenChange={setWorkOrderModalOpen} />
        <VehicleCreateModal open={vehicleModalOpen} onOpenChange={setVehicleModalOpen} />
      </div>
    </div>
  )
}

export default AppLayout
