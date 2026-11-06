/* LEGAL / GDPR UI TEST (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port <PORT> &
 * Usage:  BASE=http://localhost:5603 NODE_PATH=$(npm root -g) node scripts/mobile-check/legal-check.cjs <outDir outside repo>   (exit 1 on failure)
 * Runs in en + hr at 375 and 1280 px and saves a screenshot per state. Sections:
 *   1. acceptance checkbox on /register, /accept-invite, /activate (button disabled until ticked, accept_terms sent, links), blocking
 *      re-acceptance dialog (cannot be dismissed, sign-out alternative, accept closes it)
 *   2. company data export card in Settings (admin only; download, cooldown, files too large; technician sees nothing)
 *   3. Users page: erase a leaver (dialog, placeholder row, POST /anonymize); Profile: download my data + legal links
 * (later steps add: personal data download, remove/anonymise user, superadmin closure) */
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

      // ---- 2. company data export card (Settings, admin only)
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.goto(BASE + '/dashboard/settings')
        const card = page.locator('#data-export')
        await card.waitFor({ timeout: 8000 })
        await card.scrollIntoViewIfNeeded()
        const title = (await card.locator('h2').innerText()).trim()
        check(`${tag} export: card shown to admin with translated title`, lang === 'hr' ? /Izvoz podataka/.test(title) : /Export company data/.test(title), title)
        const info = (await card.getByTestId('export-files-info').innerText()).trim()
        check(`${tag} export: shows file count and size`, /12/.test(info) && /38/.test(info), info)
        const btn = card.locator('button')
        check(`${tag} export: download button enabled`, await btn.isEnabled())
        check(`${tag} export: no horizontal overflow`, !(await overflow(page)))
        await shot(page, `${tag}-export-card`)
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), btn.click()])
        check(`${tag} export: click starts a browser download of GET /api/company/export`, Boolean(download) && new URL(download.url()).pathname === '/api/company/export', download && download.url())
        await ctx.close()
      }
      mock.setExportState({ allowed: false, retry_after_seconds: 420, files: { included: false } })
      {
        const { ctx, page } = await open(browser, { width, lang })
        await page.goto(BASE + '/dashboard/settings')
        const card = page.locator('#data-export')
        await card.waitFor({ timeout: 8000 })
        await card.scrollIntoViewIfNeeded()
        const cool = (await card.getByTestId('export-cooldown').innerText()).trim()
        check(`${tag} export: cooldown text in ${lang}`, lang === 'hr' ? /7 minuta/.test(cool) : /7 minutes/.test(cool), cool)
        check(`${tag} export: button disabled during the cooldown`, await card.locator('button').isDisabled())
        const info = (await card.getByTestId('export-files-info').innerText()).trim()
        check(`${tag} export: too-large files are only listed`, lang === 'hr' ? /samo je navedeno|samo su navedene|samo je navedena/.test(info) : /only listed/.test(info), info)
        await shot(page, `${tag}-export-cooldown`)
        await ctx.close()
      }
      mock.setExportState({ allowed: true, retry_after_seconds: 0, files: { included: true } })
      {
        const { ctx, page } = await open(browser, { role: 'technician', width, lang })
        await page.goto(BASE + '/dashboard/settings')
        await page.waitForTimeout(900)
        check(`${tag} export: technician does not get the card`, (await page.locator('#data-export').count()) === 0)
        await ctx.close()
      }

      // ---- 3. personal data: erase a leaver (Users page, admin) + download my data (Profile)
      {
        const { ctx, page, calls } = await open(browser, { width, lang })
        const rows = [
          { id: 1, email: 'ja.admin@primjer.hr', role: 'admin', is_active: 1 },
          { id: 2, email: 'odlazi@primjer.hr', role: 'technician', is_active: 1 },
          { id: 9, email: 'removed-user-9@anonymized.invalid', role: 'technician', is_active: 0 },
        ]
        await page.route('**/api/companies/*/users', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }))
        await page.goto(BASE + '/dashboard/users')
        const erasedRow = page.locator('tr', { hasText: lang === 'hr' ? 'Bivši korisnik #9' : 'Former user #9' })
        await erasedRow.waitFor({ timeout: 8000 })
        check(`${tag} erase: anonymised member shows the placeholder, not an e-mail`, (await page.locator('tr', { hasText: 'anonymized.invalid' }).count()) === 0)
        check(`${tag} erase: anonymised member has no action buttons`, (await erasedRow.locator('button').count()) === 0)
        const leaverRow = page.locator('tr', { hasText: 'odlazi@primjer.hr' })
        const eraseLabel = lang === 'hr' ? 'Izbriši osobne podatke' : 'Erase personal data'
        const eraseBtn = leaverRow.locator('button', { hasText: eraseLabel })
        check(`${tag} erase: button on other members, disabled on yourself`, (await eraseBtn.isEnabled())
          && (await page.locator('tr', { hasText: 'ja.admin@primjer.hr' }).locator('button', { hasText: eraseLabel }).isDisabled()))
        check(`${tag} erase: no horizontal overflow`, !(await overflow(page)))
        await eraseBtn.click()
        const dlg = page.locator('[role=dialog]')
        await dlg.waitFor({ timeout: 5000 })
        const dlgText = await dlg.innerText()
        check(`${tag} erase: dialog explains the effect in ${lang}`, lang === 'hr' ? /Izbrisati osobne podatke\?/.test(dlgText) && /Bivši korisnik/.test(dlgText) && /ne može poništiti/.test(dlgText)
          : /Erase personal data\?/.test(dlgText) && /Former user/.test(dlgText) && /cannot be undone/.test(dlgText), dlgText.slice(0, 120))
        await shot(page, `${tag}-erase-dialog`)
        await dlg.locator('button', { hasText: lang === 'hr' ? 'Odustani' : 'Cancel' }).click()
        await page.waitForTimeout(300)
        check(`${tag} erase: cancel closes the dialog and sends nothing`, (await dlg.count()) === 0 && !calls.some((c) => c.path.endsWith('/anonymize')))
        await eraseBtn.click()
        await dlg.locator('button.bg-rose-600').click()
        await page.waitForTimeout(500)
        const post = calls.find((c) => c.method === 'POST' && c.path === '/api/users/2/anonymize')
        check(`${tag} erase: confirm POSTs /api/users/2/anonymize with confirm:true`, post && JSON.parse(post.body).confirm === true, post && post.body)
        check(`${tag} erase: row turns into the placeholder`, (await page.locator('tr', { hasText: lang === 'hr' ? 'Bivši korisnik #2' : 'Former user #2' }).count()) === 1)
        await ctx.close()
      }
      {
        const { ctx, page } = await open(browser, { role: 'technician', width, lang })
        await page.goto(BASE + '/dashboard/profile')
        const card = page.locator('#my-data')
        await card.waitFor({ timeout: 8000 })
        check(`${tag} my data: card on the profile of a non-admin too`, await card.isVisible())
        const links = await card.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
        check(`${tag} my data: terms + privacy links in ${lang}`, links.some((l) => l && l.endsWith(lang === 'hr' ? 'uvjeti.html' : 'terms.html')) && links.some((l) => l && l.endsWith(lang === 'hr' ? 'privatnost.html' : 'privacy.html')), JSON.stringify(links))
        check(`${tag} my data: no horizontal overflow`, !(await overflow(page)))
        await shot(page, `${tag}-my-data`)
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), card.locator('button').click()])
        check(`${tag} my data: button downloads a file`, Boolean(download))
        await ctx.close()
      }
    }
  }
  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed  (screenshots: ${outDir})`)
  process.exit(failures ? 1 : 0)
}
main().catch((err) => { console.error(err); process.exit(1) })
