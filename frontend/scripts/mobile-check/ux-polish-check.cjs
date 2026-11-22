/* UX POLISH TEST (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port <PORT> &
 * Optional: LANGS=hr WIDTHS=375 to run a subset.
 * Usage:  BASE=http://localhost:5701 NODE_PATH=$(npm root -g) node scripts/mobile-check/ux-polish-check.cjs   (exit 1 on failure)
 * Checks (en + hr, 375 and 1280 px, roles admin / technician / viewer):
 *  - saved list state: search, sort, filter and page size survive a reload on Locations / RMS / Interventions / Work orders / Findings,
 *    "Reset filters" appears only when something is active and clears it (also in storage), query params beat saved state,
 *    the pages keep working when localStorage throws;
 *  - bulk actions on Locations (admin only): row + select-all-on-page checkboxes, sticky action bar inside the viewport with 40px+ touch targets,
 *    "Print QR labels" opens the label page for exactly the selection, "Export CSV" downloads the selected rows; technician/viewer see no checkboxes;
 *  - empty states (mocked empty responses) on all list pages: icon, sentence, primary action for editors, none for viewers;
 *  - skeletons (delayed responses): aria-busy + skeleton rows/cards while loading, no horizontal overflow, replaced by the real content. */
const { chromium } = require('playwright')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5701'
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(browser, { role = 'admin', width = 375, lang = 'en', throwingStorage = false, storage = null }) {
  mock.resetQr()
  mock.resetFindings()
  mock.setAuthed(true)
  mock.setLanguage(lang)
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 812 }, deviceScaleFactor: 1, acceptDownloads: true })
  await ctx.addInitScript((l) => { if (!localStorage.getItem('liftelo_language')) localStorage.setItem('liftelo_language', l) }, lang)
  if (throwingStorage) {
    await ctx.addInitScript(() => {
      const boom = () => { throw new Error('storage blocked') }
      Storage.prototype.setItem = boom
      Storage.prototype.getItem = boom
      Storage.prototype.removeItem = boom
    })
  }
  const page = await ctx.newPage()
  page.on('pageerror', (e) => { check(`no uncaught page error (${e.message.slice(0, 80)})`, false) })
  await page.route('**/api/**', (route) => mock.handle(route, role))
  return { ctx, page, storage }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const savedKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('liftelo:list:')))
const savedValue = (page, page_) => page.evaluate((p) => { const k = Object.keys(localStorage).find((x) => x.startsWith('liftelo:list:') && x.endsWith(':' + p)); return k ? JSON.parse(localStorage.getItem(k)) : null }, page_)
const T = {
  en: { reset: 'Reset filters', search: 'Search...' },
  hr: { reset: 'Poništi filtre', search: 'Traži...' },
}

