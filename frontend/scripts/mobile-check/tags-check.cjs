/* OPEN-FAULT VISIBILITY TEST ("tags" on locations / QR / forms). Playwright + mocked API (mock.cjs: /findings, /findings/by-location,
 * /elevators/by-qr with open_findings).
 *   cd frontend && npx vite --port 5614 --strictPort &
 *   BASE=http://localhost:5614 node scripts/mobile-check/tags-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: locations list badges (red when out of service, amber otherwise, "to order" hint only when a part is still to be ordered),
 * filter "only locations with open faults" + sort by the faults column, map markers (fake google.maps: colour/count per location, RMS colour
 * as fallback) and the translated legend; QR landing with the open faults of THAT elevator above the history (+ "none" state, link to the
 * fault, viewer sees it too); RMS dialog notice (information only, duplicate warning, "same fault" skip -> no new finding sent);
 * intervention dialog: per fault still present (default, nothing sent) / fixed (finding_updates sent, hint differs for admin / technician);
 * forms keep working (no notice, no block) when the findings API fails. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/tags-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5614'
fs.mkdirSync(outDir, { recursive: true })
const F = require(`../../src/locales/${lang}/findings.json`)
const LOC = require(`../../src/locales/${lang}/locations.json`)
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OOS = 'Potreban popravak - Dizalo nije u funkciji'
const tok = (id) => `Qk7Zp2mX9aLw4RtYb${String(id).padStart(3, '0')}0Zee`
const plural = (obj, key, n) => { // en: one/other, hr: one/few/other
  const rule = new Intl.PluralRules(lang === 'hr' ? 'hr' : 'en').select(n)
  return (obj[`${key}_${rule}`] ?? obj[`${key}_other`]).replace('{{count}}', String(n))
}

const FAKE_GOOGLE = () => {
  window.__markers = []
  class Marker { constructor(o) { this.o = o; window.__markers.push(o) } setMap() {} setAnimation() {} addListener() {} getPosition() { return { lat: () => 0, lng: () => 0 } } }
  window.google = { maps: {
    Map: class { setCenter() {} setZoom() {} fitBounds() {} }, Marker, InfoWindow: class { setContent() {} close() {} open() {} },
    LatLngBounds: class { extend() {} }, Animation: { DROP: 1 }, SymbolPath: { CIRCLE: 0 }, event: { trigger() {}, addListenerOnce() {} },
  } }
}

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
    await ctx.addInitScript(FAKE_GOOGLE)
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.tsqd-parent-container{display:none!important}'
      document.head.appendChild(style)
    }))
    await ctx.route('**/api/**', (route) => mock.handle(route, role))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    const requests = []
    page.on('request', (req) => { if (req.method() === 'POST' && /\/api\/(rms-visits|interventions)$/.test(new URL(req.url()).pathname)) requests.push({ url: new URL(req.url()).pathname, body: req.postData() || '' }) })
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`), fullPage: true })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    return { ctx, page, shot, overflow, requests }
  }
  const sign = async (page) => {
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
  const submit = async (page) => { const b = page.locator('[role=dialog] button[type=submit]'); await b.scrollIntoViewIfNeeded(); await b.click() }

  // ============================== LOCATIONS LIST + MAP (admin)
  {
    const { ctx, page, shot, overflow } = await session('admin')
    mock.setFindingState(5, 'resolved') // location 3 ends up without open faults
    await page.goto(BASE + '/dashboard/locations', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=location-faults]', { timeout: 8000 })
    const rows = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => ({
      name: tr.querySelector('button')?.innerText || '',
      badge: tr.querySelector('[data-testid=location-faults] [data-tone]')?.getAttribute('data-tone') || null,
      open: tr.querySelector('[data-testid=location-faults] [data-tone]')?.getAttribute('data-open') || null,
      toOrder: tr.querySelectorAll('[data-testid=location-to-order]').length,
    })))
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    const L1 = rows.find((r) => !/^Lokacija/.test(r.name)).name
    check('location 1 (out of service open): RED badge with 2 open + "to order" hint', byName[L1]?.badge === 'red' && byName[L1].open === '2' && byName[L1].toOrder === 1, JSON.stringify(rows))
    check('location 2 (in service + recommendation): AMBER badge with 2, no "to order" (no part needed)', byName['Lokacija 2']?.badge === 'amber' && byName['Lokacija 2'].open === '2' && byName['Lokacija 2'].toOrder === 0)
    check('location 3 (only a resolved fault): no badge', byName['Lokacija 3'] && byName['Lokacija 3'].badge === null)
    const badgeTitle = await page.locator('[data-testid=location-faults] [data-tone=red]').first().getAttribute('title')
    check('badge title is translated (count + out of service)', badgeTitle.includes(plural(F.locationBadge, 'open', 2)) && badgeTitle.includes(F.locationBadge.outOfService.replace('{{count}}', '1')), badgeTitle)
    check('"to order" chip text is translated', (await page.locator('[data-testid=location-to-order]').first().innerText()).trim() === F.locationBadge.toOrder)
    await shot('locations')
    await overflow('locations list')

    // filter
    const filterLabel = page.locator('label', { hasText: F.locationFilter.only })
    check('filter checkbox is translated', await filterLabel.count() === 1)
    await page.locator('[data-testid=faults-only-filter]').check()
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2)
    const filtered = await page.locator('tbody tr button').evaluateAll((els) => els.map((e) => e.innerText))
    check('filter "only locations with open faults": location 3 hidden', filtered.length === 2 && !filtered.includes('Lokacija 3'), JSON.stringify(filtered))
    check('filter is kept in the URL (?faults=1)', page.url().includes('faults=1'))
    await shot('locations_filtered')
    await page.locator('[data-testid=faults-only-filter]').uncheck()
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3)

    // sort by the faults column: worst first (descending first)
    await page.locator('thead button', { hasText: F.locationBadge.column }).click()
    await sleep(300)
    const sorted = await page.locator('tbody tr button').evaluateAll((els) => els.map((e) => e.innerText))
    check('sort by faults: out-of-service location first, location without faults last', sorted[0] === L1 && sorted[2] === 'Lokacija 3', JSON.stringify(sorted))
    await shot('locations_sorted')

    // map markers + legend
    const markers = await page.evaluate(() => window.__markers.slice(-3).map((m) => ({ title: m.title, color: m.icon?.fillColor, label: m.label?.text || null, scale: m.icon?.scale })))
    const mk = Object.fromEntries(markers.map((m) => [m.title, m]))
    check('map: location 1 marker red with the count 2 (out of service wins)', mk[L1]?.color === '#dc2626' && mk[L1].label === '2', JSON.stringify(markers))
    check('map: location 2 marker amber with the count 2', mk['Lokacija 2']?.color === '#d97706' && mk['Lokacija 2'].label === '2')
    check('map: location 3 (no open faults) falls back to the RMS colour, no count', !['#dc2626', '#d97706'].includes(mk['Lokacija 3']?.color) && mk['Lokacija 3'].label === null, JSON.stringify(mk['Lokacija 3']))
    const legend = await page.locator('[data-testid=map-legend]').innerText()
    check('legend is translated and complete', ['outOfService', 'openFaults', 'ok', 'warning', 'faulty', 'unknown', 'countHint'].every((k) => legend.includes(LOC.locationsMap.legend[k])) && legend.includes(LOC.locationsMap.legend.title), legend.slice(0, 80))
    await page.locator('[data-testid=map-legend]').scrollIntoViewIfNeeded()
    await shot('map_legend')
    await ctx.close()
  }

  // ============================== findings API down: list and forms keep working
  {
    const { ctx, page, requests } = await session('admin')
    mock.setFindingsFail(true)
    await page.goto(BASE + '/dashboard/locations', { waitUntil: 'networkidle' })
    await page.waitForSelector('tbody tr')
    check('findings API failing: locations list still renders, no badges, no error card', await page.locator('tbody tr').count() === 3 && await page.locator('[data-testid=location-faults]').count() === 0)
    await page.goto(BASE + `/q/${tok(11)}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('h1:has-text("Lift A")')
    await page.getByRole('button', { name: LOC.qr.landing.newRms }).first().click().catch(() => {})
    await page.waitForSelector('[role=dialog] form select', { timeout: 8000 }).catch(() => {})
    check('findings API failing: RMS dialog opens without the notice and is not blocked', await page.locator('[role=dialog] form select').count() >= 1 && await page.locator('[data-testid=open-faults-notice]').count() === 0)
    void requests
    mock.setFindingsFail(false)
    await ctx.close()
  }

  // ============================== QR landing + dialogs, per role
  for (const role of ['admin', 'technician', 'viewer']) {
    const { ctx, page, shot, overflow, requests } = await session(role)
    await page.goto(BASE + `/q/${tok(11)}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=qr-open-faults]', { timeout: 8000 })
    const box = page.locator('[data-testid=qr-open-faults]')
    const txt = await box.innerText()
    check(`${role}: QR landing shows the open fault of THIS elevator (Lift A: 1 fault)`, (await box.getAttribute('data-count')) === '1' && txt.includes('Vrata kabine') && !txt.includes('Bučan pogon'), txt.slice(0, 120))
    check(`${role}: severity badge, category, days open and "part needed" are shown`, txt.includes(F.severity.out_of_service) && txt.includes(F.category.doors) && /9/.test(txt) && txt.includes(F.card.partNeeded), txt.replace(/\s+/g, ' ').slice(0, 200))
    const yFaults = (await box.boundingBox()).y
    const yHistory = (await page.locator('h2', { hasText: LOC.qr.landing.recentHistory }).boundingBox()).y
    check(`${role}: faults are shown ABOVE the history`, yFaults < yHistory, `${yFaults} < ${yHistory}`)
    await shot('qr_landing')
    await overflow('QR landing')
    if (role === 'admin') {
      await box.locator('[data-testid=finding-card]').click()
      await page.waitForURL(/\/dashboard\/findings\?id=1/)
      check('admin: clicking the fault opens its detail (/dashboard/findings?id=1)', true)
      await page.goto(BASE + `/q/${tok(32)}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid=qr-open-faults], [data-testid=qr-open-faults-none]')
      check('elevator with only a resolved fault: "no open faults" state, no list', await page.locator('[data-testid=qr-open-faults]').count() === 0 && (await page.locator('[data-testid=qr-open-faults-none]').innerText()).includes(F.qr.none))
      await shot('qr_none')
    }
    if (role === 'viewer') { await ctx.close(); continue }

    // ---- RMS dialog (preset elevator: Lift A of location 1)
    await page.goto(BASE + `/q/${tok(11)}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=qr-open-faults]')
    await page.getByRole('button', { name: LOC.qr.landing.newRms }).first().click()
    await page.waitForSelector('[role=dialog] form select')
    await page.waitForSelector('[data-testid=open-faults-notice]')
    const notice = page.locator('[role=dialog] [data-testid=open-faults-notice]')
    const ntxt = await notice.innerText()
    check(`${role}: RMS dialog lists the open fault of the elevator being reported`, await notice.count() === 1 && ntxt.includes('Vrata kabine') && ntxt.includes(F.notice.title_one), ntxt.slice(0, 100))
    check(`${role}: RMS notice is information only (no still present / fixed choice)`, await notice.locator('input[type=radio]').count() === 0)
    await shot('rms_notice')
    await page.locator('[role=dialog] form select').first().selectOption(OOS)
    await page.waitForSelector('[data-testid=finding-fields]')
    await page.selectOption('#rms-finding-0-cat', 'doors')
    check(`${role}: new fault in the SAME category as the open one shows a warning`, await page.locator('[data-testid=finding-duplicate-warning]').count() === 1 && (await page.locator('[data-testid=finding-duplicate-warning]').innerText()).includes('Vrata kabine'))
    await page.selectOption('#rms-finding-0-cat', 'controller')
    check(`${role}: different category: no warning`, await page.locator('[data-testid=finding-duplicate-warning]').count() === 0)
    await page.selectOption('#rms-finding-0-cat', 'doors')
    await shot('rms_duplicate_warning')
    await overflow('RMS dialog with notice')
    await page.locator('[data-testid=finding-skip-new]').check()
    check(`${role}: "same fault - do not add a new one" hides the new-fault fields`, await page.locator('#rms-finding-0-desc').count() === 0)
    await shot('rms_skip')
    await sign(page)
    await submit(page)
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 8000 }).catch(() => {})
    const rmsReq = requests.find((r) => r.url === '/api/rms-visits')
    const rmsBody = rmsReq ? JSON.parse(rmsReq.body) : {}
    check(`${role}: RMS saved with the repair status but WITHOUT a duplicate finding`, Boolean(rmsReq) && rmsBody.items?.[0]?.status === OOS && !('findings' in rmsBody), JSON.stringify(rmsBody.findings))

    // ---- intervention dialog
    await page.goto(BASE + `/q/${tok(11)}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=qr-open-faults]')
    await page.getByRole('button', { name: LOC.qr.landing.newIntervention }).first().click()
    await page.waitForSelector('[role=dialog] [data-testid=open-faults-notice]')
    const inotice = page.locator('[role=dialog] [data-testid=open-faults-notice]')
    check(`${role}: intervention notice offers still present (default) / fixed per fault`, await inotice.locator('input[type=radio]').count() === 2 && await inotice.locator('[data-testid=fault-present]').isChecked() && !(await inotice.locator('[data-testid=fault-fixed]').isChecked()))
    await shot('intervention_notice')
    await overflow('intervention dialog with notice')
    await inotice.locator('[data-testid=fault-fixed]').check()
    const hint = role === 'admin' ? F.notice.fixedAdminHint : F.notice.fixedTechnicianHint
    check(`${role}: "fixed" shows the ${role === 'admin' ? 'resolve' : 'office confirms'} hint`, (await inotice.innerText()).includes(hint))
    await shot('intervention_fixed')
    await sign(page)
    await submit(page)
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 8000 }).catch(() => {})
    const intReq = requests.find((r) => r.url === '/api/interventions')
    const updates = intReq && /name="finding_updates"\r\n\r\n(.*)\r\n/.exec(intReq.body)
    check(`${role}: intervention request carries finding_updates [{finding_id: 1, action: fixed}]`, Boolean(updates) && JSON.stringify(JSON.parse(updates[1])) === JSON.stringify([{ finding_id: 1, action: 'fixed' }]), updates ? updates[1] : 'no finding_updates')
    check(`${role}: a "fixed" answer creates NO new finding entry`, intReq && !/name="findings"/.test(intReq.body))

    // still present (default): nothing is sent
    requests.length = 0
    await page.goto(BASE + `/q/${tok(11)}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=qr-open-faults]')
    await page.getByRole('button', { name: LOC.qr.landing.newIntervention }).first().click()
    await page.waitForSelector('[role=dialog] [data-testid=open-faults-notice]')
    await sign(page)
    await submit(page)
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 8000 }).catch(() => {})
    const intReq2 = requests.find((r) => r.url === '/api/interventions')
    check(`${role}: default "still present": no finding_updates and no new finding sent`, Boolean(intReq2) && !/finding_updates/.test(intReq2.body) && !/name="findings"/.test(intReq2.body))
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed (${tag})`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
