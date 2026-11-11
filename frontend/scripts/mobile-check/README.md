# Mobile layout check (Playwright harness)

Dev-only tool, not part of the build. Mocks the whole API (`mock.cjs`, via `page.route`), so no backend/DB is needed.

Run (Chromium + Playwright installed globally):
```
cd frontend && npx vite --port 5199 &
NODE_PATH=$(npm root -g) node scripts/mobile-check/check.cjs <outDir> [width=375] [height=812] [admin|superadmin]
```
Visits public and `/dashboard/*` routes, layout menus, FAB dialogs and page dialogs; measures horizontal overflow (elements outside the
viewport, ignoring those inside `overflow-x: auto`), dialog/main side gaps; saves a screenshot per state to `<outDir>`.
`mock.cjs` returns fake JSON for the endpoints the app uses; unknown GETs return `[]`. Authed pages can be opened by direct URL (deep link bug fixed, see `deeplink-check.cjs`).
Leaflet map tiles show up as offenders but are clipped by the map container (false positive).
Ograničenje: harness radi u Chromiumu i ne može reproducirati iOS WebKit posebnosti (npr. date inputi, 100vh/dvh, safe-area); njih treba provjeriti na pravom iPhoneu.

Potpis (`signature-check.cjs`): `NODE_PATH=$(npm root -g) node scripts/mobile-check/signature-check.cjs <outDir izvan repoa>` crta tri odvojena poteza prstom (CDP touch događaji, iPhone 13, devicePixelRatio 3) u prozoru "Novi RMS zapis" i provjerava da se veličina platna ne mijenja i da svaki potez završi ispod prsta. Izlaz 1 ako ne.


Deep linkovi (`deeplink-check.cjs`): `NODE_PATH=$(npm root -g) node scripts/mobile-check/deeplink-check.cjs` – direktni link/osvježavanje na `/dashboard/*` (query, hash, spora sesija ili spore firme), bez firmi, superadmin, odjavljen -> prijava -> povratak, otvoreni redirect (`//evil.com`). Izlaz 1 ako ne.

Offline/PWA (`../offline-check/`): `node scripts/offline-check/core-test.cjs` (čista logika) i `offline-check.cjs` (Playwright, stateful lažni server; treba `npm run build && npx vite preview --port 5604 --strictPort` i dev server na :5199 za zadnju provjeru). Vidi docs/infrastructure.md §18.
