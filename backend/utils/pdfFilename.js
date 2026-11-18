const db = require('../db');

/*
 * Friendly PDF file names: "<type>_<location>_<date>_<id>.pdf", e.g. RMS_Stambena-zgrada-Vukovarska_2026-11-11_12.pdf
 * Browsers (iOS especially) name a downloaded/shared PDF after the LAST PATH SEGMENT of the URL, not the Content-Disposition
 * header, so GET /api/<type>/:id/pdf redirects to /api/<type>/:id/pdf/<friendly name>.pdf (the name segment is ignored on input
 * and always recomputed from the database; it only exists to give the URL a meaningful end).
 */

const LABELS = {
  hr: { rms: 'RMS', intervention: 'Intervencija', workOrder: 'Radni-nalog' },
  en: { rms: 'RMS', intervention: 'Intervention', workOrder: 'Work-order' },
};

const slug = (value, max = 40) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');

const QUERIES = {
  rms: `SELECT l.name AS location_name, DATE_FORMAT(v.visit_date, '%Y-%m-%d') AS doc_date
        FROM rms_visits v
        LEFT JOIN locations l ON l.id = v.location_id AND l.company_id = v.company_id
        WHERE v.id = ? AND v.company_id = ? LIMIT 1`,
  intervention: `SELECT l.name AS location_name, DATE_FORMAT(i.date, '%Y-%m-%d') AS doc_date
        FROM interventions i
        LEFT JOIN locations l ON l.id = i.location_id AND l.company_id = i.company_id
        WHERE i.id = ? AND i.company_id = ? LIMIT 1`,
  workOrder: `SELECT l.name AS location_name, DATE_FORMAT(COALESCE(w.issued_date, w.due_date, DATE(w.created_at)), '%Y-%m-%d') AS doc_date
        FROM work_orders w
        LEFT JOIN locations l ON l.id = w.location_id AND l.company_id = w.company_id
        WHERE w.id = ? AND w.company_id = ? LIMIT 1`,
};

function buildPdfFilename({ kind, language, locationName, date, id }) {
  const labels = LABELS[language] || LABELS.hr;
  const parts = [labels[kind] || 'Dokument', slug(locationName), /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '', String(id).replace(/[^0-9]/g, '')];
  return `${parts.filter(Boolean).join('_')}.pdf`;
}

/**
 * Returns the friendly file name for this request, or null when it already sent a redirect to the URL that ends with it
 * (the caller must then return). Falls back to a generic name when the lookup fails, so the PDF is never blocked by naming.
 */
async function resolvePdfName(req, res, { kind, id, companyId }) {
  const language = ['hr', 'en'].includes(req.query?.lang) ? req.query.lang : 'hr';
  let row = null;
  try {
    const [rows] = await db.query(QUERIES[kind], [id, companyId]);
    row = rows[0] || null;
  } catch (err) {
    console.error('[pdfFilename] lookup failed:', err.message);
  }
  const filename = buildPdfFilename({ kind, language, locationName: row?.location_name, date: row?.doc_date, id });

  if (!req.params.name) {
    const queryStart = req.originalUrl.indexOf('?');
    const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, `${req.baseUrl}/${encodeURIComponent(String(id))}/pdf/${encodeURIComponent(filename)}${query}`);
    return null;
  }
  return filename;
}

module.exports = { resolvePdfName, buildPdfFilename, slug };
