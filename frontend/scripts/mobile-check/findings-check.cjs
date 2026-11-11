/* FINDINGS ("Kvarovi" / "Faults") UI TEST (Playwright + mocked API with a stateful fake of /api/findings - mock.cjs).
 *   cd frontend && npx vite --port 5607 --strictPort &
 *   BASE=http://localhost:5607 node scripts/mobile-check/findings-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure; screenshots in outDir)
 * Covers: RMS and intervention dialogs show the "What is wrong?" form only for a repair status, block submit without a description
 * (translated message, NO request sent), send `findings` for exactly that elevator (RMS JSON / intervention multipart); the findings page
 * (tabs open / to order / all, filters, severity order, detail with history); admin actions vs technician comment-only vs viewer read-only;
 * "to order" list + copy; Home card (admin counts with out-of-service highlighted and to-order SEPARATE, technician compact list);
 * open faults per elevator on the location page; no horizontal overflow. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/findings-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5607'
fs.mkdirSync(outDir, { recursive: true })
const F = require(`../../src/locales/${lang}/findings.json`)
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OOS = 'Potreban popravak - Dizalo nije u funkciji'
const INS = 'Potreban popravak - Dizalo u funkciji'

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetFindings()
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
      userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
    })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { // hide the React Query devtools button of the dev server
      const style = document.createElement('style')
      style.textContent = '.tsqd-parent-container{display:none!important}'
      document.head.appendChild(style)
    }))
    await ctx.route('**/api/**', (route) => mock.handle(route, role))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    const requests = []
    page.on('request', (req) => { if (req.method() === 'POST' && /\/api\/(rms-visits|interventions)$/.test(new URL(req.url()).pathname)) requests.push({ url: new URL(req.url()).pathname, body: req.postData() || '' }) })
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`) })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    return { ctx, page, shot, overflow, requests }
  }
  const text = (page, sel) => page.locator(sel).innerText()
  const fmt = (s, vars = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k])

  // ============================== ADMIN
  {
    const { ctx, page, shot, overflow } = await session('admin')
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=findings-home-card]', { timeout: 8000 }).catch(() => {})
    check('admin Home: "Open faults" card is shown', await page.locator('[data-testid=findings-home-card]').count() === 1)
    const tiles = await page.locator('[data-testid=findings-tile]').evaluateAll((els) => els.map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), tone: e.getAttribute('data-tone') })))
    check('Home tiles: out of service = 1 (highlighted), to order = 2, waiting for part = 1, in service = 3 (separate counts)',
      tiles.length === 4 && tiles[0].text.endsWith(' 1') && tiles[0].tone === 'danger' && tiles[1].text.endsWith(' 2') && tiles[1].tone === 'info' && tiles[2].text.endsWith(' 1') && tiles[3].text.endsWith(' 3'), JSON.stringify(tiles))
    check('Home card names the labels in the active language', (await text(page, '[data-testid=findings-home-card]')).includes(F.home.outOfService) && (await text(page, '[data-testid=findings-home-card]')).includes(F.home.toOrder))
    await shot('home')
    await overflow('Home')

    await page.goto(BASE + '/dashboard/findings', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=finding-card]')
    let cards = page.locator('[data-testid=finding-card]')
    check('findings page: 5 open faults, resolved one hidden', (await cards.count()) === 5)
    check('sorted by severity: first card is the out-of-service one', (await cards.first().innerText()).includes(F.severity.out_of_service))
    check('sidebar/menu title is translated', (await text(page, 'h1')) === F.page.title)
    await shot('list')
    await overflow('findings list')

    await page.selectOption('[data-testid=findings-filters] select >> nth=0', 'in_service')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=finding-card]').length === 3)
    check('filter severity=in_service -> 3 cards', (await cards.count()) === 3)
    await page.selectOption('[data-testid=findings-filters] select >> nth=0', '')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=finding-card]').length === 5)
    await page.locator('[data-testid=findings-filters] input[type=checkbox]').check()
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=finding-card]').length === 3)
    check('filter "part needed" -> 3 cards (out of service + in service + waiting for part)', (await cards.count()) === 3)
    await page.locator('[data-testid=findings-filters] input[type=checkbox]').uncheck()
    await page.selectOption('[data-testid=findings-filters] select >> nth=1', '2')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=finding-card]').length === 2)
    check('filter by location -> 2 cards', (await cards.count()) === 2)
    await page.selectOption('[data-testid=findings-filters] select >> nth=1', '')

    await page.click('[data-tab=all]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=finding-card]').length === 6)
    check('"All" tab shows the resolved fault too, sorted last', (await cards.count()) === 6 && (await cards.last().innerText()).includes(F.state.resolved))

    await page.click('[data-tab=toOrder]')
    await page.waitForSelector('[data-testid=to-order-list]')
    check('"To order" tab: 2 parts to order (the in-service one included)', (await page.locator('[data-testid=to-order-list] li').count()) === 2)
    const toOrderText = await text(page, '[data-testid=to-order-list]')
    check('to-order lines show the part notes', toOrderText.includes('komplet kotačića vrata') && toOrderText.includes('ležaj motora 6208'))
    await shot('to_order')
    await overflow('to-order list')
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    await page.click(`button:has-text("${F.toOrder.copy}")`)
    await sleep(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
    check('"Copy list" puts one line per part on the clipboard', clip.split('\n').length === 2 && clip.includes('ležaj motora 6208'), clip)

    // detail + admin actions
    await page.click('[data-tab=open]')
    await page.waitForSelector('[data-testid=finding-card]')
    await page.locator('[data-testid=finding-card]').first().click()
    await page.waitForSelector('[data-testid=finding-detail]')
    await sleep(300)
    check('detail shows the history with the "reported" entry', (await text(page, '[data-testid=finding-history]')).includes(F.detail.event.opened))
    const detailText = await text(page, '[data-testid=finding-detail]')
    check('admin sees status buttons + resolve', detailText.includes(F.actions.resolve) && detailText.includes(F.actions.partsOrdered) && detailText.includes(F.actions.setInProgress))
    await shot('detail_admin')
    await page.fill('[data-testid=finding-note]', 'Naručeno kod dobavljača')
    await page.click(`button:has-text("${F.actions.partsOrdered}")`)
    await page.waitForFunction((txt) => document.querySelector('[data-testid=finding-history]')?.innerText.includes(txt), F.detail.event.parts_ordered)
    check('"Parts ordered" adds a history entry with the note', (await text(page, '[data-testid=finding-history]')).includes('Naručeno kod dobavljača'))
    check('state badge in the dialog changed to "waiting for part"', (await text(page, '[data-testid=finding-detail]')).includes(F.state.waiting_part))
    await page.click(`button:has-text("${F.actions.resolve}")`)
    await page.waitForFunction((txt) => document.querySelector('[data-testid=finding-history]')?.innerText.includes(txt), F.detail.event.resolved)
    check('resolved -> "Reopen" offered', (await text(page, '[data-testid=finding-detail]')).includes(F.actions.reopen))
    await page.click(`button:has-text("${F.detail.close}") >> nth=-1`)
    await page.waitForFunction(() => !document.querySelector('[data-testid=finding-detail]'))
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=finding-card]').length === 4)
    check('after resolving, the open list has 4 faults', true)

    // deep link from a notification: /dashboard/findings?id=2
    await page.goto(BASE + '/dashboard/findings?id=2', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=finding-detail]')
    check('notification link ?id=2 opens that fault', (await text(page, '[data-testid=finding-detail]')).includes('ležaj motora') || (await text(page, '[data-testid=finding-detail]')).includes('Bučan pogon'))

    // location page
    await page.goto(BASE + '/dashboard/locations/1', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=elevator-findings]')
    const perElevator = await page.locator('[data-testid=elevator-findings]').evaluateAll((els) => els.map((e) => ({ el: e.getAttribute('data-elevator'), n: e.querySelectorAll('a[href*="findings?id="]').length })))
    check('location page: open faults per elevator (Lift A: none after it was resolved above, Lift B: 1)', perElevator.length === 2 && perElevator[0].n === 0 && perElevator[1].n === 1, JSON.stringify(perElevator))
    check('location page: link to the full fault history of the elevator', (await page.locator('a[href*="findings?elevator="]').count()) >= 2)
    await shot('location')
    await overflow('location detail')
    await ctx.close()
  }

  // ============================== TECHNICIAN
  {
    const { ctx, page, shot, overflow } = await session('technician')
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=findings-home-card]', { timeout: 8000 }).catch(() => {})
    check('technician Home: compact list of open faults (no admin tiles)', await page.locator('[data-testid=findings-home-card] [data-testid=finding-card]').count() === 5 && await page.locator('[data-testid=findings-tile]').count() === 0)
    await shot('home')
    await overflow('Home')
    await page.goto(BASE + '/dashboard/findings?id=1', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=finding-detail]')
    const d = await text(page, '[data-testid=finding-detail]')
    check('technician: comment only (no status / resolve / parts buttons), hint shown', !d.includes(F.actions.resolve) && !d.includes(F.actions.partsOrdered) && d.includes(F.actions.addNote) && d.includes(F.actions.adminOnly))
    await shot('detail')
    await page.fill('[data-testid=finding-note]', 'Fotografirao sam dio')
    await page.click(`button:has-text("${F.actions.addNote}")`)
    await page.waitForFunction((txt) => document.querySelector('[data-testid=finding-history]')?.innerText.includes(txt), 'Fotografirao sam dio')
    check('technician comment appears in the history', true)
    await ctx.close()
  }

  // ============================== VIEWER
  {
    const { ctx, page, shot } = await session('viewer')
    await page.goto(BASE + '/dashboard/findings?id=1', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=finding-detail]')
    const d = await text(page, '[data-testid=finding-detail]')
    check('viewer: read-only (no action panel, no note field)', !d.includes(F.actions.title) && await page.locator('[data-testid=finding-note]').count() === 0 && d.includes(F.detail.history))
    await shot('detail')
    await ctx.close()
  }

  // ============================== RMS dialog + intervention dialog
  {
    const { ctx, page, shot, overflow, requests } = await session('technician')
    const openFab = async (selector) => {
      await page.click('div.fixed.bottom-4 button')
      const items = page.locator('[role=menuitem]')
      const n = await items.count()
      for (let k = 0; k < n; k++) {
        if (k > 0) await page.click('div.fixed.bottom-4 button')
        await items.nth(k).click()
        try { await page.waitForSelector(selector, { timeout: 2500 }); return true } catch { await page.keyboard.press('Escape').catch(() => {}) }
      }
      return false
    }
    const sign = async () => {
      await page.locator('[role=dialog] [data-testid=client-absent]').check() // the client signs later (name + role are required for a drawn client signature)
      const canvases = page.locator('[role=dialog] canvas')
      for (let c = 0; c < (await canvases.count()); c++) {
        if (!(await canvases.nth(c).isVisible())) continue
        await canvases.nth(c).scrollIntoViewIfNeeded()
        const b = await canvases.nth(c).boundingBox()
        await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down()
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.mouse.move(b.x + b.width - 20, b.y + 30, { steps: 6 }); await page.mouse.up()
      }
    }
    const submit = async () => { const b = page.locator('[role=dialog] button[type=submit]'); await b.scrollIntoViewIfNeeded(); await b.click() }

    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check('RMS dialog opens', await openFab('#rms-address'))
    await page.fill('#rms-address', 'Lokacija 2')
    await page.locator('li', { hasText: 'Lokacija 2' }).first().click().catch(() => {})
    await page.locator('#rms-address').blur()
    await page.waitForFunction(() => document.querySelectorAll('[role=dialog] select').length >= 2)
    check('no finding form while every elevator is O.K.', await page.locator('[data-testid=finding-fields]').count() === 0)
    const selects = page.locator('[role=dialog] form select')
    await selects.nth(0).selectOption(OOS)
    await page.waitForSelector('[data-testid=finding-fields]')
    check('repair status shows the "What is wrong?" form for THAT elevator only', await page.locator('[data-testid=finding-fields]').count() === 1)
    check('form has description, category select and a "part needed" checkbox', await page.locator('#rms-finding-0-desc').count() === 1 && await page.locator('#rms-finding-0-cat option').count() === 9 && await page.locator('[data-testid=finding-fields] input[type=checkbox]').count() === 1)
    await shot('rms_form')
    await sign()
    await submit()
    await sleep(500)
    check('submit without a description is blocked with a translated message', await page.locator('[data-testid=finding-fields] [role=alert]').count() === 1 && (await text(page, '[data-testid=finding-fields] [role=alert]')) === fmt(F.form.descriptionRequired, { elevator: 'Lift A' }))
    check('...and NO request was sent', requests.length === 0)
    await shot('rms_validation')
    await page.fill('#rms-finding-0-desc', 'Vrata ne zatvaraju do kraja')
    await page.selectOption('#rms-finding-0-cat', 'doors')
    await page.locator('[data-testid=finding-fields] input[type=checkbox]').check()
    await page.fill('#rms-finding-0-part', 'kotačići vrata')
    await shot('rms_filled')
    await overflow('RMS dialog')
    await selects.nth(2).selectOption(INS)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=finding-fields]').length === 2)
    await page.fill('#rms-finding-1-desc', 'Svjetlo trepće')
    await submit()
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 8000 }).catch(() => {})
    const rmsReq = requests.find((r) => r.url === '/api/rms-visits')
    const body = rmsReq ? JSON.parse(rmsReq.body) : {}
    check('RMS request carries 2 findings, each for its own elevator, with category / part', Array.isArray(body.findings) && body.findings.length === 2
      && body.findings[0].elevator_label === 'Lift A' && body.findings[0].category === 'doors' && body.findings[0].needs_part === true && body.findings[0].part_note === 'kotačići vrata'
      && body.findings[1].elevator_label === 'Lift B' && body.findings[1].needs_part === false && !('part_note' in body.findings[1]), JSON.stringify(body.findings))
    check('item statuses are still the untranslated DB strings', body.items?.[0]?.status === OOS && body.items?.[1]?.status === INS)
    check('the request still has its client_request_id (idempotency)', typeof body.client_request_id === 'string' && body.client_request_id.length >= 8)

    // intervention
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check('intervention dialog opens', await openFab('#int-location'))
    await page.fill('#int-location', 'Lokacija 2')
    await page.locator('li', { hasText: 'Lokacija 2' }).first().click().catch(() => {})
    await page.locator('#int-location').blur()
    await page.waitForFunction(() => document.querySelectorAll('[role=dialog] form select').length >= 3)
    await page.locator('[role=dialog] form select').nth(1).selectOption(OOS)
    await page.waitForSelector('[data-testid=finding-fields]')
    await sign()
    await submit()
    await sleep(500)
    check('intervention: blocked without description (translated message)', await page.locator('[data-testid=finding-fields] [role=alert]').count() === 1 && requests.filter((r) => r.url === '/api/interventions').length === 0)
    await shot('intervention_validation')
    await page.fill('#int-finding-1-desc', 'Motor se pregrijava')
    await submit()
    await sleep(1200)
    const intReq = requests.find((r) => r.url === '/api/interventions')
    const m = intReq ? /name="findings"\r\n\r\n([^\r]*)/.exec(intReq.body) : null
    const intFindings = m ? JSON.parse(m[1]) : null
    check('intervention request carries the finding as a JSON field for that elevator', Array.isArray(intFindings) && intFindings.length === 1 && intFindings[0].elevator_label === 'Lift B' && intFindings[0].description === 'Motor se pregrijava', m ? m[1] : 'no findings field')
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
