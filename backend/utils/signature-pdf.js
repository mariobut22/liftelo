const fs = require('fs');
const path = require('path');
const { loadTranslations } = require('./i18n/loadTranslations');

/*
 * Signature block + footer line shared by the RMS and intervention PDFs.
 * `info` comes from utils/reportSignatures.js (describeSignatures): state, document_number, document_hash, technician, client.
 * All texts come from backend/locales/<lang>/signature-pdf.json.
 */

const getSignatureTranslations = (language = 'hr') =>
  loadTranslations({ namespace: 'signature-pdf', language, defaultLanguage: 'hr' });

const formatDateTime = (value, locale) =>
  value ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zagreb', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—';

// "Document no. RMS-000028 · Integrity hash 3fa2c1d09ab4" (hash only when known)
function documentLine(info, language) {
  if (!info?.document_number) return '';
  const t = getSignatureTranslations(language);
  const parts = [`${t.documentNumber} ${info.document_number}`];
  if (info.document_hash) parts.push(`${t.integrityHash} ${String(info.document_hash).slice(0, 12)}`);
  return parts.join(' · ');
}

const absoluteSignature = (stored) => {
  if (typeof stored !== 'string' || !stored.startsWith('/uploads/')) return null;
  const abs = path.join(__dirname, '..', stored);
  return fs.existsSync(abs) ? abs : null;
};

function drawSignatureBlock({ doc, info, language, locale, fonts, colors, technicianFallbackName, notAvailable }) {
  const t = getSignatureTranslations(language);
  const lineWidth = 220;
  const height = 80;
  const top = doc.y;
  const leftX = doc.page.margins.left;
  const rightX = doc.page.margins.left + lineWidth + 40;
  const line = (x, y) => doc.moveTo(x, y).lineTo(x + lineWidth, y).strokeColor('#9CA3AF').stroke();
  const label = (text, x, y, opts = {}) => {
    doc.font(opts.bold ? fonts.bold : fonts.regular).fontSize(opts.size || 9).fillColor(opts.color || colors.text)
      .text(text, x, y, { width: lineWidth });
  };

  // technician column
  label(`${t.technician}:`, leftX, top);
  const techImage = info?.technician ? absoluteSignature(info.technician.path) : null;
  if (techImage) doc.image(techImage, leftX, top + 16, { fit: [lineWidth, height] });
  else line(leftX, top + 80);
  let y = top + 90;
  const techName = info?.technician?.name || (info?.technician ? technicianFallbackName : null) || notAvailable;
  label(`${t.name}: ${techName}`, leftX, y);
  y += 13;
  label(`${t.signedAt}: ${info?.technician ? formatDateTime(info.technician.at, locale) : '—'}`, leftX, y);

  // client column
  const client = info?.client || null;
  label(`${t.client}:`, rightX, top);
  let ry = top + 90;
  if (client && client.method === 'drawn') {
    const clientImage = absoluteSignature(client.path);
    if (clientImage) doc.image(clientImage, rightX, top + 16, { fit: [lineWidth, height] });
    else line(rightX, top + 80);
    label(`${t.name}: ${client.name || notAvailable}`, rightX, ry); ry += 13;
    if (client.role) { label(`${t.role}: ${client.role}`, rightX, ry); ry += 13; }
    label(`${t.signedAt}: ${formatDateTime(client.at, locale)}`, rightX, ry);
  } else if (client && client.method === 'scan') {
    label(t.scanAttached, rightX, top + 20, { bold: true });
    ry = top + 56;
    if (client.name) { label(`${t.name}: ${client.name}`, rightX, ry); ry += 13; }
    if (client.role) { label(`${t.role}: ${client.role}`, rightX, ry); ry += 13; }
    label(`${t.signedAt}: ${formatDateTime(client.at, locale)}`, rightX, ry); ry += 13;
    if (client.by_name) label(`${t.attachedBy}: ${client.by_name}`, rightX, ry);
  } else if (client && client.method === 'declined') {
    label(t.declined, rightX, top + 20, { bold: true });
    ry = top + 44;
    label(`${t.reason}: ${client.note || '—'}`, rightX, ry);
    ry = Math.max(doc.y + 4, top + 80);
    label(`${t.signedAt}: ${formatDateTime(client.at, locale)}`, rightX, ry); ry += 13;
    if (client.by_name) label(`${t.recordedBy}: ${client.by_name}`, rightX, ry);
  } else {
    line(rightX, top + 80);
    if (info?.state === 'awaiting_client') label(t.awaitingClient, rightX, top + 84, { color: colors.muted });
    else label(`${t.name}: ___________________`, rightX, ry);
  }

  doc.fillColor(colors.text).font(fonts.regular).fontSize(9);
  const docLine = documentLine(info, language);
  if (docLine) {
    const lineY = Math.max(y, ry) + 26;
    doc.font(fonts.regular).fontSize(7.5).fillColor(colors.muted)
      .text(`${docLine} · ${t.generatedAt} ${formatDateTime(new Date(), locale)}`, leftX, lineY, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    doc.fillColor(colors.text).fontSize(9);
  }
}

module.exports = { drawSignatureBlock, documentLine, getSignatureTranslations, formatDateTime };
