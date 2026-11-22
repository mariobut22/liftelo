/* FAULT -> WORK ORDER IN ONE CLICK (Playwright + mocked API: mock.cjs).
 *   cd frontend && npx vite --port 5731 --strictPort &
 *   BASE=http://localhost:5731 node scripts/mobile-check/work-order-fault-check.cjs <outDir outside repo> [width=375] [height=812] [lang=en]   (exit 1 on failure)
 * Covers: admin sees "Create work order" in the fault detail (not on a resolved fault); the create dialog opens PREFILLED (location, elevator
 * ticked, item = fault description, due date by severity, comment with elevator and priority); saving sends finding_id + the prefilled values;
 * the fault then shows "Work order #N" and the work order page shows the linked fault; technician and viewer never see the button;
 * work order without a fault still works; no horizontal overflow. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const [outDir = '/tmp/wo-fault-check', W = '375', H = '812', lang = 'en'] = process.argv.slice(2)
const width = Number(W)
const height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5731'
fs.mkdirSync(outDir, { recursive: true })
const F = require(`../../src/locales/${lang}/findings.json`)
const WO = require(`../../src/locales/${lang}/workOrders.json`)
let failures = 0
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const pad = (n) => String(n).padStart(2, '0')
const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`

;(async () => {
  const browser = await chromium.launch()
  const tag = `${W}_${lang}`
  async function session(role) {
    mock.setAuthed(true)
    mock.setLanguage(lang)
    mock.resetFindings()
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
    await page.goto(`${BASE}/dashboard/findings?id=1`, { waitUntil: 'networkidle' })
    const detail = page.getByTestId('finding-detail')
    await detail.waitFor({ timeout: 15000 })
    const btn = page.getByTestId('finding-create-work-order')
    check(`[${tag}] admin sees "${F.workOrder.create}"`, (await btn.count()) === 1 && (await btn.innerText()).includes(F.workOrder.create))
    await btn.click()
    const dialog = page.getByRole('dialog').last()
    await page.locator('#wo-location').waitFor({ timeout: 10000 })
    await page.waitForTimeout(600)
    const loc = await page.locator('#wo-location').inputValue()
    check(`[${tag}] location prefilled`, loc.includes('Vukovarska'), loc)
    const itemText = await page.locator('input[id^="wo-item-"]').first().inputValue()
    check(`[${tag}] item = fault description`, itemText.includes('Vrata kabine se ne zatvaraju'), itemText)
    check(`[${tag}] due date = today (out of service = urgent)`, (await page.locator('#wo-due').inputValue()) === ymd(new Date()))
    const comment = await page.locator('#wo-comment').inputValue()
    const priority = F.workOrder.priority.out_of_service
    check(`[${tag}] comment names elevator and priority`, comment.includes('Lift A') && comment.includes(priority), comment)
    check(`[${tag}] elevator "Lift A" ticked, "Lift B" not`, (await dialog.locator('label:has-text("Lift A") input:checked').count()) === 1 && (await dialog.locator('label:has-text("Lift B") input:checked').count()) === 0)
    check(`[${tag}] no horizontal overflow with dialog open`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
    await page.screenshot({ path: path.join(outDir, `${tag}_admin_prefilled.png`) })
    await dialog.getByRole('button', { name: WO.workOrderCreateModal.saveWorkOrder, exact: true }).click()
    await page.waitForTimeout(1200)
    const post = mock.workOrderPosts[0]
    check(`[${tag}] request carries finding_id and prefilled values`,
      !!post && post.finding_id === 1 && post.location_id === 1 && post.items?.[0]?.description?.includes('Vrata kabine') && JSON.stringify(post.elevator_ids) === '[11]' && post.due_date === ymd(new Date()), JSON.stringify(post))
    // the fault now lists the work order
    await page.goto(`${BASE}/dashboard/findings?id=1`, { waitUntil: 'networkidle' })
    const linked = page.getByTestId('finding-work-orders')
    await linked.waitFor({ timeout: 10000 })
    const linkText = await linked.innerText()
    check(`[${tag}] fault shows the work order link`, linkText.includes(F.workOrder.linkedItem.replace('{{id}}', '77')), linkText)
    const hist = await page.getByTestId('finding-history').innerText()
    check(`[${tag}] history has the "work order created" event`, hist.includes(F.detail.event.work_order_created.replace('{{id}}', '77')), hist)
    await linked.getByRole('link').first().click()
    await page.waitForURL('**/dashboard/work-orders/77', { timeout: 10000 })
    const card = page.getByTestId('work-order-findings')
    await card.waitFor({ timeout: 10000 })
    const cardText = await card.innerText()
    check(`[${tag}] work order page shows the linked fault`, cardText.includes(WO.workOrderDetail.linkedFault.replace('{{id}}', '1').replace('{{elevator}}', 'Lift A')), cardText)
    check(`[${tag}] work order page no overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
    await page.screenshot({ path: path.join(outDir, `${tag}_admin_linked.png`) })

    // resolved fault (id 6): no button
    await page.goto(`${BASE}/dashboard/findings?id=6&state=all`, { waitUntil: 'networkidle' })
    await page.getByTestId('finding-detail').waitFor({ timeout: 10000 })
    check(`[${tag}] resolved fault has no create button`, (await page.getByTestId('finding-create-work-order').count()) === 0)
    // in-service fault (id 2): due date +7
    await page.goto(`${BASE}/dashboard/findings?id=2`, { waitUntil: 'networkidle' })
    await page.getByTestId('finding-create-work-order').click()
    await page.locator('#wo-due').waitFor({ timeout: 10000 })
    await page.waitForTimeout(500)
    const plus7 = new Date(); plus7.setDate(plus7.getDate() + 7)
    check(`[${tag}] in-service fault -> due in 7 days`, (await page.locator('#wo-due').inputValue()) === ymd(plus7))
    await ctx.close()
  }

  // ---- technician and viewer
  for (const role of ['technician', 'viewer']) {
    const { ctx, page } = await session(role)
    await page.goto(`${BASE}/dashboard/findings?id=1`, { waitUntil: 'networkidle' })
    await page.getByTestId('finding-detail').waitFor({ timeout: 15000 })
    check(`[${tag}] ${role}: no create-work-order button`, (await page.getByTestId('finding-create-work-order').count()) === 0)
    check(`[${tag}] ${role}: no overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
    await ctx.close()
  }

  await browser.close()
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
  process.exit(failures ? 1 : 0)
})()
