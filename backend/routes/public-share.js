// PUBLIC read-only page of one location (no login): GET /api/public/share/:token.
// Safety rules (docs/infrastructure.md "Share links"):
//  - company_id and location_id come ONLY from the link row found by SHA-256(token); nothing is taken from the client.
//  - unknown / malformed / revoked / expired token -> the SAME 404 body (no oracle); per-IP rate limits.
//  - every query filters by company_id AND location_id; the response is built from an explicit allow-list of fields.
//  - NOT exposed: prices, notes/comments/free text, emails/phones, ids, company_id, other locations, photos, signatures,
//    PDFs (the PDF routes need a login session and write files; they are deliberately not reachable through a share token).
const express = require('express');
const db = require('../db');
const { SHARE_TOKEN_RE, hashShareToken } = require('../utils/shareLinks');
const { createRateLimiter } = require('../utils/publicRateLimit');
const { hasFindingsTables, DERIVED_SELECT } = require('../utils/findings');

const router = express.Router();

// 120 requests / minute / IP, and at most 20 failed lookups (404) / 10 minutes / IP
const requestLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120 });
const failureLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

const LIST_LIMIT = 50;
const NOT_FOUND = { error: 'Not found', code: 'share_not_found' };

const RMS_STATUS_CODES = {
  'O.K.': 'ok',
  'Potreban popravak - Dizalo u funkciji': 'repair_in_service',
  'Potreban popravak - Dizalo nije u funkciji': 'repair_out_of_service'
};
const statusCode = (status) => RMS_STATUS_CODES[String(status ?? '').trim()] || 'other';
// worst outcome of a set of status codes
const outcomeOf = (codes) => {
  if (codes.includes('repair_out_of_service')) return 'repair_out_of_service';
  if (codes.includes('repair_in_service')) return 'repair_in_service';
  if (codes.includes('other')) return 'other';
  return codes.length > 0 ? 'ok' : null;
};

/** First name only: first word of the name, letters only, max 30 chars; e-mail-like or empty values give null. */
const firstName = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.includes('@')) return null;
  const word = raw.split(/\s+/)[0].replace(/[^\p{L}\p{M}'-]/gu, '').slice(0, 30);
  return word || null;
};

const addMonths = (ym, months) => {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer'
  });
  next();
});

// no token at all: same body as an unknown token
router.get('/', (_req, res) => res.status(404).json(NOT_FOUND));

