/* Offline-tolerant entry + PWA test (Playwright + a fake API with a stateful fake server). Needs the BUILT app (the service worker
 * exists only in production builds):
 *   cd frontend && npm run build && npx vite preview --port 5604 --strictPort &
 *   python3 scripts/image-check/make-fixtures.py <fixtureDir>
 *   node scripts/offline-check/offline-check.cjs <outDir outside repo> <fixtureDir> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: SW install + app shell reload while offline (/api and /uploads never cached); offline RMS saved on the device, survives a
 * reload, then sent exactly ONCE even when the first POST is saved by the server but its response is lost; offline intervention with
 * 2 photos + signatures sent resumably with a failure in the middle; 402 -> "needs attention" (not dropped), retry and discard;
 * another account on the same device never sends foreign items; update toast; no service worker in dev. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('../mobile-check/mock.cjs')

const [outDir = '/tmp/offline-check', fixtureDir, W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
if (!fixtureDir) { console.error('usage: offline-check.cjs <outDir> <fixtureDir> [w] [h] [lang]'); process.exit(2) }
const width = Number(W), height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5604'
const DEV = process.env.DEV_BASE || 'http://localhost:5199'
const DIST_SW = path.join(__dirname, '..', '..', 'dist', 'sw.js')
fs.mkdirSync(outDir, { recursive: true })
const fx = (name) => path.join(fixtureDir, name)
const L = require(`../../src/locales/${lang}/offline.json`)
const COMMON = require(`../../src/locales/${lang}/common.json`)
const fill = (text, vars = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k])

let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) { passes += 1; console.log('  ok    ' + name) } else { failures += 1; console.log('  FAIL  ' + name + (extra ? '  ' + extra : '')) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ the fake server (state lives here, not in the app)
const server = {
  down: false, // every API call fails at the network level (the app is "online" but has no signal)
  dropAfterSaveOnce: false, // saves the next RMS create but kills the response (lost response = duplicate risk)
  failPhotoNumberOnce: null, // the Nth distinct photo upload answers 500 once
  createStatus: null, // answer every create with this HTTP status (e.g. 402) until reset
  dropIntAfterSaveOnce: false, // saves the next intervention but kills the response
  rms: new Map(), rmsFindings: new Map(), ints: new Map(), intLines: new Map(), photos: new Map(), signed: new Set(),
  log: [], // { kind: 'rms'|'int'|'photo'|'sign', rid }
  nextId: 100,
}
const resetServer = () => Object.assign(server, { down: false, dropAfterSaveOnce: false, failPhotoNumberOnce: null, createStatus: null })
const fieldOf = (text, name) => (new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(text) || [])[1]
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function fakeApi(route) {
  const req = route.request()
  const url = new URL(req.url())
  const p = url.pathname
  if (!p.startsWith('/api/')) return route.continue()
  if (server.down && p !== '/api/__never__') return route.abort('internetdisconnected')
  const method = req.method()
  if (method === 'POST' && p === '/api/rms-visits') {
    if (server.createStatus) return json(route, server.createStatus, { error: 'x', code: server.createStatus === 402 ? 'service_disabled_technician' : 'invalid_request' })
    const rmsBody = JSON.parse(req.postData() || '{}')
    const rid = rmsBody.client_request_id
    server.log.push({ kind: 'rms', rid })
    const existing = server.rms.get(rid)
    if (existing) return json(route, 200, { id: existing, duplicate: true })
    const id = server.nextId++
    server.rms.set(rid, id)
    server.rmsFindings.set(rid, rmsBody.findings || []) // like the real backend: findings are stored with the visit, once per client_request_id
    if (server.dropAfterSaveOnce) { server.dropAfterSaveOnce = false; return route.abort('connectionreset') }
    return json(route, 201, { id })
  }
  if (method === 'POST' && p === '/api/interventions') {
    if (server.createStatus) return json(route, server.createStatus, { error: 'x', code: server.createStatus === 402 ? 'service_disabled_technician' : 'invalid_request' })
    const rid = fieldOf(req.postDataBuffer().toString('latin1'), 'client_request_id')
    server.log.push({ kind: 'int', rid })
    const existing = server.ints.get(rid)
    if (existing) return json(route, 200, { id: existing, duplicate: true })
    const id = server.nextId++
    server.ints.set(rid, id)
    // like the real backend: the work / material rows are stored together with the intervention, once per client_request_id
    const rawLines = fieldOf(req.postDataBuffer().toString('latin1'), 'work_lines')
    server.intLines.set(rid, rawLines ? JSON.parse(rawLines) : [])
    if (server.dropIntAfterSaveOnce) { server.dropIntAfterSaveOnce = false; return route.abort('connectionreset') }
    return json(route, 200, { id })
  }
  let m
  if (method === 'POST' && (m = p.match(/^\/api\/interventions\/(\d+)\/photos$/))) {
    const rid = fieldOf(req.postDataBuffer().toString('latin1'), 'client_request_id')
    server.log.push({ kind: 'photo', rid })
    const distinct = [...server.photos.keys()]
    if (server.failPhotoNumberOnce && !server.photos.has(rid) && distinct.length + 1 === server.failPhotoNumberOnce) {
      server.failPhotoNumberOnce = null
      return json(route, 500, { error: 'boom' })
    }
    const dup = server.photos.has(rid)
    if (!dup) server.photos.set(rid, server.nextId++)
    return json(route, dup ? 200 : 201, { photo: { id: server.photos.get(rid), file_path: '/uploads/interventions/x.jpg', kind: 'other', caption: null, legacy: false }, ...(dup ? { duplicate: true } : {}) })
  }
  if (method === 'POST' && (m = p.match(/^\/api\/reports\/(rms|intervention)\/(\d+)\/sign$/))) {
    const body = req.postDataBuffer().toString('latin1')
    server.log.push({ kind: 'sign', rid: `${m[1]}:${m[2]}`, hasTech: body.includes('name="technician_signature"'), hasClient: body.includes('name="client_signature"'), signerName: fieldOf(body, 'client_signer_name'), signerRole: fieldOf(body, 'client_signer_role'), language: fieldOf(body, 'language') })
    if (server.signed.has(m[2])) return json(route, 403, { error: 'Report already signed', code: 'report_already_signed' })
    server.signed.add(m[2])
    return json(route, 200, {})
  }
  return mock.handle(route, 'technician')
}

const count = (kind) => server.log.filter((e) => e.kind === kind).length

;(async () => {
  const browser = await chromium.launch()
  const newContext = async () => {
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
      userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
    })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    await ctx.route('**/api/**', fakeApi)
    return ctx
  }
  mock.setAuthed(true)
  mock.setLanguage(lang)
  const tag = `${W}_${lang}`
  const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${tag}_${name}.png`) })

  const ctx = await newContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  const hideDevtools = () => page.addStyleTag({ content: '.tsqd-parent-container{display:none!important}' }).catch(() => {})

  const idbItems = () => page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('liftelo-offline')
    open.onsuccess = () => {
      const q = open.result.transaction('outbox').objectStore('outbox').getAll()
      q.onsuccess = () => resolve(q.result.map((i) => ({ label: i.label, id: i.id, kind: i.kind, status: i.status, serverId: i.serverId, attempts: i.attempts, signed: i.signed, clientPresent: i.signatures ? Boolean(i.signatures.client) : null, signer: (i.signatures && i.signatures.clientSigner) || null, photos: i.photos.map((ph) => ph.done), userId: i.userId, code: i.lastErrorCode, errStatus: i.lastErrorStatus, nextAttemptAt: i.nextAttemptAt })))
    }
    open.onerror = () => resolve([])
  }))
  const idbCache = () => page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('liftelo-offline')
    open.onsuccess = () => { const q = open.result.transaction('readcache').objectStore('readcache').getAllKeys(); q.onsuccess = () => resolve(q.result) }
    open.onerror = () => resolve([])
  }))
  const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150) } return false }
  const kick = () => page.evaluate(() => window.dispatchEvent(new Event('online'))) // same trigger the browser fires when signal returns
  const bannerText = async () => ((await page.locator('[data-testid=offline-banner]').count()) ? (await page.locator('[data-testid=offline-banner]').innerText()).replace(/\s+/g, ' ') : '')
  const toasts = async () => (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' | ')

  async function openFab(testSelector) {
    await page.click('div.fixed.bottom-4 button')
    const items = page.locator('[role=menuitem]')
    const n = await items.count()
    for (let k = 0; k < n; k++) {
      if (k > 0) await page.click('div.fixed.bottom-4 button')
      await items.nth(k).click()
      try { await page.waitForSelector(testSelector, { timeout: 2500 }); return true } catch { await page.keyboard.press('Escape').catch(() => {}) }
    }
    return false
  }
  async function sign({ absent = false } = {}) {
    const canvases = page.locator('[role=dialog] canvas')
    if (absent) await page.locator('[role=dialog] [data-testid=client-absent]').check()
    for (let c = 0; c < (absent ? 1 : await canvases.count()); c++) {
      await canvases.nth(c).scrollIntoViewIfNeeded()
      const b = await canvases.nth(c).boundingBox()
      await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.mouse.move(b.x + b.width - 20, b.y + 30, { steps: 6 }); await page.mouse.up()
    }
    if (!absent) {
      await page.locator('[role=dialog] input[id$="signer-name"]').fill('Ivo Ivic')
      await page.locator('[role=dialog] input[id$="signer-role"]').fill('Building manager')
    }
  }
  const submit = async () => { const b = page.locator('[role=dialog] button[type=submit]'); await b.scrollIntoViewIfNeeded(); await b.click() }
  async function fillRms(locationName) {
    await page.fill('#rms-address', locationName)
    await page.locator('li', { hasText: locationName }).first().click().catch(() => {})
    await page.locator('#rms-address').blur()
    await page.waitForFunction(() => document.querySelectorAll('[role=dialog] select').length >= 2, null, { timeout: 8000 }) // elevators loaded (from the cache when offline)
  }
  async function fillIntervention(locationName) {
    await page.fill('#int-location', locationName)
    await page.locator('li', { hasText: locationName }).first().click().catch(() => {})
    await page.locator('#int-location').blur()
  }

  // ================================================================== 1. service worker + app shell
  console.log(`\n[service worker + app shell ${W}px ${lang}]`)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
  await hideDevtools()
  const swReady = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return Boolean(reg.active) })
  check('service worker installed and active', swReady)
  await page.reload({ waitUntil: 'networkidle' })
  await hideDevtools()
  check('page is controlled by the service worker after a reload', await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
  const cacheUrls = await page.evaluate(async () => { const out = []; for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname); return out })
  check('app shell is precached (index.html + hashed JS/CSS + manifest + icons)', ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png'].every((u) => cacheUrls.includes(u)) && cacheUrls.some((u) => /^\/assets\/.+\.js$/.test(u)) && cacheUrls.some((u) => /^\/assets\/.+\.css$/.test(u)), JSON.stringify(cacheUrls))
  check('/api and /uploads are NEVER in the service worker cache', !cacheUrls.some((u) => u.startsWith('/api') || u.startsWith('/uploads')))
  check('read cache holds session, companies, locations and elevators for offline use', await waitFor(async () => { const keys = await idbCache(); return ['session', 'companies', 'locations', 'elevators-all'].every((k) => keys.includes(k)) }))
  const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()))
  check('manifest: name, standalone, start_url, 192/512/maskable icons', manifest.name === 'Liftelo' && manifest.display === 'standalone' && manifest.start_url === '/dashboard/home' && manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.purpose === 'maskable'))

  await ctx.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=offline-banner]', { timeout: 10000 }).catch(() => {})
  await hideDevtools()
  check('OFFLINE reload: the app shell loads and stays on /dashboard/home (cached session, no redirect to login)', page.url().endsWith('/dashboard/home') && (await page.locator('#root').innerText()).length > 20, page.url())
  check('offline banner is shown', (await bannerText()).includes(L.banner.offline.slice(0, 25)), await bannerText())
  await shot(page, '1_offline_home')
  await page.goto(BASE + '/dashboard/locations', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=offline-banner]', { timeout: 10000 }).catch(() => {})
  check('OFFLINE navigation to another client route (/dashboard/locations) also loads', page.url().endsWith('/dashboard/locations') && (await page.locator('#root').innerText()).length > 20)

  // ================================================================== 2. offline RMS -> pending -> sent exactly once
  console.log(`\n[offline RMS ${W}px ${lang}]`)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  check('RMS dialog opens offline', await openFab('#rms-address'))
  await fillRms('Lokacija 2')
  check('elevators of the chosen location come from the offline read cache', (await page.locator('[role=dialog] select').count()) >= 2)
  await sign()
  await shot(page, '2_rms_form_offline')
  await submit()
  check('"saved on this device" message is shown (not an error)', await waitFor(async () => (await toasts()).includes(L.toast.saved.slice(0, 20)), 6000), await toasts())
  await page.waitForSelector('[role=dialog]', { state: 'detached', timeout: 5000 }).catch(() => {})
  await shot(page, '3_rms_saved_pill')
  let items = await idbItems()
  check('exactly 1 item in the outbox (kind rms, pending, unsigned, not on the server)', items.length === 1 && items[0].kind === 'rms' && items[0].status === 'pending' && items[0].serverId == null && server.rms.size === 0, JSON.stringify(items))
  check('item carries a location label for the list (the fake API gives all locations the same address, so the first match wins)', typeof items[0].label === 'string' && items[0].label.length > 3, items[0].label)
  check('banner shows "Waiting to send (1)"', (await bannerText()).includes(fill(L.banner.waiting, { n: 1 })), await bannerText())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=offline-banner]', { timeout: 10000 })
  check('reload while pending: the item survives and is still counted', (await idbItems()).length === 1 && (await bannerText()).includes(fill(L.banner.waiting, { n: 1 })))
  await page.click('a[href="/dashboard/outbox"]')
  await page.waitForSelector('[data-testid=outbox-page]')
  check('list screen shows the item and the storage warning', (await page.locator('[data-testid=outbox-item]').count()) === 1 && (await page.locator('[data-testid=outbox-page]').innerText()).includes(L.outbox.storage.warningTitle))
  await shot(page, '4_outbox_list_offline')

  // back online, but the first POST is saved by the server and its response is lost
  server.dropAfterSaveOnce = true
  await ctx.setOffline(false)
  await waitFor(() => count('rms') >= 1, 10000)
  await sleep(800)
  items = await idbItems()
  check('response lost: server stored it once, item still pending (never "sent" without confirmation)', server.rms.size === 1 && items.length === 1 && items[0].serverId == null && items[0].attempts >= 1, JSON.stringify(items))
  await kick()
  check('retry delivered: item removed from the outbox', await waitFor(async () => (await idbItems()).length === 0))
  const rmsPosts = server.log.filter((e) => e.kind === 'rms')
  check('server saw TWO POSTs with the SAME client_request_id and stored ONE visit', rmsPosts.length === 2 && rmsPosts[0].rid === rmsPosts[1].rid && server.rms.size === 1, JSON.stringify(rmsPosts))
  check('signatures sent exactly once', count('sign') === 1, String(count('sign')))
  const firstSign = server.log.find((e) => e.kind === 'sign')
  check('queued signing replays the client signer name + role and the language', firstSign.hasTech && firstSign.hasClient && firstSign.signerName === 'Ivo Ivic' && firstSign.signerRole === 'Building manager' && firstSign.language === lang, JSON.stringify(firstSign))
  check('"Sent" toast appeared and the waiting banner is gone', (await waitFor(async () => (await toasts()).includes(fill(L.toast.sent, { label: '' }).trim().slice(0, 4)), 4000)) && (await bannerText()) === '', `${await toasts()} / ${await bannerText()}`)
  await shot(page, '5_rms_sent')

  // ================================================================== 2b. offline RMS WITH a finding -> exactly one finding stored
  console.log(`\n[offline RMS with a finding ${W}px ${lang}]`)
  const F = require(`../../src/locales/${lang}/findings.json`)
  const rmsBefore = server.rms.size
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  await ctx.setOffline(true)
  check('RMS dialog opens offline (finding test)', await openFab('#rms-address'))
  await fillRms('Lokacija 2')
  await page.locator('[role=dialog] form select').nth(0).selectOption('Potreban popravak - Dizalo nije u funkciji')
  await page.waitForSelector('[data-testid=finding-fields]')
  check('finding form shows offline too (repair status)', (await page.locator('[data-testid=finding-fields]').count()) === 1)
  await sign()
  await submit()
  await sleep(500)
  check('offline: blocked without a description (no outbox item yet)', (await idbItems()).length === 0 && (await page.locator('[data-testid=finding-fields] [role=alert]').count()) === 1)
  await page.fill('#rms-finding-0-desc', 'Door does not close')
  await page.locator('[data-testid=finding-fields] input[type=checkbox]').check()
  await page.fill('#rms-finding-0-part', 'door roller')
  await submit()
  check('saved on this device (toast)', await waitFor(async () => (await toasts()).includes(L.toast.saved.slice(0, 20)), 6000), await toasts())
  items = await idbItems()
  const stored = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('liftelo-offline')
    open.onsuccess = () => { const q = open.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => resolve(q.result.map((i) => i.payload.findings)) }
  }))
  check('outbox payload carries the finding (elevator, description, part)', items.length === 1 && stored[0]?.length === 1 && stored[0][0].description === 'Door does not close' && stored[0][0].needs_part === true && stored[0][0].part_note === 'door roller', JSON.stringify(stored))
  await shot(page, '5b_rms_finding_saved')
  server.dropAfterSaveOnce = true // first POST is saved but its response is lost -> the retry must NOT create a second finding
  await ctx.setOffline(false)
  await waitFor(() => count('rms') >= 2 + 1, 10000)
  await sleep(800)
  await kick()
  check('delivered: outbox empty', await waitFor(async () => (await idbItems()).length === 0))
  const newRids = [...server.rms.keys()].slice(rmsBefore)
  const allFindings = newRids.flatMap((rid) => server.rmsFindings.get(rid) || [])
  const postsForRid = server.log.filter((e) => e.kind === 'rms' && newRids.includes(e.rid))
  check('server saw the visit twice (lost response) but stored exactly ONE visit and exactly ONE finding', newRids.length === 1 && postsForRid.length === 2 && allFindings.length === 1 && allFindings[0].elevator_label === 'Lift A', JSON.stringify({ newRids: newRids.length, posts: postsForRid.length, findings: allFindings }))
  void F

  // ================================================================== 3. offline intervention: 2 photos + signatures, failure in the middle
  console.log(`\n[offline intervention with 2 photos ${W}px ${lang}]`)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  await ctx.setOffline(true)
  check('intervention dialog opens offline', await openFab('[data-testid=photo-picker]'))
  await fillIntervention('Lokacija 2')
  await page.locator('[data-testid=photo-input-gallery]').setInputFiles([fx('o6-portrait-1200x900.jpg'), fx('o8-portrait-1200x900.jpg')])
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=photo-list] li[data-status=ready]').length === 2, null, { timeout: 15000 })
  await sign()
  await submit()
  check('saved on this device (toast)', await waitFor(async () => (await toasts()).includes(L.toast.saved.slice(0, 20)), 6000), await toasts())
  items = await idbItems()
  check('outbox holds 1 intervention with 2 photos waiting, nothing on the server', items.length === 1 && items[0].kind === 'intervention' && items[0].photos.length === 2 && items[0].photos.every((d) => !d) && server.ints.size === 0, JSON.stringify(items))
  await shot(page, '6_intervention_saved')

  server.failPhotoNumberOnce = 2 // the second photo gets a 500 once
  await ctx.setOffline(false)
  check('create + photo 1 went through, photo 2 failed in the middle', await waitFor(async () => { const i = await idbItems(); return i.length === 1 && i[0].serverId != null && i[0].photos[0] === true && i[0].photos[1] === false && i[0].attempts >= 1 }, 12000), JSON.stringify(await idbItems()))
  check('not signed yet (signing waits for all photos)', count('sign') === 2 && !server.log.some((e) => e.kind === 'sign' && e.rid.startsWith('intervention')))
  await shot(page, '7_intervention_midway')
  await kick()
  check('resumed: photo 2 sent, signed, item removed', await waitFor(async () => (await idbItems()).length === 0, 12000), JSON.stringify(await idbItems()))
  const photoPosts = server.log.filter((e) => e.kind === 'photo')
  const distinctPhotos = new Set(photoPosts.map((e) => e.rid))
  check('intervention created ONCE (resume did not create it again)', server.ints.size === 1 && count('int') === 1, `${server.ints.size} stored, ${count('int')} posts`)
  check('3 photo POSTs for 2 distinct ids: failed photo retried with the SAME client_request_id', photoPosts.length === 3 && distinctPhotos.size === 2, JSON.stringify(photoPosts))
  check('intervention signed exactly once', server.log.filter((e) => e.kind === 'sign' && e.rid.startsWith('intervention')).length === 1)

  // ================================================================== 3b. offline intervention WITH work / material rows -> exactly one set of rows
  console.log(`\n[offline intervention with work rows ${W}px ${lang}]`)
  const WL = require(`../../src/locales/${lang}/workLines.json`)
  const intsBefore = server.ints.size
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  await ctx.setOffline(true)
  check('intervention dialog opens offline (work rows test)', await openFab('#int-location'))
  await fillIntervention('Lokacija 2')
  await page.locator('[data-testid=work-lines-open]').scrollIntoViewIfNeeded()
  await page.click('[data-testid=work-lines-open]')
  await page.waitForSelector('[data-testid=work-lines-dialog]')
  const wrow = page.locator('[data-testid=work-lines-dialog] [data-testid=work-line-row]')
  await wrow.nth(0).locator('[data-testid=work-line-name]').fill('Zamjena kontaktora')
  await wrow.nth(0).locator('[data-testid=work-line-quantity]').fill('2,5')
  await wrow.nth(0).locator('[data-testid=work-line-unit]').selectOption('pcs')
  await wrow.nth(0).locator('[data-testid=work-line-hours]').fill('1,5')
  await page.click('[data-testid=work-line-add]')
  await wrow.nth(1).locator('[data-testid=work-line-name]').fill('Podmazivanje')
  await wrow.nth(1).locator('[data-testid=work-line-hours]').fill('0.5')
  await page.click('[data-testid=work-lines-apply]')
  await page.waitForSelector('[data-testid=work-lines-dialog]', { state: 'detached' })
  await sign()
  await submit()
  check('saved on this device (toast)', await waitFor(async () => (await toasts()).includes(L.toast.saved.slice(0, 20)), 6000), await toasts())
  items = await idbItems()
  const storedLines = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('liftelo-offline')
    open.onsuccess = () => { const q = open.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => resolve(q.result.map((i) => i.payload.work_lines)) }
  }))
  check('outbox payload carries the work rows (numbers, unit code)', items.length === 1 && storedLines[0]?.length === 2 && storedLines[0][0].name === 'Zamjena kontaktora' && storedLines[0][0].quantity === 2.5 && storedLines[0][0].unit === 'pcs' && storedLines[0][0].hours === 1.5 && storedLines[0][1].hours === 0.5, JSON.stringify(storedLines))
  check('nothing on the server while offline', server.ints.size === intsBefore)
  server.dropIntAfterSaveOnce = true // first POST is saved but its response is lost -> the retry must NOT create a second set of rows
  await ctx.setOffline(false)
  await waitFor(() => server.log.filter((e) => e.kind === 'int').length >= 1, 10000)
  await sleep(800)
  await kick()
  check('delivered: outbox empty', await waitFor(async () => (await idbItems()).length === 0, 15000), JSON.stringify(await idbItems()))
  const newInt = [...server.ints.keys()].slice(intsBefore)
  const intPosts = server.log.filter((e) => e.kind === 'int' && newInt.includes(e.rid))
  const allRows = newInt.flatMap((rid) => server.intLines.get(rid) || [])
  check('server saw the intervention twice (lost response) but stored exactly ONE intervention and exactly ONE set of 2 rows', newInt.length === 1 && intPosts.length === 2 && allRows.length === 2 && allRows[0].name === 'Zamjena kontaktora', JSON.stringify({ n: newInt.length, posts: intPosts.length, rows: allRows }))
  await shot(page, '6b_intervention_rows_delivered')
  void WL

  // ================================================================== 4. 402 -> needs attention, retry, discard
  console.log(`\n[402 needs attention ${W}px ${lang}]`)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  await ctx.setOffline(true)
  await openFab('#rms-address')
  await fillRms('Lokacija 3')
  await sign()
  await submit()
  await waitFor(async () => (await idbItems()).length === 1, 6000)
  server.createStatus = 402
  await ctx.setOffline(false)
  check('402: item is kept as needs_attention (not dropped, not retried forever)', await waitFor(async () => { const i = await idbItems(); return i.length === 1 && i[0].status === 'needs_attention' && i[0].code === 'service_disabled_technician' }, 10000), JSON.stringify(await idbItems()))
  check('banner says it needs attention', (await bannerText()).includes(fill(L.banner.needsAttention, { n: 1 })), await bannerText())
  await page.goto(BASE + '/dashboard/outbox', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=outbox-item]')
  const reason = await page.locator('[data-testid=outbox-reason]').innerText()
  check('list shows the translated reason (from the error code)', reason.includes(COMMON.apiErrors.codes.service_disabled_technician), reason)
  await shot(page, '8_outbox_needs_attention')
  server.createStatus = null
  await page.locator('[data-testid=outbox-item] button', { hasText: L.outbox.actions.retry }).click()
  check('after the cause is fixed, "Retry now" sends it and the list empties', await waitFor(async () => (await idbItems()).length === 0, 10000) && (await page.locator('[data-testid=outbox-page]').innerText()).includes(L.outbox.empty))

  // discard with confirmation
  await ctx.setOffline(true)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  await openFab('#rms-address')
  await fillRms('Lokacija 3')
  await sign()
  await submit()
  await waitFor(async () => (await idbItems()).length === 1, 6000)
  await page.goto(BASE + '/dashboard/outbox', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=outbox-item]')
  await page.locator('[data-testid=outbox-item] button', { hasText: L.outbox.actions.discard }).click()
  await page.waitForSelector('[data-testid=outbox-discard-confirm]')
  await shot(page, '9_discard_confirm')
  await page.locator('button', { hasText: L.outbox.actions.cancel }).click()
  check('discard needs confirmation: cancelling keeps the item', (await idbItems()).length === 1)
  await page.locator('[data-testid=outbox-item] button', { hasText: L.outbox.actions.discard }).click()
  await page.locator('[data-testid=outbox-discard-confirm]').click()
  check('confirmed discard removes it', await waitFor(async () => (await idbItems()).length === 0, 5000))

  // ================================================================== 5. another account on the same device
  console.log(`\n[account isolation ${W}px ${lang}]`)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  await openFab('#rms-address')
  await fillRms('Lokacija 2')
  await sign()
  await submit()
  await waitFor(async () => (await idbItems()).length === 1, 6000)
  const before = server.log.length
  await page.goto('about:blank') // leave the app first: going online must not wake the sender of user 1
  mock.setUserId(2) // someone else signs in on this phone
  await ctx.setOffline(false)
  await page.goto(BASE + '/dashboard/outbox', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=outbox-page]')
  await sleep(1500)
  await kick()
  await sleep(1500)
  check('items of user 1 are NOT sent while user 2 is signed in', server.log.length === before && (await idbItems()).length === 1, `${server.log.length - before} requests`)
  check('user 2 sees no waiting items of their own, but is told that another account has some', (await page.locator('[data-testid=outbox-item]').count()) === 0 && (await page.locator('[data-testid=outbox-other-account]').count()) === 1)
  await shot(page, '10_other_account')
  mock.setUserId(1)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  check('back as user 1: the item is sent', await waitFor(async () => (await idbItems()).length === 0, 12000) && server.log.length > before)

  // ================================================================== 5b. offline "client not present - sign later"
  console.log(`\n[offline: client not present, sign later ${W}px ${lang}]`)
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div.fixed.bottom-4 button', { timeout: 10000 })
  await hideDevtools()
  await ctx.setOffline(true)
  await openFab('#rms-address')
  await fillRms('Lokacija 2')
  // without name + role the form refuses to save (client signature drawn)
  await page.locator('[role=dialog] canvas').nth(0).scrollIntoViewIfNeeded()
  await sign()
  await page.locator('[role=dialog] input[id$="signer-role"]').fill('')
  await submit()
  await sleep(700)
  check('client signature without a role is refused (nothing queued)', (await idbItems()).length === 0 && (await toasts()).length > 0, await toasts())
  await page.locator('[role=dialog] [data-testid=client-absent]').check()
  await shot(page, '12_sign_later_checked')
  await submit()
  check('"sign later" saved on the device', await waitFor(async () => (await toasts()).includes(L.toast.saved.slice(0, 20)), 6000), await toasts())
  items = await idbItems()
  check('outbox item stores the technician signature only (no client signature, no signer)', items.length === 1 && items[0].clientPresent === false, JSON.stringify(items))
  await page.goto(BASE + '/dashboard/outbox', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=outbox-item]')
  await shot(page, '13_outbox_sign_later')
  const signsBefore = count('sign')
  await ctx.setOffline(false)
  await kick()
  check('sign-later item replayed: removed from the outbox', await waitFor(async () => (await idbItems()).length === 0, 12000))
  const laterSign = server.log.filter((e) => e.kind === 'sign').slice(signsBefore)
  check('exactly ONE sign request, technician signature only, no client signature, no signer fields', laterSign.length === 1 && laterSign[0].hasTech && !laterSign[0].hasClient && !laterSign[0].signerName, JSON.stringify(laterSign))
  await kick()
  await sleep(600)
  check('nothing is sent twice afterwards', server.log.filter((e) => e.kind === 'sign').length === signsBefore + 1)

  // ================================================================== 6. update toast
  console.log(`\n[update toast ${W}px ${lang}]`)
  const original = fs.readFileSync(DIST_SW, 'utf8')
  const oldVersion = /const VERSION = '([^']+)'/.exec(original)[1]
  try {
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await hideDevtools()
    fs.writeFileSync(DIST_SW, original.replace(oldVersion, 'v2-test-update'))
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update() })
    check('new version found: "update available" toast with an action', await waitFor(async () => (await toasts()).includes(L.update.available), 10000), await toasts())
    await shot(page, '11_update_toast')
    check('nothing reloaded by itself (the old version is still the controller)', await page.evaluate(async () => { const keys = await caches.keys(); return keys.length >= 2 }))
    await page.locator('[data-sonner-toast] button', { hasText: L.update.action }).click()
    await page.waitForLoadState('domcontentloaded')
    check('after "Update now" the new version runs (old cache removed, new cache active)', await waitFor(async () => { try { const keys = await page.evaluate(() => caches.keys()); return keys.length === 1 && keys[0].endsWith('v2-test-update') } catch { return false } }, 15000))
  } finally {
    fs.writeFileSync(DIST_SW, original)
  }

  // ================================================================== 7. no service worker in dev, no outbox for viewers
  console.log('\n[dev server]')
  const devCtx = await browser.newContext({ viewport: { width, height } })
  await devCtx.route('**/api/**', (route) => mock.handle(route, 'viewer'))
  const dev = await devCtx.newPage()
  await dev.goto(DEV + '/dashboard/home', { waitUntil: 'networkidle' })
  check('vite dev: NO service worker registered', (await dev.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0)
  const viewerCan = await dev.evaluate(async () => { const m = await import('/src/lib/offline/enqueue.ts'); return m.canQueueOffline() })
  check('viewer: no outbox (read-only role)', viewerCan === false)
  await devCtx.close()

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(1) })
