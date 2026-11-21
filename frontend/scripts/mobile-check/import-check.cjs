/* IMPORT OF LOCATIONS/ELEVATORS + FIRST-RUN GUIDE TEST. Playwright + mocked API (mock.cjs: /import/*, setLocationsEmpty).
 *   cd frontend && npx vite --port 5629 --strictPort &
 *   BASE=http://localhost:5629 node scripts/mobile-check/import-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: wizard steps 1-3 + result, template downloads (xlsx/csv, language), client-side file checks (wrong type, too big, empty), server
 * file errors translated by code (too many rows, missing columns, unreadable, invalid type, empty), preview counts/table/messages (translated
 * by code), "only problems" filter, "also import warnings" option, nothing-to-import state, confirm + result + links, retry after a failed
 * apply REUSES the same client_request_id (no double import), horizontal scroll of the table without page overflow, viewer/technician get a
 * forbidden message, Locations header button + empty state, Home first-run guide (admin + zero locations only, dismissible per user via
 * localStorage, gone when locations exist, locked QR step), Settings entry card. Screenshots go to <outDir> (look at them). */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/import-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5629'
fs.mkdirSync(outDir, { recursive: true })
const I = require(`../../src/locales/${lang}/import.json`)
const C = require(`../../src/locales/${lang}/common.json`)
const fill = (text, vars = {}) => text.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k]))
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role, { empty = false, storage = true } = {}) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.setLocationsEmpty(empty)
    mock.setImportApplyFailures(0)
    mock.importApplies.length = 0
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024, acceptDownloads: true,
      userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
    })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    if (!storage) { // storage access that throws (private mode / blocked), only for the guide's key so the rest of the app keeps running
      await ctx.addInitScript(() => {
        for (const method of ['getItem', 'setItem']) {
          const original = Storage.prototype[method]
          Storage.prototype[method] = function (key, ...rest) { if (String(key).startsWith('liftelo:getStarted')) throw new Error('blocked'); return original.call(this, key, ...rest) }
        }
      })
    }
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.tsqd-parent-container{display:none!important}'
      document.head.appendChild(style)
    }))
    await ctx.route('**/api/**', (route) => mock.handle(route, role))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`), fullPage: true })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    return { ctx, page, shot, overflow }
  }
  const T = (id) => `[data-testid=${id}]`
  const pick = (page, name, content, type = 'text/csv') => page.locator(T('import-file-input')).setInputFiles({ name, mimeType: type, buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) })
  const problemText = async (page) => { await page.waitForSelector(T('import-problem'), { timeout: 5000 }); return norm(await page.locator(T('import-problem')).innerText()) }

  // ============================== WIZARD (admin)
  {
    const { ctx, page, shot, overflow } = await session('admin')
    await page.goto(BASE + '/dashboard/import', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('import-page'), { timeout: 8000 })
    check('admin: page title translated', norm(await page.locator('h1').innerText()) === I.page.title)
    check('admin: step 1 shown, stepper "1 of 3"', await page.locator(T('import-step-upload')).isVisible() && norm(await page.locator(T('import-stepper')).innerText()).includes(fill(I.steps.label, { current: 1, total: 3 })))
    check('admin: drop zone + file input + both template buttons present', await page.locator(T('import-dropzone')).isVisible() && (await page.locator(T('import-file-input')).count()) === 1
      && norm(await page.locator(T('import-template-xlsx')).innerText()) === I.upload.downloadXlsx && norm(await page.locator(T('import-template-csv')).innerText()) === I.upload.downloadCsv)
    await overflow('import step 1')
    await shot('1-upload')

    for (const kind of ['xlsx', 'csv']) {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.locator(T(`import-template-${kind}`)).click()])
      check(`template ${kind}: downloads a file in the UI language (${lang})`, download.suggestedFilename().includes(`-${lang}.${kind}`), download.suggestedFilename())
    }

    // client-side checks
    await pick(page, 'notes.txt', 'a;b', 'text/plain')
    check('wrong type (.txt): translated message, still step 1', await problemText(page) === norm(I.upload.problems.wrongType) && await page.locator(T('import-step-upload')).isVisible())
    await pick(page, 'big.csv', Buffer.alloc(2 * 1024 * 1024 + 1, 0x61))
    check('file > 2 MB: translated message (no upload)', await problemText(page) === norm(I.upload.problems.tooBig))
    await pick(page, 'empty.csv', Buffer.alloc(0))
    check('empty file: translated message', await problemText(page) === norm(I.upload.problems.empty))
    // server-side file errors by code
    for (const [file, code] of [['toomany.csv', 'import_too_many_rows'], ['missing.csv', 'import_missing_columns'], ['unreadable.xlsx', 'import_file_unreadable'], ['invalid.xlsx', 'import_invalid_file'], ['emptyfile.csv', 'import_file_empty']]) {
      await pick(page, file, 'Naziv;Adresa\r\nA;B\r\n')
      await page.waitForFunction(() => document.querySelector('[data-testid=import-problem]'), null, { timeout: 5000 })
      await sleep(150)
      check(`server error ${code}: translated by code, no raw text`, await problemText(page) === norm(C.apiErrors.codes[code]), await problemText(page))
    }
    await shot('1-upload-error')
    await overflow('import step 1 with error')

    // mixed file -> step 2
    await pick(page, 'mixed.csv', 'Naziv;Adresa\r\nA;B\r\n')
    await page.waitForSelector(T('import-step-check'), { timeout: 8000 })
    check('step 2 shown, stepper "2 of 3", file name shown', norm(await page.locator(T('import-stepper')).innerText()).includes(fill(I.steps.label, { current: 2, total: 3 })) && (await page.locator(T('import-step-check')).innerText()).includes('mixed.csv'))
    const num = async (id) => Number(norm(await page.locator(T(id)).innerText()))
    check('counts: 34 ok / 2 warnings / 2 errors', (await num('count-ok')) === 34 && (await num('count-warning')) === 2 && (await num('count-error')) === 2, `${await num('count-ok')}/${await num('count-warning')}/${await num('count-error')}`)
    check('plan line: 33 buildings, 33 elevators; skipped 4', norm(await page.locator(T('import-will-create')).innerText()) === fill(I.preview.willCreate, { locations: 33, elevators: 33 })
      && (await page.locator(T('import-step-check')).innerText()).includes(fill(I.preview.skippedRows, { number: 4 })))
    check('ignored column listed', (await page.locator(T('import-step-check')).innerText()).includes(fill(I.preview.ignoredColumns, { list: 'Boja' })))
    check('large file with problems: "only problems" is pre-checked -> 4 rows', await page.locator(T('import-only-problems')).isChecked() && (await page.locator(`${T('import-table')} tbody tr`).count()) === 4)
    const rowsText = norm(await page.locator(T('import-table')).innerText())
    check('row messages translated by code (name missing, field too long with translated field + max, RMS frequency, exists, duplicate elevator)',
      rowsText.includes(I.rowMessages.name_required) && rowsText.includes(fill(I.rowMessages.field_too_long, { field: I.fields.contact_phone, max: 50 }))
      && rowsText.includes(I.rowMessages.invalid_rms_frequency) && rowsText.includes(I.rowMessages.location_exists) && rowsText.includes(fill(I.rowMessages.duplicate_elevator_in_file, { label: 'D2' })), rowsText.slice(0, 300))
    check('status badges translated', rowsText.includes(I.preview.status.warning) && rowsText.includes(I.preview.status.error))
    await shot('2-check-problems')
    await overflow('import step 2')
    const scroll = await page.locator(T('import-table-scroll')).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
    check('table sits in its own horizontal scroller (scrollable at 375 px, never widens the page)', width >= 700 || scroll.sw > scroll.cw, JSON.stringify(scroll))
    await page.locator(T('import-only-problems')).uncheck()
    check('unchecking "only problems" shows all 38 rows', (await page.locator(`${T('import-table')} tbody tr`).count()) === 38)
    await shot('2-check-all')
    await page.locator(T('import-include-warnings')).check()
    check('"also import warnings": plan becomes 34 buildings, 35 elevators', norm(await page.locator(T('import-will-create')).innerText()) === fill(I.preview.willCreate, { locations: 34, elevators: 35 }))
    await page.locator(T('import-include-warnings')).uncheck()
    await page.locator(T('import-continue')).click()
    await page.waitForSelector(T('import-step-confirm'))
    check('step 3: confirm text with the counts, map note, stepper "3 of 3"', norm(await page.locator(T('import-confirm-summary')).innerText()) === fill(I.confirm.summary, { locations: 33, elevators: 33 })
      && (await page.locator(T('import-step-confirm')).innerText()).includes(norm(I.confirm.mapNote).replace(/\\"/g, '"')) && norm(await page.locator(T('import-stepper')).innerText()).includes(fill(I.steps.label, { current: 3, total: 3 })))
    await shot('3-confirm')
    await overflow('import step 3')
    await page.locator(T('import-start')).click()
    await page.waitForSelector(T('import-step-done'), { timeout: 8000 })
    check('result: created 33 buildings + 33 elevators, skipped 4', norm(await page.locator(T('import-result-created')).innerText()) === fill(I.result.created, { locations: 33, elevators: 33 })
      && (await page.locator(T('import-step-done')).innerText()).includes(fill(I.result.skipped, { number: 4 })))
    const applyReq = mock.importApplies[mock.importApplies.length - 1]
    check('apply sent a client_request_id and include_warnings=false', applyReq && /^[A-Za-z0-9_-]{8,64}$/.test(applyReq.requestId) && applyReq.includeWarnings === false, JSON.stringify(applyReq))
    await shot('4-result')
    await overflow('import result')
    await page.locator(T('import-go-locations')).click()
    await page.waitForURL('**/dashboard/locations')
    check('result link goes to the Locations page', page.url().endsWith('/dashboard/locations'))

    // retry after a failed apply reuses the request id
    mock.importApplies.length = 0
    mock.setImportApplyFailures(1)
    await page.goto(BASE + '/dashboard/import', { waitUntil: 'networkidle' })
    await pick(page, 'ok.xlsx', 'x', 'application/octet-stream')
    await page.waitForSelector(T('import-step-check'))
    check('small clean file: "only problems" not pre-checked', !(await page.locator(T('import-only-problems')).isChecked()) && (await page.locator(`${T('import-table')} tbody tr`).count()) === 3)
    await page.locator(T('import-continue')).click()
    await page.locator(T('import-start')).click()
    check('failed apply: translated generic error, stays on step 3', await problemText(page) === norm(C.apiErrors.generic) && await page.locator(T('import-step-confirm')).isVisible())
    await shot('3-confirm-failed')
    await page.locator(T('import-start')).click()
    await page.waitForSelector(T('import-step-done'), { timeout: 8000 })
    check('retry reuses the SAME client_request_id (a replay cannot import twice)', mock.importApplies.length === 2 && mock.importApplies[0].requestId === mock.importApplies[1].requestId && mock.importApplies[0].requestId.length >= 8, JSON.stringify(mock.importApplies))
    check('result after retry: 2 buildings, 2 elevators', norm(await page.locator(T('import-result-created')).innerText()) === fill(I.result.created, { locations: 2, elevators: 2 }))
    check('result offers QR stickers when elevators were created', (await page.locator('a[href="/dashboard/qr-labels"]').count()) === 1)
    await page.getByRole('button', { name: I.result.another }).click()
    check('"import another file" returns to step 1', await page.locator(T('import-step-upload')).isVisible())

    // nothing importable
    await pick(page, 'allbad.csv', 'x')
    await page.waitForSelector(T('import-step-check'))
    check('only error rows: Continue disabled + "nothing to import" hint', await page.locator(T('import-continue')).isDisabled() && await page.locator(T('import-nothing')).isVisible())
    await shot('2-check-nothing')
    await page.locator(T('import-choose-other')).click()
    check('"choose another file" goes back to step 1', await page.locator(T('import-step-upload')).isVisible())

    // locked workspace
    await pick(page, 'locked.csv', 'x')
    check('locked company (402): translated subscription message shown, no crash', await problemText(page) === norm(C.apiErrors.codes.subscription_locked), await problemText(page))
    await ctx.close()
  }

  // ============================== ROLES
  for (const role of ['viewer', 'technician']) {
    const { ctx, page, shot } = await session(role)
    await page.goto(BASE + '/dashboard/import', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('import-forbidden'), { timeout: 8000 })
    check(`${role}: forbidden message, no file input`, norm(await page.locator(T('import-forbidden')).innerText()).includes(I.page.adminOnly) && (await page.locator(T('import-file-input')).count()) === 0)
    await shot('forbidden')
    await ctx.close()
  }

  // ============================== LOCATIONS entry points
  {
    const { ctx, page, shot, overflow } = await session('admin')
    await page.goto(BASE + '/dashboard/locations', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('locations-import-button'), { timeout: 8000 })
    check('Locations header has the import button (translated)', norm(await page.locator(T('locations-import-button')).innerText()) === I.entry.button)
    await overflow('locations (with data)')
    await page.locator(T('locations-import-button')).click()
    await page.waitForURL('**/dashboard/import')
    check('header button opens /dashboard/import', page.url().endsWith('/dashboard/import'))
    await ctx.close()
  }
  {
    const { ctx, page, shot, overflow } = await session('admin', { empty: true })
    await page.goto(BASE + '/dashboard/locations', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('locations-empty-actions'), { timeout: 8000 })
    check('empty state offers the Excel import first + manual add', norm(await page.locator(T('locations-empty-import')).innerText()) === I.entry.emptyTitle && (await page.locator(`${T('locations-empty-actions')} button`).count()) === 2)
    await overflow('locations empty state')
    await shot('locations-empty')
    await page.locator(T('locations-empty-import')).click()
    await page.waitForURL('**/dashboard/import')
    check('empty-state import button opens the import page', page.url().endsWith('/dashboard/import'))
    await ctx.close()
  }
  {
    const { ctx, page } = await session('technician', { empty: true })
    await page.goto(BASE + '/dashboard/locations', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    check('technician: empty state has no import/add buttons', (await page.locator(T('locations-empty-actions')).count()) === 0 && (await page.locator(T('locations-import-button')).count()) === 0)
    await ctx.close()
  }

  // ============================== HOME: first-run guide
  {
    const { ctx, page, shot, overflow } = await session('admin', { empty: true })
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('get-started-card'), { timeout: 8000 })
    check('admin + zero locations: guide card visible, title translated', norm(await page.locator(`${T('get-started-card')} h2`).innerText()) === I.guide.title)
    const steps = await page.locator(`${T('get-started-card')} li`).count()
    check('4 steps: import, manual, invite, QR', steps === 4 && await page.locator(T('get-started-step-import')).isVisible() && await page.locator(T('get-started-step-qr')).isVisible())
    check('QR step is locked (disabled button + hint) while there are no elevators', await page.locator(`${T('get-started-step-qr')} button`).isDisabled() && (await page.locator(T('get-started-step-qr')).innerText()).includes(I.guide.qr.locked))
    await overflow('home with guide')
    await shot('home-guide')
    await page.locator(`${T('get-started-step-manual')} button`).click()
    await page.waitForSelector('[role=dialog]', { timeout: 5000 })
    check('"Add building" opens the existing create dialog', await page.locator('[role=dialog]').isVisible())
    await page.keyboard.press('Escape')
    await page.locator(`${T('get-started-step-invite')} button`).click()
    await page.waitForURL('**/dashboard/users')
    check('"Invite technicians" goes to the users page', page.url().endsWith('/dashboard/users'))
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.locator(`${T('get-started-step-import')} button`).click()
    await page.waitForURL('**/dashboard/import')
    check('"Import from Excel" goes to /dashboard/import', page.url().endsWith('/dashboard/import'))
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('get-started-card'))
    await page.locator(T('get-started-dismiss')).click()
    check('dismiss hides the card', (await page.locator(T('get-started-card')).count()) === 0)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    check('dismissal is remembered (localStorage, per user) after reload', (await page.locator(T('get-started-card')).count()) === 0)
    await ctx.close()
  }
  {
    const { ctx, page } = await session('admin')
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    check('admin with locations: no guide card (disappears automatically)', (await page.locator(T('get-started-card')).count()) === 0)
    await ctx.close()
  }
  {
    const { ctx, page } = await session('technician', { empty: true })
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    check('technician: no guide card', (await page.locator(T('get-started-card')).count()) === 0)
    await ctx.close()
  }
  {
    const { ctx, page } = await session('viewer', { empty: true })
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    check('viewer: no guide card', (await page.locator(T('get-started-card')).count()) === 0)
    await ctx.close()
  }
  {
    const { ctx, page } = await session('admin', { empty: true, storage: false })
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('get-started-card'), { timeout: 8000 })
    await page.locator(T('get-started-dismiss')).click()
    check('blocked localStorage: no crash, card hidden for this visit', (await page.locator(T('get-started-card')).count()) === 0)
    await ctx.close()
  }

  // ============================== SETTINGS entry
  {
    const { ctx, page, shot, overflow } = await session('admin')
    await page.goto(BASE + '/dashboard/settings', { waitUntil: 'networkidle' })
    await page.waitForSelector(T('import-settings-card'), { timeout: 8000 })
    check('Settings has the import card (translated title)', norm(await page.locator(`${T('import-settings-card')} h2`).innerText()) === I.entry.settingsTitle)
    await overflow('settings')
    await page.locator(`${T('import-settings-card')} button`).click()
    await page.waitForURL('**/dashboard/import')
    check('Settings card opens the import page', page.url().endsWith('/dashboard/import'))
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
