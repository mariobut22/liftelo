// Strict parsing of what the in-app scanner reads. The scanned text is NEVER used as a URL to navigate to: only the
// token extracted here is used, and only for the authenticated lookup GET /api/elevators/by-qr/:token (open-redirect /
// phishing safe). Same token shape as the backend (QR_TOKEN_RE in backend/routes/elevators.js).
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/
const PATH_RE = /^\/q\/([A-Za-z0-9_-]{16,64})\/?$/

/** Returns the token of a Liftelo sticker (`<our origin>/q/<token>` or a bare token), otherwise null. */
export function parseScannedCode(raw: string, origin: string = window.location.origin): string | null {
  const text = String(raw ?? '').trim()
  if (!text || text.length > 2048) return null
  if (TOKEN_RE.test(text)) return text
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.origin !== origin) return null // other host, port or scheme: not ours
  if (url.username || url.password) return null
  const match = PATH_RE.exec(url.pathname)
  return match ? match[1] : null
}

// Minimal typing of the native BarcodeDetector (not in lib.dom for all TS versions)
type NativeDetector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
type NativeDetectorCtor = {
  new (options?: { formats?: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

/** Returns a function that decodes the QR text of the current video frame (or null). Native API first, jsQR otherwise. */
export async function createQrDecoder(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const Native = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? ['qr_code']
      if (formats.includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] })
        return async (video) => {
          const found = await detector.detect(video)
          return found.length > 0 ? found[0].rawValue : null
        }
      }
    } catch {
      // fall through to the JS decoder
    }
  }
  const { default: jsQR } = await import('jsqr') // separate chunk, only loaded where the browser has no BarcodeDetector
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    if (!context || !video.videoWidth || !video.videoHeight) return null
    const scale = Math.min(1, 640 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
    return result ? result.data : null
  }
}
