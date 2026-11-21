/* NAVIGATION (app chrome) UI TEST - Playwright + mocked API (mock.cjs).
 *   cd frontend && npx vite --port 5618 --strictPort &
 *   (optional, multi-company ON build:)  VITE_MULTI_COMPANY_ENABLED=true npx vite --port 5619 --strictPort &
 *   BASE=http://localhost:5618 BASE_MULTI=http://localhost:5619 node scripts/mobile-check/nav-check.cjs <outDir outside repo>   (exit 1 on failure)
 * For roles admin / technician / viewer, widths 375 and 1280, languages en and hr, it asserts: the visible sidebar items + group headings per role
 * (and that the old flat items Profile / Active sessions / "Liftelo v2" are gone), nav landmark aria-label, aria-current on the active item,
 * active highlight on nested routes, no dead link (every item opens a page that renders inside the layout), collapsed sidebar (icons only with
 * aria-labels + dividers), the account menu (Profile, Active sessions admin only, Language, Sign out) that still reaches /dashboard/profile and
 * /dashboard/sessions, the plain company label (multi-company off) vs the switcher (multi-company on), the mobile drawer and the '+' menu. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const outDir = process.argv[2] || '/tmp/nav-check'
const BASE = process.env.BASE || 'http://localhost:5618'
const BASE_MULTI = process.env.BASE_MULTI || ''
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

const ROUTES = {
  home: '/dashboard/home', locations: '/dashboard/locations', rms: '/dashboard/rms', interventions: '/dashboard/interventions',
  workOrders: '/dashboard/work-orders', findings: '/dashboard/findings', rmsOverview: '/dashboard/rms-overview', stats: '/dashboard/stats',
  projects: '/dashboard/projects', vehicles: '/dashboard/vehicles', users: '/dashboard/users', settings: '/dashboard/settings',
}
const WORK = ['locations', 'rms', 'interventions', 'workOrders', 'findings']
const EXPECT = {
  admin: ['home', ...WORK, 'rmsOverview', 'stats', 'projects', 'vehicles', 'users', 'settings'],
  technician: ['home', ...WORK, 'rmsOverview', 'stats', 'projects', 'vehicles'],
  viewer: ['home', ...WORK, 'rmsOverview', 'stats', 'projects', 'vehicles'],
}
const GROUPS = { admin: ['work', 'reports', 'other', 'administration'], technician: ['work', 'reports', 'other'], viewer: ['work', 'reports', 'other'] }
const NESTED = [
  ['/dashboard/interventions/12', 'interventions'], ['/dashboard/rms-overview', 'rmsOverview'], ['/dashboard/rms-overview', 'rms', false],
  ['/dashboard/findings', 'findings'], ['/dashboard/locations/3', 'locations'], ['/dashboard/work-orders/1', 'workOrders'],
]

;(async () => {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    const N = require(`../../src/locales/${lang}/nav.json`)
    const C = require(`../../src/locales/${lang}/common.json`)
    const label = (k) => N.items[k]
    for (const width of [375, 1280]) {
      for (const role of ['admin', 'technician', 'viewer']) {
        const tag = `${lang}_${width}_${role}`
        mock.setAuthed(true)
        mock.setLanguage(lang)
        const ctx = await browser.newContext({
          viewport: { width, height: width < 1024 ? 812 : 800 }, deviceScaleFactor: 1, isMobile: width < 1024, hasTouch: width < 1024,
          userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
        })
        await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
        await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style'); style.textContent = '.tsqd-parent-container{display:none!important}'; document.head.appendChild(style)
        }))
        await ctx.route('**/api/**', (route) => mock.handle(route, role))
        const page = await ctx.newPage()
        page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
        const shot = (n) => page.screenshot({ path: path.join(outDir, `${tag}_${n}.png`) })
        const mobile = width < 1024
        const go = async (p) => { await page.goto(BASE + p); await page.waitForSelector('header', { timeout: 15000 }); await page.waitForTimeout(500) }
        // the visible navigation container: sidebar on desktop, opened drawer on mobile
        const openNav = async () => {
          if (mobile && !(await page.locator('nav:visible').count())) { await page.getByRole('button', { name: N.appLayout.openNavigation }).click(); await page.waitForSelector('nav:visible') }
          return page.locator('nav:visible').first()
        }
        const visibleItems = async () => {
          const nav = await openNav()
          return nav.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
        }

        await go('/dashboard/home')
        const nav = await openNav()
        check(`${tag}: nav landmark has aria-label`, (await nav.getAttribute('aria-label')) === N.appLayout.mainNavigation)
        const hrefs = await visibleItems()
        const want = EXPECT[role].map((k) => ROUTES[k])
        check(`${tag}: sidebar items = ${EXPECT[role].length}`, JSON.stringify(hrefs) === JSON.stringify(want), JSON.stringify(hrefs.filter((h) => !want.includes(h)).concat(want.filter((h) => !hrefs.includes(h)))))
        check(`${tag}: no Profile / Active sessions link in sidebar`, !hrefs.includes('/dashboard/profile') && !hrefs.includes('/dashboard/sessions'))
        const groups = await nav.locator('[data-nav-group]').evaluateAll((g) => g.map((x) => x.getAttribute('data-nav-group')))
        check(`${tag}: groups ${GROUPS[role].join(',')}`, JSON.stringify(groups) === JSON.stringify(GROUPS[role]), groups.join(','))
        const headings = await nav.locator('[data-nav-group] > p').allInnerTexts()
        check(`${tag}: translated group headings`, JSON.stringify(headings.map((h) => h.toLowerCase())) === JSON.stringify(GROUPS[role].map((g) => N.groups[g].toLowerCase())), headings.join('|'))
        const navText = await nav.innerText()
        check(`${tag}: no "Liftelo v2", no Profile/Sessions text`, !/Liftelo v2/.test(await page.locator('body').innerText()) && !navText.includes(N.items.profile) && !navText.includes(N.items.sessions))
        check(`${tag}: home is the active item (aria-current=page)`, (await nav.locator('a[aria-current="page"]').getAttribute('href')) === ROUTES.home)
        await shot('sidebar')

        // no dead link: each item renders a page inside the layout (header present, not bounced to another URL)
        if (width === 1280 && lang === 'en') {
          for (const k of EXPECT[role]) {
            await page.goto(BASE + ROUTES[k]); await page.waitForSelector('header', { timeout: 15000 }); await page.waitForTimeout(300)
            const u = new URL(page.url()).pathname
            const blank = (await page.locator('main').innerText()).trim().length === 0
            check(`${tag}: item ${k} opens ${ROUTES[k]}`, u === ROUTES[k] && !blank, u)
          }
          // routes that left the sidebar are still reachable by URL
          for (const p of ['/dashboard/profile', ...(role === 'admin' ? ['/dashboard/sessions'] : [])]) {
            await page.goto(BASE + p); await page.waitForSelector('header'); await page.waitForTimeout(300)
            check(`${tag}: ${p} reachable by URL`, new URL(page.url()).pathname === p)
          }
        }

        // nested active highlight
        if (role !== 'viewer' || width === 1280) {
          for (const [p, key, expectActive = true] of NESTED) {
            await go(p)
            const n = await openNav()
            const active = await n.locator('a[aria-current="page"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
            check(`${tag}: ${p} ${expectActive ? 'highlights' : 'does not highlight'} ${key}`, expectActive ? active.length === 1 && active[0] === ROUTES[key] : !active.includes(ROUTES[key]), active.join(','))
          }
          await go('/dashboard/interventions/12')
          await openNav(); await shot('nested')
        }

        // account menu
        await go('/dashboard/home')
        await page.getByRole('button', { name: N.appLayout.accountMenu }).click()
        await page.waitForSelector('[role="menu"]')
        const items = await page.locator('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"]').allInnerTexts()
        const wantMenu = [C.labels.profile, ...(role === 'admin' ? [N.items.sessions] : []), ...items.filter((t) => t === 'Hrvatski' || t === 'English' || t === C.languageSwitcher.croatian || t === C.languageSwitcher.english), C.actions.signOut]
        check(`${tag}: account menu entries`, items.length >= 4 && items[0] === C.labels.profile && items.includes(C.actions.signOut) && items.includes(N.items.sessions) === (role === 'admin'), items.join('|'))
        check(`${tag}: account menu has language options`, items.filter((t) => t === C.languageSwitcher.croatian || t === C.languageSwitcher.english).length === 2)
        void wantMenu
        await shot('account-menu')
        if (role === 'admin') {
          await page.getByRole('menuitem', { name: N.items.sessions }).click(); await page.waitForTimeout(500)
          check(`${tag}: menu -> Active sessions`, new URL(page.url()).pathname === '/dashboard/sessions')
          await page.getByRole('button', { name: N.appLayout.accountMenu }).click()
        }
        await page.getByRole('menuitem', { name: C.labels.profile }).click(); await page.waitForTimeout(500)
        check(`${tag}: menu -> Profile`, new URL(page.url()).pathname === '/dashboard/profile')
        check(`${tag}: no horizontal overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1)

        // header company chip, multi-company off: plain label
        const chip = page.getByTestId('company-label')
        check(`${tag}: company chip is a non-interactive label (no button, no caret)`, (await chip.count()) === 1 && (await chip.locator('svg').count()) === 0 && (await chip.evaluate((e) => e.tagName)) === 'DIV')
        check(`${tag}: company chip shows the company name`, (await chip.innerText()).includes('Rijeka Dizalo'))
        if (!mobile) check(`${tag}: company chip shows the role badge`, (await chip.innerText()).toLowerCase().includes(String(C.roles[role === 'admin' ? 'admin' : role]).toLowerCase()))
        await go('/dashboard/home')
        await shot('header')

        // '+' quick create menu
        await page.getByRole('button', { name: N.appLayout.quickCreate }).click()
        await page.waitForSelector('[role="menu"]')
        const plus = await page.locator('[role="menuitem"]').allInnerTexts()
        check(`${tag}: '+' menu still lists create actions`, plus.some((t) => t.includes(N.appLayout.createRms)) && plus.some((t) => t.includes(N.appLayout.scanQr)))
        await page.keyboard.press('Escape')

        if (mobile) {
          await page.getByRole('button', { name: N.appLayout.openNavigation }).click()
          await page.waitForSelector('nav:visible')
          await shot('drawer')
          await page.locator('nav:visible a', { hasText: label('locations') }).click(); await page.waitForTimeout(500)
          check(`${tag}: drawer link navigates and closes the drawer`, new URL(page.url()).pathname === ROUTES.locations && (await page.locator('nav:visible').count()) === 0)
        } else if (role !== 'viewer') {
          // collapsed sidebar: icons only + aria-labels + dividers
          await go('/dashboard/home')
          await page.getByRole('button', { name: N.appLayout.collapseSidebar }).click(); await page.waitForTimeout(400)
          const n = page.locator('nav:visible').first()
          const links = await n.locator('a').evaluateAll((as) => as.map((a) => ({ label: a.getAttribute('aria-label'), text: Array.from(a.childNodes).filter((c) => c.nodeType === 1 && c.tagName === 'SPAN' && !c.getAttribute('aria-hidden')).length })))
          check(`${tag}: collapsed: every item has an aria-label`, links.length === EXPECT[role].length && links.every((l) => l.label))
          check(`${tag}: collapsed: no group headings, ${GROUPS[role].length} groups separated by dividers`, (await n.locator('[data-nav-group] > p').count()) === 0 && (await n.locator('[data-nav-group].border-t').count()) === GROUPS[role].length)
          await page.locator('nav:visible a', { hasText: '' }).nth(1).hover(); await page.waitForTimeout(350)
          await shot('collapsed')
          await page.getByRole('button', { name: N.appLayout.expandSidebar }).click()
        }
        await ctx.close()
      }
    }
  }

  // multi-company ON build: the switcher is kept exactly as before
  if (BASE_MULTI) {
    mock.setAuthed(true); mock.setLanguage('en')
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await ctx.addInitScript(() => localStorage.setItem('liftelo_language', 'en'))
    await ctx.route('**/api/**', (route) => mock.handle(route, 'admin'))
    const page = await ctx.newPage()
    await page.goto(BASE_MULTI + '/dashboard/home'); await page.waitForSelector('header'); await page.waitForTimeout(600)
    check('multi-company ON: company chip is a button with a caret', (await page.getByTestId('company-label').count()) === 0 && (await page.locator('header button[aria-haspopup="true"] svg').count()) === 1)
    await page.locator('header button[aria-haspopup="true"]').click()
    check('multi-company ON: switcher menu lists both companies', (await page.locator('[role="menuitem"]').count()) === 2)
    await page.screenshot({ path: path.join(outDir, 'multi_switcher.png') })
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})()
