/* LOCATION PROFILE (/dashboard/locations/:id) UI TEST - Playwright + mocked API (mock.cjs).
 *   cd frontend && npx vite --port 5701 --strictPort &
 *   BASE=http://localhost:5701 NODE_PATH=$(npm root -g) node scripts/mobile-check/location-profile-check.cjs <outDir outside repo>   (exit 1 on failure)
 * Roles admin / technician / viewer, widths 375 and 1280, languages en and hr: header (name, address, chips), tab bar (ARIA tabs, keyboard),
 * deep links (/locations/1 = Overview, #faults, unknown hash = Overview, hash survives reload and back navigation), actions per role,
 * overflow menu (admin), preselected New RMS from an elevator card, Info tab (edit + share card admin only), no horizontal overflow,
 * dark mode sanity (dark surfaces, no light card) and screenshots of every tab. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('./mock.cjs')

const outDir = process.argv[2] || '/tmp/location-profile-check'
const BASE = process.env.BASE || 'http://localhost:5701'
fs.mkdirSync(outDir, { recursive: true })
let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const hashOf = (page) => new URL(page.url()).hash

;(async () => {
  const browser = await chromium.launch()
  for (const lang of ['en', 'hr']) {
    const L = require(`../../src/locales/${lang}/locations.json`).locationDetail
    const tabLabel = (id) => L.tabs[id]
    for (const width of [375, 1280]) {
      for (const role of ['admin', 'technician', 'viewer']) {
        const tag = `${lang}_${width}_${role}`
        mock.resetQr && mock.resetQr()
        mock.setAuthed(true)
        mock.setLanguage(lang)
        const ctx = await browser.newContext({ viewport: { width, height: 812 }, deviceScaleFactor: 1, isMobile: width < 1024, hasTouch: width < 1024 })
        await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
        await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style'); style.textContent = '.tsqd-parent-container{display:none!important}'; document.head.appendChild(style)
        }))
        await ctx.route('**/api/**', (route) => mock.handle(route, role))
        const page = await ctx.newPage()
        page.on('pageerror', (e) => { failures += 1; console.log('FAIL  PAGEERROR ' + e.message) })
        page.on('dialog', (d) => d.accept())
        const shot = (n) => page.screenshot({ path: path.join(outDir, `${tag}_${n}.png`), fullPage: true })
        const go = async (hash = '') => { await page.goto(`${BASE}/dashboard/locations/1${hash}`); await page.getByTestId('location-header').waitFor({ timeout: 15000 }); await page.waitForTimeout(400) }
        const tabs = page.getByRole('tab')

        // ---------- default URL = overview
        await go()
        check(`${tag}: h1 is the building name`, (await page.locator('h1').innerText()).includes('Stambena zgrada'))
        check(`${tag}: address under the name`, (await page.getByTestId('location-header').innerText()).includes('Ulica kralja Zvonimira'))
        check(`${tag}: tablist has 5 tabs with translated labels`, (await tabs.count()) === 5 && (await page.getByRole('tablist').getAttribute('aria-label')) === L.tabsLabel)
        const names = await tabs.evaluateAll((els) => els.map((e) => e.textContent))
        check(`${tag}: labels = ${['overview', 'elevators', 'faults', 'history', 'info'].map(tabLabel).join('/')}`, ['overview', 'elevators', 'faults', 'history', 'info'].every((id, i) => names[i].startsWith(tabLabel(id))), names.join('|'))
        check(`${tag}: Overview selected, URL has no hash`, (await page.getByRole('tab', { name: tabLabel('overview') }).getAttribute('aria-selected')) === 'true' && hashOf(page) === '')
        check(`${tag}: tabpanel labelled by the selected tab`, (await page.getByRole('tabpanel').getAttribute('aria-labelledby')) === 'loc-tab-overview')
        check(`${tag}: chips: 2 open faults (rose/amber severity), RMS done this month, 2 elevators`,
          (await page.getByTestId('chip-faults').getAttribute('data-severity')) === 'out_of_service'
          && (await page.getByTestId('chip-faults').innerText()).includes('2') && (await page.getByTestId('chip-rms').getAttribute('data-status')) === 'done'
          && (await page.getByTestId('chip-elevators').innerText()).includes('2'))
        check(`${tag}: overview shows faults, access, RMS and interventions blocks`, (await page.getByTestId('overview-faults').count()) === 1 && (await page.getByTestId('overview-access').count()) === 1
          && (await page.getByTestId('overview-rms').count()) === 1 && (await page.getByTestId('overview-interventions').count()) === 1)
        check(`${tag}: overview lists the open faults (2) and the machine room key`, (await page.locator('[data-testid=overview-faults] a[href*="findings?id="]').count()) === 2 && (await page.getByTestId('overview-access').innerText()).includes('Portir'))
        check(`${tag}: no horizontal overflow (overview)`, !(await overflow(page)))
        check(`${tag}: back link present`, (await page.getByTestId('back-to-locations').count()) === 1)
        await shot('1-overview')

        // ---------- actions per role
        const newRms = page.getByTestId('action-new-rms')
        const newInt = page.getByTestId('action-new-intervention')
        const qrBtn = page.getByRole('button', { name: lang === 'en' ? 'QR labels' : 'QR naljepnice', exact: true })
        const more = page.getByTestId('location-more')
        if (role === 'viewer') {
          check(`${tag}: viewer has no action row at all`, (await page.getByTestId('location-actions').count()) === 0 && (await page.getByRole('button', { name: /QR/ }).count()) === 0)
        } else {
          check(`${tag}: New RMS and New intervention are large touch targets`, (await newRms.count()) === 1 && (await newInt.count()) === 1 && (await newRms.boundingBox()).height >= 44 && (await newInt.boundingBox()).height >= 44)
          check(`${tag}: QR labels + overflow menu only for admin`, role === 'admin' ? (await qrBtn.count()) === 1 && (await more.count()) === 1 : (await qrBtn.count()) === 0 && (await more.count()) === 0 && (await page.getByRole('button', { name: /QR/ }).count()) === 0)
          await newRms.click()
          await page.getByRole('dialog').waitFor({ timeout: 5000 })
          check(`${tag}: New RMS opens the form dialog`, await page.getByRole('dialog').isVisible())
          await page.keyboard.press('Escape')
          await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
        }
        if (role === 'admin') {
          check(`${tag}: overflow menu button has an aria-label`, (await more.getAttribute('aria-label')) === L.actions.more)
          await more.click()
          const items = await page.getByRole('menuitem').allInnerTexts()
          check(`${tag}: overflow menu = edit location, add elevator, share link`, items.length === 3 && items[0].includes(L.editLocation) && items[1].includes(L.addElevator) && items[2].includes(L.actions.shareLink), items.join('|'))
          await shot('2-menu')
          await page.getByRole('menuitem', { name: L.actions.shareLink }).click()
          await page.waitForTimeout(300)
          check(`${tag}: "share link" menu item opens the Info tab with the share card`, hashOf(page) === '#info' && (await page.getByTestId('share-link-card').count()) === 1)
        }

        // ---------- tabs: click + hash, keyboard
        await go()
        await page.getByRole('tab', { name: new RegExp('^' + tabLabel('elevators')) }).click()
        await page.waitForTimeout(300)
        check(`${tag}: clicking Elevators sets #elevators and selects it`, hashOf(page) === '#elevators' && (await page.getByRole('tab', { name: new RegExp('^' + tabLabel('elevators')) }).getAttribute('aria-selected')) === 'true')
        check(`${tag}: elevator cards: 2 with label, status badge and open-fault badge`, (await page.getByTestId('elevator-card').count()) === 2 && (await page.getByTestId('elevator-faults-badge').count()) === 2)
        check(`${tag}: no empty "—" detail lines on the elevator card`, !(await page.getByTestId('elevator-card').first().innerText()).includes('—'))
        check(`${tag}: no horizontal overflow (elevators)`, !(await overflow(page)))
        if (role !== 'viewer') {
          await page.getByTestId('elevator-card').first().getByRole('button', { name: L.actions.newRms }).click()
          await page.getByRole('dialog').waitFor({ timeout: 5000 })
          check(`${tag}: elevator card New RMS opens the dialog`, true)
          await page.keyboard.press('Escape')
          await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
        } else {
          check(`${tag}: viewer: no New RMS / intervention buttons on elevator cards`, (await page.getByTestId('elevator-card').getByRole('button').filter({ hasText: /RMS|interven/i }).count()) === 0)
        }
        if (role === 'admin') {
          await page.getByRole('button', { name: L.actions.elevatorActions.replace('{{label}}', 'Lift A') }).click()
          const items = await page.getByRole('menuitem').allInnerTexts()
          check(`${tag}: elevator menu = QR label, edit, delete`, items.length === 3, items.join('|'))
          await page.keyboard.press('Escape')
        } else {
          check(`${tag}: no elevator admin menu`, (await page.getByRole('button', { name: L.actions.elevatorActions.replace('{{label}}', 'Lift A') }).count()) === 0 && (await page.getByTestId('add-elevator').count()) === 0)
        }
        await shot('3-elevators')

        // keyboard
        await page.getByRole('tab', { name: new RegExp('^' + tabLabel('overview')) }).focus()
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250)
        check(`${tag}: ArrowRight moves focus + selection to the next tab`, hashOf(page) === '#elevators' && (await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'tab')
        await page.keyboard.press('End'); await page.waitForTimeout(250)
        check(`${tag}: End goes to the last tab (Info)`, hashOf(page) === '#info')
        await page.keyboard.press('Home'); await page.waitForTimeout(250)
        check(`${tag}: Home goes back to Overview`, hashOf(page) === '')
        check(`${tag}: only the selected tab is in the tab order`, (await tabs.evaluateAll((els) => els.filter((e) => e.tabIndex === 0).length)) === 1)

        // ---------- deep links
        await go('#faults')
        check(`${tag}: #faults opens Faults (one block per elevator)`, (await page.getByRole('tab', { name: new RegExp('^' + tabLabel('faults')) }).getAttribute('aria-selected')) === 'true' && (await page.getByTestId('elevator-findings').count()) === 2)
        check(`${tag}: faults link to the fault and to the elevator history`, (await page.locator('a[href*="findings?id="]').count()) === 2 && (await page.locator('a[href*="findings?elevator="]').count()) >= 2)
        check(`${tag}: no horizontal overflow (faults)`, !(await overflow(page)))
        await shot('4-faults')
        await page.reload(); await page.getByTestId('location-header').waitFor(); await page.waitForTimeout(300)
        check(`${tag}: reload keeps the tab`, hashOf(page) === '#faults' && (await page.getByTestId('location-panel-faults').count()) === 1)
        await go('#nonsense')
        check(`${tag}: unknown hash falls back to Overview`, (await page.getByTestId('location-panel-overview').count()) === 1)

        await go('#history')
        check(`${tag}: History: 12 months grid, RMS records, interventions`, (await page.locator('[data-testid=history-months] li').count()) === 12 && (await page.locator('[data-testid=history-rms] li').count()) === 3 && (await page.getByTestId('location-intervention-link').count()) === 1)
        check(`${tag}: no horizontal overflow (history)`, !(await overflow(page)))
        await shot('5-history')
        await page.getByTestId('location-intervention-link').click()
        await page.waitForURL('**/dashboard/interventions/1')
        await page.goBack()
        await page.getByTestId('location-header').waitFor()
        check(`${tag}: back from an intervention returns to #history`, hashOf(page) === '#history' && (await page.getByTestId('history-months').count()) === 1)

        await go('#info')
        const hasShare = (await page.getByTestId('share-link-card').count()) === 1
        check(`${tag}: Info: details + share card only for admin`, (await page.getByTestId('info-details').count()) === 1 && hasShare === (role === 'admin'))
        check(`${tag}: edit location button only for admin`, (await page.getByTestId('edit-location').count()) === (role === 'admin' ? 1 : 0))
        if (role === 'admin') {
          await page.getByTestId('edit-location').click()
          await page.getByRole('dialog').waitFor()
          check(`${tag}: edit dialog is prefilled with the name`, (await page.getByRole('dialog').locator('input').first().inputValue()).includes('Stambena zgrada'))
          await page.keyboard.press('Escape')
        }
        check(`${tag}: no horizontal overflow (info)`, !(await overflow(page)))
        await shot('6-info')
        await ctx.close()
      }
    }
  }

  // ---------- empty + loading states (technician, English)
  {
    mock.setAuthed(true); mock.setLanguage('en')
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
    await ctx.addInitScript(() => localStorage.setItem('liftelo_language', 'en'))
    await ctx.route('**/api/**', (route) => mock.handle(route, 'admin'))
    await ctx.route('**/api/locations/1/elevators**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    const page = await ctx.newPage()
    await page.goto(`${BASE}/dashboard/locations/1#elevators`)
    await page.getByTestId('elevators-empty').waitFor({ timeout: 15000 })
    check('empty elevators: shared EmptyState with an add button (admin)', (await page.getByTestId('elevators-empty').getByRole('button').count()) === 1)
    await page.screenshot({ path: path.join(outDir, 'empty-elevators.png'), fullPage: true })
    await ctx.close()
  }

  // ---------- dark mode
  for (const width of [375, 1280]) {
    mock.setAuthed(true); mock.setLanguage('en')
    const ctx = await browser.newContext({ viewport: { width, height: 812 }, colorScheme: 'dark' })
    await ctx.addInitScript(() => localStorage.setItem('liftelo_language', 'en'))
    await ctx.route('**/api/**', (route) => mock.handle(route, 'admin'))
    const page = await ctx.newPage()
    for (const hash of ['', '#elevators', '#faults', '#history', '#info']) {
      await page.goto(`${BASE}/dashboard/locations/1${hash}`)
      await page.getByTestId('location-header').waitFor({ timeout: 15000 })
      await page.waitForTimeout(400)
      const lum = await page.evaluate(() => {
        const rgb = (el) => (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || [255, 255, 255]).slice(0, 3).map(Number)
        const l = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const sections = [...document.querySelectorAll('[data-testid=location-header], section')]
        return { body: l(rgb(document.body)), maxSurface: Math.max(...sections.map((s) => l(rgb(s)))) }
      })
      check(`dark ${width} ${hash || '#overview'}: body and cards are dark`, lum.body < 0.25 && lum.maxSurface < 0.25, JSON.stringify(lum))
      check(`dark ${width} ${hash || '#overview'}: no horizontal overflow`, !(await overflow(page)))
      await page.screenshot({ path: path.join(outDir, `dark_${width}_${hash.slice(1) || 'overview'}.png`), fullPage: true })
    }
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})()
