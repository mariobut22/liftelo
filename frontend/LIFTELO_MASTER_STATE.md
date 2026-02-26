# Liftelo v2 – Frontend State Snapshot

## 1) Tech stack
- **React**: 19.2.0 (from [`package.json`](package.json:1))
- **Vite**: 7.3.1 (from [`package.json`](package.json:1))
- **Tailwind CSS**: 4.1.18 with PostCSS (from [`package.json`](package.json:1))
- **shadcn/ui**: in-house primitives under [`src/components/ui/*`](src/components/ui/button.tsx:1) (Card, Button, Badge, Dialog, Dropdown, Table, etc.)
- **TanStack Query**: `@tanstack/react-query` with provider in [`src/main.tsx`](src/main.tsx:1); hooks in [`src/hooks/queries/*`](src/hooks/queries/useUsers.ts:1)
- **State management**: Zustand store in [`src/store/authStore.ts`](src/store/authStore.ts:1)
- **Routing**: `react-router-dom` v7 with nested routes in [`src/app/App.tsx`](src/app/App.tsx:1)
- **Auth store logic**: session fetched via `GET /api/users/session` in [`useAuthStore.fetchSession()`](src/store/authStore.ts:1); logout clears user + redirects to `/login`

## 2) Page inventory (routes and purpose)
- **Dashboard**: `/dashboard/home` – overview and KPI summary ([`src/pages/Home.tsx`](src/pages/Home.tsx:1))
- **Locations**: `/dashboard/locations` – locations list + actions ([`src/pages/Locations.tsx`](src/pages/Locations.tsx:1))
- **Location Detail**: `/dashboard/locations/:id` – location details, elevators, RMS, interventions ([`src/pages/LocationDetail.tsx`](src/pages/LocationDetail.tsx:1))
- **RMS**: `/dashboard/rms` – RMS list + filters ([`src/pages/Rms.tsx`](src/pages/Rms.tsx:1))
- **Interventions**: `/dashboard/interventions` – interventions list + filters ([`src/pages/Interventions.tsx`](src/pages/Interventions.tsx:1))
- **Work Orders**: `/dashboard/work-orders` – work orders list ([`src/pages/WorkOrders.tsx`](src/pages/WorkOrders.tsx:1))
- **Work Order Detail**: `/dashboard/work-orders/:id` – detail + actions ([`src/pages/WorkOrderDetail.tsx`](src/pages/WorkOrderDetail.tsx:1))
- **Vehicles**: `/dashboard/vehicles` – vehicle CRUD ([`src/pages/Vehicles.tsx`](src/pages/Vehicles.tsx:1))
- **Projects**: `/dashboard/projects` – project list ([`src/pages/Projects.tsx`](src/pages/Projects.tsx:1))
- **Project Detail**: `/dashboard/projects/:id` – project detail ([`src/pages/ProjectDetail.tsx`](src/pages/ProjectDetail.tsx:1))
- **Stats**: `/dashboard/stats` – analytics + status coverage ([`src/pages/Stats.tsx`](src/pages/Stats.tsx:1))
- **Company**: `/dashboard/company` – company info + logo upload ([`src/pages/Company.tsx`](src/pages/Company.tsx:1))
- **Users**: `/dashboard/users` – user management (invite, reset, disable, search, bulk) ([`src/pages/Users.tsx`](src/pages/Users.tsx:1))
- **Sessions**: `/dashboard/sessions` – active sessions admin console ([`src/pages/Sessions.tsx`](src/pages/Sessions.tsx:1))
- **Activity Log**: `/dashboard/users/activity` – audit trail ([`src/pages/UserActivity.tsx`](src/pages/UserActivity.tsx:1))
- **Settings**: `/dashboard/settings` – session timeout + email settings ([`src/pages/Settings.tsx`](src/pages/Settings.tsx:1))
- **SetPassword**: `/activate` – invite activation / set password ([`src/pages/SetPassword.tsx`](src/pages/SetPassword.tsx:1))
- **Profile**: `/dashboard/profile` – account + change password ([`src/pages/Profile.tsx`](src/pages/Profile.tsx:1))
- **Login**: `/login` – auth entry ([`src/pages/Login.tsx`](src/pages/Login.tsx:1))