router.get('/:token', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (requestLimiter.isLimited(ip) || failureLimiter.isLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests', code: 'rate_limited' });
  }
  requestLimiter.record(ip);

  const token = String(req.params.token || '');
  const miss = () => { failureLimiter.record(ip); return res.status(404).json(NOT_FOUND); };
  if (!SHARE_TOKEN_RE.test(token)) return miss();

  try {
    const [[link]] = await db.query(
      `SELECT company_id, location_id FROM location_share_links
       WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
      [hashShareToken(token)]
    );
    if (!link) return miss();
    const companyId = link.company_id;
    const locationId = link.location_id;

    const [[location]] = await db.query(
      'SELECT name, address, rms_frequency FROM locations WHERE id = ? AND company_id = ? LIMIT 1',
      [locationId, companyId]
    );
    if (!location) return miss();
    const [[company]] = await db.query('SELECT name FROM companies WHERE id = ? LIMIT 1', [companyId]);
    const companyName = company?.name ?? null;

    const [elevators] = await db.query(
      'SELECT label FROM elevators WHERE location_id = ? AND company_id = ? ORDER BY label ASC LIMIT 200',
      [locationId, companyId]
    );

    // last RMS date per elevator label
    const [lastRows] = await db.query(
      `SELECT i.elevator_label AS label, DATE_FORMAT(MAX(DATE(v.visit_date)), '%Y-%m-%d') AS last_date
       FROM rms_visit_items i
       JOIN rms_visits v ON v.id = i.visit_id AND v.company_id = i.company_id
       WHERE v.location_id = ? AND v.company_id = ? AND i.company_id = ?
       GROUP BY i.elevator_label`,
      [locationId, companyId, companyId]
    );
    const lastByLabel = new Map(lastRows.map((r) => [r.label, r.last_date]));
    const frequency = [1, 2, 3].includes(Number(location.rms_frequency)) ? Number(location.rms_frequency) : 1;

    // open faults (derived state; resolved ones are not listed)
    let faults = [];
    if (await hasFindingsTables()) {
      const [rows] = await db.query(
        `SELECT x.elevator_label, x.severity, DATE_FORMAT(x.created_at, '%Y-%m-%d') AS reported_on
         FROM (${DERIVED_SELECT}) x
         WHERE x.location_id = ? AND COALESCE(x.state, 'open') <> 'resolved'
         ORDER BY CASE x.severity WHEN 'out_of_service' THEN 0 WHEN 'in_service' THEN 1 ELSE 2 END ASC, x.created_at ASC, x.id ASC
         LIMIT ${LIST_LIMIT}`,
        [companyId, locationId]
      );
      faults = rows.map((r) => ({ elevator: r.elevator_label, severity: r.severity, date: r.reported_on }));
    }
    const faultCount = new Map();
    for (const f of faults) faultCount.set(f.elevator, (faultCount.get(f.elevator) || 0) + 1);

    // RMS visits (newest first) + their per-elevator status codes (no comments)
    const [visits] = await db.query(
      `SELECT v.id, DATE_FORMAT(DATE(v.visit_date), '%Y-%m-%d') AS visit_date, u.full_name AS tech_name, u.username AS tech_username
       FROM rms_visits v
       LEFT JOIN users u ON u.id = v.user_id
       WHERE v.location_id = ? AND v.company_id = ?
       ORDER BY v.visit_date DESC, v.created_at DESC, v.id DESC
       LIMIT ${LIST_LIMIT}`,
      [locationId, companyId]
    );
    const visitItems = new Map();
    if (visits.length > 0) {
      const [items] = await db.query(
        'SELECT visit_id, elevator_label, status FROM rms_visit_items WHERE company_id = ? AND visit_id IN (?) ORDER BY elevator_label ASC',
        [companyId, visits.map((v) => v.id)]
      );
      for (const it of items) {
        if (!visitItems.has(it.visit_id)) visitItems.set(it.visit_id, []);
        visitItems.get(it.visit_id).push({ elevator: it.elevator_label, status: statusCode(it.status) });
      }
    }

    // interventions (newest first)
    const [interventions] = await db.query(
      `SELECT i.id, DATE_FORMAT(DATE(i.date), '%Y-%m-%d') AS date, i.technician, i.status
       FROM interventions i
       WHERE i.location_id = ? AND i.company_id = ?
       ORDER BY i.date DESC, i.created_at DESC, i.id DESC
       LIMIT ${LIST_LIMIT}`,
      [locationId, companyId]
    );
    const interventionItems = new Map();
    if (interventions.length > 0) {
      const [items] = await db.query(
        'SELECT intervention_id, elevator_label, status FROM intervention_items WHERE company_id = ? AND intervention_id IN (?) ORDER BY elevator_label ASC',
        [companyId, interventions.map((i) => i.id)]
      );
      for (const it of items) {
        if (!interventionItems.has(it.intervention_id)) interventionItems.set(it.intervention_id, []);
        interventionItems.get(it.intervention_id).push({ elevator: it.elevator_label, status: statusCode(it.status) });
      }
    }

    return res.json({
      generated_at: new Date().toISOString(),
      location: { name: location.name, address: location.address || null },
      company: { name: companyName },
      elevators: elevators.map((e) => {
        const last = lastByLabel.get(e.label) || null;
        return {
          label: e.label,
          last_rms_date: last,
          next_rms_month: last ? addMonths(last.slice(0, 7), frequency) : null,
          open_faults: faultCount.get(e.label) || 0
        };
      }),
      rms_visits: visits.map((v) => {
        const items = visitItems.get(v.id) || [];
        return {
          date: v.visit_date,
          technician: firstName(v.tech_name) || firstName(v.tech_username) || companyName,
          elevator_count: items.length,
          outcome: outcomeOf(items.map((i) => i.status)),
          items
        };
      }),
      interventions: interventions.map((i) => {
        const items = interventionItems.get(i.id) || [];
        const codes = items.length > 0 ? items.map((x) => x.status) : (i.status ? [statusCode(i.status)] : []);
        return {
          date: i.date,
          technician: firstName(i.technician) || companyName,
          outcome: outcomeOf(codes),
          elevators: items.map((x) => x.elevator)
        };
      }),
      open_faults: faults,
      pdf_available: false
    });
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE')) return miss();
    console.error('Public share lookup failed:', err);
    return res.status(500).json({ error: 'Failed to load page', code: 'share_error' });
  }
});

module.exports = router;
module.exports._limiters = { requestLimiter, failureLimiter };
