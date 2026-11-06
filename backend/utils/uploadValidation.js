const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/*
 * Shared upload hardening: the REAL file type comes from the first bytes of the content ("magic bytes"),
 * never from the client's mimetype or file extension. File names are generated on the server
 * (<companyId>-... prefix, extension from the detected type) so a client can never choose a name or an extension.
 */

const MB = 1024 * 1024;
const PHOTO_MAX_BYTES = 10 * MB;          // per photo (the app compresses to ~0.3-1 MB before sending)
const PHOTO_MAX_PER_REQUEST = 10;         // legacy multi-file POST /api/interventions
const PHOTO_MAX_PER_INTERVENTION = 30;    // photos stored in intervention_photos per intervention

const TYPES = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', image: true },
  png: { mime: 'image/png', ext: 'png', image: true },
  webp: { mime: 'image/webp', ext: 'webp', image: true },
  gif: { mime: 'image/gif', ext: 'gif', image: true },
  pdf: { mime: 'application/pdf', ext: 'pdf', image: false }
};
const PHOTO_MIMES = new Set([TYPES.jpeg.mime, TYPES.png.mime, TYPES.webp.mime]);

function sniffFileType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return TYPES.jpeg;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return TYPES.png;
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return TYPES.webp;
  const head6 = buf.toString('latin1', 0, 6);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return TYPES.gif;
  if (buf.toString('latin1', 0, 5) === '%PDF-') return TYPES.pdf;
  return null;
}

function jpegDimensions(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webpDimensions(buf) {
  const chunk = buf.toString('latin1', 12, 16);
  if (chunk === 'VP8X' && buf.length >= 30) {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const b = buf.readUInt32LE(21);
    return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ' && buf.length >= 30) {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

// Width/height from the file header, or null when it cannot be read (never throws).
function imageDimensions(buf, type) {
  try {
    let dims = null;
    if (type === TYPES.jpeg) dims = jpegDimensions(buf);
    else if (type === TYPES.png && buf.length >= 24) dims = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    else if (type === TYPES.webp) dims = webpDimensions(buf);
    else if (type === TYPES.gif && buf.length >= 10) dims = { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (dims && dims.width > 0 && dims.height > 0 && dims.width <= 65535 && dims.height <= 65535) return dims;
  } catch {
    // fall through
  }
  return null;
}

// "<companyId>-<label>-<time>-<random>.<ext>" (matches the ownership rule in utils/uploadsAccess.js)
function safeUploadName(companyId, type, label = '') {
  const cid = Number(companyId);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error('companyId required for upload names');
  const middle = label ? `${String(label).replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}-` : '';
  return `${cid}-${middle}${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${type.ext}`;
}

function removeFiles(paths) {
  for (const p of paths || []) {
    try { fs.unlinkSync(p); } catch { /* already gone */ }
  }
}

// Wraps a multer middleware so every upload failure becomes a JSON error with a stable `code`
// (the frontend translates by code; err.message is never sent to the client).
function withUploadErrors(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Photo is too large', code: 'photo_too_large' });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Too many files in one request', code: 'too_many_photos' });
      }
      return res.status(400).json({ error: 'Upload failed', code: 'upload_failed' });
    });
  };
}

const uploadsRoot = (...parts) => path.join(__dirname, '..', 'uploads', ...parts);

module.exports = {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_PER_REQUEST,
  PHOTO_MAX_PER_INTERVENTION,
  PHOTO_MIMES,
  TYPES,
  sniffFileType,
  imageDimensions,
  safeUploadName,
  removeFiles,
  withUploadErrors,
  uploadsRoot
};
