/* SUPERADMIN MONITORING TABS: screenshots + overflow check (Playwright, API mocked - mock.cjs). Needs:  cd frontend && npx vite --port 5503 &
 * Usage:  BASE=http://localhost:5503 NODE_PATH=$(npm root -g) node scripts/mobile-check/superadmin-monitoring-shots.cjs <outDir outside the repo>
 * Visits /superadmin?tab=revenue|health|audit|growth in en and hr at 375 and 1280 px, saves a full-page screenshot each and fails (exit 1)
 * on horizontal overflow of the document or on a missing translation (raw "monitoring." key visible). */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const mock = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:5503'
const out = process.argv[2]
if (!out) { console.error('usage: superadmin-monitoring-shots.cjs <outDir>'); process.exit(2) }
fs.mkdirSync(out, { recursive: true })
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

;(async () => {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    for (const width of [375, 1280]) {
      for (const tab of ['companies', 'revenue', 'health', 'audit', 'growth']) {
        mock.setAuthed(true)
        mock.setLanguage(lang)
        const ctx = await browser.newContext({ viewport: { width, height: 900 } })
        await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
        const page = await ctx.newPage()
        await page.route('**/api/**', (route) => mock.handle(route, 'superadmin'))
        await page.goto(`${BASE}/superadmin${tab === 'companies' ? '' : `?tab=${tab}`}`)
        await page.waitForTimeout(1500)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        const text = await page.evaluate(() => document.body.innerText)
        check(`${lang} ${width}px ${tab}: no horizontal overflow`, overflow <= 0, `overflow ${overflow}px`)
        check(`${lang} ${width}px ${tab}: no raw i18n keys`, !/monitoring\.|superadminDashboard\./.test(text))
        await page.screenshot({ path: path.join(out, `${tab}-${lang}-${width}.png`), fullPage: true })
        await ctx.close()
      }
    }
  }
  await browser.close()
  process.exit(failures ? 1 : 0)
})()
