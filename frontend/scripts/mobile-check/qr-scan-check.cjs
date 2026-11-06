/* IN-APP QR SCANNER TEST (Playwright + Chromium fake camera, API mocked - mock.cjs). The REAL decode path runs: Chromium plays a
 * generated .y4m (a QR on a white frame) as the camera, and the app decodes it (jsQR; BarcodeDetector is not in headless Linux).
 *   cd frontend && node scripts/mobile-check/qr-scan-assets.cjs <assetDir>      (once; needs ImageMagick + ffmpeg)
 *   npx vite --port 5605 --strictPort &
 *   BASE=http://localhost:5605 node scripts/mobile-check/qr-scan-check.cjs <assetDir> <outDir>     (exit 1 on failure)
 * Covers (en + hr, 375 and 1280 px): Home button + "+" menu entry, scan valid code -> result sheet -> New RMS / New intervention
 * open with EXACTLY that elevator (the other ones can be added), View -> /q/<token>, /q/<token> landing preselects the elevator,
 * foreign-origin URL and garbage QR are rejected without navigation or API call, valid-shaped unknown token, viewer sees only View,
 * offline message, camera denied / none / insecure / unsupported messages, and the camera tracks are really ENDED after close,
 * after a successful scan and after a route change. Also a stubbed native BarcodeDetector path. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5605'
const [assetDir, outDir = '/tmp/qr-scan-check'] = process.argv.slice(2)
if (!assetDir) { console.error('usage: qr-scan-check.cjs <assetDir> <outDir>'); process.exit(2) }
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tok = (id) => `Qk7Zp2mX9aLw4RtYb${String(id).padStart(3, '0')}0Zee`
const strings = (lang) => ({
  loc: require(`../../src/locales/${lang}/locations.json`).qr,
  nav: require(`../../src/locales/${lang}/nav.json`).appLayout,
  dash: require(`../../src/locales/${lang}/dashboard.json`),
  rms: require(`../../src/locales/${lang}/rms.json`),
  inter: require(`../../src/locales/${lang}/interventions.json`),
})

const TRACK_SPY = `(() => {
  window.__streams = []
  const md = navigator.mediaDevices
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md)
    md.getUserMedia = async (c) => { const s = await orig(c); window.__streams.push(s); return s }
  }
})()`

async function launch(video) {
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  if (video) args.push(`--use-file-for-fake-video-capture=${path.join(assetDir, video + '.y4m')}`)
  return chromium.launch({ args })
}

async function open(browser, { role = 'technician', width = 375, lang = 'en', init = TRACK_SPY, permissions = ['camera'] } = {}) {
  mock.resetQr()
  mock.setAuthed(true)
  mock.setLanguage(lang)
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 812 }, deviceScaleFactor: 2, permissions })
  await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
  if (init) await ctx.addInitScript(init)
  const page = await ctx.newPage()
  const lookups = []
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.startsWith('/api/elevators/by-qr/')) lookups.push(u.pathname)
    return mock.handle(route, role)
  })
  page.on('domcontentloaded', () => page.addStyleTag({ content: '.tsqd-parent-container{display:none!important}' }).catch(() => undefined)) // dev-only query devtools button sits on top of the + button
  page.__lookups = lookups
  return { ctx, page }
}

const here = (page) => { const u = new URL(page.url()); return u.pathname }
const scanner = (page) => page.getByTestId('qr-scanner')
const sheet = (page) => page.getByTestId('qr-scan-result')
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const tracksEnded = (page) => page.evaluate(() => window.__streams.length > 0 && window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended')))
const tracksLive = (page) => page.evaluate(() => window.__streams.some((s) => s.getTracks().some((t) => t.readyState === 'live')))
const rows = (page, container) => container.locator('span.font-semibold').filter({ hasText: /^Lift [AB]$/ })

async function openFromHome(page, S) {
  await page.goto(`${BASE}/dashboard/home`)
  const btn = page.getByRole('button', { name: S.dash.scanQr.button, exact: true })
  await btn.waitFor({ timeout: 15000 })
  return btn
}

;(async () => {
  for (const lang of ['en', 'hr']) {
    const S = strings(lang)
    for (const width of [375, 1280]) {
      const tag = `${lang}-${width}`
      // ======================================================================== valid sticker (elevator 11 = Lift A, location 1)
      let browser = await launch('valid')
      let { ctx, page } = await open(browser, { width, lang })
      let btn = await openFromHome(page, S)
      check(`[${tag}] Home shows the scan button`, await btn.isVisible())
      check(`[${tag}] Home: no horizontal overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-home.png`) })
      await btn.click()
      await sheet(page).waitFor({ timeout: 15000 })
      check(`[${tag}] valid code -> result sheet with elevator`, (await sheet(page).innerText()).includes('Lift A'))
      check(`[${tag}] sheet shows the location`, (await sheet(page).innerText()).includes('Vukovarska'))
      check(`[${tag}] scanner closed after the scan and camera tracks ENDED`, (await scanner(page).count()) === 0 && (await tracksEnded(page)))
      check(`[${tag}] exactly one lookup of the right token`, page.__lookups.length === 1 && page.__lookups[0].endsWith(tok(11)), JSON.stringify(page.__lookups))
      check(`[${tag}] sheet: no overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-sheet.png`) })
      const labels = [S.loc.landing.newRms, S.loc.landing.newIntervention, S.loc.scan.viewElevator]
      for (const label of labels) check(`[${tag}] sheet action "${label}"`, await sheet(page).getByRole('button', { name: label, exact: true }).isVisible())

      // New RMS: location + exactly Lift A preselected, Lift B can be added
      await sheet(page).getByRole('button', { name: S.loc.landing.newRms, exact: true }).click()
      let dlg = page.getByRole('dialog').filter({ hasText: S.rms.create.title })
      await dlg.waitFor({ timeout: 10000 })
      await page.getByText(S.rms.create.sections.elevators.title).first().waitFor()
      await sleep(500)
      check(`[${tag}] RMS: only the scanned elevator listed`, (await rows(page, dlg).count()) === 1 && (await rows(page, dlg).first().innerText()) === 'Lift A')
      check(`[${tag}] RMS: location preselected`, (await dlg.locator('#rms-address').inputValue()).includes('Ulica kralja Zvonimira'))
      const add = dlg.getByRole('button', { name: S.rms.create.actions.addOtherElevators.replace('{{n}}', '1'), exact: true })
      check(`[${tag}] RMS: "add other elevators (1)" offered`, await add.isVisible())
      await page.screenshot({ path: path.join(outDir, `${tag}-rms.png`) })
      await add.click()
      await sleep(300)
      check(`[${tag}] RMS: other elevator added, Lift A kept`, (await rows(page, dlg).count()) === 2 && (await add.count()) === 0)
      await page.keyboard.press('Escape')
      await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined)

      // New intervention from the plus menu flow: scan again via "+" menu
      await ctx.close()
      await browser.close()

      browser = await launch('valid2') // elevator 22 = Lift B of location 2
      ;({ ctx, page } = await open(browser, { width, lang }))
      await page.goto(`${BASE}/dashboard/locations`)
      const plus = page.locator('div.fixed.bottom-4 button').first()
      await plus.waitFor({ timeout: 15000 })
      await plus.click()
      const item = page.getByRole('menuitem', { name: S.nav.scanQr, exact: true })
      check(`[${tag}] "+" menu has the scan entry`, await item.isVisible())
      await page.screenshot({ path: path.join(outDir, `${tag}-plus-menu.png`) })
      await item.click()
      await sheet(page).waitFor({ timeout: 15000 })
      check(`[${tag}] "+" menu scan -> sheet for Lift B`, (await sheet(page).innerText()).includes('Lift B') && (await sheet(page).innerText()).includes('Lokacija 2'))
      await sheet(page).getByRole('button', { name: S.loc.landing.newIntervention, exact: true }).click()
      await page.getByText(S.inter.interventionCreateModal.statusPerElevator).first().waitFor({ timeout: 10000 })
      await sleep(500)
      const idlg = page.getByRole('dialog').filter({ hasText: S.inter.interventionCreateModal.statusPerElevator })
      check(`[${tag}] intervention: only Lift B (the exact elevator, not the first) preselected`, (await rows(page, idlg).count()) === 1 && (await rows(page, idlg).first().innerText()) === 'Lift B')
      check(`[${tag}] intervention: add-others button`, await idlg.getByRole('button', { name: S.inter.interventionCreateModal.addOtherElevators.replace('{{n}}', '1'), exact: true }).isVisible())
      await page.screenshot({ path: path.join(outDir, `${tag}-intervention.png`) })
      await page.keyboard.press('Escape')
      await ctx.close()
      await browser.close()

      // ---- View elevator -> /q/<token>; camera stopped
      browser = await launch('valid')
      ;({ ctx, page } = await open(browser, { width, lang }))
      btn = await openFromHome(page, S)
      await btn.click()
      await sheet(page).waitFor({ timeout: 15000 })
      await sheet(page).getByRole('button', { name: S.loc.scan.viewElevator, exact: true }).click()
      await page.waitForURL(`**/q/${tok(11)}`, { timeout: 10000 })
      check(`[${tag}] View elevator opens /q/<token>`, here(page) === `/q/${tok(11)}`)
      // landing buttons preselect the exact elevator
      await page.getByRole('button', { name: S.loc.landing.newRms, exact: true }).first().click()
      dlg = page.getByRole('dialog').filter({ hasText: S.rms.create.title })
      await dlg.waitFor()
      await sleep(500)
      check(`[${tag}] /q/<token> landing: New RMS preselects only Lift A`, (await rows(page, dlg).count()) === 1 && (await rows(page, dlg).first().innerText()) === 'Lift A')
      await page.keyboard.press('Escape')
      await ctx.close()
      await browser.close()

      // ---- scanner stops the camera on close / route change
      browser = await launch('garbage') // nothing resolvable: scanner stays open
      ;({ ctx, page } = await open(browser, { width, lang }))
      btn = await openFromHome(page, S)
      await btn.click()
      await scanner(page).waitFor()
      await sleep(1500)
      check(`[${tag}] scanner opens full screen`, await scanner(page).evaluate((el) => { const r = el.getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 }))
      check(`[${tag}] scanner: no horizontal overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-scanner.png`) })
      check(`[${tag}] camera is live while scanning`, await tracksLive(page))
      await page.getByRole('button', { name: S.loc.scan.close, exact: true }).click()
      await sleep(300)
      check(`[${tag}] close -> scanner gone, tracks ENDED`, (await scanner(page).count()) === 0 && (await tracksEnded(page)))
      await btn.click()
      await scanner(page).waitFor()
      await sleep(800)
      await page.evaluate(() => { window.history.pushState({}, '', '/dashboard/locations'); window.dispatchEvent(new PopStateEvent('popstate')) })
      await sleep(600)
      check(`[${tag}] route change -> scanner gone, tracks ENDED`, (await scanner(page).count()) === 0 && (await tracksEnded(page)))
      await ctx.close()
      await browser.close()
    }

    // ========================================================================== rejections (375 only per language)
    const width = 375
    const tag = `${lang}-375`
    for (const [video, expectKey, shot] of [['foreign', 'notLiftelo', 'foreign'], ['garbage', 'notLiftelo', 'garbage'], ['unknown', 'unknownCode', 'unknown']]) {
      const browser = await launch(video)
      const { ctx, page } = await open(browser, { width, lang })
      const btn = await openFromHome(page, S)
      await btn.click()
      await scanner(page).waitFor()
      const alert = scanner(page).getByRole('alert').filter({ hasText: S.loc.scan[expectKey] })
      await alert.waitFor({ timeout: 15000 }).catch(() => undefined)
      check(`[${tag}] ${video} QR -> "${S.loc.scan[expectKey]}"`, (await alert.count()) > 0)
      await page.screenshot({ path: path.join(outDir, `${tag}-reject-${shot}.png`) })
      check(`[${tag}] ${video} QR: no navigation, scanner still open, no result sheet`, here(page) === '/dashboard/home' && (await scanner(page).count()) === 1 && (await sheet(page).count()) === 0)
      if (video !== 'unknown') check(`[${tag}] ${video} QR: NO API lookup made`, page.__lookups.length === 0, JSON.stringify(page.__lookups))
      await ctx.close()
      await browser.close()
    }

    // ---- bare token is accepted
    {
      const browser = await launch('bare')
      const { ctx, page } = await open(browser, { width, lang })
      const btn = await openFromHome(page, S)
      await btn.click()
      await sheet(page).waitFor({ timeout: 15000 }).catch(() => undefined)
      check(`[${tag}] bare token QR accepted`, (await sheet(page).count()) === 1)
      await ctx.close()
      await browser.close()
    }

    // ---- viewer: only View
    {
      const browser = await launch('valid')
      const { ctx, page } = await open(browser, { width, lang, role: 'viewer' })
      const btn = await openFromHome(page, S)
      await btn.click()
      await sheet(page).waitFor({ timeout: 15000 })
      check(`[${tag}] viewer: only "View elevator"`, (await sheet(page).getByRole('button', { name: S.loc.landing.newRms, exact: true }).count()) === 0
        && (await sheet(page).getByRole('button', { name: S.loc.landing.newIntervention, exact: true }).count()) === 0
        && await sheet(page).getByRole('button', { name: S.loc.scan.viewElevator, exact: true }).isVisible())
      await page.screenshot({ path: path.join(outDir, `${tag}-viewer-sheet.png`) })
      await ctx.close()
      await browser.close()
    }

    // ---- offline: valid code but no connection (navigator.onLine false), and "online" but the request fails at network level
    for (const mode of ['offline', 'network']) {
      const browser = await launch('valid')
      const init = mode === 'offline' ? TRACK_SPY + `;Object.defineProperty(navigator, 'onLine', { get: () => false })` : TRACK_SPY
      const { ctx, page } = await open(browser, { width, lang, init })
      if (mode === 'network') {
        await page.route('**/api/elevators/by-qr/**', (route) => route.abort('internetdisconnected'))
      }
      const btn = await openFromHome(page, S)
      await btn.click()
      const alert = scanner(page).getByRole('alert').filter({ hasText: S.loc.scan.offline })
      await alert.waitFor({ timeout: 15000 }).catch(() => undefined)
      check(`[${tag}] ${mode} -> "need a connection" message`, (await alert.count()) > 0)
      check(`[${tag}] ${mode}: no result sheet, still on Home`, (await sheet(page).count()) === 0 && here(page) === '/dashboard/home')
      if (mode === 'offline') check(`[${tag}] offline: no API lookup made`, page.__lookups.length === 0)
      await page.screenshot({ path: path.join(outDir, `${tag}-${mode}.png`) })
      await ctx.close()
      await browser.close()
    }

    // ---- camera errors
    const errorCases = {
      denied: `(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')) })()`,
      noCamera: `(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('none', 'NotFoundError')) })()`,
      inUse: `(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('busy', 'NotReadableError')) })()`,
      insecure: `Object.defineProperty(window, 'isSecureContext', { value: false })`,
      unsupported: `(() => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }) })()`,
    }
    for (const [kind, init] of Object.entries(errorCases)) {
      const browser = await launch('valid')
      const { ctx, page } = await open(browser, { width, lang, init })
      const btn = await openFromHome(page, S)
      await btn.click()
      const title = scanner(page).getByText(S.loc.scan.errors[kind].title, { exact: true })
      await title.waitFor({ timeout: 10000 }).catch(() => undefined)
      check(`[${tag}] camera error "${kind}" shows translated title + text`, (await title.count()) === 1 && (await scanner(page).innerText()).includes(S.loc.scan.errors[kind].text))
      check(`[${tag}] camera error "${kind}" shows the camera-app fallback hint`, (await scanner(page).innerText()).includes(S.loc.scan.fallbackHint))
      if (kind === 'denied' || kind === 'insecure') await page.screenshot({ path: path.join(outDir, `${tag}-error-${kind}.png`) })
      await scanner(page).getByRole('button', { name: S.loc.scan.close, exact: true }).last().click()
      check(`[${tag}] camera error "${kind}": close works`, (await scanner(page).count()) === 0)
      await ctx.close()
      await browser.close()
    }

    // ---- stubbed native BarcodeDetector path (decoder = the app's own wiring; returns the QR text only when a frame arrives)
    {
      const stub = TRACK_SPY + `;
        window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code'] } async detect(v) { return v.readyState >= 2 ? [{ rawValue: '${BASE}/q/${tok(11)}' }] : [] } }`
      const browser = await launch('garbage')
      const { ctx, page } = await open(browser, { width, lang, init: stub })
      const btn = await openFromHome(page, S)
      await btn.click()
      await sheet(page).waitFor({ timeout: 15000 }).catch(() => undefined)
      check(`[${tag}] native BarcodeDetector path resolves the elevator`, (await sheet(page).count()) === 1 && (await sheet(page).innerText()).includes('Lift A'))
      await ctx.close()
      await browser.close()
    }
  }
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
