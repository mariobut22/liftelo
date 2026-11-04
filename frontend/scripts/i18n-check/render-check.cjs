/* i18n RENDER TEST (Playwright, API fully mocked - see ../mobile-check/mock.cjs). Visits every page and dialog in en AND hr at
 * 375px and 1280px and scans the visible text for "language leaks": Croatian text in en mode, English UI words in hr mode.
 * Text that comes from the fake API (user data) is ignored. Needs the dev server:  cd frontend && npx vite --port 5199 &
 * Usage:  NODE_PATH=$(npm root -g) node scripts/i18n-check/render-check.cjs <outDir> [--langs en,hr] [--widths 375,1280] [--shots]
 * Exit code 1 when leaks are found. Screenshots (--shots) go to <outDir>; keep outDir outside the repo. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('../mobile-check/mock.cjs')

const argv = process.argv.slice(2)
const outDir = argv[0] && !argv[0].startsWith('--') ? argv[0] : '/tmp/i18n-render'
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const LANGS = opt('--langs', 'en,hr').split(',')
const WIDTHS = opt('--widths', '375,1280').split(',').map(Number)
const SHOTS = argv.includes('--shots')
const BASE = process.env.BASE || 'http://localhost:5199'

const ROUTES = [
  '/dashboard/home', '/dashboard/locations', '/dashboard/locations/1', '/dashboard/rms', '/dashboard/rms/1',
  '/dashboard/rms-overview', '/dashboard/interventions', '/dashboard/projects', '/dashboard/projects/1',
  '/dashboard/work-orders', '/dashboard/work-orders/1', '/dashboard/vehicles', '/dashboard/stats',
  '/dashboard/users', '/dashboard/users/1', '/dashboard/users/activity', '/dashboard/sessions',
  '/dashboard/settings', '/dashboard/profile',
]
const PUBLIC = ['/login', '/register', '/activate?token=abc', '/accept-invite?token=abc']
const BUTTON_ROUTES = ['/dashboard/home', '/dashboard/locations', '/dashboard/locations/1', '/dashboard/rms', '/dashboard/rms/1', '/dashboard/rms-overview', '/dashboard/interventions', '/dashboard/projects', '/dashboard/projects/1', '/dashboard/work-orders', '/dashboard/work-orders/1', '/dashboard/vehicles', '/dashboard/users', '/dashboard/users/1', '/dashboard/users/activity', '/dashboard/sessions', '/dashboard/settings', '/dashboard/profile', '/dashboard/stats']

// Words that must not appear in the other language (whole words, case-insensitive). Legit shared words (Status, RMS, PDF, Motor, Admin...) are not listed.
const HR_WORDS = ['spremi', 'odustani', 'nema', 'greška', 'lokacij\\w*', 'korisni\\w*', 'postavke', 'prijav\\w*', 'lozink\\w*', 'tvrtk\\w*', 'vozil\\w*', 'projekt\\w*', 'radni', 'nalog\\w*', 'intervencij\\w*', 'serviser\\w*', 'dizal\\w*', 'datum', 'opis', 'napomen\\w*', 'učitavanje', 'pretraži', 'zatvori', 'obriši', 'uredi', 'dodaj', 'kreiraj', 'ukloni', 'aktivan', 'neaktivan', 'pretplat\\w*', 'paket', 'odjava', 'profil', 'početna', 'statistika', 'sesij\\w*', 'obavijest\\w*', 'potpis\\w*', 'strojarnica']
const EN_WORDS = ['save', 'cancel', 'settings', 'profile', 'create', 'delete', 'edit', 'search', 'loading', 'active', 'view', 'review', 'add', 'close', 'back', 'next', 'previous', 'confirm', 'error', 'name', 'password', 'location', 'locations', 'description', 'notes', 'users', 'projects', 'vehicles', 'unknown', 'actions?', 'apply', 'filter', 'yes', 'no', 'open', 'completed', 'total', 'please', 'failed', 'the', 'and', 'for', 'with', 'your', 'you', 'not', 'select', 'enter', 'sign', 'subscription', 'plan', 'trial', 'upload', 'download', 'email', 'technicians?', 'work order\\w*', 'interventions?', 'elevators?', 'company', 'session\\w*', 'notification\\w*', 'overview', 'optional', 'required', 'invalid', 'try again', 'loading\\.\\.\\.']
const wordRe = (list) => new RegExp('(?<![\\p{L}\\p{N}_])(' + list.join('|') + ')(?![\\p{L}\\p{N}_])', 'giu')
const HR_RE = wordRe(HR_WORDS)
const EN_RE = wordRe(EN_WORDS)
const DIACRITICS = /[čćšžđČĆŠŽĐ]/

// Collect visible text (text nodes + placeholder/title/aria-label/alt/value of buttons+options) inside the page.
const COLLECT = () => {
  const out = []
  const visible = (el) => { try { return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) } catch { return true } }
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = (n.textContent || '').replace(/\s+/g, ' ').trim()
    if (!t) continue
    const el = n.parentElement
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue
    if (el.closest('[data-sonner-toaster], .tsqd-parent-container, [class*="tsqd"], .gm-style, .leaflet-container')) continue
    if (el.tagName === 'OPTION' || visible(el)) out.push({ t, src: 'text', tag: el.tagName.toLowerCase() })
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
    if (el.closest('[class*="tsqd"], .gm-style, .leaflet-container') || el.matches('section[aria-label^="Notifications"]') || !visible(el)) continue
    for (const a of ['placeholder', 'title', 'aria-label', 'alt']) { const v = el.getAttribute(a); if (v && v.trim()) out.push({ t: v.trim(), src: a, tag: el.tagName.toLowerCase() }) }
  }
  return out
}

function stripUserData(text) {
  let s = text
  const vals = [...mock.recorded].sort((a, b) => b.length - a.length)
  for (const v of vals) if (s.includes(v)) s = s.split(v).join(' ')
  return s.replace(/\s+/g, ' ').trim()
}

const leaks = {} // lang -> Map(text -> {where:Set, reason})
const stats = { states: 0 }
function analyse(lang, where, items) {
  stats.states++
  for (const it of items) {
    const s = stripUserData(it.t)
    if (!s || !/\p{L}/u.test(s)) continue
    let reason = null
    if (lang === 'en') {
      if (DIACRITICS.test(s)) reason = 'croatian diacritics'
      else { const m = s.match(HR_RE); if (m) reason = 'croatian word: ' + m[0] }
    } else {
      const m = s.match(EN_RE)
      if (m) reason = 'english word: ' + m[0]
    }
    if (reason) {
      leaks[lang] = leaks[lang] || new Map()
      const key = it.t
      if (!leaks[lang].has(key)) leaks[lang].set(key, { reason, src: it.src, tag: it.tag, where: new Set() })
      leaks[lang].get(key).where.add(where)
    }
  }
}

;(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch()
  const tag = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
  for (const lang of LANGS) {
    mock.setLanguage(lang)
    for (const width of WIDTHS) {
      const height = width < 1024 ? 812 : 800
      const ctx = await browser.newContext({
        viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 1024, hasTouch: width < 1024,
        userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
      })
      await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
      const page = await ctx.newPage()
      page.setDefaultTimeout(3000)
      const consoleErrors = new Set()
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') { const t = m.text(); if (/i18next|missingKey|translation/i.test(t)) consoleErrors.add(t.slice(0, 160)) } })
      await page.route('**/api/**', (route) => mock.handle(route, 'admin'))
      const label = (name) => `${lang}@${width} ${name}`
      let loadedHome = false
      const go = async (url) => {
        if (url.startsWith('/dashboard') || url === '/onboarding') {
          if (!loadedHome) { await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(500); loadedHome = true }
          await page.evaluate((u) => { history.pushState({}, '', u); window.dispatchEvent(new PopStateEvent('popstate')) }, url)
          await page.waitForTimeout(500)
        } else { loadedHome = false; await page.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => {}) }
        await page.addStyleTag({ content: '.tsqd-parent-container{display:none!important}' }).catch(() => {})
        await page.waitForTimeout(300)
      }
      const scan = async (name, full = true) => {
        await page.waitForTimeout(250)
        analyse(lang, label(name), await page.evaluate(COLLECT))
        if (SHOTS) await page.screenshot({ path: path.join(outDir, `${lang}_${width}_${tag(name)}.png`), fullPage: full }).catch(() => {})
        const htmlLang = await page.evaluate(() => document.documentElement.lang)
        if (htmlLang !== lang) console.log(`  html lang mismatch at ${label(name)}: ${htmlLang}`)
      }
      const closeAll = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {}) }

      mock.setAuthed(false)
      for (const p of PUBLIC) { await go(p); await scan('pub' + p) }
      mock.setAuthed(true)
      for (const r of ROUTES) { await go(r); await scan(r) }
      await go('/onboarding'); await scan('/onboarding')

      const overlay = async (name, fn, full = false) => {
        loadedHome = false; await go('/dashboard/home')
        try { await fn(); await scan(name, full) } catch (e) { console.log('  SKIP ' + label(name) + ' ' + e.message.split('\n')[0]) }
        await closeAll()
      }
      await overlay('menu nav', () => page.click('button[aria-label]:has(svg.lucide-menu)'))
      await overlay('menu user', () => page.click('header button:has(span.rounded-full)'))
      await overlay('menu company', () => page.click('header button[aria-haspopup]:has-text("Rijeka")'))
      await overlay('bell', () => page.click('header button:has(svg.lucide-bell)'))
      await overlay('palette', async () => { await page.keyboard.press('Control+k'); await page.waitForSelector('[role=dialog]') })
      for (let i = 0; i < 4; i++) {
        await overlay('fab dialog ' + i, async () => { await page.click('div.fixed.bottom-4 button'); await page.locator('[role=menuitem]').nth(i).click(); await page.waitForSelector('[role=dialog]') })
      }
      await overlay('fab menu', () => page.click('div.fixed.bottom-4 button'))

      // click every button of each page; whenever a dialog opens scan it. Also scan after each click (state changes).
      for (const r of BUTTON_ROUTES) {
        await go(r)
        const n = Math.min((await page.$$('main button')).length, 30)
        for (let k = 0; k < n; k++) {
          const b = (await page.$$('main button'))[k]
          if (!b) break
          const before = page.url()
          await b.click({ timeout: 800 }).catch(() => {})
          await page.waitForTimeout(250)
          const dlg = await page.$('[role=dialog]')
          if (dlg) { await scan(`${r} btn${k} dialog`, false) } else if (SHOTS === false) { analyse(lang, label(`${r} btn${k}`), await page.evaluate(COLLECT)) }
          await closeAll()
          if (page.url() !== before) await go(r)
        }
      }

      // superadmin
      mock.setAuthed(true)
      const pageSA = await ctx.newPage()
      await pageSA.route('**/api/**', (route) => mock.handle(route, 'superadmin'))
      pageSA.setDefaultTimeout(3000)
      await pageSA.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' }).catch(() => {})
      await pageSA.waitForTimeout(500)
      await pageSA.evaluate(() => { history.pushState({}, '', '/superadmin'); window.dispatchEvent(new PopStateEvent('popstate')) })
      await pageSA.waitForTimeout(600)
      analyse(lang, label('/superadmin'), await pageSA.evaluate(COLLECT))
      if (SHOTS) await pageSA.screenshot({ path: path.join(outDir, `${lang}_${width}_superadmin.png`), fullPage: true }).catch(() => {})
      const sb = await pageSA.$$('button')
      for (let k = 0; k < Math.min(sb.length, 12); k++) {
        const b = (await pageSA.$$('button'))[k]; if (!b) break
        await b.click({ timeout: 800 }).catch(() => {})
        await pageSA.waitForTimeout(250)
        if (await pageSA.$('[role=dialog]')) analyse(lang, label(`/superadmin btn${k} dialog`), await pageSA.evaluate(COLLECT))
        await pageSA.keyboard.press('Escape'); await pageSA.keyboard.press('Escape')
      }
      await pageSA.close()
      if (consoleErrors.size) console.log(`  i18next console messages (${label('')}):`, [...consoleErrors])
      await ctx.close()
      console.log(`done ${lang} @ ${width}`)
    }
  }
  await browser.close()

  let total = 0
  const report = {}
  for (const lang of LANGS) {
    const m = leaks[lang] || new Map()
    report[lang] = [...m.entries()].map(([text, v]) => ({ text, reason: v.reason, src: v.src, tag: v.tag, where: [...v.where].slice(0, 3) }))
    total += m.size
    console.log(`\n=== ${lang}: ${m.size} unique suspected leaks ===`)
    for (const [text, v] of m) console.log(`  [${v.reason}] ${JSON.stringify(text.slice(0, 110))}  (${v.src}/${v.tag}) @ ${[...v.where][0]}`)
  }
  fs.writeFileSync(path.join(outDir, 'leaks.json'), JSON.stringify(report, null, 1))
  console.log(`\nSTATES scanned: ${stats.states} (languages: ${LANGS.join(',')}, widths: ${WIDTHS.join(',')}); unique suspected leaks: ${total}`)
  process.exit(total ? 1 : 0)
})()
