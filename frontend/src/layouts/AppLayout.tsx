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
  Plus,
  Monitor,
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
import { switchCompany, updateUserLanguage } from '../services/api'
import { useQueryClient } from '@tanstack/react-query'
import RmsCreateModal from '../components/rms/RmsCreateModal'
import WorkOrderCreateModal from '../components/work-orders/WorkOrderCreateModal'
import InterventionCreateModal from '../components/interventions/InterventionCreateModal'
import VehicleCreateModal from '../components/vehicles/VehicleCreateModal'

const navigationItems = [
  { label: 'Početna', to: '/dashboard/home', icon: Home, superadminOnly: false },
  { label: 'Lokacije', to: '/dashboard/locations', icon: MapPin, superadminOnly: false },
  { label: 'RMS', to: '/dashboard/rms', icon: Activity, superadminOnly: false },
  { label: '📊 Godišnji RMS pregled', to: '/dashboard/rms-overview', icon: BarChart3, superadminOnly: false },
  { label: 'Intervencije', to: '/dashboard/interventions', icon: Wrench, superadminOnly: false },
  { label: 'Radni nalozi', to: '/dashboard/work-orders', icon: ClipboardList, superadminOnly: false },
  { label: 'Projekti', to: '/dashboard/projects', icon: FolderKanban, superadminOnly: false },
  { label: 'Vozila', to: '/dashboard/vehicles', icon: Car, superadminOnly: false },
  { label: 'Korisnici', to: '/dashboard/users', icon: Users, adminOnly: true, superadminOnly: false },
  { label: 'Active Sessions', to: '/dashboard/sessions', icon: Monitor, adminOnly: true, superadminOnly: false },
  { label: 'Settings', to: '/dashboard/settings', icon: Settings, adminOnly: true, superadminOnly: false },
  { label: 'Profile', to: '/dashboard/profile', icon: Users, superadminOnly: false },
  { label: 'Statistika', to: '/dashboard/stats', icon: BarChart3, superadminOnly: false },
  { label: 'Tvrtka', to: '/dashboard/company', icon: Building2, superadminOnly: false },
  { label: 'Dashboard', to: '/superadmin', icon: Home, superadminOnly: true },
  { label: 'Companies', to: '/superadmin', icon: Building2, superadminOnly: true },
]

