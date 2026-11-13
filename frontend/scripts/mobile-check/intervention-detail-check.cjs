/* INTERVENTION DETAIL PAGE UI TEST (Playwright + mocked API: mock.cjs).
 *   cd frontend && npx vite --port 5613 --strictPort &
 *   BASE=http://localhost:5613 node scripts/mobile-check/intervention-detail-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]
 * (exit 1 on failure; screenshots in outDir). Covers: list row click -> /dashboard/interventions/:id, clicks on the row's buttons/links/select do
 * NOT navigate, deep link + refresh, full page (header, type, status, technicians, description/notes, PDF button, work table, photos, faults,
 * signature panel incl. awaiting-client actions), empty states (no photos / no lines / unsigned / no text), completed + closed states, viewer
 * (read-only), not found (friendly message), link from the location page, no horizontal overflow. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/intervention-detail-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5613'
fs.mkdirSync(outDir, { recursive: true })
const I = require(`../../src/locales/${lang}/interventions.json`)
const WL = require(`../../src/locales/${lang}/workLines.json`)
const S = require(`../../src/locales/${lang}/signature.json`)
const C = require(`../../src/locales/${lang}/common.json`)
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetWorkLines()
    mock.resetSignatures()
    mock.resetFindings()
    mock.addInterventionFinding()
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
    await page.route('**/api/uploads/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }))
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    const opened = []
    ctx.on('page', (p) => opened.push(p.url()))
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`), fullPage: true })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    const text = (sel) => page.locator(sel).innerText()
    const go = async (url) => { await page.goto(BASE + url, { waitUntil: 'networkidle' }) }
    return { ctx, page, shot, overflow, text, go, opened }
  }
  const path_ = (page) => new URL(page.url()).pathname

  // ============================== admin: list -> page, full content
  {
    const { ctx, page, shot, overflow, text, go, opened } = await session('admin')
    await go('/dashboard/interventions')
    await page.waitForSelector('tbody tr')
    // clicks on the row's own controls must NOT navigate
    await page.locator('[data-testid=work-lines-view]').first().click()
    await page.waitForSelector('[data-testid=intervention-work-lines-dialog]')
    check('row button (work lines) opens its dialog and does not navigate', path_(page) === '/dashboard/interventions')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^(Photos|Fotografije)$/ }).first().click()
    await page.waitForSelector('[role=dialog]')
    check('row button (photos) opens its dialog and does not navigate', path_(page) === '/dashboard/interventions')
    await page.keyboard.press('Escape')
    await page.locator('[data-testid=signature-cell]').first().click()
    await page.waitForSelector('[role=dialog]')
    check('row signature badge opens the signature dialog and does not navigate', path_(page) === '/dashboard/interventions')
    await page.keyboard.press('Escape')
    const pdfLink = page.locator('tbody a[href*="/pdf"]').first()
    await pdfLink.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault())) // do not leave the page in the test
    await pdfLink.click()
    check('row PDF link does not navigate to the detail page', path_(page) === '/dashboard/interventions')
    const sel = page.locator('tbody select').first()
    await sel.click()
    check('row status select does not navigate', path_(page) === '/dashboard/interventions')
    await page.keyboard.press('Escape')
    await shot('list')
    // row click (a plain cell) opens the page
    await page.locator('tbody tr').first().locator('td').nth(1).click()
    await page.waitForURL('**/dashboard/interventions/1')
    check('click on the row opens /dashboard/interventions/:id', path_(page) === '/dashboard/interventions/1')
    await page.waitForSelector('[data-testid=intervention-detail]')
    await page.waitForSelector('[data-testid=signature-panel]')
    await page.waitForSelector('[data-testid=photo-gallery]')
    await page.waitForSelector('[data-testid=finding-card]')

    // header
    check('title', (await text('h1')) === I.detail.title)
    const header = await text('[data-testid=intervention-detail] > div:first-child')
    check('location name is a link to the location', (await page.locator('[data-testid=intervention-location-link]').getAttribute('href')) === '/dashboard/locations/1')
    check('technician + second technician shown', header.includes('Ivan Horvat') && header.includes('Marko Marić') && header.includes(I.detail.secondTechnician))
    check('type badge translated (POZIV)', (await text('[data-testid=intervention-type]')) === I.detail.type.POZIV)
    check('status badge uses the existing status label', (await text('[data-testid=intervention-status]')) === C.rmsStatus.ok)
    check('not resolved: no "resolved" badge', (await page.locator('[data-testid=intervention-resolved]').count()) === 0)
    check('description + notes show the full text', (await text('[data-testid=intervention-description]')).includes('dug opis koji se mora prelomiti') && (await text('[data-testid=intervention-notes]')) === 'Napomena')
    check('work table has 3 rows + total hours', (await page.locator('[data-testid=work-lines-table] tbody tr').count()) === 3 && (await page.locator('[data-testid=work-lines-total-view]').count()) === 1)
    check('3 photos with before/after tags', (await page.locator('[data-testid=photo-gallery] li').count()) === 3 && (await text('[data-testid=photo-gallery]')).includes(lang === 'hr' ? 'Prije' : 'Before'))
    await page.locator('[data-testid=photo-gallery] button').first().click()
    check('photo opens in the lightbox (caption shown)', await page.getByText('Prije zamjene').first().isVisible())
    await page.keyboard.press('Escape')
    check('fault raised from this intervention is listed', (await page.locator('[data-testid=finding-card]').count()) === 1 && (await text('[data-testid=intervention-findings]')).includes('iz intervencije'))
    check('signature panel: awaiting client + all actions (admin)', (await page.locator('[data-testid=awaiting-since]').count()) === 1
      && (await page.locator('[data-testid=action-collect]').count()) === 1 && (await page.locator('[data-testid=action-attach]').count()) === 1
      && (await page.locator('[data-testid=action-decline]').count()) === 1 && (await page.locator('[data-testid=action-verify]').count()) === 1)
    await shot('full_awaiting')
    await overflow('detail (full)')
    // PDF button
    const popupP = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null)
    await page.locator('[data-testid=intervention-pdf]').click()
    const popup = await popupP
    check('PDF button opens /api/interventions/:id/pdf?lang= in a new tab', !!popup && /\/api\/(api\/)?interventions\/1\/pdf\?lang=(hr|en)/.test(popup.url()), popup ? popup.url() : 'no popup')
    if (popup) await popup.close()
    // signature action from the page (collect form opens)
    await page.locator('[data-testid=action-collect]').click()
    check('collect action opens the signature form on the page', await page.waitForSelector('[data-testid=collect-form]', { timeout: 3000 }).then(() => true, () => false))
    await shot('collect_form')
    // fault card opens the findings page
    await page.locator('[data-testid=finding-card]').click()
    await page.waitForURL('**/dashboard/findings?id=*')
    check('fault card opens the fault in the findings page', path_(page) === '/dashboard/findings')
    await page.goBack()
    await page.waitForSelector('[data-testid=intervention-detail]')
    // location link
    await page.locator('[data-testid=intervention-location-link]').click()
    await page.waitForURL('**/dashboard/locations/1')
    check('location link navigates to the location', path_(page) === '/dashboard/locations/1')
    // location page -> intervention link
    await page.waitForSelector('[data-testid=location-intervention-link]')
    await page.locator('[data-testid=location-intervention-link]').first().click()
    await page.waitForURL('**/dashboard/interventions/1')
    check('location page lists the intervention with a link to the page', path_(page) === '/dashboard/interventions/1')
    // deep link / refresh
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=intervention-detail]')
    check('refresh keeps the page', path_(page) === '/dashboard/interventions/1' && (await text('h1')) === I.detail.title)
    await ctx.close()
  }

  // ============================== empty states + completed / closed / unsigned
  {
    const { ctx, page, shot, overflow, text, go } = await session('admin')
    await go('/dashboard/interventions/2')
    await page.waitForSelector('[data-testid=signature-panel]')
    await page.waitForSelector('[data-testid=photos-empty]')
    check('no photos: empty text', (await text('[data-testid=photos-empty]')) === I.photos.none)
    check('no work rows: empty text', (await text('[data-testid=work-lines-none]')) === WL.view.none)
    check('no faults: empty text', (await text('[data-testid=findings-empty]')) === I.detail.findingsEmpty)
    check('no description: placeholder', (await text('[data-testid=intervention-description]')) === I.detail.noText)
    check('type badge translated (INICIJATIVA)', (await text('[data-testid=intervention-type]')) === I.detail.type.INICIJATIVA)
    check('completed: state label shown, no collect action', (await text('[data-testid=signature-panel]')).includes(S.state.completed) && (await page.locator('[data-testid=action-collect]').count()) === 0)
    await shot('empty_completed')
    await overflow('detail (empty, completed)')
    mock.setSignatureState('intervention', 2, 'unsigned')
    await go('/dashboard/interventions/2')
    await page.waitForSelector('[data-testid=signature-panel]')
    check('unsigned: panel says the technician has not signed', (await text('[data-testid=signature-panel]')).includes(S.panel.unsignedNote))
    await shot('unsigned')
    await go('/dashboard/interventions/3')
    await page.waitForSelector('[data-testid=signature-panel]')
    check('closed without client: honest note', (await text('[data-testid=signature-panel]')).includes(S.panel.closedNote))
    check('resolved badge shown for a resolved intervention', (await text('[data-testid=intervention-resolved]')) === I.detail.resolved)
    await shot('closed_resolved')
    await overflow('detail (closed)')
    await ctx.close()
  }

  // ============================== viewer: read-only
  {
    const { ctx, page, shot, go } = await session('viewer')
    await go('/dashboard/interventions/1')
    await page.waitForSelector('[data-testid=signature-panel]')
    check('viewer: sees the whole page (work table, photos, faults)', (await page.locator('[data-testid=work-lines-table]').count()) === 1 && (await page.locator('[data-testid=photo-gallery]').count()) === 1 && (await page.locator('[data-testid=finding-card]').count()) === 1)
    check('viewer: no signature action buttons', (await page.locator('[data-testid^=action-]').count()) === 0)
    await shot('detail')
    await ctx.close()
  }

  // ============================== technician: can collect, cannot verify
  {
    const { ctx, page, go } = await session('technician')
    await go('/dashboard/interventions/1')
    await page.waitForSelector('[data-testid=signature-panel]')
    check('technician: collect / attach / decline, no verify', (await page.locator('[data-testid=action-collect]').count()) === 1 && (await page.locator('[data-testid=action-decline]').count()) === 1 && (await page.locator('[data-testid=action-verify]').count()) === 0)
    await ctx.close()
  }

  // ============================== not found (other company / missing id)
  {
    const { ctx, page, shot, overflow, text, go } = await session('admin')
    await go('/dashboard/interventions/999')
    await page.waitForSelector('[data-testid=intervention-detail-error]')
    const msg = await text('[data-testid=intervention-detail-error]')
    check('not found: friendly translated message (no raw JSON / code)', msg.includes(C.apiErrors.codes.intervention_not_found) && !msg.includes('intervention_not_found'), msg.slice(0, 120))
    await shot('not_found')
    await overflow('not found')
    await page.locator('[data-testid=intervention-detail-error] button').click()
    await page.waitForURL('**/dashboard/interventions')
    check('not found: button goes back to the list', path_(page) === '/dashboard/interventions')
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
