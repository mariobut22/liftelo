/* Generates the fake-camera videos for qr-scan-check.cjs: one 2 s .y4m per scenario (a QR code on a white frame).
 * Usage:  node scripts/mobile-check/qr-scan-assets.cjs <outDir outside repo>   [ORIGIN=http://localhost:5605]
 * Needs ImageMagick (`convert`) and `ffmpeg` on PATH; the QR is drawn with the repo's own `qrcode` dependency. */
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const QRCode = require(path.join(__dirname, '..', '..', 'node_modules', 'qrcode'))

const out = process.argv[2]
if (!out) throw new Error('usage: qr-scan-assets.cjs <outDir>')
fs.mkdirSync(out, { recursive: true })
const O = process.env.ORIGIN || 'http://localhost:5605'
// tokens are the mock API's (mock.cjs qrTokenFor): elevator 11 = Lift A of location 1, 22 = Lift B of location 2
const items = {
  valid: `${O}/q/Qk7Zp2mX9aLw4RtYb0110Zee`,
  valid2: `${O}/q/Qk7Zp2mX9aLw4RtYb0220Zee`,
  bare: 'Qk7Zp2mX9aLw4RtYb0110Zee',
  foreign: 'https://evil.example.com/q/Qk7Zp2mX9aLw4RtYb0110Zee',
  garbage: 'WIFI:S:cafe;T:WPA;P:secret;;',
  unknown: `${O}/q/Zzzzzzzzzzzzzzzzzzzz9999`,
}
;(async () => {
  for (const [name, text] of Object.entries(items)) {
    const qr = path.join(out, `${name}-qr.png`)
    await QRCode.toFile(qr, text, { errorCorrectionLevel: 'Q', width: 360, margin: 4 })
    const frame = path.join(out, `${name}.png`)
    execFileSync('convert', ['-size', '640x480', 'xc:white', qr, '-gravity', 'center', '-composite', frame])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', frame, '-t', '2', '-r', '10', '-pix_fmt', 'yuv420p', path.join(out, `${name}.y4m`)])
    console.log(name, text)
  }
})()
