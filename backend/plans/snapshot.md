# Project Snapshot (LifteloApp)

## Overview
- Stack: Node.js + Express, mysql2, EJS templates for PDFs, vanilla HTML/CSS/JS + Bootstrap.
- Core areas: dashboard UI with sidebar/topbar shell, RMS/Interventions management, users/locations, stats, PDF generation, file uploads, and session-based auth.

## Recent UI/Layout Changes
- Added SaaS-style tokens (spacing, typography, radii, shadows) and updated global styles in [`public/styles.css`](public/styles.css:1).
- Dashboard layout now expands correctly on desktop:
  - `.app-shell` and `.main-area` forced to full width to avoid 250px squeeze.
  - `.content` explicitly set to `width: 100%`.
  - Dashboard container constraints removed inside app shell.
- Mobile/tablet layout fixes:
  - Edge-to-edge content with `overflow-x: hidden` on `body`.
  - `.main-area` set to `width: 100%` on mobile.
  - Mobile hamburger moved into topbar for easier access.

## Navigation
- Sidebar + topbar injected by [`public/dashboard/nav.js`](public/dashboard/nav.js:1).
- Mobile menu button now placed in the top-left of the topbar.

## Forms & Tables
- Global form styling was re-scoped to avoid breaking Bootstrap grid forms on dashboard pages.
- Tables and cards have modernized spacing, hover states, and sticky headers.

## Key Files Touched Recently
- [`public/styles.css`](public/styles.css:1): tokens, layout widths, mobile fixes, form scoping, topbar/hamburger alignment.
- [`public/dashboard/nav.js`](public/dashboard/nav.js:1): hamburger moved into topbar left.
- [`public/dashboard/nav.js`](public/dashboard/nav.js:1): global injection of RMS/Intervention modals and FAB actions.
- [`public/dashboard/js/modal.js`](public/dashboard/js/modal.js:1): global modal open/close handling with data attributes and overlay behavior.
- [`public/dashboard/rms-create.js`](public/dashboard/rms-create.js:1): refactored to `window.initRmsModal` initializer for injected modal.
- [`public/dashboard/intervention-create.js`](public/dashboard/intervention-create.js:1): refactored to `window.initInterventionModal` initializer and scoped bindings.

## RMS + Intervention Modals (Globalization Snapshot)
- Modals were moved from page-local HTML into global injection via [`public/dashboard/nav.js`](public/dashboard/nav.js:1), so every dashboard page shares the same RMS + Intervention modal markup.
- The floating action button now opens modals universally using `data-modal-target` attributes handled by [`public/dashboard/js/modal.js`](public/dashboard/js/modal.js:1).
- Page-local modal blocks were removed from [`public/dashboard/rms.html`](public/dashboard/rms.html:1) and [`public/dashboard/interventions.html`](public/dashboard/interventions.html:1) to avoid duplicate DOM and binding conflicts.
- Modal scripts are now loaded once globally in [`public/dashboard/nav.js`](public/dashboard/nav.js:1) and call `window.initRmsModal()` / `window.initInterventionModal()` after injection.
- `rms-create` and `intervention-create` logic was updated to be idempotent and to bind inputs within the injected modal containers only.
- Intervention modal gained a datalist of locations (matching RMS behavior) with population in [`public/dashboard/intervention-create.js`](public/dashboard/intervention-create.js:1).

## Current Status
- Desktop layout no longer squeezed.
- Mobile layout is edge-to-edge with no horizontal scrolling.
- Sidebar accessible on mobile via topbar hamburger.
- RMS and Intervention modals open consistently from any dashboard page via global injection.

## Notes
- If additional UI refinements are needed, inspect dashboard pages using the injected app shell and ensure Bootstrap grid forms are not overridden by global form styles.
