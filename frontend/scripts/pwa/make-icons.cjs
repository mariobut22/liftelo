/* Generates the PWA icons in frontend/public/icons from the official Liftelo mark (docs/marketing/logo/liftelo-icon-white.svg).
 * Dev tool, run only when the logo changes (the PNGs are committed):
 *   cd frontend && NODE_PATH=$(npm root -g) node scripts/pwa/make-icons.cjs
 * Output: icon-192.png, icon-512.png (purpose any), icon-maskable-512.png (mark inside the 80% safe zone), apple-touch-icon.png (180).
 * All are opaque (#18181b background, white mark): iOS fills transparency with black and Android masks "maskable" icons. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BG = '#18181b'
const out = path.join(__dirname, '..', '..', 'public', 'icons')
fs.mkdirSync(out, { recursive: true })

// The mark occupies x 14..52, y 6..58 of the 64x64 viewBox (see the svg); center it and scale to `fraction` of the canvas height
const mark = '<path d="M14 6h15v38h21v14H14z"/><rect x="36" y="10" width="16" height="20" rx="2.5"/>'
const html = (size, fraction) => {
  const scale = (size * fraction) / 52 // mark height is 52 units
  const tx = size / 2 - 33 * scale // mark center x is 33
  const ty = size / 2 - 32 * scale // mark center y is 32
  return `<html><body style="margin:0;background:${BG}"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${BG}"/><g fill="#ffffff" transform="translate(${tx} ${ty}) scale(${scale})">${mark}</g></svg></body></html>`
}

;(async () => {
  const browser = await chromium.launch()
  const jobs = [
    ['icon-192.png', 192, 0.62],
    ['icon-512.png', 512, 0.62],
    ['icon-maskable-512.png', 512, 0.5],
    ['apple-touch-icon.png', 180, 0.62],
  ]
  for (const [name, size, fraction] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(html(size, fraction))
    await page.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: size, height: size } })
    await page.close()
    console.log('wrote', name)
  }
  await browser.close()
})()
