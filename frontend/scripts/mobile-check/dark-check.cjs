/* DARK MODE CHECK (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port <PORT> &
 * Usage:  BASE=http://localhost:5199 NODE_PATH=$(npm root -g) node scripts/mobile-check/dark-check.cjs <outDir outside repo> [--shots]   (exit 1 on failure)
 * Part 1 (toggle): System follows emulated prefers-color-scheme (live change), manual Light/Dark in the account menu, persisted in
 *   localStorage, survives reload, works with localStorage blocked, theme-color meta follows, class is on <html> before first paint.
 * Part 2 (audit): every main route + share page + QR landing + login, 375 and 1280 px, en and hr, in dark (emulated scheme and manual
 *   toggle with a light OS): flags (a) large near-white backgrounds while the page is dark, (b) visible text with contrast < 3:1.
 *   Areas that must stay light (class theme-light, signature canvas, QR images, photos) are skipped.
 * Part 3: light mode keeps class-less <html> and white body. Screenshots: all with --shots, otherwise only one per route at 375. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5199'
const outDir = process.argv[2] || '/tmp/dark-check'
const SHOTS = process.argv.includes('--shots')
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

const ROUTES = [
  '/dashboard/home', '/dashboard/locations', '/dashboard/locations/1', '/dashboard/rms', '/dashboard/rms/1', '/dashboard/rms-overview',
  '/dashboard/interventions', '/dashboard/interventions/1', '/dashboard/work-orders', '/dashboard/work-orders/1', '/dashboard/work-orders/recurring',
  '/dashboard/findings', '/dashboard/calendar', '/dashboard/vehicles', '/dashboard/projects', '/dashboard/projects/1', '/dashboard/users',
  '/dashboard/users/1', '/dashboard/users/activity', '/dashboard/sessions', '/dashboard/settings', '/dashboard/profile', '/dashboard/stats',
  '/dashboard/import', '/dashboard/qr-labels', '/dashboard/outbox',
]
const PUBLIC = [
  ['login', '/login', false],
  ['share', `/s/${mock.SHARE_TOKEN}`, false],
  ['qr', '/q/Qk7Zp2mX9aLw4RtYb0110Zee', true],
]

// ---- runs in the page: returns { pageDark, bright: [...], lowContrast: [...] }
const AUDIT = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const cache = new Map()
  // any CSS colour (rgb, oklch, color-mix ...) -> rgba via a 1px canvas
  const parse = (c) => {
    if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
    if (cache.has(c)) return cache.get(c)
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = '#000'
    cx.fillStyle = c
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    const v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
    // premultiplied rounding: recover straight colour for alpha < 1
    if (v.a > 0 && v.a < 1) { v.r = Math.min(255, Math.round(d[0] / v.a)); v.g = Math.min(255, Math.round(d[1] / v.a)); v.b = Math.min(255, Math.round(d[2] / v.a)) }
    cache.set(c, v)
    return v
  }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const over = (top, bottom) => { const a = top.a + bottom.a * (1 - top.a); return a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a) / 1) / a, g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a } }
  const skip = (el) => !!el.closest('.qr-cell, .bg-zinc-900, .bg-slate-900, .theme-light, canvas, img, video, svg, [data-keep-light], .gm-style, .leaflet-container, iframe, [data-radix-popper-content-wrapper] .gm-style')
  // effective background: composite ancestors' backgrounds; null when an ancestor has an image/gradient (cannot judge)
  const effBg = (el) => {
    const chain = []
    for (let e = el; e; e = e.parentElement) chain.push(e)
    let acc = { r: 0, g: 0, b: 0, a: 0 }
    for (const e of chain) {
      const cs = getComputedStyle(e)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
      const c = parse(cs.backgroundColor)
      if (c && c.a > 0) acc = over(acc, c)
      if (acc.a >= 0.999) return acc
    }
    return over(acc, parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 })
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false
    for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).opacity === '0' || getComputedStyle(e).display === 'none') return false
    return true
  }
  const sel = (el) => {
    const parts = []
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      parts.unshift(e.tagName.toLowerCase() + (e.getAttribute('data-testid') ? `[${e.getAttribute('data-testid')}]` : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''))
    }
    return parts.join(' > ')
  }
  const out = { pageDark: document.documentElement.classList.contains('dark'), bodyBg: getComputedStyle(document.body).backgroundColor, bright: [], lowContrast: [] }
  const seen = new Set()
  for (const el of document.querySelectorAll('body *')) {
    if (skip(el) || !visible(el)) continue
    const cs = getComputedStyle(el)
    const bg = parse(cs.backgroundColor)
    const r = el.getBoundingClientRect()
    // (a) near-white opaque background on something large enough to be a surface
    if (bg && bg.a > 0.6 && lum(bg) > 0.8 && !el.closest('button, a, [role=button], label') && r.width * r.height > 2500 && !(r.bottom < 0 || r.top > innerHeight * 3)) {
      const k = sel(el)
      if (!seen.has('b' + k)) { seen.add('b' + k); out.bright.push(`${k} bg=${cs.backgroundColor} ${Math.round(r.width)}x${Math.round(r.height)}`) }
    }
    // (b) text contrast
    let text = ''
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent
    text = text.trim()
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue // skip empty / dash-only decorative markers
    const fg = parse(cs.color)
    const base = effBg(el)
    if (!fg || !base) continue
    const f = fg.a < 1 ? over(fg, base) : fg
    const l1 = lum(f), l2 = lum(base)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    if (ratio < 3) {
      const k = sel(el) + '|' + text.slice(0, 20)
      if (!seen.has(k)) { seen.add(k); out.lowContrast.push(`${ratio.toFixed(2)} "${text.slice(0, 30)}" ${sel(el)} fg=${cs.color}`) }
    }
  }
  return out
}

async function open(browser, { role = 'admin', authed = true, width = 375, lang = 'en', scheme = 'light', pref, blockStorage = false }) {
  mock.resetShare()
  mock.setAuthed(authed)
  mock.setLanguage(lang)
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 812 }, deviceScaleFactor: 1, colorScheme: scheme })
  await ctx.addInitScript(([l, p, block]) => {
    try { localStorage.setItem('liftelo_language', l); if (p && !sessionStorage.getItem('__themeSet')) { localStorage.setItem('liftelo-theme', p); sessionStorage.setItem('__themeSet', '1') } } catch (e) { /* ignore */ }
    if (block) { // storage access for the theme key throws (other app code keeps working: it is not guarded everywhere)
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem
      Storage.prototype.getItem = function (k) { if (k === 'liftelo-theme') throw new Error('blocked'); return get.call(this, k) }
      Storage.prototype.setItem = function (k, v) { if (k === 'liftelo-theme') throw new Error('blocked'); return set.call(this, k, v) }
    }
  }, [lang, pref, blockStorage])
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())
  await page.route('**/api/**', (route) => mock.handle(route, role))
  return { ctx, page }
}
const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'))
const metaColor = (page) => page.evaluate(() => document.querySelector('meta[name="theme-color"]').getAttribute('content'))