## 3) Admin-only sections
- **Navigation items (sidebar)**: Users, Active Sessions, Settings are marked `adminOnly` in [`navigationItems`](src/layouts/AppLayout.tsx:38)
- **Admin-guarded pages**:
  - Users: [`src/pages/Users.tsx`](src/pages/Users.tsx:1)
  - Activity Log: [`src/pages/UserActivity.tsx`](src/pages/UserActivity.tsx:1)
  - Sessions: [`src/pages/Sessions.tsx`](src/pages/Sessions.tsx:1)
  - Settings: [`src/pages/Settings.tsx`](src/pages/Settings.tsx:1)
- **Admin-only actions**: user disable/reset/invite, session termination, activity log export, system settings changes

## 4) Global systems
- **Notifications bell**: header integration in [`AppLayout`](src/layouts/AppLayout.tsx:197), logic in [`NotificationBell`](src/components/notifications/NotificationBell.tsx:1) + [`NotificationDropdown`](src/components/notifications/NotificationDropdown.tsx:1)
- **Polling**: notifications hook polls every 60s in [`useNotifications`](src/hooks/queries/useNotifications.ts:1)
- **Session management**: fetch session on app mount in [`App`](src/app/App.tsx:29) using [`useAuthStore.fetchSession()`](src/store/authStore.ts:17)
- **Error boundaries**: global `ErrorBoundary` in [`src/main.tsx`](src/main.tsx:1) using [`ErrorFallback`](src/components/ErrorFallback.tsx:1)
- **Command palette**: global modal in [`CommandPalette`](src/components/CommandPalette.tsx:1)
- **FAB create system**: floating action button in [`AppLayout`](src/layouts/AppLayout.tsx:238) with create modals for RMS/Interventions/Work Orders (admin-only vehicle create)

## 5) Data fetching architecture
- **API wrapper**: [`apiFetch()`](src/services/api.ts:17) with `credentials: 'include'` and JSON handling
- **Query hooks**: `useQuery` hooks in [`src/hooks/queries/*`](src/hooks/queries/useUsers.ts:1) (users, sessions, activity, notifications, etc.)
- **Mutation hooks**: `useMutation` hooks in [`src/hooks/mutations/*`](src/hooks/mutations/useDisableUser.ts:1) with cache invalidation via `queryClient.invalidateQueries`
- **Credentials handling**: centralized in [`apiFetch()`](src/services/api.ts:17)

## 6) Design system
- **Layout system**: `AppLayout` with sidebar + header + content area ([`src/layouts/AppLayout.tsx`](src/layouts/AppLayout.tsx:1)); public pages use `MainLayout` ([`src/layouts/MainLayout.tsx`](src/layouts/MainLayout.tsx:1))
- **Sidebar logic**: `navigationItems` array with `adminOnly` gating ([`src/layouts/AppLayout.tsx`](src/layouts/AppLayout.tsx:38))
- **Modal architecture**: shadcn `Dialog` components; consistent layout with header/body/footer sections (e.g., [`src/components/ui/dialog.tsx`](src/components/ui/dialog.tsx:1))
- **DataTable system**: generic, sortable, filterable table in [`src/components/table/DataTable.tsx`](src/components/table/DataTable.tsx:1)
- **Role gating in UI**: admin-only action rendering in pages (Users, Sessions, Activity, Settings)

## 7) SaaS-level features implemented
- **User management**: invite flow, password reset, enable/disable, bulk actions, role badges ([`Users`](src/pages/Users.tsx:1))
- **Audit log**: server-side filtering, pagination, CSV export ([`UserActivity`](src/pages/UserActivity.tsx:1))
- **Active sessions**: list + force logout + global logout all ([`Sessions`](src/pages/Sessions.tsx:1))
- **System settings**: session timeout + email notifications ([`Settings`](src/pages/Settings.tsx:1))
- **Notification center**: bell, unread counts, mark read/all read ([`NotificationDropdown`](src/components/notifications/NotificationDropdown.tsx:1))
- **Admin gating**: enforced in page components and sidebar

## 8) Missing enterprise features (not implemented)
- **SSO/SAML/OIDC** and MFA
- **Granular RBAC / permission policies** (beyond admin role)
- **Organization/tenant management** (multi-org, org switching)
- **Billing, subscription management, usage metering**
- **Audit log retention / export policies** (beyond CSV export)
- **Advanced security**: device management, IP allowlists, session risk scoring
- **Feature flags / staged rollout**
- **Localization/i18n system** (mixed English/Croatian text)
- **Observability**: centralized client logging, error tracking (Sentry), performance telemetry
- **Automated tests**: e2e/unit tests not present
- **Accessibility audit**: no explicit a11y tooling or tests

---

References are inline; see files linked above for implementation details.
