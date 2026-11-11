// QR labels for elevators. The QR code encodes `<origin>/q/<token>` (opaque per-elevator token, never the numeric id).
// Generated fully client-side with the `qrcode` package (MIT); nothing is sent to any external service.
import QRCode from 'qrcode'

// Error correction level Q (~25% recoverable): robust against scratched/dirty stickers while staying scannable at small sizes.
const QR_OPTIONS = { errorCorrectionLevel: 'Q' as const }
const QUIET_ZONE = 4 // modules, as required by the QR spec

export const qrUrl = (token: string, origin: string = window.location.origin) => `${origin}/q/${encodeURIComponent(token)}`

export const shortCode = (token: string) => token.slice(0, 6)

export function qrShape(text: string): { size: number; viewBox: string; path: string } {
  const qr = QRCode.create(text, QR_OPTIONS)
  const size = qr.modules.size
  const data = qr.modules.data
  let path = ''
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (data[row * size + col]) path += `M${col} ${row}h1v1h-1z`
    }
  }
  const total = size + QUIET_ZONE * 2
  return { size, viewBox: `${-QUIET_ZONE} ${-QUIET_ZONE} ${total} ${total}`, path }
}

export function qrSvgString(text: string): string {
  const { size, viewBox, path } = qrShape(text)
  const total = size + QUIET_ZONE * 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${total * 10}" height="${total * 10}" shape-rendering="crispEdges">` +
    `<rect x="${-QUIET_ZONE}" y="${-QUIET_ZONE}" width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  )
}

export function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { ...QR_OPTIONS, margin: QUIET_ZONE, width: 1024 })
}

export function fileSafeName(...parts: Array<string | null | undefined>): string {
  const joined = parts.filter(Boolean).join('-')
  const cleaned = joined.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return (cleaned || 'qr').slice(0, 80)
}

export function downloadHref(href: string, filename: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function downloadSvg(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  downloadHref(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
