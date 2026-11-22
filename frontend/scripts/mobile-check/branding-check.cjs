/* COMPANY BRANDING TEST (Settings -> Branding card: logo + accent colour for PDFs). Playwright + mocked API (mock.cjs: /company with
 * logo_path + brand_accent_color, POST/DELETE /company/logo, PUT /company/branding).
 *   cd frontend && npx vite --port 5621 --strictPort &
 *   BASE=http://localhost:5621 node scripts/mobile-check/branding-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: admin sees the card (translated, no horizontal overflow), logo choose -> preview -> upload -> shown, rejects a non-PNG/JPEG and a
 * > 1 MB file on the client, "Remove logo", accent colour (hex field + presets, invalid value blocks saving with a message, save sends the
 * normalised value, reset sends null), live preview uses the colour; technician / viewer cannot reach the card (admin-only page). */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/branding-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5621'
fs.mkdirSync(outDir, { recursive: true })
const B = require(`../../src/locales/${lang}/branding.json`)
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetBranding()
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
      userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
    })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.tsqd-parent-container{display:none!important}'
      document.head.appendChild(style)
    }))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    await page.route('**/api/**', (route) => mock.handle(route, role))
    // the (mocked) uploads folder answers 404 by default: serve a real PNG for the company logo
    await page.route('**/api/uploads/company-logos/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${role}_${name}.png`), fullPage: true })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`${role}: no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    return { ctx, page, shot, overflow }
  }

  // ============================== ADMIN
  {
    const { ctx, page, shot, overflow } = await session('admin')
    await page.goto(BASE + '/dashboard/settings', { waitUntil: 'networkidle' })
    const card = page.locator('[data-testid=branding-card]')
    await card.waitFor({ timeout: 8000 })
    check('Branding card is visible with the translated title and description', (await card.innerText()).includes(B.title) && (await card.innerText()).includes(B.description))
    check('no logo yet: placeholder text is shown, "Remove logo" is disabled', (await card.innerText()).includes(B.logo.none) && await page.locator('[data-testid=branding-logo-remove]').isDisabled())
    check('"Upload logo" is disabled until a file is chosen', await page.locator('[data-testid=branding-logo-upload]').isDisabled())
    check('the old duplicate logo block is gone from the company card (one logo input only)', await page.locator('input[type=file]').count() === 1)
    check('hint and signed-documents note are translated', (await card.innerText()).includes(B.logo.hint) && (await card.innerText()).includes(B.signedNote))
    await overflow('settings')
    await shot('initial')

    // client-side rejections
    const input = page.locator('[data-testid=branding-logo-input]')
    await input.setInputFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a0000000000') })
    await page.waitForSelector(`text=${B.errors.type}`, { timeout: 4000 }).then(() => check('a GIF is rejected with the translated message', true), () => check('a GIF is rejected with the translated message', false))
    check('...and nothing is selected for upload', await page.locator('[data-testid=branding-logo-upload]').isDisabled())
    await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(1.2 * 1024 * 1024)]) })
    await page.waitForSelector(`text=${B.errors.size}`, { timeout: 4000 }).then(() => check('a file over 1 MB is rejected with the translated message', true), () => check('a file over 1 MB is rejected with the translated message', false))

    // upload
    await input.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
    await page.waitForSelector('[data-testid=branding-logo-img]', { timeout: 4000 })
    check('chosen PNG is previewed and "Upload logo" is enabled', await page.locator('[data-testid=branding-logo-upload]').isEnabled())
    await page.locator('[data-testid=branding-logo-upload]').click()
    await sleep(600)
    check('upload request was sent', mock.pushCalls().includes('logo:upload'))
    check('after upload the stored logo (from /api/uploads) is shown and "Remove logo" is enabled', await page.locator('[data-testid=branding-logo-img]').count() >= 1 && await page.locator('[data-testid=branding-logo-remove]').isEnabled())
    const src = await page.locator('[data-testid=branding-logo-img]').first().getAttribute('src')
    check('logo src points to the company-scoped upload path', /\/uploads\/company-logos\/1-/.test(src || ''), src)
    await shot('logo_uploaded')

    // accent colour
    const hex = page.locator('[data-testid=branding-accent-hex]')
    const save = page.locator('[data-testid=branding-accent-save]')
    check('save is disabled while the colour is unchanged', await save.isDisabled())
    await hex.fill('red')
    check('invalid colour: message shown, save disabled', await page.locator('[data-testid=branding-accent-error]').innerText() === B.accent.invalid && await save.isDisabled())
    await hex.fill('#12345')
    check('5 digits is invalid too', await save.isDisabled())
    await hex.fill('#b91c1c')
    check('valid colour enables save, error gone', await save.isEnabled() && await page.locator('[data-testid=branding-accent-error]').count() === 0)
    const titleColor = await page.locator('[data-testid=branding-preview-title]').evaluate((el) => getComputedStyle(el).color)
    check('live preview heading uses the colour (rgb 185,28,28)', titleColor === 'rgb(185, 28, 28)', titleColor)
    await shot('colour_typed')
    await save.click()
    await sleep(600)
    check('save sent the normalised (upper-case) value', mock.pushCalls().includes('accent:#B91C1C'), JSON.stringify(mock.pushCalls()))
    check('after saving the field shows the saved value and save is disabled again', (await hex.inputValue()).toUpperCase() === '#B91C1C' && await save.isDisabled())
    await page.locator('[role=group] button').nth(1).click() // a preset (#0F766E)
    check('a preset fills the field', (await hex.inputValue()) === '#0F766E')
    await save.click()
    await sleep(500)
    check('preset saved', mock.pushCalls().includes('accent:#0F766E'))
    await page.locator('[data-testid=branding-accent-reset]').click()
    await sleep(500)
    check('"Use default colour" sends null and clears the field', mock.pushCalls().includes('accent:null') && (await hex.inputValue()) === '')
    const defaultColor = await page.locator('[data-testid=branding-preview-title]').evaluate((el) => getComputedStyle(el).color)
    check('preview falls back to the default dark heading colour', defaultColor === 'rgb(17, 24, 39)', defaultColor)

    // remove logo
    await page.locator('[data-testid=branding-logo-remove]').click()
    await sleep(500)
    check('remove sent; placeholder is back and "Remove logo" disabled again', mock.pushCalls().includes('logo:remove') && (await card.innerText()).includes(B.logo.none) && await page.locator('[data-testid=branding-logo-remove]').isDisabled())
    await overflow('settings after changes')
    await shot('after')
    await ctx.close()
  }

  // ============================== PRE-EXISTING BRANDING IS SHOWN
  {
    const { ctx, page } = await session('admin')
    mock.setBrand({ logo_path: '/uploads/company-logos/1-1700000000000-abcdef123456.png', accent: '#15803D' })
    await page.goto(BASE + '/dashboard/settings', { waitUntil: 'networkidle' })
    await page.locator('[data-testid=branding-card]').waitFor({ timeout: 8000 })
    check('saved logo and colour are loaded into the card', await page.locator('[data-testid=branding-logo-img]').count() >= 1 && (await page.locator('[data-testid=branding-accent-hex]').inputValue()) === '#15803D')
    await ctx.close()
  }

  // ============================== NON-ADMINS
  for (const role of ['technician', 'viewer']) {
    const { ctx, page, shot } = await session(role)
    await page.goto(BASE + '/dashboard/settings', { waitUntil: 'networkidle' })
    await sleep(500)
    check(`${role}: no Branding card (settings is admin-only)`, await page.locator('[data-testid=branding-card]').count() === 0)
    await shot('settings')
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})()
