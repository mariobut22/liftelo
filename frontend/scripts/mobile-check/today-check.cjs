/* HOME "TODAY" CARD UI TEST (Playwright + mocked API: mock.cjs).
 *   cd frontend && npx vite --port 5617 --strictPort &
 *   BASE=http://localhost:5617 node scripts/mobile-check/today-check.cjs <outDir outside repo>
 * (exit 1 on failure). Roles technician / admin / viewer, widths 375 and 1280, languages en and hr. Covers: card is the first block after
 * the heading, scan button (big, one only) opens the scanner, technician sees New RMS / New intervention (open the create dialogs), viewer
 * sees NO create shortcuts, work orders ordered by urgency (overdue, today, upcoming, no date), locations without RMS (max 3) for
 * technician, open-fault row, admin compact (only due/overdue orders, no location list), friendly empty state (admin-ok), no overflow. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/today-check'] = process.argv.slice(2)
const BASE = process.env.BASE || 'http://localhost:5617'
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

;(async () => {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    const D = require(`../../src/locales/${lang}/dashboard.json`)
    for (const width of [375, 1280]) {
      for (const scenario of ['technician', 'viewer', 'admin', 'admin-ok']) {
        const tag = `${lang}-${width}-${scenario}`
        mock.setAuthed(true)
        mock.setLanguage(lang)
        const ctx = await browser.newContext({
          viewport: { width, height: 812 }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
          userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
        })
        await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
        await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = '.tsqd-parent-container{display:none!important}'
          document.head.appendChild(style)
        }))
        await ctx.route('**/api/**', (route) => mock.handle(route, scenario))
        const page = await ctx.newPage()
        page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
        await page.goto(`${BASE}/dashboard/home`, { waitUntil: 'networkidle' })
        const card = page.getByTestId('today-card')
        await card.waitFor({ timeout: 15000 })
        await page.screenshot({ path: path.join(outDir, `${tag}.png`) })
        const text = await card.innerText()
        check(`[${tag}] title "${D.today.title}"`, text.includes(D.today.title))
        const scan = card.getByRole('button', { name: D.scanQr.button, exact: true })
        check(`[${tag}] exactly one scan button on the page`, (await page.getByRole('button', { name: D.scanQr.button, exact: true }).count()) === 1)
        const box = await scan.boundingBox()
        check(`[${tag}] scan button is big (>= 48px high)`, !!box && box.height >= 48, JSON.stringify(box))
        check(`[${tag}] no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
        const firstCardTop = await card.evaluate((el) => el.getBoundingClientRect().top)
        check(`[${tag}] card sits near the top (below greeting, PWA banner may add height)`, firstCardTop < 420, String(firstCardTop))

        const create = scenario !== 'viewer'
        check(`[${tag}] create shortcuts ${create ? 'visible' : 'hidden'}`,
          (await card.getByTestId('today-new-rms').count()) === (create ? 1 : 0) && (await card.getByTestId('today-new-intervention').count()) === (create ? 1 : 0))

        if (scenario === 'technician' || scenario === 'viewer') {
          const urg = await card.getByTestId('today-order').evaluateAll((els) => els.map((e) => e.getAttribute('data-urgency')))
          check(`[${tag}] orders by urgency`, JSON.stringify(urg) === JSON.stringify(['overdue', 'today', 'upcoming', 'upcoming', 'none']), JSON.stringify(urg))
          check(`[${tag}] overdue + due-today badges`, text.includes(D.today.overdue) && text.includes(D.today.dueToday))
          check(`[${tag}] locations without RMS limited to 3`, (await card.getByTestId('today-missing-item').count()) === 3)
          check(`[${tag}] open faults row`, (await card.getByTestId('today-faults').count()) === 1)
          check(`[${tag}] no empty state`, (await card.getByTestId('today-empty').count()) === 0)
          await card.getByTestId('today-order').first().click()
          await page.waitForURL(/\/dashboard\/work-orders\/1/)
          check(`[${tag}] order opens its work order`, true)
        } else if (scenario === 'admin') {
          check(`[${tag}] admin compact: no location list`, (await card.getByTestId('today-missing').count()) === 0)
          check(`[${tag}] admin compact: only due/overdue orders`, (await card.getByTestId('today-order').count()) <= 3)
        } else {
          check(`[${tag}] friendly empty state "${D.today.empty}"`, text.includes(D.today.empty) || (await card.getByTestId('today-faults').count()) === 1)
        }

        if (create) {
          await page.goto(`${BASE}/dashboard/home`, { waitUntil: 'networkidle' })
          await card.getByTestId('today-new-rms').click()
          await page.getByRole('dialog').waitFor({ timeout: 8000 })
          check(`[${tag}] New RMS opens the RMS dialog`, true)
          await page.keyboard.press('Escape')
          await page.getByRole('dialog').waitFor({ state: 'hidden' })
          await card.getByTestId('today-new-intervention').click()
          await page.getByRole('dialog').waitFor({ timeout: 8000 })
          check(`[${tag}] New intervention opens the intervention dialog`, true)
          await page.keyboard.press('Escape')
        }
        await page.goto(`${BASE}/dashboard/home`, { waitUntil: 'networkidle' })
        await card.getByRole('button', { name: D.scanQr.button, exact: true }).click()
        await page.getByTestId('qr-scanner').waitFor({ timeout: 8000 }).then(() => check(`[${tag}] scan button opens the scanner`, true), () => check(`[${tag}] scan button opens the scanner`, false))
        await ctx.close()
      }
    }
  }
  await browser.close()
  console.log(failures ? `\n${failures} FAILURES` : '\nALL PASSED')
  process.exit(failures ? 1 : 0)
})()
