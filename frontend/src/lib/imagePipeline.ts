import {
  JPEG_QUALITY,
  MAX_EDGE,
  MAX_INPUT_BYTES,
  canKeepOriginal,
  fitWithin,
  needsManualRotation,
  orientationTransform,
  parseJpeg,
  sniffImageType,
  stripJpegMetadata,
  takenAtFrom,
  type SniffedType,
} from './imageCore'

/*
 * Client-side photo pipeline (runs on the phone before anything is sent):
 *   decode -> correct EXIF orientation -> shrink to MAX_EDGE (1600 px long edge) -> JPEG 0.8 -> metadata-free blob.
 * Re-encoding through a canvas drops EXIF/GPS/camera data (privacy). Small files that need no work are kept as is.
 * Output is a plain Blob + metadata, so the same function feeds the live upload and a later offline outbox.
 */

export type ImageErrorCode = 'not_an_image' | 'heic_unsupported' | 'decode_failed' | 'encode_failed' | 'too_large'

export class ImageProcessError extends Error {
  code: ImageErrorCode

  constructor(code: ImageErrorCode) {
    super(code)
    this.name = 'ImageProcessError'
    this.code = code
  }
}

export type ProcessedImage = {
  blob: Blob
  mime: string
  width: number
  height: number
  originalBytes: number
  /** true when the original was sent untouched (small, upright, no metadata) */
  kept: boolean
  takenAt: string | null
}

export type ProcessOptions = {
  maxEdge?: number
  quality?: number
  /**
   * Test hook: 'manual' strips the EXIF block before decoding, so the browser cannot rotate, and applies the rotation
   * with our own code (the path used when a browser decodes JPEGs without honoring EXIF). Default 'auto'.
   */
  orientation?: 'auto' | 'manual'
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void }

async function decode(file: File | Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // fall back to an <img> element below
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', quality))
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export async function processImage(file: File | Blob, options: ProcessOptions = {}): Promise<ProcessedImage> {
  const maxEdge = options.maxEdge ?? MAX_EDGE
  const quality = options.quality ?? JPEG_QUALITY
  const mode = options.orientation ?? 'auto'

  if (file.size > MAX_INPUT_BYTES) throw new ImageProcessError('too_large')

  // Look at the real bytes: file.type is empty/wrong for some camera and HEIC files.
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())
  const type: SniffedType = sniffImageType(head)
  const declaredHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test((file as File).name || '')
  const isHeic = type === 'heic' || declaredHeic
  if (type === 'unknown' && !isHeic && !/^image\//i.test(file.type)) throw new ImageProcessError('not_an_image')

  const jpeg = type === 'jpeg' ? parseJpeg(head) : null
  const orientation = jpeg?.orientation ?? 1
  const lastModified = (file as File).lastModified
  const takenAt = takenAtFrom(lastModified)

  let decoded: Decoded
  try {
    // 'manual' (test hook): remove the EXIF block first so NO browser can rotate, then rotate with our own code
    const input =
      mode === 'manual' && type === 'jpeg' ? new Blob([stripJpegMetadata(new Uint8Array(await file.arrayBuffer())) as BlobPart], { type: 'image/jpeg' }) : file
    decoded = await decode(input)
  } catch {
    // iOS Safari usually converts HEIC to JPEG when the picker is used; if we still got HEIC and cannot read it, say so
    throw new ImageProcessError(isHeic ? 'heic_unsupported' : 'decode_failed')
  }

  try {
    if (
      mode === 'auto' &&
      canKeepOriginal({
        type,
        bytes: file.size,
        width: decoded.width,
        height: decoded.height,
        orientation,
        hasMetadata: jpeg?.hasMetadata ?? false,
      })
    ) {
      return {
        blob: file,
        mime: file.type || (type === 'png' ? 'image/png' : type === 'webp' ? 'image/webp' : 'image/jpeg'),
        width: decoded.width,
        height: decoded.height,
        originalBytes: file.size,
        kept: true,
        takenAt,
      }
    }

    await yieldToUi()

    // 'manual' mode never trusts the browser; 'auto' only fixes up when it did not rotate a 5-8 orientation
    const rotateOurselves =
      mode === 'manual' ? orientation > 1 : needsManualRotation(orientation, jpeg?.size ?? null, decoded)
    const transform = rotateOurselves
      ? orientationTransform(orientation, decoded.width, decoded.height)
      : { canvas: { width: decoded.width, height: decoded.height }, matrix: [1, 0, 0, 1, 0, 0] as const }

    const target = fitWithin(transform.canvas.width, transform.canvas.height, maxEdge)
    const canvas = makeCanvas(target.width, target.height)
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new ImageProcessError('encode_failed')
    ctx.fillStyle = '#ffffff' // JPEG has no alpha: transparent PNG areas become white, not black
    ctx.fillRect(0, 0, target.width, target.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const scale = target.width / transform.canvas.width
    const [a, b, c, d, e, f] = transform.matrix
    ctx.setTransform(a * scale, b * scale, c * scale, d * scale, e * scale, f * scale)
    ctx.drawImage(decoded.source, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    const blob = await canvasToJpeg(canvas, quality)
    if (!blob || blob.size === 0) throw new ImageProcessError('encode_failed')

    return {
      blob,
      mime: 'image/jpeg',
      width: target.width,
      height: target.height,
      originalBytes: file.size,
      kept: false,
      takenAt,
    }
  } catch (error) {
    if (error instanceof ImageProcessError) throw error
    throw new ImageProcessError('encode_failed')
  } finally {
    decoded.close()
  }
}
