/*
 * Pure (DOM-free) parts of the client-side image pipeline: sizing, JPEG header parsing (EXIF orientation,
 * metadata detection), orientation transforms. Kept separate from imagePipeline.ts so they can be unit-tested in
 * node (frontend/scripts/image-check/core-test.cjs).
 */

export const MAX_EDGE = 1600
export const JPEG_QUALITY = 0.8
/** Files at or under this size that need no work are sent as they are. */
export const SMALL_BYTES = 350 * 1024
/** Anything bigger than this is refused before decoding (a phone photo is 2-15 MB). */
export const MAX_INPUT_BYTES = 60 * 1024 * 1024

export type Size = { width: number; height: number }

/** Scale (width, height) down so the long edge is at most `maxEdge`; never scales up. */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): Size & { scaled: boolean } {
  const longEdge = Math.max(width, height)
  if (!(longEdge > maxEdge)) return { width, height, scaled: false }
  const ratio = maxEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  }
}

export type SniffedType = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic' | 'unknown'

/** Type from the first bytes (the browser's file.type is empty or wrong for some camera/HEIC files). */
export function sniffImageType(bytes: Uint8Array): SniffedType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(bytes.subarray(from, to)))
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (bytes.length >= 6 && ascii(0, 3) === 'GIF') return 'gif'
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic'
  }
  return 'unknown'
}

type JpegSegments = {
  /** APP1 (EXIF / XMP) or APP13 (Photoshop / IPTC) present: location, time, camera info */
  hasMetadata: boolean
  orientation: number
  size: Size | null
}

/** Walks the JPEG marker segments up to the start of scan. Never throws; unknown input gives neutral values. */
export function parseJpeg(bytes: Uint8Array): JpegSegments {
  const out: JpegSegments = { hasMetadata: false, orientation: 1, size: null }
  if (!(bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8)) return out
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue }
    const marker = bytes[i + 1]
    if (marker === 0xff) { i += 1; continue }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    if (marker === 0xd9 || marker === 0xda) break // end of image / start of scan
    const length = view.getUint16(i + 2)
    if (length < 2) break
    const start = i + 4
    if (marker === 0xe1 || marker === 0xed) {
      out.hasMetadata = true
      if (marker === 0xe1 && out.orientation === 1) out.orientation = readExifOrientation(view, start, i + 2 + length)
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && start + 5 <= bytes.length) {
      out.size = { height: view.getUint16(start + 1), width: view.getUint16(start + 3) }
    }
    i += 2 + length
  }
  return out
}

/** Copy of a JPEG without its APP1/APP13 segments (EXIF, XMP, IPTC). Image data is untouched. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (!(bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8)) return bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { parts.push(bytes.subarray(i, i + 2)); i += 2; continue }
    const length = view.getUint16(i + 2)
    if (length < 2) break
    if (!(marker === 0xe1 || marker === 0xed)) parts.push(bytes.subarray(i, i + 2 + length))
    i += 2 + length
  }
  parts.push(bytes.subarray(i)) // start of scan, image data, end marker
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  parts.forEach((part) => { out.set(part, offset); offset += part.length })
  return out
}

function readExifOrientation(view: DataView, start: number, end: number): number {
  try {
    // "Exif\0\0" then a TIFF header
    if (end - start < 14 || view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return 1
    const tiff = start + 6
    const little = view.getUint16(tiff) === 0x4949
    if (!little && view.getUint16(tiff) !== 0x4d4d) return 1
    const ifd = tiff + view.getUint32(tiff + 4, little)
    if (ifd + 2 > end) return 1
    const entries = view.getUint16(ifd, little)
    for (let n = 0; n < entries; n += 1) {
      const entry = ifd + 2 + n * 12
      if (entry + 12 > end) return 1
      if (view.getUint16(entry, little) === 0x0112) {
        const value = view.getUint16(entry + 8, little)
        return value >= 1 && value <= 8 ? value : 1
      }
    }
  } catch {
    // truncated EXIF: treat as no orientation
  }
  return 1
}

/**
 * 2D transform that draws an image stored in EXIF orientation `o` (1-8) upright onto a canvas of the returned size.
 * Matrix is for ctx.setTransform(a, b, c, d, e, f) before drawImage(img, 0, 0).
 */
export function orientationTransform(
  orientation: number,
  width: number,
  height: number
): { canvas: Size; matrix: [number, number, number, number, number, number] } {
  const w = width
  const h = height
  switch (orientation) {
    case 2: return { canvas: { width: w, height: h }, matrix: [-1, 0, 0, 1, w, 0] }
    case 3: return { canvas: { width: w, height: h }, matrix: [-1, 0, 0, -1, w, h] }
    case 4: return { canvas: { width: w, height: h }, matrix: [1, 0, 0, -1, 0, h] }
    case 5: return { canvas: { width: h, height: w }, matrix: [0, 1, 1, 0, 0, 0] }
    case 6: return { canvas: { width: h, height: w }, matrix: [0, 1, -1, 0, h, 0] }
    case 7: return { canvas: { width: h, height: w }, matrix: [0, -1, -1, 0, h, w] }
    case 8: return { canvas: { width: h, height: w }, matrix: [0, -1, 1, 0, 0, w] }
    default: return { canvas: { width: w, height: h }, matrix: [1, 0, 0, 1, 0, 0] }
  }
}

/**
 * The browser may or may not have applied the EXIF rotation while decoding. For orientations 5-8 the decoded size
 * tells us: if it still equals the raw (SOF) size, the rotation has NOT been applied and we must do it.
 * (Orientations 2-4 keep the size, so they cannot be detected this way; modern browsers apply them.)
 */
export function needsManualRotation(orientation: number, raw: Size | null, decoded: Size): boolean {
  if (orientation < 5 || !raw) return false
  if (raw.width === raw.height) return false
  return decoded.width === raw.width && decoded.height === raw.height
}

/** Send the original untouched only when nothing about it needs fixing and it carries no metadata. */
export function canKeepOriginal(input: {
  type: SniffedType
  bytes: number
  width: number
  height: number
  orientation: number
  hasMetadata: boolean
}): boolean {
  if (input.type !== 'jpeg' && input.type !== 'png' && input.type !== 'webp') return false
  if (input.bytes > SMALL_BYTES) return false
  if (Math.max(input.width, input.height) > MAX_EDGE) return false
  if (input.orientation !== 1 || input.hasMetadata) return false
  return true
}

/** ISO time of capture (browsers expose it as lastModified for camera files); null when implausible. */
export function takenAtFrom(lastModified: number | undefined, now = Date.now()): string | null {
  if (!lastModified || lastModified < Date.UTC(2000, 0, 1) || lastModified > now + 24 * 3600 * 1000) return null
  return new Date(lastModified).toISOString()
}
