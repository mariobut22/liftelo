/* Real-browser test of the photo pipeline (src/lib/imagePipeline.ts) with real JPEG files. Needs the dev server:
 *   cd frontend && npx vite --port 5602 &
 *   python3 scripts/image-check/make-fixtures.py <fixtureDir>
 *   NODE_PATH=$(npm root -g) node scripts/image-check/pipeline-check.cjs <fixtureDir>     (exit 1 on failure)
 * For each fixture the output is decoded again and the four corner colours are sampled, so a wrong orientation, wrong size,
 * or surviving EXIF/GPS data fails the check. Each file is processed twice: 'auto' (browser applies EXIF) and 'manual'
 * (our own rotation code, used on browsers without imageOrientation support). */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE || 'http://localhost:5602'
const dir = process.argv[2]
if (!dir) { console.error('usage: pipeline-check.cjs <fixtureDir>'); process.exit(2) }

let failures = 0
let passes = 0
const check = (name, ok, extra = '') => { if (ok) { passes += 1; console.log('  ok    ' + name) } else { failures += 1; console.log('  FAIL  ' + name + (extra ? '  ' + extra : '')) } }

const near = (c, expected) => c.every((v, i) => Math.abs(v - expected[i]) < 60)
const RED = [230, 30, 30], GREEN = [30, 200, 30], BLUE = [30, 30, 230], YELLOW = [240, 220, 20]

const CASES = [
  // file, expected output size, expect kept as is
  ['small-upright.jpg', [800, 600], true],
  ['o6-portrait-1200x900.jpg', [900, 1200], false],
  ['o8-portrait-1200x900.jpg', [900, 1200], false],
  ['o3-1000x700.jpg', [1000, 700], false],
  ['big-4000x3000-gps.jpg', [1600, 1200], false],
  ['big-o6-4000x3000.jpg', [1200, 1600], false],
]

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const run = async (file, mode, mime = 'image/jpeg') => {
    const b64 = fs.readFileSync(path.join(dir, file)).toString('base64')
    return page.evaluate(async ({ b64, file, mode, mime }) => {
      const { processImage } = await import('/src/lib/imagePipeline.ts')
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const f = new File([bytes], file, { type: mime, lastModified: 1762596000000 })
      const t0 = performance.now()
      try {
        const r = await processImage(f, { orientation: mode })
        const ms = Math.round(performance.now() - t0)
        const out = new Uint8Array(await r.blob.arrayBuffer())
        // metadata: any APP1/APP13 segment, or the ASCII "Exif"/"GPS"
        let hasApp1 = false
        if (out[0] === 0xff && out[1] === 0xd8) {
          let i = 2
          while (i + 4 < out.length && out[i] === 0xff) {
            const m = out[i + 1]
            if (m === 0xe1 || m === 0xed) hasApp1 = true
            if (m === 0xda) break
            i += 2 + ((out[i + 2] << 8) | out[i + 3])
          }
        }
        const text = new TextDecoder('latin1').decode(out.subarray(0, 4096))
        // decode the OUTPUT (honoring any EXIF it might still have) and sample the 4 corners
        const bmp = await createImageBitmap(r.blob, { imageOrientation: 'from-image' })
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
        const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0)
        const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
        const m = Math.max(6, Math.round(Math.min(bmp.width, bmp.height) / 14))
        return {
          ok: true, ms, width: bmp.width, height: bmp.height, kept: r.kept, bytes: r.blob.size, original: r.originalBytes, mime: r.mime, takenAt: r.takenAt,
          hasApp1, hasExifText: /Exif|GPS|TestCamera/.test(text),
          tl: px(m, m), tr: px(bmp.width - m, m), bl: px(m, bmp.height - m), br: px(bmp.width - m, bmp.height - m),
        }
      } catch (e) {
        return { ok: false, code: e && e.code, message: String(e && e.message) }
      }
    }, { b64, file, mode, mime })
  }

  for (const mode of ['auto', 'manual']) {
    console.log(`\n[${mode} orientation mode]`)
    for (const [file, [w, h], kept] of CASES) {
      if (mode === 'manual' && kept) continue // 'manual' never short-circuits
      const r = await run(file, mode)
      if (!r.ok) { check(`${file} processed`, false, JSON.stringify(r)); continue }
      check(`${file}: ${w}x${h}`, r.width === w && r.height === h, `got ${r.width}x${r.height}`)
      check(`${file}: corners red/green/blue/yellow upright`, near(r.tl, RED) && near(r.tr, GREEN) && near(r.bl, BLUE) && near(r.br, YELLOW), JSON.stringify([r.tl, r.tr, r.bl, r.br]))
      if (mode === 'auto') check(`${file}: ${kept ? 'kept as is' : 're-encoded'}`, r.kept === kept)
      if (!r.kept) check(`${file}: no EXIF/GPS/camera data left`, !r.hasApp1 && !r.hasExifText)
      if (file.startsWith('big')) check(`${file}: ${(r.original / 1024 / 1024).toFixed(2)} MB -> ${Math.round(r.bytes / 1024)} KB (smaller, JPEG), ${r.ms} ms`, r.bytes < r.original / 2 && r.mime === 'image/jpeg')
      if (mode === 'auto' && file === 'o6-portrait-1200x900.jpg') check('takenAt comes from lastModified', r.takenAt === new Date(1762596000000).toISOString(), String(r.takenAt))
    }
  }

  console.log('\n[unreadable input -> typed errors, never a junk upload]')
  let r = await run('fake.jpg', 'auto')
  check('HTML named .jpg -> decode_failed (or not_an_image)', !r.ok && ['decode_failed', 'not_an_image'].includes(r.code), JSON.stringify(r))
  r = await run('iphone.heic', 'auto', 'image/heic')
  check('HEIC the browser cannot decode -> heic_unsupported', !r.ok && r.code === 'heic_unsupported', JSON.stringify(r))
  r = await run('notes.pdf', 'auto', 'application/pdf')
  check('PDF -> not_an_image', !r.ok && r.code === 'not_an_image', JSON.stringify(r))

  await browser.close()
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(failures ? 1 : 0)
})()
