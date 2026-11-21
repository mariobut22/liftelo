/* HOME CARD "RMS DEADLINES" UI TEST (Playwright + mocked API: mock.cjs).
 *   cd frontend && npx vite --port 5622 --strictPort &
 *   BASE=http://localhost:5622 node scripts/mobile-check/rms-deadlines-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]
 * (exit 1 on failure; screenshots in outDir). Covers: colour by urgency (normal / 7 days left = warning / last 3 days = critical /
 * overdue = critical / all done = green), the "X days left" and "N locations missing" texts (en + hr, plural forms), last day text,
 * overdue marker per row, row -> /dashboard/locations/:id, "+N more" link -> RMS overview, same card for admin / technician / viewer,
 * card hidden when the endpoint fails or the company expects no RMS, no horizontal overflow, no page errors. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/rms-deadlines-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5622'
fs.mkdirSync(outDir, { recursive: true })
const T = require(`../../src/locales/${lang}/dashboard.json`).rmsDeadlines
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const loc = (id, name) => ({ id, name: name || `Zgrada ${id}` })
const base = { year: 2026, month: 11, days_in_month: 30, days_left: 20, urgency: 'normal', expected: 3, done: 0, missing_count: 2, overdue_count: 0, missing_locations: [loc(1), loc(2)], overdue_locations: [] }

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function open(role, fixture) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.setDeadlines(fixture)
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
    await ctx.route('**/api/**', (route) => mock.handle(route, role))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' })
    return { ctx, page, card: page.locator('[data-testid=rms-deadlines-card]') }
  }
  const noOverflow = async (page, name) => {
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`${name}: no horizontal overflow`, o <= 1, String(o))
  }
  const plural = (n, key) => {
    const rule = new Intl.PluralRules(lang).select(n)
    return (T[`${key}_${rule}`] || T[`${key}_other`]).replace('{{count}}', String(n))
  }
  const borderOf = (card) => card.getAttribute('class')
  const isRed = (c) => c.includes('border-rose-300')
  const isAmber = (c) => c.includes('border-amber-300')

  // ---- normal (20 days left)
  {
    const { ctx, page, card } = await open('admin', base)
    await card.waitFor()
    check('normal: urgency attribute', await card.getAttribute('data-urgency') === 'normal')
    check('normal: days text', (await page.locator('[data-testid=rms-deadlines-days]').innerText()) === plural(20, 'daysLeft'))
    check('normal: missing text', (await page.locator('[data-testid=rms-deadlines-missing]').innerText()) === plural(2, 'missing'))
    check('normal: neutral border (not red / amber)', !isRed(await borderOf(card)) && !isAmber(await borderOf(card)) && (await borderOf(card)).includes('border-zinc-200'))
    check('normal: two rows, none marked overdue', await page.locator('[data-testid=rms-deadlines-row]').count() === 2 && await page.locator('[data-testid=rms-deadlines-row][data-overdue=true]').count() === 0)
    await noOverflow(page, 'normal')
    await page.screenshot({ path: path.join(outDir, `${tag}_normal.png`) })
    await ctx.close()
  }

  // ---- warning: 7 days left, amber
  {
    const { ctx, page, card } = await open('admin', { ...base, days_left: 7, urgency: 'warning' })
    await card.waitFor()
    check('warning: attribute + amber border', await card.getAttribute('data-urgency') === 'warning' && isAmber(await borderOf(card)), await borderOf(card))
    check('warning: "7 days left" text', (await page.locator('[data-testid=rms-deadlines-days]').innerText()) === plural(7, 'daysLeft'))
    await page.screenshot({ path: path.join(outDir, `${tag}_warning.png`) })
    await ctx.close()
  }

  // ---- critical: last 3 days
  {
    const { ctx, page, card } = await open('admin', { ...base, days_left: 2, urgency: 'critical', missing_count: 1, missing_locations: [loc(2)] })
    await card.waitFor()
    check('critical (2 days left): attribute + red border', await card.getAttribute('data-urgency') === 'critical' && isRed(await borderOf(card)), await borderOf(card))
    check('critical: singular missing text', (await page.locator('[data-testid=rms-deadlines-missing]').innerText()) === plural(1, 'missing'))
    await page.screenshot({ path: path.join(outDir, `${tag}_critical.png`) })
    await ctx.close()
  }

  // ---- last day
  {
    const { ctx, page, card } = await open('admin', { ...base, days_left: 0, urgency: 'critical' })
    await card.waitFor()
    check('last day: dedicated text', (await page.locator('[data-testid=rms-deadlines-days]').innerText()) === T.lastDay)
    await ctx.close()
  }

  // ---- overdue from last month (red even with many days left), rows, links
  {
    const fixture = { ...base, urgency: 'critical', days_left: 15, missing_count: 3, missing_locations: [loc(1), loc(2), loc(3)], overdue_count: 2, overdue_locations: [{ ...loc(3), year: 2026, month: 10 }, { ...loc(7, 'Kvartalna lokacija'), year: 2026, month: 10 }] }
    const { ctx, page, card } = await open('admin', fixture)
    await card.waitFor()
    check('overdue: red border although 15 days left', isRed(await borderOf(card)), await borderOf(card))
    const missingText = await page.locator('[data-testid=rms-deadlines-missing]').innerText()
    check('overdue: missing + overdue counts in the text', missingText.includes(plural(3, 'missing')) && missingText.includes(plural(2, 'overdue')), missingText)
    const rows = page.locator('[data-testid=rms-deadlines-row]')
    check('overdue: 4 rows (2 overdue first, then the not-overdue missing ones, no duplicates)', await rows.count() === 4, String(await rows.count()))
    check('overdue: the first two rows are marked overdue with the month name', await rows.nth(0).getAttribute('data-overdue') === 'true' && await rows.nth(1).getAttribute('data-overdue') === 'true' && await rows.nth(2).getAttribute('data-overdue') === 'false')
    const monthName = new Date(2026, 9, 1).toLocaleDateString(lang === 'hr' ? 'hr-HR' : 'en-GB', { month: 'long' })
    check('overdue: row shows "No RMS in <month>"', (await rows.nth(0).innerText()).includes(T.overdueFrom.replace('{{month}}', monthName)), await rows.nth(0).innerText())
    await page.screenshot({ path: path.join(outDir, `${tag}_overdue.png`) })
    await noOverflow(page, 'overdue')
    await rows.nth(1).click()
    await page.waitForURL('**/dashboard/locations/7')
    check('row opens the location page', new URL(page.url()).pathname === '/dashboard/locations/7')
    await ctx.close()
  }

  // ---- many locations: capped list + "more" link
  {
    const many = Array.from({ length: 9 }, (_, i) => loc(i + 1, `Zgrada ${i + 1} - Ulica Ivana Mažuranića s jako dugim imenom koje ne smije probiti ekran`))
    const { ctx, page, card } = await open('admin', { ...base, urgency: 'warning', days_left: 5, missing_count: 9, missing_locations: many })
    await card.waitFor()
    check('many: list capped at 6 rows', await page.locator('[data-testid=rms-deadlines-row]').count() === 6)
    check('many: "3 more" link', (await page.locator('[data-testid=rms-deadlines-more]').innerText()) === plural(3, 'more'))
    await noOverflow(page, 'many (long names)')
    await page.screenshot({ path: path.join(outDir, `${tag}_many.png`) })
    await page.locator('[data-testid=rms-deadlines-more]').click()
    await page.waitForURL('**/dashboard/rms-overview')
    check('"more" opens the RMS overview', new URL(page.url()).pathname === '/dashboard/rms-overview')
    await ctx.close()
  }

  // ---- all done
  {
    const { ctx, page, card } = await open('admin', { ...base, urgency: 'done', missing_count: 0, missing_locations: [], done: 3 })
    await card.waitFor()
    check('done: green card with the all-done text, no rows', await card.getAttribute('data-urgency') === 'done' && (await card.innerText()).includes(T.allDone) && await page.locator('[data-testid=rms-deadlines-row]').count() === 0)
    await page.screenshot({ path: path.join(outDir, `${tag}_done.png`) })
    await ctx.close()
  }

  // ---- hidden: company expects no RMS / endpoint fails
  {
    const { ctx, page } = await open('admin', { ...base, urgency: 'done', expected: 0, missing_count: 0, missing_locations: [] })
    check('expected 0 and nothing overdue: no card', await page.locator('[data-testid=rms-deadlines-card]').count() === 0)
    await ctx.close()
  }
  {
    const { ctx, page } = await open('admin', { __status: 500, body: { error: 'x', code: 'rms_deadlines_failed' } })
    check('endpoint fails: no card, Home still renders', await page.locator('[data-testid=rms-deadlines-card]').count() === 0 && await page.locator('h1').count() === 1)
    await ctx.close()
  }

  // ---- roles: technician and viewer see the same list
  for (const role of ['technician', 'viewer']) {
    const { ctx, page, card } = await open(role, { ...base, urgency: 'warning', days_left: 6 })
    await card.waitFor()
    check(`${role}: same card and rows as the admin`, await page.locator('[data-testid=rms-deadlines-row]').count() === 2 && (await page.locator('[data-testid=rms-deadlines-days]').innerText()) === plural(6, 'daysLeft'))
    await noOverflow(page, role)
    await ctx.close()
  }

  mock.setDeadlines(null)
  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
