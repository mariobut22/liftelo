/* UI test of the photo flow against the mocked API (../mobile-check/mock.cjs). Needs the dev server:
 *   cd frontend && npx vite --port 5602 &
 *   python3 scripts/image-check/make-fixtures.py <fixtureDir>
 *   node scripts/image-check/photos-ui-check.cjs <outDir outside repo> <fixtureDir> [width=375] [height=812] [lang=hr]   (exit 1 on failure)
 * 1. Gallery: Interventions page -> Photos -> thumbnails -> lightbox (counter, arrow keys, swipe, Esc).
 * 2. Create flow: pick 3 files (2 JPEGs with EXIF + 1 fake) -> all thumbnails shown, broken one has a translated error, remove,
 *    tag + caption, submit; one upload fails with 500 -> per-photo error + retry (same client_request_id) -> signing happens last. */
const { chromium, devices } = require('playwright')
const fs = require('fs')
const path = require('path')
const mock = require('../mobile-check/mock.cjs')

const [outDir = '/tmp/photos-ui', fixtureDir, W = '375', H = '812', lang = 'hr'] = process.argv.slice(2)
if (!fixtureDir) { console.error('usage: photos-ui-check.cjs <outDir> <fixtureDir> [w] [h] [lang]'); process.exit(2) }
const width = Number(W), height = Number(H)
const BASE = process.env.BASE || 'http://localhost:5602'
fs.mkdirSync(outDir, { recursive: true })
const fx = (name) => path.join(fixtureDir, name)

let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) { passes += 1; console.log('  ok    ' + name) } else { failures += 1; console.log('  FAIL  ' + name + (extra ? '  ' + extra : '')) } }

