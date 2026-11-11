/* LANGUAGE SELECTION TEST (Playwright, API fully mocked - ../mobile-check/mock.cjs). Fresh browser context per scenario.
 * Checks: browser-locale detection, pre-login switch persistence, account-vs-device reconciliation after login (PUT /api/users/me/language),
 * Register sends `language`, and that no request is made to look up a language by e-mail before login.
 * Needs the dev server:  cd frontend && npx vite --port 5199 &
 * Usage:  NODE_PATH=$(npm root -g) node scripts/i18n-check/language-check.cjs <outDir outside repo>   (exit 1 on failure) */
const { chromium } = require('playwright')
const fs = require('fs')
const mock = require('../mobile-check/mock.cjs')

const outDir = process.argv[2] || '/tmp/lang-check'
fs.mkdirSync(outDir, { recursive: true })
const BASE = process.env.BASE || 'http://localhost:5199'
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

async function newScenario(browser, { locale, userLanguage, storage }) {
  mock.setAuthed(false)
  mock.setUserLanguage(userLanguage)
  const ctx = await browser.newContext({ locale, viewport: { width: 375, height: 812 } })
  if (storage) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) } }, storage)
  const page = await ctx.newPage()
  const requests = []
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    requests.push({ method: req.method(), path: url.pathname, body: req.postData() })
    if (req.method() === 'POST' && (url.pathname === '/api/login' || url.pathname === '/api/signup')) {
      mock.setAuthed(true)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: { global_role: 'user' } }) })
    }
    return mock.handle(route, 'admin')
  })
  return { ctx, page, requests }
}
const htmlLang = (page) => page.evaluate(() => document.documentElement.lang)
const puts = (requests) => requests.filter((r) => r.method === 'PUT' && r.path === '/api/users/me/language').map((r) => JSON.parse(r.body).language)
const loginTitle = (page) => page.locator('p.text-sm.text-slate-500').first().innerText()
const HR_TITLE = /Prijavite|Prijava/i

async function login(page) {
  await page.fill('#email', 'a@b.hr')
  await page.fill('#password', 'secret123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard/**', { timeout: 8000 })
  await page.waitForTimeout(600)
}

