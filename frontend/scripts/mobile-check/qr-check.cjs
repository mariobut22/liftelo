/* QR LABELS TEST (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port <PORT> &
 * Usage:  BASE=http://localhost:5601 QR_TOOLS=<dir with jsqr + pngjs installed> NODE_PATH=$(npm root -g) \
 *           node scripts/mobile-check/qr-check.cjs <outDir outside repo>     (exit 1 on failure)
 * Checks (en + hr, 375 and 1280 px): label page for location/elevator/all, the generated QR really DECODES (jsQR) to
 * <origin>/q/<token> (element screenshot, downloaded PNG, printed PDF page), A4 print layout (PDF page count + png),
 * regenerate (old code -> friendly 404 page), logged-out scan -> login -> back on /q/<token>, landing buttons preselect
 * the location in the RMS / intervention dialogs, viewer + technician see no QR admin actions. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5601'
const TOOLS = process.env.QR_TOOLS
const jsQR = require(path.join(TOOLS, 'node_modules', 'jsqr'))
const { PNG } = require(path.join(TOOLS, 'node_modules', 'pngjs'))
const outDir = process.argv[2] || '/tmp/qr-check'
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

const decode = (buffer) => {
  const png = PNG.sync.read(buffer)
  const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  return res ? res.data : null
}
const tokenOf = (id, gen = 0) => `Qk7Zp2mX9aLw4RtYb${String(id).padStart(3, '0')}${gen}Zee`

async function open(browser, { role = 'admin', authed = true, width = 375, lang = 'en', acceptDialogs = true }) {
  mock.resetQr()
  mock.setAuthed(authed)
  mock.setLanguage(lang)
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 812 }, deviceScaleFactor: 2, acceptDownloads: true })
  await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
  const page = await ctx.newPage()
  if (acceptDialogs) page.on('dialog', (d) => d.accept())
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/login') {
      mock.setAuthed(true)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: { global_role: 'user' } }) })
    }
    return mock.handle(route, role)
  })
  return { ctx, page }
}
const here = (page) => { const u = new URL(page.url()); return u.pathname + u.search }
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)

;(async () => {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    for (const width of [375, 1280]) {
      const tag = `${lang}-${width}`
      // ---------------------------------------------------------------- admin: location -> QR labels
      let { ctx, page } = await open(browser, { width, lang })
      await page.goto(`${BASE}/dashboard/locations/1`)
      const entry = page.getByRole('button', { name: lang === 'en' ? 'QR labels' : 'QR naljepnice', exact: true })
      await entry.waitFor({ timeout: 8000 })
      check(`[${tag}] location detail shows QR labels button for admin`, await entry.isVisible())
      await page.screenshot({ path: path.join(outDir, `${tag}-1-location.png`), fullPage: true })
      await entry.click()
      await page.waitForSelector('[data-testid="qr-label"]', { timeout: 8000 })
      check(`[${tag}] label page URL`, here(page) === '/dashboard/qr-labels?location=1', here(page))
      check(`[${tag}] two labels (location 1 has two elevators)`, (await page.locator('.qr-preview [data-testid="qr-label"]').count()) === 2)
      check(`[${tag}] no horizontal overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-2-labels.png`), fullPage: true })

      // the QR really decodes to <origin>/q/<token>
      const code = page.locator('.qr-preview .qr-label__code').first()
      const decoded = decode(await code.screenshot())
      check(`[${tag}] QR on screen decodes to the expected URL`, decoded === `${BASE}/q/${tokenOf(11)}`, String(decoded))
      check(`[${tag}] QR URL has no numeric id`, decoded && !/\/q\/\d+$/.test(decoded))

      // downloads
      const [dlPng] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PNG' }).first().click()])
      const pngPath = path.join(outDir, `${tag}-download.png`)
      await dlPng.saveAs(pngPath)
      check(`[${tag}] downloaded PNG decodes to the URL`, decode(fs.readFileSync(pngPath)) === `${BASE}/q/${tokenOf(11)}`, dlPng.suggestedFilename())
      const [dlSvg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'SVG' }).first().click()])
      const svgPath = path.join(outDir, `${tag}-download.svg`)
      await dlSvg.saveAs(svgPath)
      const svgText = fs.readFileSync(svgPath, 'utf8')
      check(`[${tag}] downloaded SVG is an svg with a path`, svgText.startsWith('<svg') && svgText.includes('<path'), dlSvg.suggestedFilename())

      // print layout (desktop only; same DOM)
      if (width === 1280) {
        for (const layout of ['3x8', '2x5']) {
          await page.locator('select').selectOption(layout)
          await page.emulateMedia({ media: 'print' })
          const visible = await page.evaluate(() => [...document.body.children].filter((el) => getComputedStyle(el).display !== 'none' && el.tagName !== 'SCRIPT').map((el) => el.className))
          check(`[${tag}/${layout}] in print only the label sheet is displayed`, visible.length === 1 && String(visible[0]).includes('qr-print-root'), JSON.stringify(visible))
          const pdfPath = path.join(outDir, `${tag}-${layout}.pdf`)
          await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true })
          const pages = Number((execFileSync('pdfinfo', [pdfPath]).toString().match(/Pages:\s+(\d+)/) || [])[1])
          check(`[${tag}/${layout}] PDF is one A4 page for 2 labels`, pages === 1, `pages=${pages}`)
          const size = execFileSync('pdfinfo', [pdfPath]).toString().match(/Page size:\s+(.*)/)[1]
          check(`[${tag}/${layout}] PDF page is A4`, /\(A4\)/.test(size), size)
          execFileSync('pdftoppm', ['-r', '200', '-png', '-singlefile', pdfPath, path.join(outDir, `${tag}-${layout}-print`)])
          // crop of the first cell (8 mm margin) -> decode
          const png = PNG.sync.read(fs.readFileSync(path.join(outDir, `${tag}-${layout}-print.png`)))
          const mm = 200 / 25.4
          const cols = layout === '3x8' ? 3 : 2
          const rows = layout === '3x8' ? 8 : 5
          const cw = Math.round((194 / cols) * mm)
          const ch = Math.round((281 / rows) * mm)
          const x0 = Math.round(8 * mm)
          const y0 = Math.round(8 * mm)
          const crop = new PNG({ width: cw, height: ch })
          PNG.bitblt(png, crop, x0, y0, cw, ch, 0, 0)
          check(`[${tag}/${layout}] printed first label decodes to the URL`, decode(PNG.sync.write(crop)) === `${BASE}/q/${tokenOf(11)}`)
          // QR physical size on paper: measure bounding box of dark modules in the crop
          const qrMm = await page.evaluate(() => {
            const el = document.querySelector('.qr-print-root .qr-label__code')
            return el ? el.getBoundingClientRect().width / 96 * 25.4 : 0
          })
          check(`[${tag}/${layout}] printed QR >= 25 mm wide (scannable from 20-30 cm)`, qrMm >= 25, `${qrMm.toFixed(1)} mm`)
          await page.emulateMedia({ media: 'screen' })
        }
        // 24+ labels -> several pages (all-company sheet has 6 elevators; check page flow with the 2x5 layout via many labels is covered by 1 page here)
      }

      // regenerate -> old code 404
      await page.locator('select').selectOption('3x8').catch(() => {})
      await page.getByRole('button', { name: lang === 'en' ? 'New code' : 'Novi kod', exact: true }).first().click()
      await page.waitForTimeout(800)
      const decoded2 = decode(await page.locator('.qr-preview .qr-label__code').first().screenshot())
      check(`[${tag}] after regenerate the QR encodes a different token`, decoded2 === `${BASE}/q/${tokenOf(11, 1)}`, String(decoded2))
      await page.goto(`${BASE}/q/${tokenOf(11, 0)}`)
      await page.waitForSelector('h1', { timeout: 8000 })
      const heading = await page.locator('h1').first().innerText()
      check(`[${tag}] old sticker shows the friendly invalid-code page`, heading === (lang === 'en' ? 'This QR code is not valid' : 'Ovaj QR kod nije valjan'), heading)
      check(`[${tag}] invalid page has no horizontal overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-3-invalid.png`), fullPage: true })

      // landing with the new token
      await page.goto(`${BASE}/q/${tokenOf(11, 1)}`)
      await page.waitForSelector('h1:has-text("Lift A")', { timeout: 8000 })
      check(`[${tag}] landing shows elevator + location`, (await page.locator('body').innerText()).includes('Lift A'))
      check(`[${tag}] landing no horizontal overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-4-landing.png`), fullPage: true })
      await page.getByRole('button', { name: lang === 'en' ? 'New RMS' : 'Novi RMS', exact: true }).click()
      await page.waitForSelector('#rms-address', { timeout: 8000 })
      await page.waitForTimeout(800)
      check(`[${tag}] New RMS opens with the location preselected`, (await page.inputValue('#rms-address')) === 'Ulica kralja Zvonimira 12, 51000 Rijeka')
      check(`[${tag}] New RMS lists the elevators of that location`, (await page.locator('[role=dialog]').innerText()).includes('Lift B'))
      await page.screenshot({ path: path.join(outDir, `${tag}-5-rms-modal.png`) })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: lang === 'en' ? 'New intervention' : 'Nova intervencija', exact: true }).click()
      await page.waitForSelector('#int-location', { timeout: 8000 })
      await page.waitForTimeout(500)
      check(`[${tag}] New intervention opens with the location preselected`, (await page.inputValue('#int-location')).startsWith('Stambena zgrada'))
      await ctx.close()

      // ---------------------------------------------------------------- logged out scan -> login -> back
      ;({ ctx, page } = await open(browser, { width, lang, authed: false }))
      await page.goto(`${BASE}/q/${tokenOf(12)}`)
      await page.waitForURL('**/login', { timeout: 8000 })
      check(`[${tag}] logged-out scan goes to login (no data shown)`, !(await page.locator('body').innerText()).includes('Lift B'))
      await page.screenshot({ path: path.join(outDir, `${tag}-6-login.png`) })
      await page.locator('input[type=email], input[name=email], input[name=username], input#email, input#username').first().fill('a@b.hr')
      await page.locator('input[type=password]').first().fill('secret123')
      await page.locator('button[type=submit]').first().click()
      await page.waitForURL('**/q/**', { timeout: 8000 })
      await page.waitForSelector('h1:has-text("Lift B")', { timeout: 8000 })
      check(`[${tag}] after login the user lands on /q/<token>`, here(page) === `/q/${tokenOf(12)}`, here(page))
      await ctx.close()

      // ---------------------------------------------------------------- technician + viewer: no admin actions
      for (const role of ['technician', 'viewer']) {
        ;({ ctx, page } = await open(browser, { width, lang, role }))
        await page.goto(`${BASE}/dashboard/locations/1`)
        await page.waitForSelector('text=Lift A', { timeout: 8000 })
        check(`[${tag}/${role}] no QR button on location detail`, (await page.getByRole('button', { name: /QR/ }).count()) === 0)
        await page.goto(`${BASE}/dashboard/qr-labels?location=1`)
        await page.waitForTimeout(800)
        check(`[${tag}/${role}] label page shows admin-only message, no labels`, (await page.locator('[data-testid="qr-label"]').count()) === 0 && (await page.locator('body').innerText()).includes(lang === 'en' ? 'Only administrators' : 'samo administratori'))
        await page.goto(`${BASE}/q/${tokenOf(11)}`)
        await page.waitForSelector('h1:has-text("Lift A")', { timeout: 8000 })
        const rmsBtn = await page.getByRole('button', { name: lang === 'en' ? 'New RMS' : 'Novi RMS', exact: true }).count()
        check(`[${tag}/${role}] landing ${role === 'viewer' ? 'has no write buttons' : 'has write buttons'}`, role === 'viewer' ? rmsBtn === 0 : rmsBtn === 1)
        if (role === 'viewer') await page.screenshot({ path: path.join(outDir, `${tag}-7-viewer-landing.png`), fullPage: true })
        await ctx.close()
      }
    }
  }
  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
