# Mobile layout check (Playwright harness)

Dev-only tool, not part of the build. Mocks the whole API (`mock.cjs`, via `page.route`), so no backend/DB is needed.

Run (Chromium + Playwright installed globally):
```
cd frontend && npx vite --port 5199 &
NODE_PATH=$(npm root -g) node scripts/mobile-check/check.cjs <outDir> [width=375] [height=812] [admin|superadmin]
```
Visits public and `/dashboard/*` routes, layout menus, FAB dialogs and page dialogs; measures horizontal overflow (elements outside the
viewport, ignoring those inside `overflow-x: auto`), dialog/main side gaps; saves a screenshot per state to `<outDir>`.
`mock.cjs` returns fake JSON for the endpoints the app uses; unknown GETs return `[]`. Authed pages are reached by client-side
navigation (a direct deep link to `/dashboard/*` is redirected to home because the session loads before companies).
Leaflet map tiles show up as offenders but are clipped by the map container (false positive).
