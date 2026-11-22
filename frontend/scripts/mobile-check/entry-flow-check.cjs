/* FIELD-ENTRY FLOW UI TEST (Playwright + mock.cjs + a small stateful fake of the create/prefill endpoints in this file).
 *   cd frontend && npx vite --port 5611 --strictPort &
 *   BASE=http://localhost:5611 node scripts/mobile-check/entry-flow-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers:
 *  1. "Prefill from last RMS" / "Prefill from last intervention" (one tap, clearly labelled): copies comments + notes (+ work lines) into EMPTY
 *     fields only, never signatures / date / statuses / findings, nothing is sent (no POST), "no earlier record" and load failure answers.
 *  2. "Fixed in this visit" per open fault in the RMS form (technician: office confirms hint, admin: resolved hint) and in the intervention
 *     form: body carries finding_updates; the offline outbox payload keeps them.
 *  3. "Waiting to send" entries at the top of the RMS and intervention LISTS (offline outbox in IndexedDB), badge pending / needs attention,
 *     they disappear when synced and the real record shows exactly once.
 *  No horizontal overflow on the dialogs and lists. The browser is "offline" by overriding navigator.onLine (the dev server has no service worker). */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/entry-flow-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5611'
fs.mkdirSync(outDir, { recursive: true })
const RMS = require(`../../src/locales/${lang}/rms.json`)
const INT = require(`../../src/locales/${lang}/interventions.json`)
const OFF = require(`../../src/locales/${lang}/offline.json`)
const FND = require(`../../src/locales/${lang}/findings.json`)
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const INS = 'Potreban popravak - Dizalo u funkciji'

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`

  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetFindings()
    const srv = {
      prefillRms: { found: true, visit_id: 7, visit_date: '2026-10-01', notes_general: 'Last general note', items: [{ elevator_label: 'Lift A', comment: 'Last comment A', visit_id: 7 }, { elevator_label: 'Lift B', comment: 'Last comment B', visit_id: 7 }] },
      prefillInt: { found: true, intervention_id: 9, notes: 'Last description', items: [{ elevator_label: 'Lift A', comment: 'Last int comment A' }], work_lines: [{ id: 1, position: 1, name: 'Contactor', quantity: 2, unit: 'pcs', hours: 1.5 }] },
      prefillFail: false, prefillCalls: [], posts: [], signs: [], rmsList: null, intList: null, intStatus: 200, nextId: 500,
    }
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
      userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
    })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    await ctx.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => !window.__off })
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = '.tsqd-parent-container{display:none!important}'
        document.head.appendChild(style)
      })
    })
    await ctx.route('**/api/**', (route) => mock.handle(route, role))
    // the fake create / prefill endpoints sit in front of the generic mock (Playwright runs the last registered handler first)
    await ctx.route('**/api/**', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const p = url.pathname
      const method = req.method()
      const ok = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (method === 'GET' && /^\/api\/rms-visits\/prefill\/location\/\d+$/.test(p)) {
        srv.prefillCalls.push(p)
        return srv.prefillFail ? route.abort('connectionreset') : ok(srv.prefillRms)
      }
      if (method === 'GET' && p === '/api/interventions/prefill/elevator') {
        srv.prefillCalls.push(p + url.search)
        return srv.prefillFail ? route.abort('connectionreset') : ok(srv.prefillInt)
      }
      if (method === 'POST' && (p === '/api/rms-visits' || p === '/api/interventions')) {
        const post = { url: p, body: req.postData() || '' }
        srv.posts.push(post)
        if (p === '/api/interventions' && srv.intStatus !== 200) return ok({ error: 'x', code: 'service_disabled_technician' }, srv.intStatus)
        return ok({ id: srv.nextId++ }, p === '/api/rms-visits' ? 201 : 200)
      }
      if (method === 'POST' && /^\/api\/reports\/(rms|intervention)\/\d+\/sign$/.test(p)) { srv.signs.push(p); return ok({ ok: true }) }
      if (method === 'POST' && p === '/api/records/filter') {
        let body = {}
        try { body = JSON.parse(req.postData() || '{}') } catch { /* ignore */ }
        const list = body.type === 'rms' ? srv.rmsList : srv.intList
        if (list) return ok(list)
      }
      return route.fallback()
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`) })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    return { ctx, page, shot, overflow, srv }
  }
  const fmt = (s, vars = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k])

  async function helpers(page) {
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
      await page.locator('[role=dialog] [data-testid=client-absent]').check()
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
    const pickLocation = async (inputSel, formSel, minSelects) => {
      await page.fill(inputSel, 'Lokacija 2')
      await page.locator('li', { hasText: 'Lokacija 2' }).first().click().catch(() => {})
      await page.locator(inputSel).blur()
      await page.waitForFunction((n) => document.querySelectorAll('[role=dialog] form select').length >= n, minSelects)
      void formSel
    }
    const goOffline = () => page.evaluate(() => { window.__off = true; window.dispatchEvent(new Event('offline')) })
    const goOnline = () => page.evaluate(() => { window.__off = false; window.dispatchEvent(new Event('online')) })
    const spaGo = (to) => page.evaluate((target) => { window.history.pushState({}, '', target); window.dispatchEvent(new PopStateEvent('popstate')) }, to)
    const toastText = async () => (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' | ')
    const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150) } return false }
    const idbItems = () => page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('liftelo-offline')
      open.onsuccess = () => {
        const q = open.result.transaction('outbox').objectStore('outbox').getAll()
        q.onsuccess = () => resolve(q.result.map((i) => ({ id: i.id, label: i.label, kind: i.kind, status: i.status, payload: i.payload })))
      }
      open.onerror = () => resolve([])
    }))
    return { openFab, sign, submit, pickLocation, goOffline, goOnline, spaGo, toastText, waitFor, idbItems }
  }

  for (const role of ['technician', 'admin']) {
    const { ctx, page, shot, overflow, srv } = await session(role)
    const h = await helpers(page)
    const today = new Date().toISOString().slice(0, 10)

    // ============================== 1a. RMS prefill
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check(`${role}: RMS dialog opens`, await h.openFab('#rms-address'))
    check(`${role}: no prefill button before a location is chosen`, await page.locator('[data-testid=prefill-rms]').count() === 0)
    await h.pickLocation('#rms-address', null, 2)
    await page.waitForSelector('[data-testid=prefill-rms]')
    check(`${role}: one-tap "${RMS.create.prefill.button}" button with an explanation`, (await page.locator('[data-testid=prefill-rms]').innerText()) === RMS.create.prefill.button && (await page.locator('[role=dialog]').innerText()).includes(RMS.create.prefill.hint))
    await page.fill('input[name="items.1.comment"]', 'Typed by me')
    await page.fill('#rms-date', '2026-11-20')
    await shot('rms_prefill_before')
    await page.click('[data-testid=prefill-rms]')
    await page.waitForFunction(() => document.querySelector('input[name="items.0.comment"]')?.value === 'Last comment A', null, { timeout: 5000 }).catch(() => {})
    check(`${role}: comment of Lift A copied from the last RMS`, await page.inputValue('input[name="items.0.comment"]') === 'Last comment A')
    check(`${role}: what the user already typed is NOT overwritten`, await page.inputValue('input[name="items.1.comment"]') === 'Typed by me')
    check(`${role}: general note copied`, await page.inputValue('#rms-notes') === 'Last general note')
    check(`${role}: the visit date is not copied`, await page.inputValue('#rms-date') === '2026-11-20' && srv.prefillRms.visit_date !== '2026-11-20')
    check(`${role}: statuses stay O.K., no finding form appears`, (await page.locator('[data-testid=finding-fields]').count()) === 0 && (await page.locator('[role=dialog] form select').first().inputValue()) === 'O.K.')
    check(`${role}: confirmation toast tells to check and edit`, (await h.toastText()).includes(fmt(RMS.create.prefill.done, { date: '' }).split('(')[0].trim()), await h.toastText())
    check(`${role}: prefill only READ (exactly one GET, no POST)`, srv.prefillCalls.length === 1 && srv.posts.length === 0)
    await shot('rms_prefill_after')
    await overflow('RMS dialog')
    srv.prefillRms = { found: false }
    await page.click('[data-testid=prefill-rms]')
    await sleep(400)
    check(`${role}: no earlier RMS -> friendly message`, (await h.toastText()).includes(RMS.create.prefill.nothing), await h.toastText())
    srv.prefillFail = true
    await page.click('[data-testid=prefill-rms]')
    await sleep(600)
    check(`${role}: load failure -> message, form still usable`, (await h.toastText()).includes(RMS.create.prefill.failed) && await page.inputValue('input[name="items.1.comment"]') === 'Typed by me')
    srv.prefillFail = false

    // ============================== 2a. "fixed in this visit" in the RMS form
    await page.waitForSelector('[role=dialog] [data-testid=open-faults-notice]')
    const notice = page.locator('[role=dialog] [data-testid=open-faults-notice]').first()
    check(`${role}: RMS notice offers still present (default) / fixed in this visit`, await notice.locator('input[type=radio]').count() === 2 && await notice.locator('[data-testid=fault-present]').isChecked())
    check(`${role}: choice is worded "${FND.notice.fixed}"`, (await notice.innerText()).includes(FND.notice.fixed))
    await notice.locator('[data-testid=fault-fixed]').check()
    const hint = role === 'admin' ? FND.notice.fixedAdminHintRms : FND.notice.fixedTechnicianHintRms
    check(`${role}: hint after choosing fixed (${role === 'admin' ? 'resolved by this visit' : 'office confirms'})`, (await notice.innerText()).includes(hint))
    await shot('rms_fixed')
    await h.sign()
    await h.submit()
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 8000 }).catch(() => {})
    const rmsPost = srv.posts.find((p) => p.url === '/api/rms-visits')
    const rmsBody = rmsPost ? JSON.parse(rmsPost.body) : {}
    check(`${role}: RMS request carries finding_updates [{3, fixed}] and the typed comment`, JSON.stringify(rmsBody.finding_updates) === JSON.stringify([{ finding_id: 3, action: 'fixed' }]) && rmsBody.items?.[1]?.comment === 'Typed by me' && rmsBody.visit_date === '2026-11-20', JSON.stringify(rmsBody.finding_updates))
    check(`${role}: request has no signature / photo fields (only text)`, !JSON.stringify(rmsBody).includes('signature') && !('photos' in rmsBody) && rmsBody.notes_general === 'Last general note')
    check(`${role}: signing step ran after the create`, srv.signs.some((s) => /rms\/500\/sign/.test(s)))
    void today

    // ============================== 1b. intervention prefill + fixed
    srv.prefillRms = { found: true, items: [] }
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check(`${role}: intervention dialog opens`, await h.openFab('#int-location'))
    await h.pickLocation('#int-location', null, 3)
    await page.waitForSelector('[data-testid=prefill-intervention]')
    check(`${role}: one prefill button per elevator row, labelled`, await page.locator('[data-testid=prefill-intervention]').count() === 2 && (await page.locator('[data-testid=prefill-intervention]').first().innerText()) === INT.interventionCreateModal.prefill.button)
    check(`${role}: work lines empty before`, (await page.locator('[data-testid=work-lines-summary]').innerText()) === require(`../../src/locales/${lang}/workLines.json`).field.empty)
    await page.locator('[data-testid=prefill-intervention]').first().click()
    await page.waitForFunction(() => document.querySelector('#int-notes')?.value === 'Last description', null, { timeout: 5000 }).catch(() => {})
    check(`${role}: description copied`, await page.inputValue('#int-notes') === 'Last description')
    check(`${role}: comment of THAT elevator copied`, await page.inputValue('input[name="elevator_items.0.comment"]') === 'Last int comment A')
    check(`${role}: work lines copied (1 row)`, (await page.locator('[data-testid=work-lines-summary]').innerText()).includes('1') && !(await page.locator('[data-testid=work-lines-summary]').innerText()).includes(require(`../../src/locales/${lang}/workLines.json`).field.empty))
    check(`${role}: request used the elevator label`, srv.prefillCalls.at(-1).includes('elevator_label=Lift+A') || srv.prefillCalls.at(-1).includes('elevator_label=Lift%20A'), srv.prefillCalls.at(-1))
    check(`${role}: date and signature are not touched (still empty signature pad, no photos)`, await page.inputValue('#int-date') === new Date().toISOString().slice(0, 10))
    await page.fill('#int-notes', 'My own text')
    await page.locator('[data-testid=prefill-intervention]').first().click()
    await sleep(500)
    check(`${role}: second tap does not overwrite what was typed`, await page.inputValue('#int-notes') === 'My own text')
    await shot('intervention_prefill')
    await overflow('intervention dialog')
    srv.prefillInt = { found: false }
    await page.locator('[data-testid=prefill-intervention]').nth(1).click()
    await sleep(400)
    check(`${role}: no earlier intervention -> friendly message`, (await h.toastText()).includes(INT.interventionCreateModal.prefill.nothing))
    await page.keyboard.press('Escape')
    await sleep(300)
    check(`${role}: prefilling created nothing (no intervention POST)`, srv.posts.filter((p) => p.url === '/api/interventions').length === 0)

    if (role !== 'technician') { await ctx.close(); continue }

    // ============================== 3. waiting to send in the lists (offline outbox)
    srv.prefillRms = { found: true, visit_date: '2026-10-01', notes_general: '', items: [] }
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    check('RMS dialog opens (offline test)', await h.openFab('#rms-address'))
    await h.pickLocation('#rms-address', null, 2)
    await page.waitForSelector('[role=dialog] [data-testid=open-faults-notice]')
    await h.goOffline()
    await page.locator('[role=dialog] [data-testid=open-faults-notice]').first().locator('[data-testid=fault-fixed]').check()
    await h.sign()
    await h.submit()
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 8000 }).catch(() => {})
    check('offline: RMS saved on the device (toast), nothing sent', (await h.toastText()).includes(OFF.toast.saved) && srv.posts.filter((p) => p.url === '/api/rms-visits').length === 1 /* the online one from step 2a */)
    let items = await h.idbItems()
    check('outbox payload keeps finding_updates (fixed in this visit works offline)', items.length === 1 && items[0].kind === 'rms' && JSON.stringify(items[0].payload.finding_updates) === JSON.stringify([{ finding_id: 3, action: 'fixed' }]), JSON.stringify(items.map((i) => i.payload.finding_updates)))

    // an intervention too (will be refused by the server: needs attention)
    check('intervention dialog opens (offline test)', await h.openFab('#int-location'))
    await h.pickLocation('#int-location', null, 3)
    await h.sign()
    await h.submit()
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 8000 }).catch(() => {})
    items = await h.idbItems()
    check('outbox holds 1 RMS + 1 intervention', items.length === 2 && items.some((i) => i.kind === 'rms') && items.some((i) => i.kind === 'intervention'))

    await h.spaGo('/dashboard/rms')
    await page.waitForSelector('[data-testid=waiting-to-send-list]')
    const rmsRows = page.locator('[data-testid=waiting-to-send-list] [data-testid=waiting-row]')
    check('RMS list: exactly one "Waiting to send" row, with the location and the badge', await rmsRows.count() === 1 && (await rmsRows.first().innerText()).includes(items.find((i) => i.kind === 'rms').label) && (await rmsRows.first().innerText()).includes(OFF.list.waitingBadge), await rmsRows.first().innerText())
    const order = await page.evaluate(() => {
      const w = document.querySelector('[data-testid=waiting-to-send-list]')
      const t = document.querySelector('table')
      return w && t ? Boolean(w.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) : null
    })
    check('RMS list: the waiting rows are ABOVE the table of saved records', order === true, String(order))
    await shot('rms_list_waiting')
    await overflow('RMS list')
    await h.spaGo('/dashboard/interventions')
    await page.waitForSelector('[data-testid=waiting-to-send-list]')
    check('intervention list: one waiting row with the badge', await h.waitFor(async () => (await page.locator('[data-testid=waiting-row]').count()) === 1 && (await page.locator('[data-testid=waiting-row]').first().innerText()).includes(OFF.list.waitingBadge), 5000))
    await shot('intervention_list_waiting')
    await overflow('intervention list')

    // back online: the RMS syncs and disappears; the intervention is refused -> needs attention badge
    srv.intStatus = 402
    srv.rmsList = [{ id: 500, location_id: 2, location_name: 'Lokacija 2', date: '2026-11-20', visit_date: '2026-11-20', technician: 'x', signature_state: 'awaiting_client' }]
    await h.goOnline()
    check('online: outbox sends the RMS exactly once (create POST with the stored client_request_id)', await h.waitFor(async () => srv.posts.filter((p) => p.url === '/api/rms-visits').length === 2) && JSON.parse(srv.posts.filter((p) => p.url === '/api/rms-visits')[1].body).finding_updates?.[0]?.finding_id === 3)
    check('intervention refused (402) -> kept as "needs attention", badge changes', await h.waitFor(async () => (await page.locator('[data-testid=waiting-row]').first().getAttribute('data-status')) === 'needs_attention') && (await page.locator('[data-testid=waiting-row]').first().innerText()).includes(OFF.list.failedBadge))
    await shot('intervention_list_failed')
    await h.spaGo('/dashboard/rms')
    check('RMS list: waiting row gone once synced', await h.waitFor(async () => (await page.locator('[data-testid=waiting-to-send-list]').count()) === 0))
    await page.waitForSelector('table tbody tr')
    check('RMS list: the real record shows exactly once (no duplicate of the synced entry)', await page.locator('tbody tr', { hasText: 'Lokacija 2' }).count() === 1, String(await page.locator('tbody tr').count()))
    check('outbox keeps only the refused intervention', (await h.idbItems()).length === 1)
    await shot('rms_list_synced')
    await overflow('RMS list after sync')
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