const GALLERY = [
  { id: null, file_path: '/uploads/interventions/old-legacy-1.jpg', kind: 'other', caption: null, legacy: true, taken_at: null },
  { id: 11, file_path: '/uploads/interventions/1-i1-a.jpg', kind: 'before', caption: 'Vrata kabine prije popravka', legacy: false, taken_at: new Date(Date.now() - 36e5).toISOString() },
  { id: 12, file_path: '/uploads/interventions/1-i1-b.jpg', kind: 'after', caption: 'Nakon zamjene kontaktora u strojarnici, dugi opis koji se mora prelomiti u više redova na uskom ekranu', legacy: false, taken_at: null },
  { id: 13, file_path: '/uploads/interventions/1-i1-c.jpg', kind: 'other', caption: null, legacy: false, taken_at: null },
]

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024,
    userAgent: width < 1024 ? devices['iPhone 13'].userAgent : undefined,
  })
  await ctx.addInitScript((l) => localStorage.setItem('liftelo_language', l), lang)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  mock.setAuthed(true)
  mock.setLanguage(lang)
  await page.route('**/api/**', (route) => mock.handle(route, 'admin'))

  // ---- fake backend pieces for this test
  const requests = []
  let photoPosts = 0
  const secondPhotoFailsOnce = { done: false }
  await page.route('**/api/uploads/**', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(fx(route.request().url().includes('-b.') ? 'o8-portrait-1200x900.jpg' : route.request().url().includes('-c.') ? 'small-upright.jpg' : 'o6-portrait-1200x900.jpg')) }))
  await page.route(/\/api\/interventions\/\d+\/photos$/, async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: GALLERY.map((p) => ({ ...p, mime: 'image/jpeg', size_bytes: 1, width: 1, height: 1, created_at: new Date().toISOString() })) }) })
    photoPosts += 1
    const body = req.postDataBuffer() || Buffer.alloc(0)
    const text = body.toString('latin1')
    const field = (name) => (new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(text) || [])[1]
    const rec = { url: req.url(), bytes: body.length, requestId: field('client_request_id'), kind: field('kind'), caption: field('caption'), takenAt: field('taken_at'), jpeg: text.includes('JFIF') || text.includes('\xff\xd8') }
    requests.push(rec)
    // the 2nd distinct photo fails once with a server error
    const distinct = [...new Set(requests.filter((r) => r.requestId).map((r) => r.requestId))]
    if (distinct.length === 2 && distinct[1] === rec.requestId && !secondPhotoFailsOnce.done) {
      secondPhotoFailsOnce.done = true
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    }
    await new Promise((r) => setTimeout(r, 250))
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ photo: { id: photoPosts, file_path: '/uploads/interventions/1-x.jpg', kind: 'other', caption: null, legacy: false } }) })
  })
  const order = []
  await page.route(/\/api\/interventions$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    order.push('create')
    const type = route.request().headers()['content-type'] || ''
    requests.push({ createContentType: type, hasImages: (route.request().postData() || '').includes('name="images"') })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 77, message: 'ok' }) })
  })
  await page.route(/\/api\/reports\/intervention\/\d+\/sign$/, (route) => { order.push('sign'); return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })

  const goto = async (url) => {
    await page.goto(BASE + '/dashboard/home', { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: '.tsqd-parent-container{display:none!important}' }).catch(() => {})
    await page.evaluate((u) => { history.pushState({}, '', u); window.dispatchEvent(new PopStateEvent('popstate')) }, url)
    await page.waitForTimeout(600)
  }
  const tag = `${W}_${lang}`

  // ------------------------------------------------------------------ 1. gallery + lightbox
  console.log(`\n[gallery + lightbox ${W}px ${lang}]`)
  await goto('/dashboard/interventions')
  const photosBtn = page.locator('button', { hasText: lang === 'hr' ? 'Fotografije' : 'Photos' }).first()
  await photosBtn.waitFor({ timeout: 5000 })
  await page.screenshot({ path: path.join(outDir, `${tag}_1_list.png`) })
  await photosBtn.click()
  await page.waitForSelector('[data-testid=photo-gallery]')
  await page.waitForTimeout(500)
  check('gallery shows all 4 photos (legacy + 3 new)', (await page.locator('[data-testid=photo-gallery] li').count()) === 4)
  check('before/after badges are shown', (await page.locator('[data-testid=photo-gallery]').innerText()).includes(lang === 'hr' ? 'Prije' : 'Before'))
  await page.screenshot({ path: path.join(outDir, `${tag}_2_gallery.png`) })
  await page.locator('[data-testid=photo-gallery] button').nth(1).click()
  await page.waitForSelector('[data-testid=photo-lightbox]')
  await page.waitForTimeout(400)
  const counter = async () => (await page.locator('[data-testid=photo-counter]').innerText()).replace(/\s+/g, ' ')
  check('lightbox opens on the clicked photo (2 of 4)', /2\D+4/.test(await counter()), await counter())
  check('lightbox shows caption', (await page.locator('[data-testid=photo-caption]').innerText()).includes('Vrata kabine'))
  await page.screenshot({ path: path.join(outDir, `${tag}_3_lightbox.png`) })
  await page.keyboard.press('ArrowRight')
  check('ArrowRight -> 3 of 4', /3\D+4/.test(await counter()), await counter())
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
  check('ArrowLeft x2 -> 1 of 4', /1\D+4/.test(await counter()), await counter())
  await page.keyboard.press('ArrowLeft')
  check('ArrowLeft wraps to 4 of 4', /4\D+4/.test(await counter()), await counter())
  // swipe left = next (pointer events, like a finger)
  const img = page.locator('[data-testid=photo-lightbox-image]')
  const box = await img.boundingBox()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 }); await page.mouse.up()
  check('swipe left -> next (1 of 4)', /1\D+4/.test(await counter()), await counter())
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 }); await page.mouse.up()
  check('swipe right -> previous (4 of 4)', /4\D+4/.test(await counter()), await counter())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Esc closes the lightbox', (await page.locator('[data-testid=photo-lightbox]').count()) === 0)
  check('gallery dialog is still open after closing the lightbox', (await page.locator('[data-testid=photo-gallery]').count()) === 1)
  await page.keyboard.press('Escape')

  // ------------------------------------------------------------------ 2. create flow
  console.log(`\n[create intervention with photos ${W}px ${lang}]`)
  await goto('/dashboard/home')
  await page.click('div.fixed.bottom-4 button')
  const items = page.locator('[role=menuitem]')
  const count = await items.count()
  let opened = false
  for (let k = 0; k < count && !opened; k++) {
    if (k > 0) await page.click('div.fixed.bottom-4 button')
    await items.nth(k).click()
    try { await page.waitForSelector('[data-testid=photo-picker]', { timeout: 2500 }); opened = true } catch { await page.keyboard.press('Escape').catch(() => {}) }
  }
  check('intervention dialog with photo picker opened', opened)
  if (!opened) { await browser.close(); process.exit(1) }

  const camera = page.locator('[data-testid=photo-input-camera]')
  check('camera input uses capture=environment', (await camera.getAttribute('capture')) === 'environment')
  const gallery = page.locator('[data-testid=photo-input-gallery]')
  check('gallery input is multiple, images only, without capture', (await gallery.getAttribute('multiple')) !== null && (await gallery.getAttribute('capture')) === null && (await gallery.getAttribute('accept')) === 'image/*')
  const cameraButtons = await page.locator('[data-testid=photo-picker] button', { hasText: lang === 'hr' ? 'Slikaj' : 'Take photo' }).count()
  check(width < 1024 ? 'camera button shown on a touch phone' : 'camera button hidden on desktop (no touch)', width < 1024 ? cameraButtons === 1 : cameraButtons === 0)

  await page.fill('#int-location', 'Lokacija 2')
  await page.locator('li', { hasText: 'Lokacija 2' }).first().click().catch(() => {})
  await page.locator('#int-location').blur()

  const t0 = Date.now()
  await gallery.setInputFiles([fx('big-o6-4000x3000.jpg'), fx('o8-portrait-1200x900.jpg'), fx('fake.jpg')])
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=photo-list] li[data-status=processing]').length === 0, null, { timeout: 15000 })
  console.log(`  (3 files prepared in ${Date.now() - t0} ms)`)
  check('ALL 3 selected files are listed (not just the first)', (await page.locator('[data-testid=photo-list] li').count()) === 3)
  check('2 previews + 1 error', (await page.locator('[data-testid=photo-list] li[data-status=ready]').count()) === 2 && (await page.locator('[data-testid=photo-list] li[data-status=error]').count()) === 1)
  const errText = await page.locator('[data-testid=photo-list] li[data-status=error]').innerText()
  check('broken file shows a translated error (no raw keys)', !/interventions:|photos\./.test(errText) && errText.length > 10, errText.replace(/\s+/g, ' '))
  const previewDims = await page.locator('[data-testid=photo-list] li[data-status=ready] img').first().evaluate((i) => [i.naturalWidth, i.naturalHeight])
  check('preview is the processed image (1200x1600 for the 4000x3000 orientation-6 photo)', previewDims[0] === 1200 && previewDims[1] === 1600, JSON.stringify(previewDims))
  await page.locator('[data-testid=photo-picker]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(outDir, `${tag}_4_picker.png`) })

  // remove the broken one, tag + caption the first
  await page.locator('[data-testid=photo-list] li[data-status=error] button[aria-label]').first().click()
  check('removing the broken photo leaves 2', (await page.locator('[data-testid=photo-list] li').count()) === 2)
  const first = page.locator('[data-testid=photo-list] li').first()
  await first.locator('select').selectOption('before')
  await first.locator('input[type=text]').fill('Vrata kabine')

  // signatures
  const canvases = page.locator('[role=dialog] canvas')
  for (let c = 0; c < (await canvases.count()); c++) {
    await canvases.nth(c).scrollIntoViewIfNeeded()
    const b = await canvases.nth(c).boundingBox()
    await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.mouse.move(b.x + b.width - 20, b.y + 30, { steps: 6 }); await page.mouse.up()
  }
  await page.locator('[role=dialog] button[type=submit]').scrollIntoViewIfNeeded()
  await page.locator('[role=dialog] button[type=submit]').click()
  await page.waitForSelector('[data-testid=photo-list] li[data-status=error]', { timeout: 10000 })
  await page.waitForTimeout(300)
  check('intervention was created exactly once, WITHOUT images in the create request', order.filter((o) => o === 'create').length === 1 && requests.find((r) => r.createContentType)?.hasImages === false)
  check('signing waits: not signed while a photo failed', !order.includes('sign'))
  const failedLi = page.locator('[data-testid=photo-list] li[data-status=error]')
  check('exactly the failed photo shows an error + retry button', (await failedLi.count()) === 1 && (await failedLi.locator('button', { hasText: lang === 'hr' ? 'Pokušaj ponovno' : 'Try again' }).count()) === 1)
  check('the other photo is marked uploaded', (await page.locator('[data-testid=photo-list] li[data-status=uploaded]').count()) === 1)
  await page.locator('[role=dialog] [data-testid=photo-picker]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(outDir, `${tag}_5_failed.png`) })
  await failedLi.locator('button', { hasText: lang === 'hr' ? 'Pokušaj ponovno' : 'Try again' }).click()
  await page.waitForSelector('[role=dialog]', { state: 'detached', timeout: 10000 }).catch(async (e) => { await page.screenshot({ path: path.join(outDir, tag + '_dbg.png') }); console.log('TOASTS', await page.locator('[data-sonner-toast]').allInnerTexts(), 'order', order.join()); throw e })
  const posts = requests.filter((r) => r.requestId)
  const ids = [...new Set(posts.map((r) => r.requestId))]
  check('3 photo POSTs (ok, failed, retried) for 2 distinct client_request_ids', posts.length === 3 && ids.length === 2, `${posts.length} posts, ${ids.length} ids`)
  check('retry reuses the SAME client_request_id (server dedupes)', posts[1].requestId === posts[2].requestId, JSON.stringify(posts.map((r) => r.requestId)))
  check('first photo carries kind=before + caption', posts[0].kind === 'before' && posts[0].caption === 'Vrata kabine', JSON.stringify(posts[0]))
  check('uploaded photos are compressed (< 400 KB each, was 1.3 MB / 130 KB)', posts.every((r) => r.bytes < 400 * 1024), posts.map((r) => r.bytes).join(','))
  check('taken_at is sent', posts.every((r) => r.takenAt))
  check('order: create -> photos -> sign, sign exactly once', order.join(',') === 'create,sign', order.join(','))
  await page.screenshot({ path: path.join(outDir, `${tag}_6_done.png`) })

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})()
