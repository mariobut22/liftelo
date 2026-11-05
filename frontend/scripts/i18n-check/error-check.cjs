/* API ERROR TRANSLATION TEST (Playwright, API fully mocked - ../mobile-check/mock.cjs). Needs the dev server:
 *   cd frontend && npx vite --port 5199 &
 * Usage:  NODE_PATH=$(npm root -g) node scripts/i18n-check/error-check.cjs <outDir outside repo>   (exit 1 on failure)
 * Checks, in en and hr:
 *  1. EVERY code in src/locales/<lang>/common.json apiErrors.codes: an error response `{ error: <raw text in the OTHER language>, code }`
 *     shows exactly the translated message (never the raw backend text)
 *  2. responses WITHOUT a code / with an unknown code / non-JSON bodies / HTTP 5xx / network failure show the translated generic or network message
 *  3. role_limit_reached interpolation, 401/402/403 special paths, ApiError.status/code
 *  4. UI level: login and register forms show the translated message for a coded error and the generic form message otherwise
 *  4b. downloadApiFile (Excel export) error/success paths
 *  5. every backend `code: '...'` literal has a translation (backend/utils is scanned for codes) */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('../mobile-check/mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5199'
const outDir = process.argv[2] || '/tmp/error-check'
fs.mkdirSync(outDir, { recursive: true })
const SRC = path.join(__dirname, '..', '..', 'src')
const BACKEND = path.join(__dirname, '..', '..', '..', 'backend')
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) { failures += 1; console.log(`FAIL  ${name}${extra ? '  ' + extra : ''}`) } return ok }
let passes = 0
const pass = (name, ok, extra) => { if (check(name, ok, extra)) passes += 1 }

const load = (lang) => JSON.parse(fs.readFileSync(path.join(SRC, 'locales', lang, 'common.json'), 'utf8')).apiErrors

// 5. backend codes vs translations
const backendCodes = new Set()
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'uploads' && e.name !== 'public') walk(p) } else if (e.name.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bcode:\s*'([a-z_]+)'/g)) backendCodes.add(m[1]) } }
for (const d of ['routes', 'utils']) walk(path.join(BACKEND, d))
backendCodes.add('not_found'); backendCodes.add('request_too_large')
for (const lang of ['en', 'hr']) {
  const codes = load(lang).codes
  const missing = [...backendCodes].filter((c) => !codes[c])
  pass(`[${lang}] all ${backendCodes.size} backend codes are translated`, missing.length === 0, missing.join(','))
}

