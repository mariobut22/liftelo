/* Mobile layout check harness (see README.md). Usage:
 *   node scripts/mobile-check/check.cjs <outDir> [width=375] [height=812] [role=admin|superadmin]
 * Needs `npm run dev -- --port 5199` running. API is fully mocked via page.route. */
const { chromium, devices } = require('playwright')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/mobile-check', W = '375', H = '812', role = 'admin'] = process.argv.slice(2)
const width = Number(W), height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5199'

const ROUTES = [
  '/dashboard/home', '/dashboard/locations', '/dashboard/locations/1', '/dashboard/rms', '/dashboard/rms/1',
  '/dashboard/rms-overview', '/dashboard/interventions', '/dashboard/projects', '/dashboard/projects/1',
  '/dashboard/work-orders', '/dashboard/work-orders/1', '/dashboard/vehicles', '/dashboard/stats',
  '/dashboard/users', '/dashboard/users/1', '/dashboard/users/activity', '/dashboard/sessions',
  '/dashboard/settings', '/dashboard/profile',
]
const PUBLIC = ['/login', '/register', '/activate?token=abc', '/accept-invite?token=abc']
const SUPER = ['/superadmin']

const MEASURE = () => {
  const iw = window.innerWidth
  const out = { iw, docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, offenders: [] }
  const scrollable = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
    return false
  }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right > iw + 1 || r.left < -1) {
      if (scrollable(el)) continue
      if (el.closest('[data-sonner-toaster]')) continue
      if (el instanceof SVGElement && el.closest('svg') && el.tagName !== 'svg') continue
      out.offenders.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').slice(0, 40)} [${Math.round(r.left)},${Math.round(r.right)}] "${(el.textContent || '').trim().slice(0, 25)}"`)
    }
  }
  out.offenders = out.offenders.slice(0, 3)
  const main = document.querySelector('main')
  if (main) { const r = main.getBoundingClientRect(); out.main = [Math.round(r.left), Math.round(iw - r.right)] }
  const dlg = document.querySelector('[role="dialog"]')
  if (dlg) { const r = dlg.getBoundingClientRect(); out.dialog = { gaps: [Math.round(r.left), Math.round(iw - r.right)], top: Math.round(r.top), bottom: Math.round(window.innerHeight - r.bottom) } }
  const small = [...document.querySelectorAll('button, a, [role=menuitem]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32 }).length
  out.smallTargets = small
  return out
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
    userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
  })
  await ctx.addInitScript(() => localStorage.setItem('liftelo_language', 'hr'))
  const page = await ctx.newPage()
  await page.route('**/api/**', (route) => mock.handle(route, role))
  const report = []
  const tag = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
  async function scan(name, { full = true } = {}) {
    await page.waitForTimeout(400)
    const m = await page.evaluate(MEASURE)
    const bad = m.docScrollW > m.iw || m.bodyScrollW > m.iw || m.offenders.length
    report.push({ name, ...m, bad: !!bad })
    console.log((bad ? 'BAD ' : 'ok  ') + name, JSON.stringify({ doc: m.docScrollW, main: m.main, dialog: m.dialog, small: m.smallTargets, off: m.offenders.map((o) => o.slice(0, 70)) }))
    await page.screenshot({ path: path.join(outDir, `${W}_${tag(name)}.png`), fullPage: full })
  }
  const fs = require('fs'); fs.mkdirSync(outDir, { recursive: true })

  // Deep links to /dashboard/* are redirected to home by an app race (session loads before companies), so for
  // authed pages we load home once and navigate client-side via history + popstate.
  let loadedHome = false
  const go = async (url) => {
    if (url.startsWith('/dashboard') || url === '/superadmin' || url === '/onboarding') {
      if (!loadedHome || page.url().indexOf(BASE) !== 0) { await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(500); loadedHome = true }
      await page.evaluate((u) => { history.pushState({}, '', u); window.dispatchEvent(new PopStateEvent('popstate')) }, url)
      await page.waitForTimeout(500)
    } else { loadedHome = false; await page.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => {}) } await page.addStyleTag({ content: '.tsqd-parent-container{display:none!important}' }).catch(() => {}); await page.waitForTimeout(300) }
  const closeAll = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(250); await page.evaluate(() => window.scrollTo(0, 0)) }
  page.setDefaultTimeout(3000)

  if (role === 'admin') {
    // public pages need no session: use separate unauth mock
    mock.setAuthed(false)
    for (const p of PUBLIC) { await go(p); await scan('pub' + p) }
    mock.setAuthed(true)
    for (const r of ROUTES) { await go(r); await scan(r) }
    await go('/onboarding'); await scan('/onboarding')
  } else {
    for (const r of SUPER) { await go(r); await scan(r) }
  }

  // layout overlays on home
  await go(role === 'admin' ? '/dashboard/home' : '/superadmin')
  const open = async (label, fn, opts) => { loadedHome = false; await go(role === 'admin' ? '/dashboard/home' : '/superadmin'); try { await fn(); await scan(label, opts) } catch (e) { console.log('SKIP ' + label + ' ' + e.message.split('\n')[0]) } await closeAll() }
  if (role === 'admin') {
    await open('menu nav', async () => { await page.click('button[aria-label="Open navigation"]') })
    await go('/dashboard/home')
    await open('menu user', async () => { await page.click('header button:has(span.rounded-full)') }, { full: false })
    await open('menu company', async () => { await page.click('header button[aria-haspopup]:has-text("Rijeka")') }, { full: false })
    await open('bell', async () => { await page.click('header button:has(svg.lucide-bell)') }, { full: false })
    await open('palette', async () => { await page.keyboard.press('Control+k'); await page.waitForSelector('[role=dialog], [cmdk-root], input') }, { full: false })
    for (const label of ['Create RMS', 'Create Intervention', 'Create Work Order', 'Novo vozilo']) {
      await open('fab ' + label, async () => {
        await page.click('div.fixed.bottom-4 button'); await page.click(`[role=menuitem]:has-text("${label}")`); await page.waitForSelector('[role=dialog]')
      }, { full: false })
    }
    await open('fab menu', async () => { await page.click('div.fixed.bottom-4 button') }, { full: false })
    await closeAll()
    // page-level dialogs: click first matching buttons
    const pageDialogs = [
      ['/dashboard/locations', /nova|dodaj|new|add|lokacij/i],
      ['/dashboard/users', /korisni|dodaj|novi|new|invite|pozovi/i],
      ['/dashboard/projects', /nov|dodaj|new|add/i],
      ['/dashboard/vehicles', /nov|dodaj|new|add/i],
      ['/dashboard/settings', /nov|dodaj|new|add/i],
    ]
    for (const [r, re] of pageDialogs) {
      await go(r)
      const btns = await page.$$('main button')
      let i = 0
      for (const b of btns) {
        const t = ((await b.textContent()) || '').trim()
        if (!t || !re.test(t)) continue
        await b.click().catch(() => {})
        await page.waitForTimeout(300)
        if (await page.$('[role=dialog]')) { await scan(`${r} dialog ${++i} ${t.slice(0, 18)}`, { full: false }); await closeAll() }
      }
    }
    // detail pages: click all buttons that open dialogs (edit, delete, etc.)
    for (const r of ['/dashboard/vehicles', '/dashboard/locations/1', '/dashboard/work-orders/1', '/dashboard/rms/1', '/dashboard/projects/1', '/dashboard/users/1', '/dashboard/settings', '/dashboard/profile']) {
      await go(r)
      const n = (await page.$$('main button')).length
      for (let k = 0; k < Math.min(n, 25); k++) {
        const btns = await page.$$('main button')
        const b = btns[k]; if (!b) break
        const t = ((await b.textContent()) || '').trim().slice(0, 18)
        await b.click({ timeout: 800 }).catch(() => {})
        await page.waitForTimeout(250)
        if (await page.$('[role=dialog]')) { await scan(`${r} btn${k} ${t}`, { full: false }); await closeAll() }
        if (!page.url().endsWith(r)) await go(r)
      }
    }
  } else {
    const btns = await page.$$('main button, button')
    for (let k = 0; k < Math.min(btns.length, 12); k++) {
      const b = (await page.$$('button'))[k]; if (!b) break
      const t = ((await b.textContent()) || '').trim().slice(0, 18)
      await b.click({ timeout: 800 }).catch(() => {})
      await page.waitForTimeout(250)
      if (await page.$('[role=dialog]')) { await scan(`super btn${k} ${t}`, { full: false }); await closeAll() }
    }
  }
  fs.writeFileSync(path.join(outDir, `${W}_report.json`), JSON.stringify(report, null, 1))
  console.log(`\nTOTAL ${report.length}, BAD ${report.filter((r) => r.bad).length}`)
  await browser.close()
})()
