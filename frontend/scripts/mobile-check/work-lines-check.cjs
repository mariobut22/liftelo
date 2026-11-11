/* WORK / MATERIAL TABLE ("work lines") UI TEST (Playwright + mocked API - mock.cjs keeps the fake table state).
 *   cd frontend && npx vite --port 5611 --strictPort &
 *   BASE=http://localhost:5611 node scripts/mobile-check/work-lines-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]
 * (exit 1 on failure; screenshots in outDir). Covers:
 *  - intervention dialog (technician): the popup, add/remove rows, unit select + free text, comma decimals, validation messages
 *    (translated, nothing sent), rows kept after "Done", request carries `work_lines`; nothing entered -> no `work_lines` field
 *  - work order create dialog (admin) sends `work_lines`
 *  - work order detail: table read-only; admin + ASSIGNED technician can fill it (PUT /items); unassigned technician and viewer cannot;
 *    a closed work order shows the table read-only
 *  - intervention list: read-only table dialog with units translated and total hours
 *  - verify result "ok_anonymised" is translated
 *  - no horizontal overflow */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/work-lines-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5611'
fs.mkdirSync(outDir, { recursive: true })
const L = require(`../../src/locales/${lang}/workLines.json`)
const S = require(`../../src/locales/${lang}/signature.json`)
const nf = new Intl.NumberFormat(lang === 'hr' ? 'hr-HR' : 'en-GB', { maximumFractionDigits: 2 })
const fmt = (s, vars = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k])
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
    mock.resetWorkLines()
    mock.resetSignatures()
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
    const requests = []
    page.on('request', (req) => {
      const u = new URL(req.url())
      if (['POST', 'PUT'].includes(req.method()) && /\/api\/(interventions|work-orders)(\/\d+\/items)?$/.test(u.pathname)) requests.push({ method: req.method(), url: u.pathname, body: req.postData() || '' })
    })
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`) })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    return { ctx, page, shot, overflow, requests }
  }
  const openFab = async (page, selector) => {
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
  const dialogRows = (page) => page.locator('[data-testid=work-lines-dialog] [data-testid=work-line-row]')
  const fillRow = async (page, i, { name, qty, unit, hours, other }) => {
    const row = dialogRows(page).nth(i)
    if (name !== undefined) await row.locator('[data-testid=work-line-name]').fill(name)
    if (qty !== undefined) await row.locator('[data-testid=work-line-quantity]').fill(qty)
    if (unit !== undefined) await row.locator('[data-testid=work-line-unit]').selectOption(unit)
    if (other !== undefined) await row.locator('[data-testid=work-line-unit-other]').fill(other)
    if (hours !== undefined) await row.locator('[data-testid=work-line-hours]').fill(hours)
  }
  const sign = async (page) => {
    await page.locator('[data-testid=client-absent]').scrollIntoViewIfNeeded()
    await page.locator('[data-testid=client-absent]').check() // client signs later (the signature step itself is covered by report-signature-check)
    const canvases = page.locator('[role=dialog] canvas')
    for (let c = 0; c < (await canvases.count()); c++) {
      if (!(await canvases.nth(c).isVisible())) continue // the client pad is hidden while "client absent" is ticked
      await canvases.nth(c).scrollIntoViewIfNeeded()
      const b = await canvases.nth(c).boundingBox()
      await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.mouse.move(b.x + b.width - 20, b.y + 30, { steps: 6 }); await page.mouse.up()
    }
  }
  const submit = async (page) => { const b = page.locator('[role=dialog] button[type=submit]'); await b.scrollIntoViewIfNeeded(); await b.click() }

  // ============================== technician: intervention dialog
  {
    const { ctx, page, shot, overflow, requests } = await session('technician')
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check('intervention dialog opens', await openFab(page, '#int-location'))
    await page.fill('#int-location', 'Lokacija 2')
    await page.locator('li', { hasText: 'Lokacija 2' }).first().click().catch(() => {})
    await page.locator('#int-location').blur()
    await page.waitForFunction(() => document.querySelectorAll('[role=dialog] form select').length >= 2)
    const field = page.locator('[data-testid=work-lines-field]')
    await field.scrollIntoViewIfNeeded()
    check('field: empty state text says the PDF gets an empty table', (await page.locator('[data-testid=work-lines-summary]').innerText()) === L.field.empty)
    check('field: button text is "add"', (await page.locator('[data-testid=work-lines-open]').innerText()).trim() === L.field.open)
    await shot('intervention_field')
    await overflow('intervention dialog')

    await page.click('[data-testid=work-lines-open]')
    await page.waitForSelector('[data-testid=work-lines-dialog]')
    check('popup opens with one empty row', (await dialogRows(page).count()) === 1)
    check('popup shows the 4 field labels in the active language', await (async () => {
      const t = await page.locator('[data-testid=work-lines-dialog]').innerText()
      return [L.columns.name, L.columns.quantity, L.columns.unit, L.columns.hours].every((x) => t.includes(x))
    })())
    check('unit select lists the common units (translated) + other', await page.locator('[data-testid=work-line-unit] option').allInnerTexts().then((o) => o.join('|') === [L.units.none, ...['pcs', 'm', 'h', 'l', 'kg', 'set', 'lump'].map((k) => L.units[k]), L.units.other].join('|')))
    await shot('popup_empty')
    await fillRow(page, 0, { name: 'Zamjena kontaktora', qty: '2,5', unit: 'pcs', hours: '1,5' })
    await page.click('[data-testid=work-line-add]')
    await page.click('[data-testid=work-line-add]')
    check('add row twice -> 3 rows', (await dialogRows(page).count()) === 3)
    await fillRow(page, 1, { name: 'Posebna stavka', unit: '__other' })
    await dialogRows(page).nth(1).locator('[data-testid=work-line-unit-other]').waitFor()
    await fillRow(page, 1, { other: 'dm', hours: '0.5' })
    check('total hours in the popup (comma and dot both accepted) = 2', (await page.locator('[data-testid=work-lines-total]').innerText()).includes(nf.format(2)), await page.locator('[data-testid=work-lines-total]').innerText())
    await shot('popup_rows')
    // validation: quantity without a name
    await fillRow(page, 2, { qty: '4' })
    await page.click('[data-testid=work-lines-apply]')
    const err1 = await page.locator('[data-testid=work-lines-error]').innerText()
    check('validation: row 3 without a name -> translated message naming the row', err1 === fmt(L.errors.nameRequired, { n: 3 }), err1)
    await shot('popup_validation')
    await fillRow(page, 2, { name: 'Kabel', qty: 'abc' })
    await page.click('[data-testid=work-lines-apply]')
    const err2 = await page.locator('[data-testid=work-lines-error]').innerText()
    check('validation: text quantity -> translated "numbers" message', err2 === fmt(L.errors.invalidNumber, { n: 3 }), err2)
    await fillRow(page, 2, { qty: '-1' })
    await page.click('[data-testid=work-lines-apply]')
    check('validation: negative quantity rejected', (await page.locator('[data-testid=work-lines-error]').count()) === 1)
    check('validation: nothing was sent', requests.length === 0)
    // remove the invalid row
    await dialogRows(page).nth(2).locator('[data-testid=work-line-remove]').click()
    check('remove row -> 2 rows', (await dialogRows(page).count()) === 2)
    await page.click('[data-testid=work-lines-apply]')
    await page.waitForSelector('[data-testid=work-lines-dialog]', { state: 'detached' })
    const summary = await page.locator('[data-testid=work-lines-summary]').innerText()
    check('after "Done": summary shows 2 rows and 2 hours', summary.includes(fmt(L.field.rows, { n: 2 })) && summary.includes(fmt(L.field.hours, { n: nf.format(2) })), summary)
    check('after "Done": button says "edit"', (await page.locator('[data-testid=work-lines-open]').innerText()).trim() === L.field.edit)
    await page.click('[data-testid=work-lines-open]')
    await page.waitForSelector('[data-testid=work-lines-dialog]')
    check('reopen: rows are kept (2 rows, values and free-text unit)', (await dialogRows(page).count()) === 2
      && (await dialogRows(page).nth(0).locator('[data-testid=work-line-name]').inputValue()) === 'Zamjena kontaktora'
      && (await dialogRows(page).nth(0).locator('[data-testid=work-line-quantity]').inputValue()) === '2,5'
      && (await dialogRows(page).nth(1).locator('[data-testid=work-line-unit-other]').inputValue()) === 'dm')
    await page.click('[data-testid=work-lines-dialog] >> text=' + L.dialog.cancel)
    await page.waitForSelector('[data-testid=work-lines-dialog]', { state: 'detached' })
    check('cancel keeps the earlier rows', (await page.locator('[data-testid=work-lines-summary]').innerText()).includes(fmt(L.field.rows, { n: 2 })))

    await sign(page)
    await submit(page)
    await sleep(1200)
    const req = requests.find((r) => r.url === '/api/interventions')
    const m = req ? /name="work_lines"\r\n\r\n([^\r]*)/.exec(req.body) : null
    const sent = m ? JSON.parse(m[1]) : null
    check('request carries work_lines (2 rows, numbers, unit code + free text)', Array.isArray(sent) && sent.length === 2
      && sent[0].name === 'Zamjena kontaktora' && sent[0].quantity === 2.5 && sent[0].unit === 'pcs' && sent[0].hours === 1.5
      && sent[1].name === 'Posebna stavka' && sent[1].quantity === null && sent[1].unit === 'dm' && sent[1].hours === 0.5, m ? m[1] : 'no work_lines field')
    check('the request still has its client_request_id (idempotency, offline replay)', Boolean(req && /name="client_request_id"/.test(req.body)))

    // second intervention: nothing entered -> no work_lines field at all
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check('second dialog opens', await openFab(page, '#int-location'))
    await page.fill('#int-location', 'Lokacija 2')
    await page.locator('li', { hasText: 'Lokacija 2' }).first().click().catch(() => {})
    await page.locator('#int-location').blur()
    await page.waitForFunction(() => document.querySelectorAll('[role=dialog] form select').length >= 2)
    check('dialog was reset: empty state again', (await page.locator('[data-testid=work-lines-summary]').innerText()) === L.field.empty)
    await sign(page)
    await submit(page)
    await sleep(1200)
    const req2 = requests.filter((r) => r.url === '/api/interventions')[1]
    check('nothing entered -> the request has NO work_lines field', Boolean(req2) && !/name="work_lines"/.test(req2.body))
    await ctx.close()
  }

  // ============================== admin: work order create + detail + intervention list + verify
  {
    const { ctx, page, shot, overflow, requests } = await session('admin')
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check('work order dialog opens', await openFab(page, '#wo-location'))
    await page.fill('#wo-location', 'Lokacija 2')
    await page.locator('li', { hasText: 'Lokacija 2' }).first().click().catch(() => {})
    await page.locator('#wo-location').blur()
    await page.locator('[id^=wo-item-]').first().fill('Provjera vrata')
    await page.locator('[data-testid=work-lines-open]').scrollIntoViewIfNeeded()
    await shot('wo_create_field')
    await page.click('[data-testid=work-lines-open]')
    await page.waitForSelector('[data-testid=work-lines-dialog]')
    await fillRow(page, 0, { name: 'Ulje za vodilice', qty: '3', unit: 'l', hours: '' })
    await page.click('[data-testid=work-lines-apply]')
    await page.waitForSelector('[data-testid=work-lines-dialog]', { state: 'detached' })
    await page.locator('[role=dialog] button[type=submit]').scrollIntoViewIfNeeded()
    await page.locator('[role=dialog] button[type=submit]').click()
    await sleep(1000)
    const woReq = requests.find((r) => r.url === '/api/work-orders' && r.method === 'POST')
    let woBody = null
    try { woBody = JSON.parse(woReq.body) } catch { /* reported below */ }
    check('work order create request carries work_lines', Boolean(woBody) && Array.isArray(woBody.work_lines) && woBody.work_lines.length === 1 && woBody.work_lines[0].name === 'Ulje za vodilice' && woBody.work_lines[0].quantity === 3 && woBody.work_lines[0].unit === 'l' && woBody.work_lines[0].hours === null, woReq?.body)

    // detail, open work order, admin edits the table in the "save" popup
    await page.goto(BASE + '/dashboard/work-orders/1', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=work-order-work-lines]')
    check('detail: empty table text', (await page.locator('[data-testid=work-lines-none]').innerText()) === L.view.none)
    check('detail (admin, open): edit button visible', (await page.locator('[data-testid=work-order-lines-edit]').count()) === 1)
    await page.click('[data-testid=work-order-lines-edit]')
    await page.waitForSelector('[data-testid=work-lines-dialog]')
    await fillRow(page, 0, { name: 'Zamjena remena', qty: '1', unit: 'pcs', hours: '2' })
    await shot('wo_detail_popup')
    await page.click('[data-testid=work-lines-apply]')
    await page.waitForSelector('[data-testid=work-lines-dialog]', { state: 'detached' })
    await page.waitForSelector('[data-testid=work-lines-table]')
    check('detail: after save the table shows the row with the translated unit and total hours', await (async () => {
      const t = await page.locator('[data-testid=work-lines-table]').innerText()
      return t.includes('Zamjena remena') && t.includes(L.units.pcs) && t.includes(fmt(L.view.totalHours, { n: nf.format(2) }))
    })())
    const putReq = requests.find((r) => r.method === 'PUT' && /\/items$/.test(r.url))
    check('save sends ONLY work_lines to PUT /items', Boolean(putReq) && Object.keys(JSON.parse(putReq.body)).join() === 'work_lines')
    await shot('wo_detail_table')
    await overflow('work order detail')

    // closed work order 2: read-only
    await page.goto(BASE + '/dashboard/work-orders/2', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=work-order-work-lines]')
    check('closed work order: table visible, NO edit button, hint shown', (await page.locator('[data-testid=work-lines-table]').count()) === 1
      && (await page.locator('[data-testid=work-order-lines-edit]').count()) === 0
      && (await page.locator('[data-testid=work-order-work-lines]').innerText()).includes(L.workOrder.readOnlyClosed))
    await shot('wo_detail_closed')

    // intervention list: read-only table dialog
    await page.goto(BASE + '/dashboard/interventions', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=work-lines-view]')
    await page.locator('[data-testid=work-lines-view]').first().click()
    await page.waitForSelector('[data-testid=work-lines-table]')
    const tbl = await page.locator('[data-testid=work-lines-table]').innerText()
    check('intervention table dialog: 3 rows, units translated, total hours 2.25', tbl.includes('Zamjena kontaktora') && tbl.includes('Podmazivanje vodilica') && tbl.includes(L.units.pcs) && tbl.includes(L.units.m) && tbl.includes(fmt(L.view.totalHours, { n: nf.format(2.25) })), tbl.replace(/\s+/g, ' '))
    await shot('intervention_table')
    await overflow('intervention table dialog')
    await page.keyboard.press('Escape')
    await page.locator('[data-testid=work-lines-view]').nth(1).click()
    await page.waitForSelector('[data-testid=work-lines-none]')
    check('intervention without rows: "no rows" text', (await page.locator('[data-testid=work-lines-none]').innerText()) === L.view.none)
    await page.keyboard.press('Escape')

    // verify result ok_anonymised
    mock.setVerify('ok_anonymised')
    const sigCell = page.locator('[data-testid=signature-cell]').first()
    if (await sigCell.count()) {
      await sigCell.click()
      await page.waitForSelector('[data-testid=action-verify]')
      await page.click('[data-testid=action-verify]')
      await page.waitForSelector('[data-testid=verify-result]')
      const vr = await page.locator('[data-testid=verify-result]').innerText()
      check('verify "ok_anonymised" is shown translated (not the raw key)', vr === S.panel.verify.ok_anonymised && !/ok_anonymised/.test(vr), vr)
      check('verify "ok_anonymised" uses the green style', /emerald/.test(await page.locator('[data-testid=verify-result]').getAttribute('class')))
      await shot('verify_anonymised')
    } else {
      check('signature cell present for the verify check', false)
    }
    await ctx.close()
  }

  // ============================== assigned technician / unassigned technician / viewer on the work order
  {
    const { ctx, page, shot, overflow, requests } = await session('technician')
    await page.goto(BASE + '/dashboard/work-orders/1', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=work-order-work-lines]')
    check('assigned technician: edit button visible, no full "edit work order" button', (await page.locator('[data-testid=work-order-lines-edit]').count()) === 1)
    await page.click('[data-testid=work-order-lines-edit]')
    await page.waitForSelector('[data-testid=work-lines-dialog]')
    await shot('wo_tech_popup')
    check('technician popup button says "Save"', (await page.locator('[data-testid=work-lines-apply]').innerText()).trim() === L.dialog.save)
    await fillRow(page, 0, { name: 'Čišćenje okna', qty: '1', unit: 'lump', hours: '3,5' })
    await page.click('[data-testid=work-lines-apply]')
    await page.waitForSelector('[data-testid=work-lines-table]')
    const put = requests.find((r) => r.method === 'PUT' && /\/items$/.test(r.url))
    const sentBody = put ? JSON.parse(put.body) : null
    check('technician saves via PUT /api/work-orders/1/items with only work_lines', Boolean(sentBody) && put.url === '/api/work-orders/1/items' && sentBody.work_lines.length === 1 && sentBody.work_lines[0].hours === 3.5 && Object.keys(sentBody).join() === 'work_lines')
    check('table now shows the saved row', (await page.locator('[data-testid=work-lines-table]').innerText()).includes('Čišćenje okna'))
    await shot('wo_tech_table')
    await overflow('technician work order detail')
    await ctx.close()
  }
  {
    const { ctx, page } = await session('technician')
    mock.setWoAssigned(false)
    await page.goto(BASE + '/dashboard/work-orders/1', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=work-order-work-lines]')
    check('technician NOT assigned: table visible but NO edit button', (await page.locator('[data-testid=work-order-lines-edit]').count()) === 0)
    mock.resetWorkLines()
    await ctx.close()
  }
  {
    const { ctx, page, shot } = await session('viewer')
    await page.goto(BASE + '/dashboard/work-orders/1', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=work-order-work-lines]')
    check('viewer: NO edit button', (await page.locator('[data-testid=work-order-lines-edit]').count()) === 0)
    await shot('wo_viewer')
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