;(async () => {
  const browser = await chromium.launch()
  for (const lang of (process.env.LANGS || 'en,hr').split(',')) {
    for (const width of (process.env.WIDTHS || '375,1280').split(',').map(Number)) {
      const tag = `${lang}-${width}`

      // ------------------------------------------------------------ Locations: saved state + reset + bulk
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.goto(`${BASE}/dashboard/locations`)
        await page.getByTestId('select-all-page').waitFor()
        check(`${tag} locations: no Reset filters while nothing is active`, (await page.getByTestId('reset-filters').count()) === 0)
        const box = page.locator('div:has(> svg.lucide-search) input').first()
        await box.fill('Lokacija 2')
        await page.getByTestId('page-size').selectOption('25')
        await page.waitForTimeout(150)
        await page.reload()
        await page.getByTestId('select-all-page').waitFor()
        check(`${tag} locations: search survives reload`, (await box.inputValue()) === 'Lokacija 2')
        check(`${tag} locations: page size survives reload`, (await page.getByTestId('page-size').inputValue()) === '25')
        check(`${tag} locations: Reset filters visible when active`, (await page.getByTestId('reset-filters').count()) >= 1)
        check(`${tag} locations: saved per user/company/page key`, (await savedKeys(page)).some((k) => /^liftelo:list:\d+:\d+:locations$/.test(k)), JSON.stringify(await savedKeys(page)))
        await page.getByTestId('reset-filters').first().click()
        await page.waitForTimeout(150)
        check(`${tag} locations: reset clears search`, (await box.inputValue()) === '')
        check(`${tag} locations: reset hides the button`, (await page.getByTestId('reset-filters').count()) === 0)
        check(`${tag} locations: reset keeps page size`, (await page.getByTestId('page-size').inputValue()) === '25')
        const stored = await savedValue(page, 'locations')
        check(`${tag} locations: storage updated after reset`, stored && stored.search === '' && stored.faultsOnly === false, JSON.stringify(stored))
        // query params win over saved state
        await box.fill('Lokacija 3')
        await page.waitForTimeout(100)
        await page.goto(`${BASE}/dashboard/locations?search=Lokacija%201`)
        await page.getByTestId('select-all-page').waitFor()
        check(`${tag} locations: query param beats saved state`, (await page.locator('div:has(> svg.lucide-search) input').first().inputValue()) === 'Lokacija 1')

        // bulk selection
        await page.goto(`${BASE}/dashboard/locations`)
        await page.getByTestId('select-all-page').waitFor()
        await page.locator('div:has(> svg.lucide-search) input').first().fill('')
        check(`${tag} bulk: no bar before selecting`, (await page.getByTestId('bulk-bar').count()) === 0)
        await page.getByTestId('select-row').first().check()
        check(`${tag} bulk: bar after one row`, await page.getByTestId('bulk-bar').isVisible())
        await page.getByTestId('select-all-page').check()
        const rows = await page.getByTestId('select-row').count()
        const checked = await page.locator('[data-testid=select-row]:checked').count()
        check(`${tag} bulk: select all on page checks every row`, rows > 0 && rows === checked, `${checked}/${rows}`)
        const bar = page.getByTestId('bulk-bar')
        const bb = await bar.boundingBox()
        const vh = page.viewportSize().height
        check(`${tag} bulk: sticky bar inside viewport`, bb && bb.y >= 0 && bb.y + bb.height <= vh + 1, JSON.stringify(bb))
        const btns = await bar.getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
        check(`${tag} bulk: touch targets >= 40px`, btns.length === 3 && btns.every((h) => h >= 40), JSON.stringify(btns))
        check(`${tag} bulk: no horizontal overflow`, !(await overflow(page)))
        const dl = page.waitForEvent('download')
        await page.getByTestId('bulk-export').click()
        const download = await dl
        const fs = require('fs')
        const csv = fs.readFileSync(await download.path(), 'utf8')
        check(`${tag} bulk: CSV has header + selected rows`, csv.split('\r\n').length === rows + 1 && csv.includes('Lokacija 2'), JSON.stringify(csv.slice(0, 80)))
        // uncheck one then print selection
        await page.getByTestId('select-row').nth(1).uncheck()
        await page.getByTestId('bulk-print-qr').click()
        await page.waitForURL(/qr-labels\?locations=/)
        const ids = new URL(page.url()).searchParams.get('locations').split(',')
        check(`${tag} bulk: QR page opened for exactly the selection`, ids.length === rows - 1, page.url())
        await page.locator('.qr-preview').waitFor()
        const labelCount = await page.locator('.qr-preview > div').count()
        const expectLabels = mockLabelCount(ids)
        check(`${tag} bulk: QR preview shows only selected locations' labels`, labelCount === expectLabels && labelCount > 0, `${labelCount}/${expectLabels}`)
        await ctx.close()
      }

      // ------------------------------------------------------------ other roles: no checkboxes
      for (const role of ['technician', 'viewer']) {
        const { ctx, page } = await open(browser, { role, width, lang })
        await page.goto(`${BASE}/dashboard/locations`)
        await page.locator('table').waitFor()
        await page.getByRole('row').nth(1).waitFor()
        check(`${tag} ${role}: no bulk checkboxes on Locations`, (await page.getByTestId('select-row').count()) === 0 && (await page.getByTestId('select-all-page').count()) === 0)
        await ctx.close()
      }

      // ------------------------------------------------------------ RMS / Interventions / Work orders: persisted filters
      {
        const { ctx, page } = await open(browser, { width, lang })
        for (const [path, key, selector] of [
          ['/dashboard/rms', 'rms', 'select:has(option[value="O.K."])'],
          ['/dashboard/interventions', 'interventions', 'select:has(option[value="O.K."])'],
        ]) {
          await page.goto(`${BASE}${path}`)
          const sel = page.locator(selector).first()
          await sel.waitFor()
          await sel.selectOption('O.K.')
          await page.waitForTimeout(150)
          await page.reload()
          const sel2 = page.locator(selector).first()
          await sel2.waitFor()
          check(`${tag} ${key}: status filter survives reload`, (await sel2.inputValue()) === 'O.K.')
          check(`${tag} ${key}: Reset filters shown`, (await page.getByTestId('reset-filters').count()) >= 1)
          await page.getByTestId('reset-filters').first().click()
          await page.waitForTimeout(200)
          check(`${tag} ${key}: reset clears filter + hides button`, (await sel2.inputValue()) === '' && (await page.getByTestId('reset-filters').count()) === 0)
          await page.goto(`${BASE}${path}?status=O.K.`)
          await page.locator(selector).first().waitFor()
          check(`${tag} ${key}: query param wins`, (await page.locator(selector).first().inputValue()) === 'O.K.')
        }
        // work orders
        await page.goto(`${BASE}/dashboard/work-orders`)
        await page.getByTestId('page-size').waitFor()
        const filterSelect = page.locator('select:has(option[value="overdue"])').first()
        await filterSelect.selectOption('completed')
        await page.getByTestId('page-size').selectOption('50')
        await page.waitForTimeout(150)
        await page.reload()
        await page.locator('select:has(option[value="overdue"])').first().waitFor()
        check(`${tag} work-orders: filter + page size survive reload`, (await page.locator('select:has(option[value="overdue"])').first().inputValue()) === 'completed' && (await page.getByTestId('page-size').inputValue()) === '50')
        await page.getByTestId('reset-filters').first().click()
        await page.waitForTimeout(150)
        check(`${tag} work-orders: reset`, (await page.locator('select:has(option[value="overdue"])').first().inputValue()) === 'all' && (await page.getByTestId('reset-filters').count()) === 0)
        // findings
        await page.goto(`${BASE}/dashboard/findings`)
        await page.getByTestId('findings-filters').waitFor()
        await page.getByTestId('findings-filters').locator('select').first().selectOption('out_of_service')
        await page.waitForTimeout(150)
        await page.goto(`${BASE}/dashboard/findings`)
        await page.getByTestId('findings-filters').waitFor()
        check(`${tag} findings: severity survives reload`, (await page.getByTestId('findings-filters').locator('select').first().inputValue()) === 'out_of_service')
        await page.getByTestId('reset-filters').first().click()
        await page.waitForTimeout(150)
        check(`${tag} findings: reset`, (await page.getByTestId('findings-filters').locator('select').first().inputValue()) === '' && (await page.getByTestId('reset-filters').count()) === 0)
        await page.goto(`${BASE}/dashboard/findings?severity=in_service`)
        await page.getByTestId('findings-filters').waitFor()
        check(`${tag} findings: query param wins`, (await page.getByTestId('findings-filters').locator('select').first().inputValue()) === 'in_service')
        await ctx.close()
      }

      // ------------------------------------------------------------ pages keep working without storage
      {
        const { ctx, page } = await open(browser, { width, lang, throwingStorage: true })
        let ok = true
        for (const path of ['/dashboard/locations', '/dashboard/rms', '/dashboard/work-orders', '/dashboard/findings', '/dashboard/interventions']) {
          await page.goto(`${BASE}${path}`)
          await page.waitForTimeout(500)
          const h1 = await page.locator('h1').first().textContent().catch(() => null)
          if (!h1) ok = false
        }
        check(`${tag} list pages render when localStorage throws`, ok)
        await ctx.close()
      }

      // ------------------------------------------------------------ empty states
      for (const role of ['admin', 'technician', 'viewer']) {
        const { ctx, page } = await open(browser, { role, width, lang })
        await page.route('**/api/locations/with-last-activity', (route) => json(route, []))
        await page.route('**/api/locations', (route) => (route.request().method() === 'GET' ? json(route, []) : route.fallback()))
        await page.route('**/api/records/filter', (route) => json(route, []))
        await page.route('**/api/work-orders', (route) => (route.request().method() === 'GET' ? json(route, []) : route.fallback()))
        await page.route('**/api/vehicles', (route) => (route.request().method() === 'GET' ? json(route, []) : route.fallback()))
        await page.route('**/api/findings?**', (route) => json(route, { items: [], total: 0 }))
        const canCreate = role !== 'viewer'
        const cases = [
          ['/dashboard/locations', role === 'admin'],
          ['/dashboard/rms', canCreate],
          ['/dashboard/interventions', canCreate],
          ['/dashboard/work-orders', canCreate],
          ['/dashboard/vehicles', role === 'admin'],
        ]
        for (const [path, expectAction] of cases) {
          await page.goto(`${BASE}${path}`)
          const empty = page.getByTestId('empty-state')
          await empty.waitFor({ timeout: 8000 }).catch(() => {})
          const vis = await empty.count()
          const actions = vis ? await empty.first().getByRole('button').count() : -1
          check(`${tag} ${role} empty ${path}: guidance shown`, vis >= 1 && (await empty.first().locator('svg').count()) >= 1 && ((await empty.first().locator('p').count()) >= 2))
          check(`${tag} ${role} empty ${path}: action ${expectAction ? 'present' : 'absent'}`, expectAction ? actions >= 1 : actions === 0, `buttons=${actions}`)
          check(`${tag} ${role} empty ${path}: no overflow`, !(await overflow(page)))
        }
        await page.goto(`${BASE}/dashboard/findings`)
        await page.getByTestId('findings-empty').waitFor({ timeout: 8000 }).catch(() => {})
        check(`${tag} ${role} empty findings`, (await page.getByTestId('findings-empty').count()) === 1)
        if (role === 'admin' && width === 1280) {
          // the action really opens the create dialog
          await page.goto(`${BASE}/dashboard/locations`)
          await page.getByTestId('empty-state').getByRole('button').last().click()
          check(`${tag} admin empty locations: action opens create dialog`, await page.getByRole('dialog').isVisible())
        }
        await ctx.close()
      }
      {
        // filtered empty (data exists, filter matches nothing) offers Reset filters
        const { ctx, page } = await open(browser, { width, lang })
        await page.goto(`${BASE}/dashboard/locations`)
        await page.getByTestId('select-all-page').waitFor()
        await page.locator('div:has(> svg.lucide-search) input').first().fill('zzzz-nothing')
        await page.getByTestId('empty-filtered').waitFor()
        check(`${tag} filtered empty state with Reset filters`, (await page.getByTestId('empty-filtered').getByRole('button', { name: T[lang].reset }).count()) === 1)
        await page.getByTestId('empty-filtered').getByRole('button').click()
        await page.waitForTimeout(150)
        check(`${tag} filtered empty: reset brings rows back`, (await page.getByTestId('select-row').count()) > 0)
        await ctx.close()
      }
      // ------------------------------------------------------------ skeletons (delayed responses)
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.route('**/api/locations/with-last-activity', async (route) => { await sleep(1800); await route.fallback() })
        await page.goto(`${BASE}/dashboard/locations`)
        await page.getByTestId('skeleton-row').first().waitFor({ timeout: 5000 })
        const busy = await page.locator('[aria-busy="true"]').count()
        const status = await page.locator('[role=status]').count()
        check(`${tag} locations skeleton: rows + aria-busy + status`, (await page.getByTestId('skeleton-row').count()) === 6 && busy >= 1 && status >= 1, `busy=${busy} status=${status}`)
        check(`${tag} locations skeleton: no horizontal overflow`, !(await overflow(page)))
        const headTop = await page.locator('[aria-busy]').first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY)
        await page.getByTestId('select-row').first().waitFor({ timeout: 8000 })
        const headTop2 = await page.locator('[aria-busy]').first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY)
        check(`${tag} locations skeleton: table header does not jump`, Math.abs(headTop - headTop2) < 2, `${headTop} -> ${headTop2}`)
        check(`${tag} locations skeleton: replaced by data, aria-busy cleared`, (await page.getByTestId('skeleton-row').count()) === 0 && (await page.locator('[aria-busy="true"]').count()) === 0)
        await ctx.close()
      }
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.route('**/api/vehicles', async (route) => { await sleep(1500); await route.fallback() })
        await page.goto(`${BASE}/dashboard/vehicles`)
        await page.getByTestId('list-skeleton').waitFor({ timeout: 5000 })
        check(`${tag} vehicles skeleton: shown, aria-busy`, (await page.getByTestId('list-skeleton').getAttribute('aria-busy')) === 'true' && !(await overflow(page)))
        await page.getByText('Renault Kangoo').first().waitFor({ timeout: 8000 })
        check(`${tag} vehicles skeleton: replaced by cards`, (await page.getByTestId('list-skeleton').count()) === 0)
        await ctx.close()
      }
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.route('**/api/findings?**', async (route) => { await sleep(1500); await route.fallback() })
        await page.goto(`${BASE}/dashboard/findings`)
        await page.getByTestId('list-skeleton').waitFor({ timeout: 5000 })
        check(`${tag} findings skeleton shown`, true)
        await page.getByTestId('findings-list').locator('> *').first().waitFor({ timeout: 8000 })
        check(`${tag} findings skeleton replaced`, (await page.getByTestId('list-skeleton').count()) === 0)
        await ctx.close()
      }
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.route('**/api/work-orders', async (route) => { if (route.request().method() === 'GET') await sleep(1500); await route.fallback() })
        await page.goto(`${BASE}/dashboard/work-orders`)
        await page.getByTestId('skeleton-row').first().waitFor({ timeout: 5000 })
        check(`${tag} work-orders skeleton shown`, (await page.locator('[aria-busy="true"]').count()) >= 1)
        await page.getByTestId('select-row').first().waitFor({ timeout: 8000 }).catch(() => {})
        await ctx.close()
      }
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.route('**/api/home/summary', async (route) => { await sleep(1800); await route.fallback() })
        await page.goto(`${BASE}/dashboard/home`)
        await page.getByTestId('home-skeleton').waitFor({ timeout: 5000 })
        check(`${tag} home skeleton: aria-busy, no overflow`, (await page.getByTestId('home-skeleton').getAttribute('aria-busy')) === 'true' && !(await overflow(page)))
        await page.getByTestId('kpi-skeleton').waitFor({ timeout: 2000 }).catch(() => {})
        await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 8000 })
        check(`${tag} home skeleton replaced`, (await page.getByTestId('home-skeleton').count()) === 0)
        await ctx.close()
      }
    }
  }
  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })

// the mock has 3 locations with 2 elevators each (one label per elevator)
function mockLabelCount(ids) {
  return new Set(ids.map(Number)).size * 2
}