const pageTitles: Record<string, string> = {
  '/dashboard/home': 'Početna',
  '/dashboard/locations': 'Lokacije',
  '/dashboard/rms': 'RMS',
  '/dashboard/rms-overview': 'Godišnji RMS pregled',
  '/dashboard/interventions': 'Intervencije',
  '/dashboard/work-orders': 'Radni nalozi',
  '/dashboard/projects': 'Projekti',
  '/dashboard/vehicles': 'Vozila',
  '/dashboard/users': 'Korisnici',
  '/dashboard/sessions': 'Active Sessions',
  '/dashboard/settings': 'Settings',
  '/dashboard/profile': 'Profile',
  '/dashboard/stats': 'Statistika',
  '/dashboard/company': 'Tvrtka',
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
  const { i18n } = useTranslation()
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
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

  const handleLanguageChange = async (language: 'en' | 'hr') => {
    try {
      await updateUserLanguage(language)
      setUser(user ? { ...user, language } : user)
    } catch (error) {
      console.error('[AppLayout] update language failed', error)
    }

    i18n.changeLanguage(language)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('liftelo_language', language)
    }
  }

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
      beforeFilter: navigationItems.map((item) => item.label),
      afterFilter: filteredNavigationItems.map((item) => item.label),
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

  const breadcrumb = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/superadmin')) {
      return 'Superadmin'
    }
    const base = Object.keys(pageTitles).find((route) => path.startsWith(route))
    return base ? pageTitles[base] : 'Dashboard'
  }, [location.pathname])

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
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={`h-5 w-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <nav className="mt-8 flex flex-1 flex-col space-y-1">
          {filteredNavigationItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                label={item.label}
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
            aria-label="Close menu"
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
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="mt-8 flex flex-1 flex-col space-y-1">
              {filteredNavigationItems.map((item) => (
                  <SidebarNavItem
                    key={item.to}
                    label={item.label}
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
        <header className="sticky top-0 z-10 flex h-16 min-w-0 items-center justify-between border-b border-zinc-200 bg-white/70 px-6 backdrop-blur-md transition-all duration-200 ease-out">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-sm font-semibold text-white lg:hidden">
              L
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Dashboard</p>
              <p className="text-sm font-semibold text-zinc-900">{breadcrumb}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-zinc-200 bg-white p-1 text-[10px] font-semibold uppercase text-zinc-500 shadow-sm">
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`rounded-full px-2 py-1 transition-colors ${
                  i18n.language === 'en'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                aria-pressed={i18n.language === 'en'}
              >
                EN
              </button>
              <span className="px-1 text-zinc-300">|</span>
              <button
                type="button"
                onClick={() => handleLanguageChange('hr')}
                className={`rounded-full px-2 py-1 transition-colors ${
                  i18n.language === 'hr'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                aria-pressed={i18n.language === 'hr'}
              >
                HR
              </button>
            </div>
            <NotificationBell />
            <div className="relative" ref={companyMenuRef}>
              <button
                type="button"
                onClick={() => {
                  if (companies.length > 1) setCompanyMenuOpen((prev) => !prev)
                }}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                aria-haspopup={companies.length > 1}
                aria-expanded={companies.length > 1 ? companyMenuOpen : undefined}
              >
                <span className="max-w-[140px] truncate text-sm font-medium text-zinc-700">
                  {activeCompany?.name ?? 'Company'}
                </span>
                {companies.length > 1 ? (
                  <ChevronDown className="h-3 w-3 text-zinc-400" />
                ) : null}
              </button>
              {companyMenuOpen && companies.length > 1 ? (
                <div
                  role="menu"
                  tabIndex={-1}
                  onKeyDown={handleMenuKeyDown}
                  className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-zinc-200 bg-white py-2 shadow-lg transition duration-150 ease-out animate-in fade-in-0 zoom-in-95"
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
                        <span className="truncate pr-2">{company.name}</span>
                        {switchingCompanyId === company.id ? (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                        ) : null}
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
                        Add company
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      >
                        Manage companies
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
                    className="flex items-center gap-2 rounded-full px-2 py-1 text-sm text-zinc-600 transition-all duration-200 ease-in-out hover:bg-zinc-100"
                    type="button"
                  >
                    <Avatar className="h-8 w-8">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700">
                        {user.username?.[0]?.toUpperCase() ?? 'U'}
                      </span>
                    </Avatar>
                    <span className="hidden text-sm font-medium text-zinc-700 sm:block">{user.username}</span>
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8}>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/profile')}>Profil</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => logout()}>Odjava</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-8 transition-opacity duration-200 ease-out min-w-0">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>

        {isAuthenticated ? (
          <div className="fixed bottom-6 right-6 z-50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="lg"
                  className="h-12 w-12 rounded-full shadow-lg transition-transform hover:scale-105"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={12}>
                <DropdownMenuItem onClick={() => setRmsModalOpen(true)}>Create RMS</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setInterventionModalOpen(true)}>Create Intervention</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWorkOrderModalOpen(true)}>Create Work Order</DropdownMenuItem>
                {isAdmin ? (
                  <DropdownMenuItem onClick={() => setVehicleModalOpen(true)}>Novo vozilo</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        <RmsCreateModal open={rmsModalOpen} onOpenChange={setRmsModalOpen} />
        <InterventionCreateModal open={interventionModalOpen} onOpenChange={setInterventionModalOpen} />
        <WorkOrderCreateModal open={workOrderModalOpen} onOpenChange={setWorkOrderModalOpen} />
        <VehicleCreateModal open={vehicleModalOpen} onOpenChange={setVehicleModalOpen} />
      </div>
    </div>
  )
}

export default AppLayout
