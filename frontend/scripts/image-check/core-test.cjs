/* Unit test of the pure parts of the photo pipeline (src/lib/imageCore.ts). No browser needed.
 *   cd frontend && node scripts/image-check/core-test.cjs
 */
const assert = require('assert')
const path = require('path')
const esbuild = require('esbuild')

const src = path.join(__dirname, '..', '..', 'src', 'lib', 'imageCore.ts')
const code = esbuild.buildSync({ entryPoints: [src], bundle: true, format: 'cjs', write: false, platform: 'node' }).outputFiles[0].text
const mod = { exports: {} }
new Function('module', 'exports', code)(mod, mod.exports)
const core = mod.exports

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log('  ok    ' + name) }

// JPEG builder: SOI, optional APP1 EXIF (orientation, little or big endian), SOF0 (w x h), SOS
function exifApp1(orientation, little = true) {
  const u16 = (v) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255])
  const u32 = (v) => (little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255])
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)]
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const len = body.length + 2
  return [0xff, 0xe1, len >> 8, len & 255, ...body]
}
function jpeg({ w = 400, h = 300, orientation = null, little = true, extra = [] } = {}) {
  const sof = [0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]
  return Uint8Array.from([0xff, 0xd8, ...(orientation ? exifApp1(orientation, little) : []), ...extra, ...sof, 0xff, 0xda, 0, 2, 1, 2, 3])
}

