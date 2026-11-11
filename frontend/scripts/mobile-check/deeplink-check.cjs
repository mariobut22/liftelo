/* DEEP LINK / REFRESH / RETURN-TO TEST (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port 5199 &
 * Usage:  NODE_PATH=$(npm root -g) node scripts/mobile-check/deeplink-check.cjs   (exit 1 on failure)
 * Adds artificial latency to /api/login/check and /api/users/companies (both orders) to mimic a real network. */
const { chromium } = require('playwright')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5199'
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(browser, { role = 'admin', authed = true, noCompanies = false, sessionMs = 0, companiesMs = 0 }) {
  mock.setAuthed(authed)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(() => localStorage.setItem('liftelo_language', 'hr'))
  const page = await ctx.newPage()
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const p = new URL(req.url()).pathname
    if (req.method() === 'POST' && p === '/api/login') {
      mock.setAuthed(true)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: { global_role: role === 'superadmin' ? 'superadmin' : 'user' } }) })
    }
    if (p === '/api/login/check') await sleep(sessionMs)
    if (p === '/api/users/companies') {
      await sleep(companiesMs)
      if (noCompanies) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return mock.handle(route, role)
  })
  return { ctx, page }
}
const here = (page) => { const u = new URL(page.url()); return u.pathname + u.search + u.hash }
async function settle(page) { await page.waitForTimeout(1500) }

const LATENCY = [[0, 0], [100, 600], [600, 100]] // [session ms, companies ms]

;(async () => {
  const browser = await chromium.launch()
  const targets = ['/dashboard/rms', '/dashboard/work-orders/1?x=1', '/dashboard/work-orders/1?x=1#sec', '/dashboard/locations/2', '/dashboard/users/activity', '/dashboard/settings#billing']
  for (const [sessionMs, companiesMs] of LATENCY) {
    for (const t of targets) {
      const { ctx, page } = await open(browser, { sessionMs, companiesMs })
      await page.goto(BASE + t)
      await settle(page)
      check(`deep link ${t} (session ${sessionMs}ms, companies ${companiesMs}ms)`, here(page) === t, `-> ${here(page)}`)
      await ctx.close()
    }
  }
  {
    const { ctx, page } = await open(browser, { sessionMs: 100, companiesMs: 500 })
    await page.goto(BASE + '/dashboard/rms'); await settle(page)
    await page.reload(); await settle(page)
    check('refresh on /dashboard/rms stays', here(page) === '/dashboard/rms', `-> ${here(page)}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { noCompanies: true, companiesMs: 300 })
    await page.goto(BASE + '/dashboard/rms'); await settle(page)
    check('no companies -> /onboarding', here(page) === '/onboarding', `-> ${here(page)}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { role: 'superadmin', companiesMs: 300 })
    await page.goto(BASE + '/superadmin'); await settle(page)
    check('superadmin deep link /superadmin stays', here(page) === '/superadmin', `-> ${here(page)}`)
    await page.goto(BASE + '/superadmin/companies/1'); await settle(page)
    check('superadmin deep link /superadmin/companies/1 stays', here(page) === '/superadmin/companies/1', `-> ${here(page)}`)
    await page.reload(); await settle(page)
    check('superadmin company detail survives reload', here(page) === '/superadmin/companies/1', `-> ${here(page)}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { companiesMs: 300 })
    await page.goto(BASE + '/superadmin/companies/1'); await settle(page)
    check('non-superadmin on /superadmin/companies/1 -> /dashboard', here(page).startsWith('/dashboard'), `-> ${here(page)}`)
    await ctx.close()
  }
  const login = async (page) => {
    await page.fill('#email', 'a@b.hr'); await page.fill('#password', 'secret123'); await page.click('button[type=submit]'); await settle(page)
  }
  for (const t of ['/dashboard/rms', '/dashboard/work-orders/1?x=1#sec']) {
    const { ctx, page } = await open(browser, { authed: false, companiesMs: 300 })
    await page.goto(BASE + t); await settle(page)
    check(`logged out ${t} -> /login`, here(page) === '/login', `-> ${here(page)}`)
    await login(page)
    check(`after login returns to ${t}`, here(page) === t, `-> ${here(page)}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { authed: false, role: 'superadmin' })
    await page.goto(BASE + '/dashboard/rms'); await settle(page); await login(page)
    check('superadmin login -> /superadmin', here(page) === '/superadmin', `-> ${here(page)}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { authed: false, noCompanies: true })
    await page.goto(BASE + '/dashboard/rms'); await settle(page); await login(page)
    check('login without companies -> /onboarding', here(page) === '/onboarding', `-> ${here(page)}`)
    await ctx.close()
  }
  for (const evil of ['//evil.com', '/\\evil.com', 'https://evil.com']) {
    const { ctx, page } = await open(browser, { authed: false })
    await page.goto(BASE + '/login'); await settle(page)
    await page.evaluate((e) => { history.replaceState({ usr: { from: e }, key: 'x', idx: 0 }, '') }, evil)
    await page.reload(); await settle(page); await login(page)
    check(`malicious target ${evil} ignored`, here(page) === '/dashboard/home' && new URL(page.url()).origin === BASE, `-> ${page.url()}`)
    await ctx.close()
  }
  await browser.close()
  console.log(failures ? `${failures} FAILED` : 'ALL PASS')
  process.exit(failures ? 1 : 0)
})()
