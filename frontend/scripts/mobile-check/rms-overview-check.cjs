/* ANNUAL RMS OVERVIEW POPUP UI TEST (Playwright + mocked API: mock.cjs).
 *   cd frontend && npx vite --port 5616 --strictPort &
 *   BASE=http://localhost:5616 node scripts/mobile-check/rms-overview-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]
 * (exit 1 on failure; screenshots in outDir). Covers: cell with TWO RMS (list, newest first, "shown in overview" marker on the visit the
 * cell date comes from, signature + repair badges, technician), cell with ONE RMS attributed by rms_month, manual date without RMS (hint),
 * empty month (empty state), load error (edit controls still work), link "Open RMS" -> /dashboard/rms/:id, "PDF" link target (new tab,
 * /api/rms/:id/pdf?lang=), admin edit controls unchanged (date, invoice switch, remove, save), viewer = read-only popup (links yes, edit no),
 * dialog inside the viewport, no horizontal overflow. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/rms-overview-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5616'
fs.mkdirSync(outDir, { recursive: true })
const R = require(`../../src/locales/${lang}/rms.json`).overview
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.setOvwVisitsFail(false)
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
    const popups = []
    ctx.on('page', (p) => popups.push(p))
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`) })
    const dialog = page.locator('[data-testid=overview-dialog]')
    const openCell = async (loc, month) => {
      await page.locator(`[data-testid=overview-cell-${loc}-${month}]`).scrollIntoViewIfNeeded()
      await page.locator(`[data-testid=overview-cell-${loc}-${month}]`).click()
      await dialog.waitFor()
      await page.waitForSelector('[data-testid=overview-visits] >> text=/./', { timeout: 5000 })
      await page.waitForLoadState('networkidle')
    }
    const closeDialog = async () => { await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }) }
    const inViewport = async (name) => {
      const box = await dialog.boundingBox()
      check(`${role}: popup (${name}) inside the viewport`, !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify(box))
      const o = await page.evaluate(() => { const el = document.querySelector('[data-testid=overview-dialog]'); return el.scrollWidth - el.clientWidth })
      check(`${role}: popup (${name}) has no horizontal overflow`, o <= 1, String(o))
    }
    const go = async () => { await page.goto(BASE + '/dashboard/rms-overview', { waitUntil: 'networkidle' }); await page.waitForSelector('table') }
    return { ctx, page, shot, dialog, openCell, closeDialog, inViewport, go, popups }
  }
  const pathOf = (page) => new URL(page.url()).pathname

  // ============================== admin
  {
    const { ctx, page, shot, dialog, openCell, closeDialog, inViewport, go, popups } = await session('admin')
    await go()
    await shot('grid')

    // --- two RMS in one month
    await openCell(1, 11)
    check('admin: title lists "RMS records in this month"', (await dialog.innerText()).includes(R.visits.title))
    check('admin: two visits listed', await page.locator('[data-testid^=overview-visit-]:not([data-testid=overview-visit-source])').count() === 2)
    const order = await page.locator('li[data-testid^=overview-visit-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    check('admin: newest first (RMS 2 then RMS 1)', JSON.stringify(order) === JSON.stringify(['overview-visit-2', 'overview-visit-1']), JSON.stringify(order))
    check('admin: "shown in overview" marker only on the 20th (RMS 2)', await page.locator('[data-testid=overview-visit-source]').count() === 1
      && await page.locator('[data-testid=overview-visit-2] [data-testid=overview-visit-source]').count() === 1)
    check('admin: marker text translated', (await page.locator('[data-testid=overview-visit-source]').innerText()) === R.visits.shownInOverview)
    check('admin: signature badges (awaiting client + completed)', await page.locator('[data-testid=signature-badge-awaiting_client]').count() === 1 && await page.locator('[data-testid=signature-badge-completed]').count() === 1)
    check('admin: repair badge on RMS 2, "all OK" on RMS 1', (await page.locator('[data-testid=overview-visit-2]').innerText()).includes(R.visits.repair_one.replace('{{count}}', '1'))
      && (await page.locator('[data-testid=overview-visit-1]').innerText()).includes(R.visits.allOk))
    check('admin: technician names shown', (await page.locator('[data-testid=overview-visit-2]').innerText()).includes('Ivan Horvat') && (await page.locator('[data-testid=overview-visit-1]').innerText()).includes('Marijana'))
    const openHref = await page.locator('[data-testid=overview-open-rms-2]').getAttribute('href')
    check('admin: "Open RMS" links to /dashboard/rms/2', openHref === '/dashboard/rms/2', String(openHref))
    check('admin: "Open RMS" is labelled', (await page.locator('[data-testid=overview-open-rms-2]').innerText()).trim() === R.visits.open)
    const pdfHref = await page.locator('[data-testid=overview-pdf-rms-2]').getAttribute('href')
    check('admin: PDF link targets /api/rms/2/pdf?lang=' + lang, /\/api\/rms\/2\/pdf\?lang=/.test(pdfHref || '') && (pdfHref || '').endsWith(`lang=${lang}`), String(pdfHref))
    check('admin: PDF link opens in a new tab (noopener)', await page.locator('[data-testid=overview-pdf-rms-2]').getAttribute('target') === '_blank' && /noopener/.test(await page.locator('[data-testid=overview-pdf-rms-2]').getAttribute('rel')))
    check('admin: manual-date hint NOT shown here', await page.locator('[data-testid=overview-visits-manual]').count() === 0 && await page.locator('[data-testid=overview-visits-edited]').count() === 0)
    check('admin: edit controls unchanged (date input, invoice switch, save)', await dialog.locator('input[type=date]').count() === 1
      && await dialog.getByRole('button', { name: R.dialog.save, exact: true }).count() === 1 && (await dialog.innerText()).includes(R.dialog.invoiceStatus))
    check('admin: date input holds the cell date', await dialog.locator('input[type=date]').inputValue() === '2026-11-20')
    check('admin: remove-date button present (a date exists)', await dialog.getByRole('button', { name: R.dialog.removeDate, exact: true }).count() === 1)
    await inViewport('two RMS')
    await shot('popup_two_rms')
    // scroll to the bottom to see the edit part
    await dialog.locator('div.overflow-y-auto').evaluate((el) => { el.scrollTop = el.scrollHeight })
    await shot('popup_two_rms_bottom')
    // PDF click -> new tab
    const before = popups.length
    await page.locator('[data-testid=overview-pdf-rms-2]').click()
    await page.waitForTimeout(500)
    check('admin: PDF click opened a new tab with the PDF url', popups.length === before + 1 && /\/api\/rms\/2\/pdf\?lang=/.test(popups[popups.length - 1].url()), popups.map((p) => p.url()).join(' | '))
    for (const p of popups.splice(0)) await p.close().catch(() => {})
    // Open RMS -> record page
    await page.locator('[data-testid=overview-open-rms-2]').click()
    await page.waitForURL('**/dashboard/rms/2')
    check('admin: "Open RMS" navigates to the RMS record page', pathOf(page) === '/dashboard/rms/2', pathOf(page))
    await page.waitForLoadState('networkidle')
    await shot('rms_detail')
    check('admin: record page shows the PDF button', await page.getByRole('button', { name: /PDF/ }).count() >= 1)
    await page.goBack()
    await page.waitForSelector('table')

    // --- one RMS attributed by rms_month
    await openCell(1, 10)
    check('admin: Oct: one visit, marker on it', await page.locator('li[data-testid^=overview-visit-]').count() === 1 && await page.locator('[data-testid=overview-visit-source]').count() === 1)
    check('admin: Oct: shows the real visit date (6 Nov) because attributed to October', (await page.locator('[data-testid=overview-visit-3]').innerText()).includes(R.visits.performedOn.replace('{{date}}', '').trim().split(' ')[0]))
    await inViewport('one RMS, rms_month')
    await shot('popup_one_rms_rms_month')
    await closeDialog()

    // --- manual date, no RMS
    await openCell(1, 9)
    check('admin: Sep: manual-date hint (translated)', (await page.locator('[data-testid=overview-visits-manual]').innerText()) === R.visits.manualHint)
    check('admin: Sep: no visit cards, no empty-state text', await page.locator('li[data-testid^=overview-visit-]').count() === 0 && await page.locator('[data-testid=overview-visits-empty]').count() === 0)
    check('admin: Sep: edit controls present', await dialog.locator('input[type=date]').inputValue() === '2026-09-09' && await dialog.getByRole('button', { name: R.dialog.removeDate, exact: true }).count() === 1)
    await inViewport('manual date')
    await shot('popup_manual_date')
    await closeDialog()

    // --- empty month
    await openCell(1, 8)
    check('admin: Aug: empty state (translated)', (await page.locator('[data-testid=overview-visits-empty]').innerText()) === R.visits.empty)
    check('admin: Aug: no remove button when there is no date, but date input + save stay', await dialog.getByRole('button', { name: R.dialog.removeDate, exact: true }).count() === 0
      && await dialog.locator('input[type=date]').count() === 1 && await dialog.getByRole('button', { name: R.dialog.save, exact: true }).count() === 1)
    await inViewport('empty month')
    await shot('popup_empty')
    await closeDialog()

    // --- load error: visits fail, the manual editing still works
    mock.setOvwVisitsFail(true)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('table')
    await page.locator('[data-testid=overview-cell-1-11]').click()
    await dialog.waitFor()
    await page.waitForSelector(`text=${R.visits.error}`, { timeout: 8000 })
    check('admin: visits load error shown, edit controls still there', await dialog.getByRole('button', { name: R.dialog.save, exact: true }).count() === 1)
    await shot('popup_error')
    mock.setOvwVisitsFail(false)
    await ctx.close()
  }

  // ============================== viewer: read-only popup, links yes
  {
    const { ctx, page, shot, dialog, openCell, inViewport, go, popups } = await session('viewer')
    await go()
    await openCell(1, 11)
    check('viewer: visits listed with links', await page.locator('li[data-testid^=overview-visit-]').count() === 2
      && await page.locator('[data-testid=overview-open-rms-1]').getAttribute('href') === '/dashboard/rms/1'
      && /\/api\/rms\/1\/pdf\?lang=/.test(await page.locator('[data-testid=overview-pdf-rms-1]').getAttribute('href')))
    check('viewer: NO date input, NO save, NO remove, NO invoice switch', await dialog.locator('input').count() === 0
      && await dialog.getByRole('button', { name: R.dialog.save, exact: true }).count() === 0
      && await dialog.getByRole('button', { name: R.dialog.removeDate, exact: true }).count() === 0
      && await dialog.locator('button.rounded-full').count() === 0)
    check('viewer: read-only date + invoice status text shown', await page.locator('[data-testid=overview-readonly]').count() === 1 && (await page.locator('[data-testid=overview-readonly]').innerText()).includes(R.dialog.invoiceStatusValue.notInvoiced))
    check('viewer: Close button works', await dialog.getByRole('button', { name: R.dialog.close, exact: true }).count() === 1)
    await inViewport('viewer two RMS')
    await shot('popup_two_rms_readonly')
    await page.locator('[data-testid=overview-open-rms-1]').click()
    await page.waitForURL('**/dashboard/rms/1')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /PDF/ }).first().waitFor()
    check('viewer: "Open RMS" navigates', pathOf(page) === '/dashboard/rms/1')
    await page.goBack()
    await page.waitForSelector('table')
    await openCell(1, 9)
    check('viewer: manual hint visible, no edit controls', await page.locator('[data-testid=overview-visits-manual]').count() === 1 && await dialog.locator('input').count() === 0)
    await shot('popup_manual_readonly')
    void popups
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
