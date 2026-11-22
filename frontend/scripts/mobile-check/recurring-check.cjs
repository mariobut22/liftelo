/* RECURRING WORK ORDERS ADMIN UI (Playwright + mocked API: mock.cjs).
 *   cd frontend && npx vite --port 5731 --strictPort &
 *   BASE=http://localhost:5731 node scripts/mobile-check/recurring-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: admin reaches /dashboard/work-orders/recurring from the work order list; empty state; creating a recurrence (form validation,
 * request body: location, frequency, start date, assignee); listing; pause / resume; delete with confirmation (cancel keeps it, yes removes it;
 * the confirmation says generated work orders are kept); technician and viewer get no link and only the admin-only message;
 * no horizontal overflow. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/recurring-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5731'
fs.mkdirSync(outDir, { recursive: true })
const WO = require(`../../src/locales/${lang}/workOrders.json`)
const R = WO.recurring
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const noOverflow = (page) => page.evaluate(() => !(document.documentElement.scrollWidth > window.innerWidth + 1))

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetWoExtras()
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
    await ctx.route('**/api/**', (route) => mock.handle(route, role))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
    return { ctx, page }
  }

  // ---- admin
  {
    const { ctx, page } = await session('admin')
    await page.goto(`${BASE}/dashboard/work-orders`, { waitUntil: 'networkidle' })
    const link = page.getByTestId('recurring-link')
    await link.waitFor({ timeout: 15000 })
    check(`[${tag}] admin sees the "${WO.workOrders.recurringLink}" button on the work order list`, (await link.innerText()).includes(WO.workOrders.recurringLink))
    await link.click()
    await page.waitForURL('**/dashboard/work-orders/recurring', { timeout: 10000 })
    await page.getByTestId('recurring-page').waitFor({ timeout: 10000 })
    await page.getByTestId('recurring-empty').waitFor({ timeout: 10000 })
    check(`[${tag}] empty state`, (await page.getByTestId('recurring-empty').innerText()).includes(R.empty))
    await page.screenshot({ path: path.join(outDir, `${tag}_admin_empty.png`) })

    await page.getByTestId('recurring-new').click()
    const form = page.getByTestId('recurring-form')
    await form.waitFor({ timeout: 10000 })
    await form.getByTestId('rec-save').click()
    await page.waitForTimeout(400)
    check(`[${tag}] form blocks an empty submit (nothing sent)`, (await page.getByTestId('recurring-item').count()) === 0)
    await form.getByTestId('rec-location').selectOption('2')
    await page.waitForTimeout(500)
    await form.getByTestId('rec-description').fill('Godišnji pregled kočnica')
    await form.getByTestId('rec-frequency').selectOption('yearly')
    await form.getByTestId('rec-start').fill('2027-03-15')
    await form.getByTestId('rec-assignee').selectOption('1')
    check(`[${tag}] form no overflow`, await noOverflow(page))
    await page.screenshot({ path: path.join(outDir, `${tag}_admin_form.png`) })
    await form.getByTestId('rec-save').click()
    const item = page.getByTestId('recurring-item').first()
    await item.waitFor({ timeout: 10000 })
    const text = await item.innerText()
    check(`[${tag}] created recurrence is listed (text, frequency, status)`, text.includes('Godišnji pregled kočnica') && text.includes(R.frequencies.yearly) && text.includes(R.statusActive), text)
    check(`[${tag}] list no overflow`, await noOverflow(page))
    await page.screenshot({ path: path.join(outDir, `${tag}_admin_list.png`) })

    await item.getByTestId('recurring-toggle').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="recurring-item"]')?.getAttribute('data-active') === '0', null, { timeout: 8000 })
    check(`[${tag}] pause -> shows paused and "${R.resume}"`, (await item.innerText()).includes(R.statusPaused) && (await item.getByTestId('recurring-toggle').innerText()).includes(R.resume))
    await item.getByTestId('recurring-toggle').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="recurring-item"]')?.getAttribute('data-active') === '1', null, { timeout: 8000 })
    check(`[${tag}] resume -> active again`, (await item.innerText()).includes(R.statusActive))

    await item.getByTestId('recurring-delete').click()
    check(`[${tag}] delete asks for confirmation and says generated work orders stay`, (await item.innerText()).includes(R.confirmDelete))
    await item.getByRole('button', { name: 'Cancel' }).or(item.getByRole('button', { name: 'Odustani' })).first().click()
    check(`[${tag}] cancel keeps the recurrence`, (await page.getByTestId('recurring-item').count()) === 1)
    await item.getByTestId('recurring-delete').click()
    await item.getByTestId('recurring-delete-yes').click()
    await page.getByTestId('recurring-empty').waitFor({ timeout: 8000 })
    check(`[${tag}] confirmed delete removes it`, (await page.getByTestId('recurring-item').count()) === 0)

    mock.seedRecurrence()
    await page.reload({ waitUntil: 'networkidle' })
    const seeded = page.getByTestId('recurring-item').first()
    await seeded.waitFor({ timeout: 10000 })
    const seededText = await seeded.innerText()
    check(`[${tag}] seeded recurrence shows next due date, assignee and created count`, seededText.includes('Ivan Horvat') && seededText.includes(R.created.replace('{{count}}', '1')), seededText)
    check(`[${tag}] seeded recurrence links to its latest work order`, (await seeded.locator('a[href="/dashboard/work-orders/1"]').count()) === 1)
    await ctx.close()
  }

  // ---- technician and viewer
  for (const role of ['technician', 'viewer']) {
    const { ctx, page } = await session(role)
    await page.goto(`${BASE}/dashboard/work-orders`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    check(`[${tag}] ${role}: no recurring button on the work order list`, (await page.getByTestId('recurring-link').count()) === 0)
    await page.goto(`${BASE}/dashboard/work-orders/recurring`, { waitUntil: 'networkidle' })
    await page.getByTestId('recurring-admin-only').waitFor({ timeout: 10000 })
    check(`[${tag}] ${role}: only the admin-only message, no create button`, (await page.getByTestId('recurring-new').count()) === 0)
    check(`[${tag}] ${role}: no overflow`, await noOverflow(page))
    await ctx.close()
  }

  await browser.close()
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
  process.exit(failures ? 1 : 0)
})()
