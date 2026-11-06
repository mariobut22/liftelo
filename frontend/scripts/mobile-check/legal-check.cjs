/* LEGAL / GDPR UI TEST (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port <PORT> &
 * Usage:  BASE=http://localhost:5603 NODE_PATH=$(npm root -g) node scripts/mobile-check/legal-check.cjs <outDir outside repo>   (exit 1 on failure)
 * Runs in en + hr at 375 and 1280 px and saves a screenshot per state. Sections:
 *   1. acceptance checkbox on /register, /accept-invite, /activate (button disabled until ticked, accept_terms sent, links), blocking
 *      re-acceptance dialog (cannot be dismissed, sign-out alternative, accept closes it)
 * (later steps add: company export in Settings, personal data download, remove/anonymise user, superadmin closure) */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5603'
const outDir = process.argv[2] || '/tmp/legal-check'
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

async function open(browser, { role = 'admin', authed = true, width = 375, lang = 'en' }) {
  mock.setAuthed(authed)
  mock.setLanguage(lang)
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 812 }, deviceScaleFactor: 2, acceptDownloads: true })
  await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
  const page = await ctx.newPage()
  const calls = []
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    calls.push({ method: req.method(), path: new URL(req.url()).pathname, body: req.postData() })
    return mock.handle(route, role)
  })
  return { ctx, page, calls }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) })

async function main() {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    for (const width of [375, 1280]) {
      const tag = `${lang}-${width}`

      // ---- 1a. signup form
      for (const route of ['/register', '/accept-invite?token=abc', '/activate?token=abc']) {
        const { ctx, page, calls } = await open(browser, { authed: false, width, lang })
        await page.goto(BASE + route)
        const box = page.locator('input[type=checkbox]')
        await box.waitFor({ timeout: 8000 })
        const submit = page.locator('form button[type=submit]')
        const name = route.split('?')[0].slice(1)
        check(`${tag} ${name}: checkbox visible and unticked`, (await box.isVisible()) && !(await box.isChecked()))
        check(`${tag} ${name}: submit disabled until the checkbox is ticked`, await submit.isDisabled())
        const links = await page.locator('label[for] a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
        const expectTerms = lang === 'hr' ? 'uvjeti.html' : 'terms.html'
        const expectPrivacy = lang === 'hr' ? 'privatnost.html' : 'privacy.html'
        check(`${tag} ${name}: links to terms + privacy in ${lang}`, links.some((l) => l && l.endsWith(expectTerms)) && links.some((l) => l && l.endsWith(expectPrivacy)), JSON.stringify(links))
        check(`${tag} ${name}: links open in a new tab safely`, await page.locator('label[for] a[target=_blank][rel*=noopener]').count() === 2)
        const text = (await page.locator('label[for]').last().innerText()).trim()
        check(`${tag} ${name}: label text is translated (${lang})`, lang === 'hr' ? /Prihvaćam/.test(text) : /I accept/.test(text), text)
        await shot(page, `${tag}-${name}-unticked`)
        await box.check()
        check(`${tag} ${name}: submit enabled after ticking`, await submit.isEnabled())
        check(`${tag} ${name}: no horizontal overflow`, !(await overflow(page)))
        if (name === 'register') {
          await page.fill('#company_name', 'Test d.o.o.')
          await page.fill('#full_name', 'Ana Anić')
          await page.fill('#email', 'ana@test.hr')
          await page.fill('#password', 'Lozinka-123')
          await submit.click()
          await page.waitForTimeout(400)
          const post = calls.find((c) => c.path === '/api/signup')
          check(`${tag} register: accept_terms:true is sent to /api/signup`, post && JSON.parse(post.body).accept_terms === true, post && post.body)
        }
        await shot(page, `${tag}-${name}-ticked`)
        await ctx.close()
      }

      // ---- 1b. re-acceptance dialog
      mock.setLegalNeeded(true)
      {
        const { ctx, page, calls } = await open(browser, { width, lang })
        await page.goto(BASE + '/dashboard')
        const dialog = page.locator('[role=dialog]')
        await dialog.waitFor({ timeout: 8000 })
        check(`${tag} dialog: shown when acceptance is needed`, await dialog.isVisible())
        const dTitle = (await dialog.locator('h2').first().innerText()).trim()
        check(`${tag} dialog: translated title`, lang === 'hr' ? /Uvjeti korištenja/.test(dTitle) : /Terms and Privacy/.test(dTitle), dTitle)
        const accept = dialog.locator('button', { hasText: lang === 'hr' ? 'Prihvaćam i nastavljam' : 'Accept and continue' })
        check(`${tag} dialog: accept disabled until ticked`, await accept.isDisabled())
        await page.keyboard.press('Escape')
        await page.mouse.click(5, 5)
        await page.waitForTimeout(250)
        check(`${tag} dialog: Escape / click outside do not dismiss it`, await dialog.isVisible())
        check(`${tag} dialog: sign-out alternative is offered`, await dialog.locator('button', { hasText: lang === 'hr' ? 'Odjava' : 'Sign out' }).count() === 1)
        check(`${tag} dialog: no horizontal overflow`, !(await overflow(page)))
        await shot(page, `${tag}-dialog`)
        await dialog.locator('input[type=checkbox]').check()
        check(`${tag} dialog: accept enabled after ticking`, await accept.isEnabled())
        await accept.click()
        await page.waitForTimeout(500)
        check(`${tag} dialog: closes after accepting and POSTs /api/legal/accept`, (await dialog.count()) === 0 && calls.some((c) => c.method === 'POST' && c.path === '/api/legal/accept'))
        await ctx.close()
      }
      mock.setLegalNeeded(false)
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.goto(BASE + '/dashboard')
        await page.waitForTimeout(900)
        check(`${tag} dialog: not shown when everything is accepted`, (await page.locator('[role=dialog]').count()) === 0)
        await ctx.close()
      }
    }
  }
  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed  (screenshots: ${outDir})`)
  process.exit(failures ? 1 : 0)
}
main().catch((err) => { console.error(err); process.exit(1) })
