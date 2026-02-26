# Liftelo v2 Frontend Snapshot

## 1) Tech Stack

- **Framework:** React 19 + Vite + TypeScript (strict)
- **Styling:** Tailwind CSS v4 + shadcn/ui primitives
- **State management:** Zustand ([`src/store/authStore.ts`](src/store/authStore.ts:1))
- **Data fetching:** TanStack Query ([`src/lib/queryClient.ts`](src/lib/queryClient.ts:1), [`src/main.tsx`](src/main.tsx:1))
- **Table system:** TanStack Table via reusable DataTable ([`src/components/table/DataTable.tsx`](src/components/table/DataTable.tsx:1))
- **Routing:** React Router ([`src/app/App.tsx`](src/app/App.tsx:1))
- **Error boundaries:** `react-error-boundary` ([`src/components/ErrorFallback.tsx`](src/components/ErrorFallback.tsx:1), [`src/main.tsx`](src/main.tsx:1))
- **Auth handling (401 guard):** global guard in API fetch layer ([`src/services/api.ts`](src/services/api.ts:1), [`src/services/authEvents.ts`](src/services/authEvents.ts:1))
- **Command palette:** global palette with ⌘K/Ctrl+K ([`src/components/CommandPalette.tsx`](src/components/CommandPalette.tsx:1))
- **Sidebar system:** collapsible, persisted in localStorage ([`src/layouts/AppLayout.tsx`](src/layouts/AppLayout.tsx:1))
- **Toast system:** Sonner ([`src/layouts/AppLayout.tsx`](src/layouts/AppLayout.tsx:1))

## 2) Folder Structure (overview)

```
src/
  app/
    App.tsx
  components/
    CommandPalette.tsx
    ErrorFallback.tsx
    ProtectedRoute.tsx
    table/
      DataTable.tsx
    ui/
      avatar.tsx
      badge.tsx
      button.tsx
      card.tsx
      dialog.tsx
      dropdown-menu.tsx
      input.tsx
      skeleton.tsx
      table.tsx
  hooks/
    queries/
      useHomeSummary.ts
      useLocations.ts
      useProject.ts
      useProjects.ts
      useWorkOrder.ts
      useWorkOrders.ts
  layouts/
    AppLayout.tsx
    MainLayout.tsx
  lib/
    queryClient.ts
    utils.ts
  pages/
    Company.tsx
    Home.tsx
    Interventions.tsx
    Locations.tsx
    Login.tsx
    ProjectDetail.tsx
    Projects.tsx
    Rms.tsx
    Stats.tsx
    Vehicles.tsx
    WorkOrderDetail.tsx
    WorkOrders.tsx
  services/
    api.ts
    authEvents.ts
  store/
    authStore.ts
  types/
    home.ts
    location.ts
    project-detail.ts
    project.ts
    work-order-detail.ts
    work-order.ts
```

## 3) Implemented Pages + Status

- **Home:** Connected to backend summary (`/api/home/summary`) via React Query (`useHomeSummary`). ([`src/pages/Home.tsx`](src/pages/Home.tsx:1))
- **Projects:** List + detail implemented.
  - List uses DataTable + filters + URL sync ([`src/pages/Projects.tsx`](src/pages/Projects.tsx:1))
  - Detail uses sections/tasks with premium UX ([`src/pages/ProjectDetail.tsx`](src/pages/ProjectDetail.tsx:1))
- **Work Orders:** List + detail + close mutation implemented.
  - List uses DataTable + filters + URL sync ([`src/pages/WorkOrders.tsx`](src/pages/WorkOrders.tsx:1))
  - Detail uses close mutation + PDF action ([`src/pages/WorkOrderDetail.tsx`](src/pages/WorkOrderDetail.tsx:1))
- **Locations:** DataTable list with URL sync ([`src/pages/Locations.tsx`](src/pages/Locations.tsx:1))
- **Stats:** Placeholder ([`src/pages/Stats.tsx`](src/pages/Stats.tsx:1))
- **Vehicles:** Placeholder ([`src/pages/Vehicles.tsx`](src/pages/Vehicles.tsx:1))
- **Company:** Placeholder ([`src/pages/Company.tsx`](src/pages/Company.tsx:1))
- **RMS:** Placeholder ([`src/pages/Rms.tsx`](src/pages/Rms.tsx:1))
- **Interventions:** Placeholder ([`src/pages/Interventions.tsx`](src/pages/Interventions.tsx:1))

## 4) Fully Migrated From Backend

- **Home dashboard summary** (GET `/api/home/summary`) via React Query.
- **Projects list/detail** (GET `/api/projects`, `/api/projects/:id`).
- **Work Orders list/detail** (GET `/api/work-orders`, `/api/work-orders/:id`).
- **Work Order close action** (PUT `/api/work-orders/:id/close`).
- **Locations list** (GET `/api/locations`).

## 5) Partially Implemented

- **Projects detail task toggles**: Optimistic UI only (no backend write yet). ([`src/pages/ProjectDetail.tsx`](src/pages/ProjectDetail.tsx:1))
- **Command Palette**: Mock data only. ([`src/components/CommandPalette.tsx`](src/components/CommandPalette.tsx:1))
- **Company selector / notifications / profile dropdown**: UI-only placeholders. ([`src/layouts/AppLayout.tsx`](src/layouts/AppLayout.tsx:1))

## 6) Placeholder / Not Yet Migrated

- Stats, Vehicles, Company, RMS, Interventions pages are placeholders.
- No project create/edit flows or work-order create/edit flows.

## 7) Architectural Decisions

- **Data fetching via TanStack Query** with 5-minute staleTime in hooks.
- **Central API layer** with `apiFetch` and 401 guard. ([`src/services/api.ts`](src/services/api.ts:1))
- **Session-based auth** handled via credentials + global 401 redirect. ([`src/services/authEvents.ts`](src/services/authEvents.ts:1))
- **Reusable DataTable** for all lists (sorting/filter/pagination). ([`src/components/table/DataTable.tsx`](src/components/table/DataTable.tsx:1))
- **Global Error Boundary** to prevent white screens. ([`src/components/ErrorFallback.tsx`](src/components/ErrorFallback.tsx:1))

## 8) Design System Rules

- **Palette:** Zinc-based neutrals with blue accent (`blue-600`).
- **Typography:** `font-semibold` for titles, `text-zinc-500` for secondary.
- **Spacing:** `p-6/p-8`, `gap-6`, `space-y-6`.
- **Surfaces:** rounded-xl/2xl, subtle borders, shadow-sm.
- **Transitions:** duration-200/300 ease-out for hover/animations.
- **Global animations:** `animate-fade-in` for route transitions. ([`src/index.css`](src/index.css:1))

## 9) Known Limitations / TODOs

- Project task toggle lacks backend mutation (currently optimistic UI only).
- No filtering on backend; all list filters are client-side.
- Placeholder UI for notifications, company selector, and profile menu.
- No real command palette search data.
- Some table columns (e.g., Work Orders assignees) are placeholders.

## 10) Project Maturity Assessment

Liftelo v2 frontend is **mid-stage**: core architecture, query layer, reusable table system, and key screens are implemented with premium UX patterns. Multiple sections are still placeholders, and some interactions are UI-only. The foundation is stable and production-grade for incremental backend integration.
