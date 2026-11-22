const fs = require('fs');
const path = require('path');
const db = require('../db');
const { sniffFileType, TYPES, uploadsRoot } = require('./uploadValidation');

/*
 * Company branding for generated PDFs (RMS, intervention, work order, monthly report): logo + accent colour.
 * PRESENTATION ONLY: nothing here is part of a document content hash (utils/reportSignatures.js hashes report rows, items, photos,
 * signatures, findings - never the company row), so changing the logo/colour can never invalidate a verification.
 * Without a (valid) logo and colour the PDFs look exactly as before.
 *
 * Storage: the logo lives in uploads/company-logos/<companyId>-<time>.<png|jpg> (uploads/ is excluded from the deploy rsync, so
 * deploys never delete it); companies.logo_path holds "/uploads/company-logos/<file>", companies.brand_accent_color "#RRGGBB".
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const LOGO_PATH = /^\/uploads\/company-logos\/(\d+)-[A-Za-z0-9._-]+\.(png|jpg)$/;
const WHITE_CONTRAST_MIN = 3;

// "#abc123" -> "#ABC123"; anything that is not exactly #RRGGBB -> null
function normalizeAccentColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toUpperCase() : null;
}

function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

const contrastWithWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

// Colour used for TEXT on white paper: the accent, darkened step by step until it is readable (contrast >= 3:1).
function readableAccent(accent) {
  let color = normalizeAccentColor(accent);
  if (!color) return null;
  for (let i = 0; i < 12 && contrastWithWhite(color) < WHITE_CONTRAST_MIN; i += 1) {
    const mixed = [0, 1, 2].map((k) => Math.round(parseInt(color.slice(1 + k * 2, 3 + k * 2), 16) * 0.85));
    color = `#${mixed.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }
  return color;
}

// Absolute path of a company's logo file, or null. Only files in uploads/company-logos that carry THIS company's id, exist and
// really are PNG/JPEG by their first bytes (an old/odd file never reaches pdfkit).
function resolveLogoFile(logoPath, companyId) {
  try {
    const match = typeof logoPath === 'string' ? LOGO_PATH.exec(logoPath) : null;
    if (!match || Number(match[1]) !== Number(companyId)) return null;
    const abs = uploadsRoot('company-logos', path.basename(logoPath));
    if (!fs.existsSync(abs)) return null;
    const fd = fs.openSync(abs, 'r');
    const head = Buffer.alloc(16);
    try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
    const type = sniffFileType(head);
    return type === TYPES.png || type === TYPES.jpeg ? abs : null;
  } catch {
    return null;
  }
}

/** { logo: absolute path | null, accent: '#RRGGBB' | null, heading: readable accent for text | null } for one company. */
async function loadBranding(companyId) {
  let source;
  try {
    [[source]] = await db.query('SELECT logo_path, brand_accent_color FROM companies WHERE id = ? LIMIT 1', [companyId]);
  } catch (err) {
    // brand_accent_color not migrated yet: fall back to the logo only (and the default look for the colour)
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    [[source]] = await db.query('SELECT logo_path FROM companies WHERE id = ? LIMIT 1', [companyId]);
  }
  const accent = normalizeAccentColor(source?.brand_accent_color);
  return {
    logo: resolveLogoFile(source?.logo_path, companyId),
    accent,
    heading: readableAccent(accent)
  };
}

// Draws the company logo inside the box, right aligned and vertically centred. Never throws (a broken image must not break the PDF).
function drawCompanyLogo(doc, branding, box) {
  if (!branding?.logo) return false;
  try {
    doc.image(branding.logo, box.x, box.y, { fit: [box.width, box.height], align: 'right', valign: 'center' });
    return true;
  } catch (err) {
    console.warn('[pdf-branding] company logo skipped:', err.message);
    return false;
  }
}

module.exports = { HEX_COLOR, normalizeAccentColor, readableAccent, resolveLogoFile, loadBranding, drawCompanyLogo };
