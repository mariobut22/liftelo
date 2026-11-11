/* Report signature UI check (Playwright, fake API from mock.cjs): "client not present - sign later" in the signing step, the
 * "Waiting for client signature" badge / filter / Home hint, and the signature panel on the report detail (timeline, collect the
 * client signature now, attach a signed scan, close without client signature, verify document). Viewer is read-only.
 *   cd frontend && npx vite --port 5608 --strictPort &
 *   node scripts/mobile-check/report-signature-check.cjs <outDir outside repo> [BASE=http://localhost:5608]   (exit 1 on failure)
 * Runs 375 x 812 and 1280 x 900 in en and hr and saves screenshots (look at them: they are the layout check). */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const mock = require('./mock.cjs')

const outDir = process.argv[2] || '/tmp/report-signature-check'
const BASE = process.argv[3] || process.env.BASE || 'http://localhost:5608'
fs.mkdirSync(outDir, { recursive: true })
const scanFile = path.join(os.tmpdir(), `scan-${process.pid}.pdf`)
fs.writeFileSync(scanFile, '%PDF-1.4\n% scan fixture for the UI test\n')

let passes = 0
let failures = 0
const check = (name, ok, extra = '') => { if (ok) { passes += 1; console.log('  ok    ' + name) } else { failures += 1; console.log('  FAIL  ' + name + (extra ? '  ' + extra : '')) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch()
  for (const [width, height] of [[375, 812], [1280, 900]]) {
    for (const lang of ['en', 'hr']) {
      const S = require(`../../src/locales/${lang}/signature.json`)
      const tag = `${width}_${lang}`
      console.log(`\n[${width}px ${lang}]`)
      mock.setLanguage(lang)
      mock.resetSignatures()

      const open = async (role) => {
        const ctx = await browser.newContext({
          viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
          userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined, acceptDownloads: true,
        })
        await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
        await ctx.route('**/api/**', (route) => mock.handle(route, role))
        const page = await ctx.newPage()
        page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
        return { ctx, page }
      }
      const hideDevtools = (page) => page.addStyleTag({ content: '.tsqd-parent-container{display:none!important}' }).catch(() => {})
      const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${tag}_${name}.png`), fullPage: false })
      const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
      const toasts = async (page) => (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' | ')
      const draw = async (page, scope) => {
        const canvas = page.locator(`${scope} canvas`).first()
        await canvas.scrollIntoViewIfNeeded()
        const b = await canvas.boundingBox()
        await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down()
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.mouse.move(b.x + b.width - 20, b.y + 30, { steps: 6 }); await page.mouse.up()
      }

      // ---------------------------------------------------------------- admin: Home hint, lists, badge, filter
      {
        const { ctx, page } = await open('admin')
        await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        const card = page.locator('[data-testid=awaiting-client-card]')
        check('Home: "waiting for client signature" hint with count and oldest age', await card.count() === 1
          && (await card.innerText()).includes(S.home.title) && (await page.locator('[data-testid=awaiting-client-summary]').innerText()).includes('4'),
        await card.innerText().catch(() => ''))
        await card.scrollIntoViewIfNeeded()
        await shot(page, '1_home_hint')
        check('Home: no horizontal overflow', await noOverflow(page))

        await page.goto(BASE + '/dashboard/rms', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        check('RMS list: badges of all three states visible', await page.locator('[data-testid=signature-badge-awaiting_client]').count() >= 1
          && await page.locator('[data-testid=signature-badge-completed]').count() >= 1 && await page.locator('[data-testid=signature-badge-closed_without_client]').count() >= 1)
        check('RMS list: awaiting badge says "Waiting for client signature"', (await page.locator('[data-testid=signature-badge-awaiting_client]').first().innerText()) === S.state.awaiting_client)
        await shot(page, '2_rms_list_badges')
        await page.locator('[data-testid=signature-filter]').selectOption('awaiting_client')
        await page.locator('button', { hasText: /Filter|Filtriraj|Primijeni/ }).first().click()
        await sleep(600)
        const rowsAfter = await page.locator('[data-testid^=signature-badge-]').count()
        check('RMS list: filter "waiting for client" keeps only waiting reports', rowsAfter >= 1 && (await page.locator('[data-testid=signature-badge-completed]').count()) === 0 && page.url().includes('signature=awaiting_client'), `${rowsAfter} ${page.url()}`)
        await shot(page, '3_rms_list_filtered')
        check('RMS list: no horizontal overflow (page level)', await noOverflow(page))

        await page.goto(BASE + '/dashboard/interventions?signature=awaiting_client', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        check('Interventions list: filter preselected from the URL (Home link)', (await page.locator('[data-testid=signature-filter]').inputValue()) === 'awaiting_client')
        await page.goto(BASE + '/dashboard/interventions', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        check('Interventions list: signature badge column', await page.locator('[data-testid=signature-cell]').count() === 3)
        await shot(page, '4_interventions_list')
        await page.locator('[data-testid=signature-cell]').first().click()
        await page.waitForSelector('[data-testid=signature-panel]')
        check('Interventions: badge opens the signature dialog with the timeline', await page.locator('[data-testid=signature-timeline] li').count() === 2
          && (await page.locator('[data-testid=document-number]').innerText()).startsWith('INT-') && (await page.locator('[data-testid=document-hash]').innerText()) === '3fa2c1d09ab4')
        check('Interventions dialog: awaiting since line + collect / attach / decline / verify actions',
          (await page.locator('[data-testid=awaiting-since]').count()) === 1 && (await page.locator('[data-testid=action-collect]').count()) === 1
          && (await page.locator('[data-testid=action-attach]').count()) === 1 && (await page.locator('[data-testid=action-decline]').count()) === 1 && (await page.locator('[data-testid=action-verify]').count()) === 1)
        await shot(page, '5_intervention_dialog')
        await ctx.close()
      }

      // ---------------------------------------------------------------- admin: detail screen, the three actions, verify
      {
        const { ctx, page } = await open('admin')
        await page.goto(BASE + '/dashboard/rms/1', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        await page.waitForSelector('[data-testid=signature-panel]')
        check('Detail: state badge, document number and 12-char hash', (await page.locator('[data-testid=signature-badge-awaiting_client]').count()) === 1
          && (await page.locator('[data-testid=document-number]').innerText()) === 'RMS-000001' && (await page.locator('[data-testid=document-hash]').innerText()).length === 12)
        await shot(page, '6_detail_awaiting')
        check('Detail: no horizontal overflow', await noOverflow(page))

        // collect the client signature now (needs name + role)
        await page.locator('[data-testid=action-collect]').click()
        await page.waitForSelector('[data-testid=collect-form] canvas')
        await shot(page, '7_collect_form')
        await draw(page, '[data-testid=collect-form]')
        await page.locator('[data-testid=collect-submit]').click()
        await sleep(500)
        check('collect: drawn signature without name/role is refused with a message', (await toasts(page)).includes(S.errors.signerRequired), await toasts(page))
        await page.locator('[data-testid=collect-form] input[id$="signer-name"]').fill('Ana Anic')
        await page.locator('[data-testid=collect-form] input[id$="signer-role"]').fill(lang === 'hr' ? 'Upravitelj' : 'Building manager')
        await page.locator('[data-testid=collect-submit]').click()
        check('collect: after saving the report is "completed"', await page.waitForSelector('[data-testid=signature-badge-completed]', { timeout: 6000 }).then(() => true, () => false))
        check('collect: actions for the client side are gone', (await page.locator('[data-testid=action-collect]').count()) === 0 && (await page.locator('[data-testid=action-decline]').count()) === 0)
        await shot(page, '8_detail_completed')

        // attach a scan
        mock.resetSignatures()
        await page.goto(BASE + '/dashboard/rms/1', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        await page.locator('[data-testid=action-attach]').click()
        await page.locator('[data-testid=attach-submit]').click()
        await sleep(400)
        check('attach: no file -> message', (await toasts(page)).includes(S.panel.attach.fileRequired), await toasts(page))
        await page.locator('[data-testid=scan-file]').setInputFiles(scanFile)
        await shot(page, '9_attach_form')
        await page.locator('[data-testid=attach-submit]').click()
        check('attach: scan attached -> completed', await page.waitForSelector('[data-testid=signature-badge-completed]', { timeout: 6000 }).then(() => true, () => false))

        // decline (reason required)
        mock.resetSignatures()
        await page.goto(BASE + '/dashboard/rms/1', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        await page.locator('[data-testid=action-decline]').click()
        await shot(page, '10_decline_form')
        await page.locator('[data-testid=decline-submit]').click()
        await sleep(400)
        check('decline: needs a reason', (await toasts(page)).includes(S.panel.decline.reasonRequired), await toasts(page))
        await page.locator('[data-testid=decline-form] textarea').fill('Building manager refused to sign today')
        await page.locator('[data-testid=decline-submit]').click()
        check('decline: closed without client signature (honest state, not "completed")', await page.waitForSelector('[data-testid=signature-badge-closed_without_client]', { timeout: 6000 }).then(() => true, () => false)
          && (await page.locator('[data-testid=signature-badge-completed]').count()) === 0)
        check('decline: a later signature / scan can still be added, decline cannot be repeated', (await page.locator('[data-testid=action-collect]').count()) === 1 && (await page.locator('[data-testid=action-attach]').count()) === 1 && (await page.locator('[data-testid=action-decline]').count()) === 0)

        // verify
        mock.resetSignatures()
        await page.goto(BASE + '/dashboard/rms/2', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        await page.locator('[data-testid=action-verify]').click()
        check('verify: ok message', await page.waitForSelector('[data-testid=verify-result]', { timeout: 5000 }).then(async () => (await page.locator('[data-testid=verify-result]').innerText()) === S.panel.verify.ok, () => false))
        await shot(page, '11_verify_ok')
        mock.setVerify('differs')
        await page.locator('[data-testid=action-verify]').click()
        await page.waitForFunction((txt) => document.querySelector('[data-testid=verify-result]')?.textContent === txt, S.panel.verify.differs, { timeout: 5000 }).catch(() => {})
        check('verify: "content differs" message', (await page.locator('[data-testid=verify-result]').innerText()) === S.panel.verify.differs)
        await shot(page, '12_verify_differs')
        mock.setVerify('ok')
        check('completed report (drawn): timeline shows the client name and role', (await page.locator('[data-testid=signature-timeline]').innerText()).includes('Ana Anić'))
        await page.goto(BASE + '/dashboard/rms/3', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        check('closed without client signature: reason in the timeline + honest note', (await page.locator('[data-testid=signature-timeline]').innerText()).includes('Klijent odbio potpisati') && (await page.locator('[data-testid=signature-panel]').innerText()).includes(S.panel.closedNote))
        await shot(page, '13_detail_closed')
        await ctx.close()
      }

      // ---------------------------------------------------------------- technician: no verify; viewer: read-only
      {
        const { ctx, page } = await open('technician')
        await page.goto(BASE + '/dashboard/rms/1', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        await page.waitForSelector('[data-testid=signature-panel]')
        check('technician: can collect / attach / decline, cannot verify', (await page.locator('[data-testid=action-collect]').count()) === 1 && (await page.locator('[data-testid=action-attach]').count()) === 1
          && (await page.locator('[data-testid=action-decline]').count()) === 1 && (await page.locator('[data-testid=action-verify]').count()) === 0)
        await ctx.close()
      }
      {
        const { ctx, page } = await open('viewer')
        await page.goto(BASE + '/dashboard/rms/1', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        await page.waitForSelector('[data-testid=signature-panel]')
        check('viewer: sees state + timeline but NO action buttons', (await page.locator('[data-testid=signature-timeline] li').count()) >= 2
          && (await page.locator('[data-testid^=action-]').count()) === 0)
        await shot(page, '14_viewer_detail')
        await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        check('viewer: no Home hint', (await page.locator('[data-testid=awaiting-client-card]').count()) === 0)
        await ctx.close()
      }

      // ---------------------------------------------------------------- the signing step: client signer + "sign later"
      for (const kind of ['rms', 'intervention']) {
        const { ctx, page } = await open('technician')
        await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
        await hideDevtools(page)
        await page.click('div.fixed.bottom-4 button')
        const items = page.locator('[role=menuitem]')
        const n = await items.count()
        let opened = false
        for (let k = 0; k < n && !opened; k++) {
          if (k > 0) await page.click('div.fixed.bottom-4 button')
          await items.nth(k).click()
          try { await page.waitForSelector(kind === 'rms' ? '#rms-address' : '#int-location', { timeout: 2500 }); opened = true } catch { await page.keyboard.press('Escape').catch(() => {}) }
        }
        check(`${kind} dialog opens`, opened)
        const block = page.locator('[role=dialog] [data-testid=client-signature-block]')
        await block.scrollIntoViewIfNeeded()
        check(`${kind}: client block has name + role fields and the "sign later" choice`, (await block.locator('input[id$="signer-name"]').count()) === 1 && (await block.locator('input[id$="signer-role"]').count()) === 1
          && (await block.innerText()).includes(S.block.absent) && (await block.locator('canvas').isVisible()))
        await shot(page, `15_${kind}_sign_step`)
        await block.locator('[data-testid=client-absent]').check()
        check(`${kind}: "client not present" hides the pad and the signer fields and explains the lock`, !(await block.locator('canvas').isVisible()) && !(await block.locator('input[id$="signer-name"]').isVisible()) && (await block.innerText()).includes(S.block.absentHint.slice(0, 30)))
        await shot(page, `16_${kind}_sign_later`)
        await block.locator('[data-testid=client-absent]').uncheck()
        check(`${kind}: unticking brings the pad back`, await block.locator('canvas').isVisible())
        await ctx.close()
      }
    }
  }
  fs.unlinkSync(scanFile)
  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(1) })