async function openAccountMenu(page, lang) {
  await page.getByRole('button', { name: lang === 'hr' ? /korisnički|račun/i : /account/i }).first().click()
}

;(async () => {
  const browser = await chromium.launch()

  // ================================================ Part 1: toggle behaviour
  {
    let { ctx, page } = await open(browser, { scheme: 'dark', width: 1280 })
    await page.goto(`${BASE}/dashboard/home`)
    await page.waitForSelector('header')
    check('system + OS dark -> html.dark', await isDark(page))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(200)
    check('system follows a live OS change to light', !(await isDark(page)))
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(200)
    check('system follows a live OS change back to dark', await isDark(page))
    await openAccountMenu(page, 'en')
    check('account menu shows System / Light / Dark', (await page.locator('[data-theme-option]').count()) === 3)
    await page.locator('[data-theme-option="light"]').click()
    await page.waitForTimeout(150)
    check('manual Light overrides OS dark', !(await isDark(page)))
    check('localStorage keeps manual choice', (await page.evaluate(() => localStorage.getItem('liftelo-theme'))) === 'light')
    await page.reload()
    await page.waitForSelector('header')
    check('manual Light survives reload (OS still dark)', !(await isDark(page)))
    await openAccountMenu(page, 'en')
    await page.locator('[data-theme-option="dark"]').click()
    await page.waitForTimeout(150)
    check('manual Dark applies', await isDark(page))
    check('theme-color meta is set', /^#[0-9a-f]{6}$/i.test(await metaColor(page)), await metaColor(page))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(150)
    check('manual Dark ignores OS light', await isDark(page))
    await page.screenshot({ path: path.join(outDir, 'toggle-menu.png') })
    await ctx.close()
  }
  {
    // class must be present at the first paint: check at DOMContentLoaded before React mounts
    const { ctx, page } = await open(browser, { scheme: 'dark', authed: false })
    await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { window.__darkAtDcl = document.documentElement.classList.contains('dark') }) })
    await page.goto(`${BASE}/login`)
    check('html.dark set before React mounts (no flash)', (await page.evaluate(() => window.__darkAtDcl)) === true)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, { scheme: 'dark', blockStorage: true, width: 1280 })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}/dashboard/home`)
    await page.waitForSelector('header')
    check('works with localStorage blocked (system -> dark, no page errors)', (await isDark(page)) && errors.length === 0, errors.join('|'))
    await openAccountMenu(page, 'en')
    await page.locator('[data-theme-option="light"]').click()
    await page.waitForTimeout(150)
    check('manual toggle works in memory without storage', !(await isDark(page)))
    await ctx.close()
  }

  // ================================================ Part 2: audit
  const problems = []
  const audit = async (page, tag, expectDark) => {
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(450)
    const r = await page.evaluate(AUDIT)
    const dark = await isDark(page)
    const bad = []
    if (dark !== expectDark) bad.push(`dark class ${dark} expected ${expectDark}`)
    if (expectDark) {
      r.bright.forEach((b) => bad.push('BRIGHT ' + b))
      r.lowContrast.forEach((b) => bad.push('CONTRAST ' + b))
    }
    if (bad.length) problems.push({ tag, bad })
    check(`[${tag}] ${expectDark ? 'dark audit clean' : 'light mode untouched'}`, bad.length === 0, bad.length ? `(${bad.length} issues)` : '')
  }
  const modes = [['os-dark', { scheme: 'dark' }, true], ['manual-dark', { scheme: 'light', pref: 'dark' }, true]]
  for (const lang of ['en', 'hr']) {
    for (const width of [375, 1280]) {
      for (const [mname, mopts, expectDark] of modes) {
        // the manual toggle is audited on a subset to keep the run short
        const routes = mname === 'os-dark' ? ROUTES : ['/dashboard/home', '/dashboard/locations/1', '/dashboard/settings']
        const { ctx, page } = await open(browser, { ...mopts, width, lang })
        for (const route of routes) {
          const tag = `${lang}-${width}-${mname} ${route}`
          await page.goto(`${BASE}${route}`).catch(() => {})
          await audit(page, tag, expectDark)
          if (SHOTS || (width === 375 && lang === 'en' && mname === 'os-dark')) await page.screenshot({ path: path.join(outDir, `${lang}-${width}-${mname}${route.replace(/\//g, '_')}.png`), fullPage: false })
        }
        await ctx.close()
        if (mname === 'os-dark') {
          for (const [name, url, authed] of PUBLIC) {
            const c = await open(browser, { ...mopts, width, lang, authed })
            await c.page.goto(`${BASE}${url}`).catch(() => {})
            await audit(c.page, `${lang}-${width}-${mname} ${name}`, true)
            await c.page.screenshot({ path: path.join(outDir, `${lang}-${width}-${mname}-${name}.png`) })
            await c.ctx.close()
          }
        }
      }
    }
  }

  // ================================================ Part 2b: overlays (menu, dialog, command palette) in dark
  for (const width of [375, 1280]) {
    const { ctx, page } = await open(browser, { scheme: 'dark', width, lang: 'en' })
    await page.goto(`${BASE}/dashboard/locations/1`)
    await page.waitForSelector('header')
    await page.waitForTimeout(500)
    await openAccountMenu(page, 'en')
    await page.waitForTimeout(300)
    await audit(page, `overlay-${width} account menu`, true)
    await page.screenshot({ path: path.join(outDir, `overlay-${width}-account-menu.png`) })
    await page.keyboard.press('Escape')
    await page.goto(`${BASE}/dashboard/home`)
    await page.waitForSelector('header')
    await page.getByRole('button', { name: 'New RMS' }).first().click().catch(() => {})
    await page.waitForTimeout(700)
    if (await page.locator('[role=dialog]').count()) {
      await audit(page, `overlay-${width} create dialog`, true)
      await page.screenshot({ path: path.join(outDir, `overlay-${width}-dialog.png`) })
    } else check(`[overlay-${width}] create dialog opened`, false)
    await ctx.close()
  }

  // ================================================ Part 3: light mode unchanged
  for (const width of [375, 1280]) {
    const { ctx, page } = await open(browser, { scheme: 'light', width, lang: 'en' })
    for (const route of ['/dashboard/home', '/dashboard/locations', '/dashboard/settings']) {
      await page.goto(`${BASE}${route}`)
      await audit(page, `light-${width} ${route}`, false)
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      check(`[light-${width} ${route}] body background is white`, bg === 'rgb(255, 255, 255)', bg)
      await page.screenshot({ path: path.join(outDir, `light-${width}${route.replace(/\//g, '_')}.png`) })
    }
    await ctx.close()
  }

  await browser.close()
  fs.writeFileSync(path.join(outDir, 'problems.json'), JSON.stringify(problems, null, 1))
  console.log(`\n${passes} passed, ${failures} failed. Details: ${path.join(outDir, 'problems.json')}`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