t('fitWithin: 4000x3000 -> 1600x1200 (long edge 1600)', () => {
  assert.deepStrictEqual(core.fitWithin(4000, 3000), { width: 1600, height: 1200, scaled: true })
})
t('fitWithin: portrait 3000x4000 -> 1200x1600; never upscales; exact edge unchanged', () => {
  assert.deepStrictEqual(core.fitWithin(3000, 4000), { width: 1200, height: 1600, scaled: true })
  assert.deepStrictEqual(core.fitWithin(800, 600), { width: 800, height: 600, scaled: false })
  assert.deepStrictEqual(core.fitWithin(1600, 900), { width: 1600, height: 900, scaled: false })
})
t('fitWithin: extreme panorama keeps at least 1 px', () => {
  const r = core.fitWithin(20000, 3)
  assert.strictEqual(r.width, 1600)
  assert.ok(r.height >= 1)
})
t('parseJpeg reads size without EXIF and reports no metadata/orientation 1', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(core.parseJpeg(jpeg()))), { hasMetadata: false, orientation: 1, size: { width: 400, height: 300 } })
})
t('parseJpeg reads EXIF orientation 1-8, little and big endian', () => {
  for (let o = 1; o <= 8; o += 1) {
    for (const little of [true, false]) {
      const r = core.parseJpeg(jpeg({ orientation: o, little }))
      assert.strictEqual(r.orientation, o, `orientation ${o} ${little ? 'LE' : 'BE'}`)
      assert.strictEqual(r.hasMetadata, true)
      assert.deepStrictEqual(r.size, { width: 400, height: 300 })
    }
  }
})
t('parseJpeg: APP13 counts as metadata; JFIF (APP0) does not', () => {
  assert.strictEqual(core.parseJpeg(jpeg({ extra: [0xff, 0xed, 0, 4, 1, 2] })).hasMetadata, true)
  assert.strictEqual(core.parseJpeg(jpeg({ extra: [0xff, 0xe0, 0, 4, 1, 2] })).hasMetadata, false)
})
t('parseJpeg never throws on garbage / truncated EXIF', () => {
  assert.strictEqual(core.parseJpeg(new Uint8Array([1, 2, 3])).orientation, 1)
  assert.strictEqual(core.parseJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 8, 0x45, 0x78, 0x69, 0x66, 0, 0])).orientation, 1)
  assert.strictEqual(core.parseJpeg(jpeg({ orientation: 9 })).orientation, 1)
})
t('stripJpegMetadata removes APP1/APP13, keeps everything else decodable', () => {
  const withAll = jpeg({ orientation: 6, extra: [0xff, 0xed, 0, 4, 1, 2, 0xff, 0xe0, 0, 4, 9, 9] })
  const stripped = core.stripJpegMetadata(withAll)
  const parsed = core.parseJpeg(stripped)
  assert.strictEqual(parsed.hasMetadata, false)
  assert.strictEqual(parsed.orientation, 1)
  assert.deepStrictEqual(parsed.size, { width: 400, height: 300 })
  assert.ok(stripped.length < withAll.length)
  assert.deepStrictEqual(Array.from(stripped.subarray(-6)), Array.from(withAll.subarray(-6))) // scan data intact
  assert.strictEqual(core.stripJpegMetadata(new Uint8Array([1, 2, 3])).length, 3)
})
t('sniffImageType: jpeg, png, webp, gif, heic, unknown', () => {
  assert.strictEqual(core.sniffImageType(jpeg()), 'jpeg')
  assert.strictEqual(core.sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0])), 'png')
  assert.strictEqual(core.sniffImageType(Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')])), 'webp')
  assert.strictEqual(core.sniffImageType(Uint8Array.from(Buffer.from('GIF89a......'))), 'gif')
  assert.strictEqual(core.sniffImageType(Uint8Array.from([0, 0, 0, 24, ...Buffer.from('ftypheic'), 0, 0, 0, 0])), 'heic')
  assert.strictEqual(core.sniffImageType(Uint8Array.from(Buffer.from('<html><body>hello</body>'))), 'unknown')
})
t('orientationTransform maps the source corners to the right place (all 8 orientations)', () => {
  // source image W x H with distinctive corners; after the transform, top-left of the DISPLAYED image must be where EXIF says
  const W = 400, H = 300
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
  // expected displayed position of the source's top-left corner (0,0) for each orientation (EXIF spec)
  const expectTL = { 1: [0, 0], 2: [W, 0], 3: [W, H], 4: [0, H], 5: [0, 0], 6: [H, 0], 7: [H, W], 8: [0, W] }
  for (let o = 1; o <= 8; o += 1) {
    const { canvas, matrix } = core.orientationTransform(o, W, H)
    assert.deepStrictEqual(apply(matrix, 0, 0), expectTL[o], `top-left of orientation ${o}`)
    assert.deepStrictEqual(o >= 5 ? [canvas.width, canvas.height] : [canvas.width, canvas.height], o >= 5 ? [H, W] : [W, H])
    // the opposite corner must stay inside the canvas
    const [bx, by] = apply(matrix, W, H)
    assert.ok(bx >= 0 && bx <= canvas.width && by >= 0 && by <= canvas.height, `bottom-right inside canvas for ${o}`)
  }
  // 6 = rotate 90 clockwise: the source's top-right corner ends up bottom-right of the displayed image
  const m6 = core.orientationTransform(6, W, H).matrix
  assert.deepStrictEqual(apply(m6, W, 0), [H, W])
  // 8 = rotate 90 counter-clockwise: the source's top-right corner ends up top-left
  const m8 = core.orientationTransform(8, W, H).matrix
  assert.deepStrictEqual(apply(m8, W, 0), [0, 0])
})
t('needsManualRotation: only when a 5-8 orientation was not applied by the decoder', () => {
  const raw = { width: 4000, height: 3000 }
  assert.strictEqual(core.needsManualRotation(6, raw, { width: 3000, height: 4000 }), false) // browser rotated
  assert.strictEqual(core.needsManualRotation(6, raw, { width: 4000, height: 3000 }), true) // browser did not
  assert.strictEqual(core.needsManualRotation(1, raw, { width: 4000, height: 3000 }), false)
  assert.strictEqual(core.needsManualRotation(3, raw, { width: 4000, height: 3000 }), false)
  assert.strictEqual(core.needsManualRotation(8, null, { width: 4000, height: 3000 }), false)
  assert.strictEqual(core.needsManualRotation(6, { width: 500, height: 500 }, { width: 500, height: 500 }), false) // square
})
t('canKeepOriginal: small upright metadata-free image yes; EXIF, big file, big dimensions, rotated no', () => {
  const ok = { type: 'jpeg', bytes: 100 * 1024, width: 1200, height: 900, orientation: 1, hasMetadata: false }
  assert.strictEqual(core.canKeepOriginal(ok), true)
  assert.strictEqual(core.canKeepOriginal({ ...ok, hasMetadata: true }), false) // GPS privacy
  assert.strictEqual(core.canKeepOriginal({ ...ok, orientation: 6 }), false)
  assert.strictEqual(core.canKeepOriginal({ ...ok, bytes: 900 * 1024 }), false)
  assert.strictEqual(core.canKeepOriginal({ ...ok, width: 3000 }), false)
  assert.strictEqual(core.canKeepOriginal({ ...ok, type: 'heic' }), false)
  assert.strictEqual(core.canKeepOriginal({ ...ok, type: 'png', bytes: 50 * 1024 }), true)
})
t('takenAtFrom: valid ISO, rejects missing/ancient/future', () => {
  const now = Date.UTC(2026, 10, 9)
  assert.strictEqual(core.takenAtFrom(Date.UTC(2026, 10, 8, 10), now), '2026-11-08T10:00:00.000Z')
  assert.strictEqual(core.takenAtFrom(undefined, now), null)
  assert.strictEqual(core.takenAtFrom(0, now), null)
  assert.strictEqual(core.takenAtFrom(Date.UTC(1999, 0, 1), now), null)
  assert.strictEqual(core.takenAtFrom(now + 5 * 864e5, now), null)
})

console.log(`\n${passed} passed, 0 failed`)