;(async () => {
  const browser = await chromium.launch()

  // 1. browser locale detection
  for (const [locale, expected] of [['hr-HR', 'hr'], ['en-US', 'en'], ['de-DE', 'en'], ['fr-FR', 'en'], ['bs-BA', 'hr'], ['sr-RS', 'hr']]) {
    const { ctx, page, requests } = await newScenario(browser, { locale })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    const lang = await htmlLang(page)
    const stored = await page.evaluate(() => localStorage.getItem('liftelo_language'))
    check(`locale ${locale} -> ${expected} (html lang=${lang})`, lang === expected)
    check(`  auto-detected language is NOT stored as explicit choice (${locale})`, stored === null)
    check(`  only login/check requests before login (${locale})`, requests.every((r) => r.path === '/api/login/check'), JSON.stringify([...new Set(requests.map((r) => r.path))]))
    if (locale === 'hr-HR' || locale === 'en-US') await page.screenshot({ path: `${outDir}/login-${expected}-from-${locale}.png` })
    await ctx.close()
  }

  // 2. toggle on login page persists after reload; flag set
  {
    const { ctx, page } = await newScenario(browser, { locale: 'en-US' })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await page.click('button[aria-label="Croatian"]')
    check('login toggle -> hr', (await htmlLang(page)) === 'hr')
    check('  localStorage liftelo_language=hr', (await page.evaluate(() => localStorage.getItem('liftelo_language'))) === 'hr')
    check('  sessionStorage pre-login flag=hr', (await page.evaluate(() => sessionStorage.getItem('liftelo_language_chosen_prelogin'))) === 'hr')
    check('  aria-pressed on HR', (await page.getAttribute('button[aria-label="Hrvatski"]', 'aria-pressed')) === 'true')
    await page.reload(); await page.waitForSelector('#email')
    check('  persists after reload', (await htmlLang(page)) === 'hr')
    const box = await page.locator('button[aria-pressed]').first().boundingBox()
    check('  touch target >= 44px', box.width >= 44 && box.height >= 44, `${box.width}x${box.height}`)
    await ctx.close()
  }

  // 3. account en, device hr (browser hr, no explicit choice) -> English after login, no PUT
  {
    const { ctx, page, requests } = await newScenario(browser, { locale: 'hr-HR', userLanguage: 'en' })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    check('device hr before login', (await htmlLang(page)) === 'hr')
    await login(page)
    check('account en, no explicit choice -> English after login', (await htmlLang(page)) === 'en')
    check('  localStorage written = en', (await page.evaluate(() => localStorage.getItem('liftelo_language'))) === 'en')
    check('  no PUT language', puts(requests).length === 0, JSON.stringify(puts(requests)))
    await page.screenshot({ path: `${outDir}/after-login-account-en.png` })
    await ctx.close()
  }

  // 4. explicit pre-login choice hr, account en -> PUT hr, stays Croatian, flag cleared
  {
    const { ctx, page, requests } = await newScenario(browser, { locale: 'en-US', userLanguage: 'en' })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await page.click('button[aria-label="Croatian"]')
    await login(page)
    check('explicit pre-login hr vs account en -> stays Croatian', (await htmlLang(page)) === 'hr')
    check('  exactly one PUT with hr', JSON.stringify(puts(requests)) === '["hr"]', JSON.stringify(puts(requests)))
    check('  flag cleared', (await page.evaluate(() => sessionStorage.getItem('liftelo_language_chosen_prelogin'))) === null)
    await page.reload(); await page.waitForTimeout(800)
    check('  reload keeps hr, no second PUT', (await htmlLang(page)) === 'hr' && puts(requests).length === 1, JSON.stringify(puts(requests)))
    await ctx.close()
  }

  // 4b. explicit pre-login choice equals account language -> no PUT
  {
    const { ctx, page, requests } = await newScenario(browser, { locale: 'en-US', userLanguage: 'hr' })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await page.click('button[aria-label="Croatian"]')
    await login(page)
    check('pre-login hr == account hr -> no PUT', (await htmlLang(page)) === 'hr' && puts(requests).length === 0, JSON.stringify(puts(requests)))
    await ctx.close()
  }

  // 5. account language NULL -> PUT with current language once
  {
    const { ctx, page, requests } = await newScenario(browser, { locale: 'hr-HR', userLanguage: null })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await login(page)
    check('account NULL -> app keeps device language hr', (await htmlLang(page)) === 'hr')
    check('  one PUT with hr', JSON.stringify(puts(requests)) === '["hr"]', JSON.stringify(puts(requests)))
    await ctx.close()
  }

  // 6. logged-in switcher (AppLayout): applies, stores, PUT, no flag
  {
    const { ctx, page, requests } = await newScenario(browser, { locale: 'en-US', userLanguage: 'en' })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await login(page)
    await page.locator('header button').last().click() // account menu (avatar), language is a radio group inside it
    await page.click('[role=menuitemradio]:has-text("Croatian")')
    await page.waitForTimeout(500)
    check('AppLayout switch -> hr applied', (await htmlLang(page)) === 'hr')
    check('  PUT hr', JSON.stringify(puts(requests)) === '["hr"]', JSON.stringify(puts(requests)))
    check('  localStorage hr, no pre-login flag', (await page.evaluate(() => localStorage.getItem('liftelo_language') + '|' + sessionStorage.getItem('liftelo_language_chosen_prelogin'))) === 'hr|null')
    await page.screenshot({ path: `${outDir}/applayout-hr.png` })
    await ctx.close()
  }

  // 7. Register sends language; screenshots of Login/Register in both languages
  for (const lang of ['en', 'hr']) {
    const { ctx, page, requests } = await newScenario(browser, { locale: lang === 'hr' ? 'hr-HR' : 'en-US', userLanguage: undefined })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await page.screenshot({ path: `${outDir}/login-${lang}-375.png`, fullPage: true })
    await page.goto(BASE + '/register'); await page.waitForSelector('#company_name')
    await page.screenshot({ path: `${outDir}/register-${lang}-375.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    check(`register page ${lang} no horizontal overflow at 375px`, !overflow)
    if (lang === 'en') await page.click('button[aria-label="Croatian"]') // switch on register page to hr, request must say hr
    await page.fill('#company_name', 'Test d.o.o.'); await page.fill('#full_name', 'Test User'); await page.fill('#email', 'new@test.hr'); await page.fill('#password', 'password123')
    mock.setUserLanguage(undefined)
    await page.check('form input[type=checkbox]') // accept the terms (required since the legal consent step)
    await page.click('button[type=submit]')
    await page.waitForURL('**/dashboard/**', { timeout: 8000 })
    const signup = requests.find((r) => r.path === '/api/signup')
    const expected = lang === 'en' ? 'hr' : 'hr'
    check(`register (${lang} page${lang === 'en' ? ', switched to hr' : ''}) sends language=${expected}`, signup && JSON.parse(signup.body).language === expected, signup && signup.body.replace(/"password":"[^"]*"/, '"password":"***"'))
    await ctx.close()
  }
  {
    const { ctx, page, requests } = await newScenario(browser, { locale: 'de-DE' })
    await page.goto(BASE + '/register'); await page.waitForSelector('#company_name')
    await page.fill('#company_name', 'T'); await page.fill('#full_name', 'T'); await page.fill('#email', 'n@t.hr'); await page.fill('#password', 'password123')
    await page.check('form input[type=checkbox]')
    await page.click('button[type=submit]'); await page.waitForURL('**/dashboard/**', { timeout: 8000 })
    check('register on de-DE device sends language=en', JSON.parse(requests.find((r) => r.path === '/api/signup').body).language === 'en')
    await ctx.close()
  }

  // 8. switcher on the other public pages
  for (const route of ['/activate?token=abc', '/accept-invite?token=abc']) {
    const { ctx, page } = await newScenario(browser, { locale: 'en-US' })
    await page.goto(BASE + route); await page.waitForSelector('button[aria-pressed]')
    await page.click('button[aria-label="Croatian"]')
    check(`${route} has working switcher`, (await htmlLang(page)) === 'hr')
    await page.screenshot({ path: `${outDir}/${route.split('?')[0].slice(1)}-hr.png` })
    check(`  no overflow at 375px`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))
    await ctx.close()
  }

  await browser.close()
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
  process.exit(failures ? 1 : 0)
})()