;(async () => {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    const other = lang === 'en' ? 'hr' : 'en'
    const tr = load(lang)
    const rawText = lang === 'en' ? 'Greška pri dohvaćanju podataka' : 'Failed to load data'
    mock.setAuthed(false)
    const ctx = await browser.newContext({ locale: lang === 'hr' ? 'hr-HR' : 'en-US', viewport: { width: 375, height: 812 } })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    const page = await ctx.newPage()
    let scripted = null // { status, body, contentType } | 'abort'
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/api/__test__')) {
        if (scripted === 'abort') return route.abort('failed')
        return route.fulfill({ status: scripted.status, contentType: scripted.contentType || 'application/json', body: scripted.body })
      }
      if (route.request().method() === 'POST' && (url.pathname === '/api/login' || url.pathname === '/api/signup') && scripted && scripted.ui) {
        return route.fulfill({ status: scripted.status, contentType: 'application/json', body: scripted.body })
      }
      return mock.handle(route, 'admin')
    })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await page.evaluate(async (l) => { const i = (await import('/src/i18n.ts')).default; await i.changeLanguage(l) }, lang)

    const call = (resp) => { scripted = resp; return page.evaluate(async () => {
      const { apiFetch, ApiError } = await import('/src/services/api.ts')
      try { await apiFetch('/api/__test__'); return { ok: true } } catch (e) { return { ok: false, message: e.message, status: e.status, code: e.code, isApiError: e instanceof ApiError } }
    }) }

    // 1. every code
    for (const [code, expected] of Object.entries(tr.codes)) {
      const status = code === 'not_authenticated' || code === 'session_expired' || code === 'invalid_credentials' ? 401 : code === 'viewer_read_only' || code === 'forbidden' ? 403 : code === 'subscription_locked' || code === 'service_disabled_technician' ? 402 : code === 'role_limit_reached' ? 409 : 400
      const r = await call({ status, body: JSON.stringify({ error: rawText, code }) })
      let want = expected
      if (status === 401 && !tr.codes[code]) want = tr.codes.not_authenticated
      if (code === 'subscription_locked') want = expected
      pass(`[${lang}] code ${code} -> translated`, r.message === want, `got "${r.message}"`)
      pass(`[${lang}] code ${code} never shows raw backend text`, !r.message.includes(rawText.slice(0, 8)))
      pass(`[${lang}] code ${code} keeps status/code on ApiError`, r.isApiError && r.status === status && (r.code === code || (code === 'subscription_locked' && r.code === code)))
    }
    // 2. generic cases
    const generic = tr.generic
    for (const [name, resp] of [
      ['no code, 400', { status: 400, body: JSON.stringify({ error: rawText }) }],
      ['no code, 500 (Database error)', { status: 500, body: JSON.stringify({ error: 'Database error' }) }],
      ['unknown code', { status: 400, body: JSON.stringify({ error: rawText, code: 'some_future_code' }) }],
      ['non-JSON 502 html', { status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }],
      ['empty 500', { status: 500, body: '' }],
      ['404 message-only body', { status: 404, body: JSON.stringify({ message: 'Not found' }) }],
      ['403 without code', { status: 403, body: JSON.stringify({ error: rawText }) }],
      ['invalid JSON on 200', { status: 200, body: 'not json' }],
    ]) {
      const r = await call(resp)
      pass(`[${lang}] ${name} -> generic translated`, r.ok === false && r.message === generic, `got "${r.message}"`)
    }
    const net = await call('abort')
    pass(`[${lang}] network failure -> translated network message`, net.message === tr.network && net.status === 0, `got "${net.message}"`)
    // success path untouched
    const okRes = await call({ status: 200, body: JSON.stringify({ a: 1 }) })
    pass(`[${lang}] success response passes through`, okRes.ok === true)
    // downloads (Excel export): failures must be a translated ApiError, success must download
    const dl = (resp) => { scripted = resp; return page.evaluate(async () => {
      const { downloadApiFile } = await import('/src/services/api.ts')
      try { await downloadApiFile('/api/__test__', 'fallback.xlsx'); return { ok: true } } catch (e) { return { ok: false, message: e.message, status: e.status, code: e.code } }
    }) }
    const dlErr = await dl({ status: 403, body: JSON.stringify({ error: 'Forbidden', code: 'forbidden' }) })
    pass(`[${lang}] download error -> translated by code`, dlErr.message === tr.codes.forbidden && dlErr.status === 403, dlErr.message)
    const dlGen = await dl({ status: 500, body: JSON.stringify({ error: 'Failed to export RMS overview' }) })
    pass(`[${lang}] download error without code -> generic`, dlGen.message === tr.generic, dlGen.message)
    const dlNet = await dl('abort')
    pass(`[${lang}] download network failure -> network message`, dlNet.message === tr.network, dlNet.message)
    scripted = { status: 200, contentType: 'application/octet-stream', body: 'xlsx-bytes' }
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.evaluate(async () => { const { downloadApiFile } = await import('/src/services/api.ts'); await downloadApiFile('/api/__test__', 'fallback.xlsx') })])
    pass(`[${lang}] download success triggers a file download`, !!download && download.suggestedFilename() === 'fallback.xlsx', download && download.suggestedFilename())
    // 3. role limit with params
    const rl = await call({ status: 409, body: JSON.stringify({ error: 'Role limit reached for admin', code: 'role_limit_reached', role: 'admin', limit: 1, used: 1, pending_invites: 0 }) })
    pass(`[${lang}] role_limit_reached interpolated`, rl.message === tr.roleLimitReachedFor.admin.replace('{{used}}', '1').replace('{{limit}}', '1'), rl.message)
    const rl2 = await call({ status: 409, body: JSON.stringify({ error: 'x', code: 'role_limit_reached' }) })
    pass(`[${lang}] role_limit_reached without params -> code message`, rl2.message === tr.codes.role_limit_reached)
    // the other language's text must not appear for any code
    const otherCodes = load(other).codes
    const leaks = Object.keys(tr.codes).filter((c) => tr.codes[c] === otherCodes[c] && !/^(upload_failed)$/.test(c))
    pass(`[${lang}] no code text identical to the other language`, leaks.length === 0, leaks.join(','))

    // 4. UI level
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    await page.evaluate(async (l) => { const i = (await import('/src/i18n.ts')).default; await i.changeLanguage(l) }, lang)
    const loginAttempt = async (resp) => {
      scripted = { ...resp, ui: true }
      await page.fill('#email', 'a@b.hr'); await page.fill('#password', 'secret123')
      await page.click('button[type=submit]')
      await page.waitForTimeout(700)
      return page.locator('.bg-rose-50').allInnerTexts()
    }
    let texts = await loginAttempt({ status: 401, body: JSON.stringify({ error: 'Invalid username or password', code: 'invalid_credentials' }) })
    pass(`[${lang}] login form shows translated invalid_credentials`, texts.some((t) => t.includes(tr.codes.invalid_credentials)), JSON.stringify(texts))
    await page.screenshot({ path: `${outDir}/login-error-${lang}.png` })
    await page.goto(BASE + '/login'); await page.waitForSelector('#email')
    texts = await loginAttempt({ status: 500, body: JSON.stringify({ error: 'Greška na serveru.' }) })
    pass(`[${lang}] login form never shows raw backend text`, !texts.some((t) => t.includes('Greška na serveru') || t.includes('Server error')), JSON.stringify(texts))
    await page.goto(BASE + '/register'); await page.waitForSelector('form')
    await page.evaluate(async (l) => { const i = (await import('/src/i18n.ts')).default; await i.changeLanguage(l) }, lang)
    scripted = { status: 409, ui: true, body: JSON.stringify({ error: 'Email already exists', code: 'email_exists' }) }
    const inputs = page.locator('form input')
    const n = await inputs.count()
    for (let i = 0; i < n; i += 1) { const type = await inputs.nth(i).getAttribute('type'); await inputs.nth(i).fill(type === 'email' ? 'a@b.hr' : type === 'password' ? 'secret123' : 'Test') }
    await page.click('form button[type=submit]')
    await page.waitForTimeout(700)
    const reg = (await page.locator('form').innerText())
    pass(`[${lang}] register form shows translated email_exists`, reg.includes(tr.codes.email_exists), reg.slice(0, 200).replace(/\n/g, ' | '))
    await page.screenshot({ path: `${outDir}/register-error-${lang}.png` })
    await ctx.close()
  }
  await browser.close()
  console.log(`\n${passes} checks passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
