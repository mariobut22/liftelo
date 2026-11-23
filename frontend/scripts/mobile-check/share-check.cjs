/* SHARE LINK TEST (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port <PORT> &
 * Usage:  BASE=http://localhost:5199 NODE_PATH=$(npm root -g) node scripts/mobile-check/share-check.cjs <outDir outside repo>   (exit 1 on failure)
 * Checks (en + hr, 375 and 1280 px): admin card in the location profile (off -> create -> full URL shown once + copy button -> stop),
 * card hidden for technician/viewer; PUBLIC page /s/:token logged out (content, no login redirect, no app navigation, noindex meta,
 * no-referrer meta, language switch, footer, PDF note, no overflow); invalid token -> friendly error; logged-in staff see the same public page. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5199'
const outDir = process.argv[2] || '/tmp/share-check'
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

async function open(browser, { role = 'admin', authed = true, width = 375, lang = 'en' }) {
  mock.resetShare()
  mock.setAuthed(authed)
  mock.setLanguage(lang)
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 812 }, deviceScaleFactor: 2 })
  await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {})
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())
  const apiCalls = []
  await page.route('**/api/**', async (route) => {
    apiCalls.push(new URL(route.request().url()).pathname)
    return mock.handle(route, role)
  })
  return { ctx, page, apiCalls }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const T = {
  en: { card: 'Read-only page for the building manager', create: 'Create link', stop: 'Stop sharing', off: 'Sharing is off.', copy: 'Copy link', fault: 'Out of service', hrBtn: 'HR', pdf: 'Documents (PDF) are not available', notFound: 'Link not available', elevators: 'Elevators' },
  hr: { card: 'Stranica samo za čitanje za upravitelja zgrade', create: 'Izradi poveznicu', stop: 'Prekini dijeljenje', off: 'Dijeljenje je isključeno.', copy: 'Kopiraj poveznicu', fault: 'Nije u funkciji', pdf: 'Dokumenti (PDF) nisu dostupni', notFound: 'Poveznica nije dostupna', elevators: 'Dizala' },
}

;(async () => {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    const L = T[lang]
    for (const width of [375, 1280]) {
      const tag = `${lang}-${width}`
      // ------------------------------------------------ admin card
      let { ctx, page } = await open(browser, { width, lang })
      await page.goto(`${BASE}/dashboard/locations/1#info`)
      const card = page.getByTestId('share-link-card')
      await card.waitFor({ timeout: 8000 })
      check(`[${tag}] admin sees the share card`, (await card.innerText()).includes(L.card))
      check(`[${tag}] default state is OFF`, (await page.getByTestId('share-state').innerText()).includes(L.off))
      check(`[${tag}] no fresh link before creating`, (await page.getByTestId('share-fresh').count()) === 0)
      await card.getByRole('button', { name: L.create, exact: true }).click()
      const fresh = page.getByTestId('share-fresh')
      await fresh.waitFor({ timeout: 5000 })
      const url = await fresh.locator('input').inputValue()
      check(`[${tag}] full URL shown once: <origin>/s/<43 chars>`, url === `${BASE}/s/${mock.SHARE_TOKEN}`, url)
      check(`[${tag}] copy button present`, await fresh.getByRole('button', { name: L.copy }).isVisible())
      await fresh.getByRole('button', { name: L.copy }).click()
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
      check(`[${tag}] copy puts the URL on the clipboard`, clip === null || clip === url, String(clip))
      check(`[${tag}] no horizontal overflow (card)`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-1-card.png`), fullPage: true })
      await card.getByRole('button', { name: L.stop, exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('[data-testid="share-fresh"]'))
      await page.waitForFunction((t) => document.querySelector('[data-testid="share-state"]')?.textContent?.includes(t), L.off)
      check(`[${tag}] stop sharing -> back to OFF, link box gone`, true)
      await ctx.close()

      for (const role of ['technician', 'viewer']) {
        ;({ ctx, page } = await open(browser, { width, lang, role }))
        await page.goto(`${BASE}/dashboard/locations/1#info`)
        await page.waitForLoadState('networkidle')
        check(`[${tag}] ${role} does not see the share card`, (await page.getByTestId('share-link-card').count()) === 0)
        await ctx.close()
      }

      // ------------------------------------------------ public page, logged out
      let calls
      ;({ ctx, page, apiCalls: calls } = await open(browser, { width, lang, authed: false }))
      await page.goto(`${BASE}/s/${mock.SHARE_TOKEN}`)
      await page.getByTestId('share-location').waitFor({ timeout: 8000 })
      check(`[${tag}] public page stays on /s/<token> (no login redirect)`, new URL(page.url()).pathname === `/s/${mock.SHARE_TOKEN}`, page.url())
      check(`[${tag}] building name shown`, (await page.getByTestId('share-location').innerText()).includes('Stambena zgrada'))
      check(`[${tag}] 2 elevators, 1 open fault, 2 RMS visits, 1 intervention`,
        (await page.getByTestId('share-elevator').count()) === 2 && (await page.getByTestId('share-fault').count()) === 1
        && (await page.getByTestId('share-rms-visit').count()) === 2 && (await page.getByTestId('share-intervention').count()) === 1)
      const body = await page.locator('body').innerText()
      check(`[${tag}] severity label translated`, body.includes(L.fault))
      check(`[${tag}] technician first name only`, body.includes('Ivan') && !/Horvat|Kovačević/.test(body))
      check(`[${tag}] PDF note shown (PDFs not offered)`, body.includes(L.pdf) && (await page.locator('a[href*="pdf"], a[href*="uploads"]').count()) === 0)
      check(`[${tag}] no app navigation / login form / email / phone on the page`, (await page.locator('nav, aside, input, form').count()) === 0 && !/@|\+385/.test(body))
      check(`[${tag}] Liftelo footer present`, /Liftelo/.test(await page.locator('footer').innerText()))
      check(`[${tag}] robots noindex + referrer no-referrer meta`, (await page.locator('meta[name="robots"]').getAttribute('content'))?.includes('noindex') && (await page.locator('meta[name="referrer"]').getAttribute('content')) === 'no-referrer')
      check(`[${tag}] no horizontal overflow (public)`, !(await overflow(page)))
      check(`[${tag}] public data came from /api/public/share only`, calls.some((c) => c.startsWith('/api/public/share/')) && !calls.some((c) => c.includes('/locations') || c.includes('/rms') || c.includes('/findings')), calls.join(' '))
      await page.screenshot({ path: path.join(outDir, `${tag}-2-public.png`), fullPage: true })
      // language switch
      const other = lang === 'en' ? 'hr' : 'en'
      await page.getByRole('button', { name: other.toUpperCase(), exact: true }).click()
      await page.waitForFunction((t) => document.body.innerText.includes(t), T[other].elevators)
      check(`[${tag}] language switch to ${other} works on the public page`, !(await page.locator('body').innerText()).includes(L.pdf))
      await page.screenshot({ path: path.join(outDir, `${tag}-3-public-${other}.png`), fullPage: true })
      await ctx.close()

      // ------------------------------------------------ invalid token
      ;({ ctx, page } = await open(browser, { width, lang, authed: false }))
      await page.goto(`${BASE}/s/${'x'.repeat(43)}`)
      await page.getByTestId('share-error').waitFor({ timeout: 8000 })
      check(`[${tag}] invalid token -> friendly error card, still on /s/`, (await page.getByTestId('share-error').innerText()).includes(L.notFound) && new URL(page.url()).pathname.startsWith('/s/'))
      check(`[${tag}] error page: no overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `${tag}-4-invalid.png`), fullPage: true })
      await ctx.close()

      // ------------------------------------------------ logged-in staff opening the public link
      ;({ ctx, page } = await open(browser, { width, lang }))
      await page.goto(`${BASE}/s/${mock.SHARE_TOKEN}`)
      await page.getByTestId('share-location').waitFor({ timeout: 8000 })
      check(`[${tag}] logged-in staff see the public layout too (no dashboard redirect)`, new URL(page.url()).pathname === `/s/${mock.SHARE_TOKEN}`)
      await ctx.close()
    }
  }
  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
