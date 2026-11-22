/* PUSH NOTIFICATIONS TOGGLE TEST (Profile -> "Push notifications on this device"). Playwright + mocked API (mock.cjs /push/*) and a
 * MOCKED browser push stack (Notification, PushManager, navigator.serviceWorker registration) - no real push service is involved.
 *   cd frontend && npx vite --port 5621 --strictPort &
 *   BASE=http://localhost:5621 node scripts/mobile-check/push-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: card hidden while the server has push disabled; unsupported browser; iOS outside the home-screen PWA (caveat text); permission
 * denied (blocked hint, switch disabled); off -> enable (permission prompt, subscribe call, server subscribe) -> on -> test push -> disable
 * (browser unsubscribe + server unsubscribe); user refuses the prompt; an existing subscription is shown as on.
 * NOT covered (needs real devices): the actual delivery of a push, the service worker push/notificationclick handlers, iOS behaviour. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/push-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5621'
fs.mkdirSync(outDir, { recursive: true })
const P = require(`../../src/locales/${lang}/push.json`)
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// installed in every page BEFORE the app runs. opts: {support, permission, existing, grant}
const FAKE_PUSH = (opts) => {
  if (opts.support === 'none') {
    delete window.PushManager
    delete window.Notification
    return
  }
  window.__push = { subscribed: opts.existing, subscribeCalls: 0, unsubscribeCalls: 0 }
  window.PushManager = window.PushManager || function PushManager() {}
  let permission = opts.permission
  window.Notification = {
    get permission() { return permission },
    requestPermission: async () => { permission = opts.grant ? 'granted' : 'denied'; return permission },
  }
  const subscription = () => ({
    endpoint: 'https://push.example.test/send/abc',
    toJSON: () => ({ endpoint: 'https://push.example.test/send/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4', auth: 'tBHItJI5svbpez7KI4CCXg' } }),
    unsubscribe: async () => { window.__push.subscribed = false; window.__push.unsubscribeCalls += 1; return true },
  })
  const registration = {
    pushManager: {
      getSubscription: async () => (window.__push.subscribed ? subscription() : null),
      subscribe: async (o) => { window.__push.subscribeCalls += 1; window.__push.lastKeyLength = o.applicationServerKey.length; window.__push.userVisibleOnly = o.userVisibleOnly; window.__push.subscribed = true; return subscription() },
    },
  }
  const sw = { getRegistration: async () => registration, ready: Promise.resolve(registration), addEventListener() {}, controller: null }
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })
}

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session({ pushEnabled = true, role = 'admin', ios = false, ...fake }) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetPush(pushEnabled)
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
      userAgent: ios ? devices['iPhone 13'].userAgent : width < 1024 ? devices['Pixel 7'].userAgent : undefined,
    })
    await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
    await ctx.addInitScript(FAKE_PUSH, { support: 'full', permission: 'default', existing: false, grant: true, ...fake })
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.tsqd-parent-container{display:none!important}'
      document.head.appendChild(style)
    }))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    await page.route('**/api/**', (route) => mock.handle(route, role))
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${tag}_${name}.png`), fullPage: true })
    const overflow = async (name) => {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`no horizontal overflow on ${name}`, o <= 1, String(o))
    }
    await page.goto(BASE + '/dashboard/profile', { waitUntil: 'networkidle' })
    await sleep(500)
    return { ctx, page, shot, overflow }
  }
  const stateOf = (page) => page.locator('[data-testid=push-card]').getAttribute('data-push-state')

  // server has push disabled -> nothing at all
  {
    const { ctx, page } = await session({ pushEnabled: false })
    check('server push disabled: card is hidden', await page.locator('[data-testid=push-card]').count() === 0)
    await ctx.close()
  }
  // unsupported browser
  {
    const { ctx, page, shot } = await session({ support: 'none' })
    await page.locator('[data-testid=push-card]').waitFor({ timeout: 5000 })
    check('no PushManager/Notification: state "unsupported", translated hint, switch disabled', await stateOf(page) === 'unsupported'
      && (await page.locator('[data-testid=push-hint]').innerText()) === P.hint.unsupported && await page.locator('[data-testid=push-switch]').isDisabled())
    await shot('unsupported')
    await ctx.close()
  }
  // iOS in the browser (not installed)
  {
    const { ctx, page, shot } = await session({ ios: true })
    await page.locator('[data-testid=push-card]').waitFor({ timeout: 5000 })
    check('iOS outside the home-screen app: caveat text, switch disabled', await stateOf(page) === 'ios_install'
      && (await page.locator('[data-testid=push-hint]').innerText()) === P.hint.ios && await page.locator('[data-testid=push-switch]').isDisabled())
    await shot('ios')
    await ctx.close()
  }
  // permission denied
  {
    const { ctx, page, shot } = await session({ permission: 'denied' })
    await page.locator('[data-testid=push-card]').waitFor({ timeout: 5000 })
    check('permission denied: state "denied", how-to-unblock hint, switch disabled', await stateOf(page) === 'denied'
      && (await page.locator('[data-testid=push-hint]').innerText()) === P.hint.denied && await page.locator('[data-testid=push-switch]').isDisabled())
    await shot('denied')
    await ctx.close()
  }
  // full flow
  {
    const { ctx, page, shot, overflow } = await session({})
    const sw = page.locator('[data-testid=push-switch]')
    await page.locator('[data-testid=push-card]').waitFor({ timeout: 5000 })
    check('initial: off, texts translated, no hint, no test button', await stateOf(page) === 'off' && (await page.locator('[data-testid=push-state]').innerText()) === P.state.off
      && (await page.locator('[data-testid=push-card]').innerText()).includes(P.title) && await page.locator('[data-testid=push-hint]').count() === 0
      && await page.locator('[data-testid=push-test]').count() === 0 && (await sw.getAttribute('aria-checked')) === 'false')
    check('nothing was subscribed on load (permission prompt only on click)', (await page.evaluate(() => window.__push.subscribeCalls)) === 0 && !mock.pushCalls().includes('subscribe'))
    await overflow('profile (off)')
    await shot('off')
    await sw.click()
    await page.waitForFunction(() => document.querySelector('[data-testid=push-card]')?.getAttribute('data-push-state') === 'on', null, { timeout: 5000 })
    const info = await page.evaluate(() => window.__push)
    check('enable: browser subscribed (userVisibleOnly, 65-byte VAPID key) and the server was told', info.subscribeCalls === 1 && info.userVisibleOnly === true && info.lastKeyLength === 65 && mock.pushCalls().includes('subscribe'), JSON.stringify(info))
    check('state "on": label translated, switch checked, test button shown', (await page.locator('[data-testid=push-state]').innerText()) === P.state.on && (await sw.getAttribute('aria-checked')) === 'true' && await page.locator('[data-testid=push-test]').isVisible())
    await overflow('profile (on)')
    await shot('on')
    await page.locator('[data-testid=push-test]').click()
    await sleep(400)
    check('test push calls the server', mock.pushCalls().includes('test'))
    await sw.click()
    await page.waitForFunction(() => document.querySelector('[data-testid=push-card]')?.getAttribute('data-push-state') === 'off', null, { timeout: 5000 })
    check('disable: browser unsubscribed and the server was told', (await page.evaluate(() => window.__push.unsubscribeCalls)) === 1 && mock.pushCalls().includes('unsubscribe'))
    await ctx.close()
  }
  // user refuses the prompt
  {
    const { ctx, page } = await session({ grant: false })
    await page.locator('[data-testid=push-switch]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid=push-card]')?.getAttribute('data-push-state') === 'denied', null, { timeout: 5000 })
    check('refusing the prompt: no subscription, state denied, server not called', (await page.evaluate(() => window.__push.subscribeCalls)) === 0 && !mock.pushCalls().includes('subscribe'))
    await ctx.close()
  }
  // existing subscription (granted) shows as on and is re-registered for the current user
  {
    const { ctx, page } = await session({ permission: 'granted', existing: true })
    await page.waitForFunction(() => document.querySelector('[data-testid=push-card]')?.getAttribute('data-push-state') === 'on', null, { timeout: 5000 })
    await sleep(300)
    check('existing subscription: shown as on and re-registered on the server', mock.pushCalls().includes('subscribe'))
    await ctx.close()
  }
  // a technician also gets the card
  {
    const { ctx, page } = await session({ role: 'technician' })
    check('technician sees the card too', await page.locator('[data-testid=push-card]').count() === 1)
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})()
