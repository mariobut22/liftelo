/* GLOBAL SEARCH TEST (header button + Ctrl/Cmd+K dialog -> GET /api/search). Playwright + mocked API (mock.cjs: /search).
 *   cd frontend && npx vite --port 5621 --strictPort &
 *   BASE=http://localhost:5621 node scripts/mobile-check/search-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en] [role=admin|technician|viewer|all]   (exit 1 on failure)
 * Covers: search button in the header (visible, >= 44 px touch target, translated label, no overflow at 375 px), opens dialog with
 * focused input + "type at least 2 characters" hint, Ctrl+K opens / toggles and Escape closes, debounce (fast typing = few requests),
 * loading, results grouped by type with translated group titles, empty state with the query, error state, arrow-key navigation with
 * ARIA (combobox / listbox / group / option, aria-activedescendant, aria-selected), Enter and tap navigate to the real detail routes
 * (location, elevator -> its location, RMS, intervention, work order, vehicle), dialog closes and resets, vehicles only for admins. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/search-check', W = '375', H = '812', lang = 'en', roleArg = 'all'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5621'
fs.mkdirSync(outDir, { recursive: true })
const NAV = require(`../../src/locales/${lang}/nav.json`)
const COMMON = require(`../../src/locales/${lang}/common.json`)
const CP = NAV.commandPalette
const fill = (text, vars = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k])
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.setSearchFail(false)
    mock.setSearchDelay(0)
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
    const searchRequests = []
    page.on('request', (req) => { if (new URL(req.url()).pathname === '/api/search') searchRequests.push(new URL(req.url()).searchParams.get('q')) })
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`) })
    return { ctx, page, shot, searchRequests }
  }

  const roles = roleArg === 'all' ? ['admin', 'technician', 'viewer'] : [roleArg]
  for (const role of roles) {
    console.log(`\n--- ${role} ${tag}`)
    const { ctx, page, shot, searchRequests } = await session(role)
    const input = page.locator('[data-testid=global-search-input]')
    const opts = page.locator('[data-testid=global-search-option]')
    const groupTitles = () => page.locator('[data-testid=global-search] [role=group] p').allInnerTexts()
    const open = async () => { await page.locator('[data-testid=global-search-open]').click(); await input.waitFor({ timeout: 5000 }) }
    const type = async (text) => { await input.fill(''); await input.fill(text) }
    const waitResults = async () => { await opts.first().waitFor({ timeout: 5000 }) }

    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    const btn = page.locator('[data-testid=global-search-open]')
    check(`${role}: search button visible in the header`, await btn.isVisible())
    const box = await btn.boundingBox()
    check(`${role}: touch target >= 44x44`, box && box.width >= 44 && box.height >= 44, JSON.stringify(box))
    check(`${role}: button has a translated accessible name`, (await btn.getAttribute('aria-label')) === CP.open)
    const hdrOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`${role}: no horizontal overflow with the header button`, hdrOverflow <= 1, String(hdrOverflow))
    const inView = await page.evaluate(() => { const r = document.querySelector('[data-testid=global-search-open]').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth })
    check(`${role}: button fully inside the viewport`, inView)

    // open, hint, focus
    await open()
    check(`${role}: input is focused`, await input.evaluate((el) => document.activeElement === el))
    check(`${role}: hint "type at least 2 characters"`, (await page.locator('[data-testid=global-search-status]').innerText()).trim() === fill(CP.hint, { n: 2 }))
    check(`${role}: input has role combobox + placeholder translated`, (await input.getAttribute('role')) === 'combobox' && (await input.getAttribute('placeholder')) === CP.placeholder)
    await shot('open')
    await type('L')
    await sleep(500)
    check(`${role}: 1 character sends no request`, searchRequests.length === 0, JSON.stringify(searchRequests))

    // debounce: fast typing -> few requests
    searchRequests.length = 0
    await input.fill('')
    await input.pressSequentially('Lokacija', { delay: 40 })
    await waitResults()
    await sleep(500)
    check(`${role}: debounce - 8 fast keystrokes cause at most 2 requests`, searchRequests.length >= 1 && searchRequests.length <= 2, JSON.stringify(searchRequests))
    check(`${role}: last request is the full term`, searchRequests[searchRequests.length - 1] === 'Lokacija')
    const titles = await groupTitles()
    check(`${role}: locations group first, translated title`, titles[0] === NAV.items.locations.toUpperCase() || titles[0].toLowerCase() === NAV.items.locations.toLowerCase(), JSON.stringify(titles))
    check(`${role}: Lokacija 2 + Lokacija 3 found (2 locations)`, (await opts.count()) >= 2 && (await opts.allInnerTexts()).filter((x) => /Lokacija [23]/.test(x)).length >= 2, JSON.stringify(await opts.allInnerTexts()))

    // ARIA + keyboard
    check(`${role}: aria-expanded true when results shown`, (await input.getAttribute('aria-expanded')) === 'true')
    check(`${role}: listbox + groups + options roles`, (await page.locator('[role=listbox]').count()) === 1 && (await page.locator('[role=group]').count()) >= 1 && (await page.locator('[role=option]').count()) >= 2)
    check(`${role}: groups are labelled (aria-labelledby points to an existing heading)`, await page.evaluate(() => [...document.querySelectorAll('[data-testid=global-search] [role=group]')].every((g) => document.getElementById(g.getAttribute('aria-labelledby'))?.textContent)))
    const act0 = await input.getAttribute('aria-activedescendant')
    check(`${role}: first option is active by default (aria-selected)`, Boolean(act0) && (await page.locator(`#${act0}`).getAttribute('aria-selected')) === 'true')
    await input.press('ArrowDown')
    const act1 = await input.getAttribute('aria-activedescendant')
    check(`${role}: ArrowDown moves the active option`, act1 && act1 !== act0 && (await page.locator(`#${act1}`).getAttribute('aria-selected')) === 'true' && (await page.locator(`#${act0}`).getAttribute('aria-selected')) === 'false')
    await input.press('ArrowUp')
    check(`${role}: ArrowUp moves back`, (await input.getAttribute('aria-activedescendant')) === act0)
    await input.press('End')
    const last = await input.getAttribute('aria-activedescendant')
    await input.press('ArrowDown')
    check(`${role}: ArrowDown on the last option wraps to the first`, last !== act0 && (await input.getAttribute('aria-activedescendant')) === act0)
    const oh = await opts.first().boundingBox()
    check(`${role}: option rows are >= 44 px high (touch)`, oh && oh.height >= 44, JSON.stringify(oh))
    await shot('results')
    if (width < 1024) {
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow with the dialog open`, ov <= 1, String(ov))
      const dlg = await page.locator('[data-testid=global-search]').boundingBox()
      check(`${role}: dialog fits the screen`, dlg && dlg.x >= 0 && dlg.x + dlg.width <= width && dlg.y >= 0 && dlg.y + dlg.height <= height, JSON.stringify(dlg))
    }

    // Enter navigates (second option = Lokacija 3? whichever is active) -> location detail, dialog closes + resets
    await input.press('Enter')
    await page.waitForURL(/\/dashboard\/locations\/\d+$/, { timeout: 5000 }).then(() => check(`${role}: Enter opens the location detail route`, true)).catch(() => check(`${role}: Enter opens the location detail route`, false, page.url()))
    check(`${role}: dialog closed after navigating`, (await page.locator('[data-testid=global-search]').count()) === 0)
    await open()
    check(`${role}: reopened dialog starts empty (query reset)`, (await input.inputValue()) === '')
    await page.keyboard.press('Escape')
    check(`${role}: Escape closes`, (await page.locator('[data-testid=global-search]').count()) === 0)

    // Ctrl/Cmd+K
    await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {})
    await page.keyboard.press('Control+k')
    check(`${role}: Ctrl+K opens`, await input.isVisible().catch(() => false))
    await page.keyboard.press('Control+k')
    await sleep(250)
    check(`${role}: Ctrl+K again closes`, (await page.locator('[data-testid=global-search]').count()) === 0)

    // every result type navigates to its detail route (tap)
    const goTo = async (term, optionIncludes, urlRe, label) => {
      await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
      await open()
      await type(term)
      await waitResults()
      const target = opts.filter({ hasText: optionIncludes }).first()
      if (!(await target.count())) { check(`${role}: ${label} result present`, false, JSON.stringify(await opts.allInnerTexts())); return }
      await target.click()
      await page.waitForURL(urlRe, { timeout: 5000 }).then(() => check(`${role}: ${label} -> ${urlRe}`, true)).catch(() => check(`${role}: ${label} -> ${urlRe}`, false, page.url()))
    }
    await goTo('SN-12345', 'Lift A', /\/dashboard\/locations\/\d+$/, 'elevator (opens its location)')
    await goTo('Lokacija 2', fill(CP.rmsVisit, { id: 2 }), /\/dashboard\/rms\/2$/, 'RMS visit')
    await goTo('Lokacija 2', fill(CP.intervention, { id: 2 }), /\/dashboard\/interventions\/2$/, 'intervention')
    await goTo('Lokacija 2', fill(CP.workOrder, { id: 2 }), /\/dashboard\/work-orders\/2$/, 'work order')
    await goTo('#2', fill(CP.workOrder, { id: 2 }), /\/dashboard\/work-orders\/2$/, 'work order by number "#2"')

    // vehicles: admin only
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await open()
    await type('Renault')
    await sleep(900)
    const vehicleOpt = opts.filter({ hasText: 'Renault Kangoo' })
    if (role === 'admin') {
      check('admin: vehicle found (plate in the name)', (await vehicleOpt.count()) === 1)
      const t2 = await groupTitles()
      check('admin: Vehicles group title translated', t2.some((x) => x.toLowerCase() === NAV.items.vehicles.toLowerCase()), JSON.stringify(t2))
      await vehicleOpt.click()
      await page.waitForURL(/\/dashboard\/vehicles$/, { timeout: 5000 }).then(() => check('admin: vehicle -> /dashboard/vehicles', true)).catch(() => check('admin: vehicle -> /dashboard/vehicles', false, page.url()))
    } else {
      check(`${role}: NO vehicles in the results (admin-only page)`, (await vehicleOpt.count()) === 0)
      check(`${role}: shows the translated empty state with the query`, (await page.locator('[data-testid=global-search-status]').innerText()).trim() === fill(CP.noResults, { query: 'Renault' }))
      await page.keyboard.press('Escape')
    }

    // empty state
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await open()
    await type('zzzqqq')
    await page.locator('[data-testid=global-search-status]').filter({ hasText: fill(CP.noResults, { query: 'zzzqqq' }) }).waitFor({ timeout: 5000 }).then(() => check(`${role}: empty state shows the query`, true)).catch(() => check(`${role}: empty state shows the query`, false))
    check(`${role}: aria-expanded false with no results`, (await input.getAttribute('aria-expanded')) === 'false')
    await shot('empty')

    // loading state (slow answer)
    mock.setSearchDelay(1200)
    await type('Lokacija 3')
    await sleep(500)
    check(`${role}: loading state while waiting (${COMMON.states.loading})`, (await page.locator('[data-testid=global-search-status]').innerText()).trim() === COMMON.states.loading)
    await shot('loading')
    await waitResults()
    mock.setSearchDelay(0)

    // error state
    mock.setSearchFail(true)
    await type('Lokacija 1')
    await page.locator('[data-testid=global-search-status]').filter({ hasText: CP.error }).waitFor({ timeout: 5000 }).then(() => check(`${role}: error state shown (search failed)`, true)).catch(() => check(`${role}: error state shown (search failed)`, false))
    await shot('error')
    mock.setSearchFail(false)
    await type('Lokacija 3')
    await waitResults()
    check(`${role}: recovers after the error`, (await opts.count()) >= 1)
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed (${tag}, ${roleArg})`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
