/* CALENDAR PAGE (/dashboard/calendar) UI TEST (Playwright + mocked API: mock.cjs, GET /api/calendar).
 *   cd frontend && npx vite --port 5731 --strictPort &
 *   BASE=http://localhost:5731 node scripts/mobile-check/calendar-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: sidebar/drawer entry "Calendar" in the Work group (all roles); month grid at >= 768 px, agenda list of the week below;
 * work orders (open / overdue / completed), RMS month-end deadline (missing count, link to the RMS overview), upcoming recurring
 * occurrence (link only for admins); click opens the right page; previous / next / today; technician sees only his own work orders and the
 * "own only" note; viewer reads everything; empty state; load error; no horizontal overflow; en and hr. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/calendar-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5731'
fs.mkdirSync(outDir, { recursive: true })
const C = require(`../../src/locales/${lang}/calendar.json`)
const NAV = require(`../../src/locales/${lang}/nav.json`)
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const noOverflow = (page) => page.evaluate(() => !(document.documentElement.scrollWidth > window.innerWidth + 1))
const wide = width >= 768

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetWoExtras()
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
      userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
    })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.tsqd-parent-container{display:none!important}'
      document.head.appendChild(style)
    }))
    let calendarFails = false
    let empty = false
    await ctx.route('**/api/calendar**', (route) => {
      if (calendarFails) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'x', code: 'calendar_failed' }) })
      if (empty) { const u = new URL(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ from: u.searchParams.get('from'), to: u.searchParams.get('to'), role, work_orders: [], rms_deadlines: [], recurrences: [] }) }) }
      return mock.handle(route, role)
    })
    await ctx.route(/\/api\/(?!calendar)/, (route) => mock.handle(route, role))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    return { ctx, page, setFail: (v) => { calendarFails = v }, setEmpty: (v) => { empty = v } }
  }

  for (const role of ['admin', 'technician', 'viewer']) {
    const { ctx, page, setFail, setEmpty } = await session(role)
    const t = `${tag}_${role}`
    await page.goto(`${BASE}/dashboard/home`, { waitUntil: 'networkidle' })
    // navigation entry (desktop sidebar or mobile drawer)
    if (!wide) {
      await page.getByRole('button', { name: /navigation|navigaci/i }).first().click().catch(() => {})
      await page.waitForTimeout(400)
    }
    const navLink = page.locator('a[href="/dashboard/calendar"]').first()
    check(`[${t}] "${NAV.items.calendar}" entry in the navigation`, (await navLink.count()) >= 1)
    check(`[${t}] entry sits in the Work group`, (await page.locator('[data-nav-group="work"] a[href="/dashboard/calendar"]').count()) >= 1)
    await page.goto(`${BASE}/dashboard/calendar`, { waitUntil: 'networkidle' })
    await page.getByTestId('calendar-page').waitFor({ timeout: 15000 })
    await page.getByTestId('cal-item').first().waitFor({ timeout: 10000 })
    check(`[${t}] ${wide ? 'month grid' : 'agenda list'} is shown`, (await page.getByTestId(wide ? 'cal-month' : 'cal-agenda').count()) === 1 && (await page.getByTestId(wide ? 'cal-agenda' : 'cal-month').count()) === 0)
    const days = await page.getByTestId('cal-day').count()
    check(`[${t}] ${wide ? 'at least 28 day cells' : '7 days'}`, wide ? days >= 28 && days % 7 === 0 : days === 7, String(days))
    check(`[${t}] no horizontal overflow`, await noOverflow(page))
    await page.screenshot({ path: path.join(outDir, `${t}_calendar.png`) })

    const kinds = await page.getByTestId('cal-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
    check(`[${t}] shows work orders`, kinds.includes('work-order'))
    const ids = await page.locator('[data-kind="work-order"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))
    if (role === 'technician') {
      check(`[${t}] technician sees only own work orders (no #3)`, !ids.includes('3'), ids.join())
      check(`[${t}] technician note "${C.myOnly}"`, (await page.getByTestId('calendar-page').innerText()).includes(C.myOnly))
    } else if (wide) {
      check(`[${t}] sees all company work orders (1 and 3 and 2)`, ['1', '2', '3'].every((id) => ids.includes(id)), ids.join())
    } else {
      check(`[${t}] week agenda has the open and overdue orders (1 or 3)`, ids.includes('1') || ids.includes('3'), ids.join())
    }
    if (wide) {
      check(`[${t}] RMS month-end deadline item`, kinds.includes('rms'))
      const rmsText = await page.locator('[data-kind="rms"]').first().innerText()
      check(`[${t}] RMS item has text`, /RMS/.test(rmsText), rmsText)
      check(`[${t}] upcoming recurring item${role === 'admin' ? ' is a link' : ' is not a link'}`,
        kinds.includes('recurrence') && ((await page.locator('a[data-kind="recurrence"]').count()) === (role === 'admin' ? 1 : 0)))
    }

    // click a work order -> its page
    const first = page.locator('a[data-kind="work-order"]').first()
    const firstId = await first.getAttribute('data-id')
    await first.click()
    await page.waitForURL(`**/dashboard/work-orders/${firstId}`, { timeout: 10000 })
    check(`[${t}] click work order opens /dashboard/work-orders/${firstId}`, true)
    await page.goBack({ waitUntil: 'networkidle' })
    await page.getByTestId('cal-item').first().waitFor({ timeout: 10000 })

    if (wide) {
      const rms = page.locator('a[data-kind="rms"]').first()
      const href = await rms.getAttribute('href')
      check(`[${t}] RMS item links to the RMS overview`, /^\/dashboard\/rms-overview\?deadline=\d{4}-\d{2}$/.test(href || ''), href || '')
    }

    // previous / next / today
    const heading = () => page.getByTestId('cal-heading').innerText()
    const h0 = await heading()
    await page.getByTestId('cal-next').click()
    await page.waitForTimeout(500)
    const h1 = await heading()
    check(`[${t}] next changes the heading`, h1 !== h0, `${h0} -> ${h1}`)
    await page.getByTestId('cal-prev').click()
    await page.getByTestId('cal-prev').click()
    await page.waitForTimeout(500)
    check(`[${t}] previous goes back`, (await heading()) !== h1)
    await page.getByTestId('cal-today').click()
    await page.waitForTimeout(500)
    check(`[${t}] today returns to the current period`, (await heading()) === h0)

    if (role === 'admin') {
      setEmpty(true)
      await page.getByTestId('cal-next').click() // months +1 / +2 / +3 were not fetched before (no cache hit)
      await page.getByTestId('cal-next').click()
      await page.getByTestId('cal-empty').waitFor({ timeout: 8000 })
      check(`[${t}] empty state "${C.empty}"`, (await page.getByTestId('cal-empty').innerText()).includes(C.empty))
      setEmpty(false)
      setFail(true)
      await page.getByTestId('cal-next').click()
      await page.getByTestId('cal-error').waitFor({ timeout: 10000 })
      check(`[${t}] load error is shown, page does not crash`, (await page.getByTestId('calendar-page').count()) === 1)
      await page.screenshot({ path: path.join(outDir, `${t}_error.png`) })
    }
    await ctx.close()
  }

  await browser.close()
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
  process.exit(failures ? 1 : 0)
})()
