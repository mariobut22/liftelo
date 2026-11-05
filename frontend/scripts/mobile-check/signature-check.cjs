/* Signature pad touch test (Playwright + CDP touch events, API mocked). Opens "Create RMS", draws two separate finger strokes
 * on the technician signature canvas and checks that (1) the canvas pixel size does not change after a stroke and
 * (2) each stroke lands under the finger (dark pixels at the expected canvas coordinates).
 * Usage: NODE_PATH=$(npm root -g) node scripts/mobile-check/signature-check.cjs [outDir]   (needs `npx vite --port 5199`; exit 1 on failure) */
const { chromium, devices } = require('playwright')
const mock = require('./mock.cjs')
const BASE = process.env.BASE || 'http://localhost:5199'
const outDir = process.argv[2] || '/tmp/signature-check'
require('fs').mkdirSync(outDir, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
  })
  await ctx.addInitScript(() => localStorage.setItem('liftelo_language', 'hr'))
  const page = await ctx.newPage()
  await page.route('**/api/**', (route) => mock.handle(route, 'admin'))
  await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '.tsqd-parent-container{display:none!important}' }).catch(() => {})
  await page.click('div.fixed.bottom-4 button')
  // menu labels are translated: pick the entry that opens a dialog containing signature canvases (RMS or intervention)
  const items = page.locator('[role=menuitem]')
  const count = await items.count()
  let opened = false
  for (let k = 0; k < count && !opened; k++) {
    if (k > 0) await page.click('div.fixed.bottom-4 button')
    await items.nth(k).click()
    try { await page.waitForSelector('[role=dialog] canvas', { timeout: 4000 }); opened = true } catch { await page.keyboard.press('Escape').catch(() => {}) }
  }
  if (!opened) throw new Error('no dialog with a signature canvas found')
  const canvas = page.locator('[role=dialog] canvas').first()
  await canvas.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const cdp = await ctx.newCDPSession(page)

  const info = () => canvas.evaluate((c) => { const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, left: r.left, top: r.top, rw: r.width, rh: r.height } })
  const touchStroke = async (pts) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] })
    for (const p of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p[0], y: p[1] }] }); await page.waitForTimeout(16) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(200)
  }
  const line = (x0, y0, x1, y1, n = 14) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])
  // dark pixel near the expected canvas coordinate (radius in canvas pixels)
  const darkNear = (cx, cy, radius) => canvas.evaluate((c, [cx, cy, radius]) => {
    const ctx2 = c.getContext('2d'); const x0 = Math.max(0, Math.round(cx - radius)); const y0 = Math.max(0, Math.round(cy - radius))
    const w = Math.min(c.width - x0, radius * 2); const h = Math.min(c.height - y0, radius * 2)
    if (w <= 0 || h <= 0) return false
    const d = ctx2.getImageData(x0, y0, w, h).data
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 80 && d[i] < 120) return true
    return false
  }, [cx, cy, radius])

  const results = []; let fail = false
  const check = (name, ok, extra = '') => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fail = true }

  const i0 = await info()
  console.log('canvas initial', JSON.stringify(i0))
  const strokes = [
    line(i0.left + 0.15 * i0.rw, i0.top + 0.3 * i0.rh, i0.left + 0.6 * i0.rw, i0.top + 0.3 * i0.rh),
    line(i0.left + 0.15 * i0.rw, i0.top + 0.7 * i0.rh, i0.left + 0.6 * i0.rw, i0.top + 0.7 * i0.rh),
    line(i0.left + 0.2 * i0.rw, i0.top + 0.2 * i0.rh, i0.left + 0.5 * i0.rw, i0.top + 0.85 * i0.rh),
  ]
  for (let s = 0; s < strokes.length; s++) {
    await touchStroke(strokes[s])
    const i = await info()
    check(`stroke ${s + 1}: canvas size unchanged`, i.w === i0.w && i.h === i0.h, `(${i0.w}x${i0.h} -> ${i.w}x${i.h})`)
    check(`stroke ${s + 1}: layout box unchanged`, Math.abs(i.rw - i0.rw) < 1 && Math.abs(i.rh - i0.rh) < 1 && Math.abs(i.left - i0.left) < 1)
    // every stroke drawn so far must still be under its own finger positions
    for (let k = 0; k <= s; k++) {
      let hit = 0; const sample = strokes[k].filter((_, idx) => idx % 3 === 0)
      for (const [x, y] of sample) {
        if (await darkNear(((x - i.left) * i.w) / i.rw, ((y - i.top) * i.h) / i.rh, 10)) hit++
      }
      check(`after stroke ${s + 1}: stroke ${k + 1} under the finger`, hit / sample.length >= 0.9, `(${hit}/${sample.length} sample points)`)
    }
  }
  await page.screenshot({ path: `${outDir}/signature.png` })
  console.log(results.join('\n'))
  console.log(fail ? '\nFAILED' : '\nALL PASSED')
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
