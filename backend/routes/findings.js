// Findings ("nalazi / kvarovi"): tracked defects per elevator. Mounted in index.js behind requireCompanyContext +
// requireSubscriptionAccess (viewer = 403 on writes, locked company = 402 on admin writes).
// findings / finding_events are INSERT-only; the state is derived from the latest event that carries a state.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { logAudit } = require('../utils/auditLog');
const { getCompanyRole } = require('../utils/membership');
const { parseClientRequestId, isDuplicateEntry } = require('../utils/clientRequestId');
const {
  STATES, SEVERITIES, CATEGORIES,
  hasFindingsTables, normalizeFinding, insertFindings, DERIVED_SELECT, serializeFinding, nextState,
  notifyNewFindings, notifyFindingEvent, cleanText
} = require('../utils/findings');

const WITH_LIVE_LOCATION = `
  SELECT x.*, l.name AS location_name_live
  FROM (${DERIVED_SELECT}) x
  LEFT JOIN locations l ON l.id = x.location_id AND l.company_id = x.company_id`;

router.use(async (req, res, next) => {
  if (!req.companyId) {
    return res.status(400).json({ error: 'Company context required', code: 'invalid_request' });
  }
  try {
    if (!(await hasFindingsTables())) {
      return res.status(503).json({ error: 'Findings are not available yet', code: 'findings_unavailable' });
    }
    const userId = req.session?.user_id;
    req.findingsRole = req.session?.global_role === 'superadmin' ? 'admin' : await getCompanyRole(userId, req.companyId);
    return next();
  } catch (err) {
    console.error('Findings gate failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

const toInt = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// GET /api/findings?state=open|all|open|waiting_part|in_progress|resolved&severity=&location_id=&elevator_id=&needs_part=1&parts_ordered=0|1&limit=&offset=
// "open" (default) = every finding that is not resolved. Sorted: unresolved first, severity, oldest first.
router.get('/', async (req, res) => {
  const companyId = req.companyId;
  const where = [];
  const params = [companyId];
  const state = String(req.query.state || 'open');
  if (state === 'open') where.push("x.state <> 'resolved'");
  else if (STATES.includes(state)) { where.push('x.state = ?'); params.push(state); }
  else if (state !== 'all') return res.status(400).json({ error: 'Invalid state filter', code: 'invalid_request' });

  if (req.query.severity) {
    if (!SEVERITIES.includes(String(req.query.severity))) return res.status(400).json({ error: 'Invalid severity filter', code: 'invalid_request' });
    where.push('x.severity = ?'); params.push(String(req.query.severity));
  }
  if (req.query.category) {
    if (!CATEGORIES.includes(String(req.query.category))) return res.status(400).json({ error: 'Invalid category filter', code: 'invalid_request' });
    where.push('x.category = ?'); params.push(String(req.query.category));
  }
  for (const key of ['location_id', 'elevator_id']) {
    if (req.query[key] !== undefined && req.query[key] !== '') {
      const id = Number.parseInt(req.query[key], 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: `Invalid ${key}`, code: 'invalid_request' });
      where.push(`x.${key} = ?`); params.push(id);
    }
  }
  if (req.query.needs_part === '1' || req.query.needs_part === 'true') where.push('x.needs_part = 1');
  if (req.query.parts_ordered === '1') where.push('x.parts_ordered_at IS NOT NULL');
  if (req.query.parts_ordered === '0') where.push('x.parts_ordered_at IS NULL');

  const limit = toInt(req.query.limit, 50, 1, 200);
  const offset = toInt(req.query.offset, 0, 0, 1000000);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const [rows] = await db.query(
      `${WITH_LIVE_LOCATION} ${whereSql}
       ORDER BY (x.state = 'resolved') ASC,
         CASE x.severity WHEN 'out_of_service' THEN 0 WHEN 'in_service' THEN 1 ELSE 2 END ASC,
         x.created_at ASC, x.id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[countRow]] = await db.query(`SELECT COUNT(*) AS total FROM (${WITH_LIVE_LOCATION} ${whereSql}) counted`, params);
    res.json({ items: rows.map(serializeFinding), total: Number(countRow.total), limit, offset });
  } catch (err) {
    console.error('Failed to load findings:', err);
    res.status(500).json({ error: 'Failed to load findings' });
  }
});

// GET /api/findings/summary – counts for Home. open = not resolved; out_of_service and needs_part/to_order are independent.
router.get('/summary', async (req, res) => {
  try {
    const [[row]] = await db.query(
      `SELECT
         COUNT(*) AS open_count,
         COALESCE(SUM(x.severity = 'out_of_service'), 0) AS out_of_service,
         COALESCE(SUM(x.severity = 'in_service'), 0) AS in_service,
         COALESCE(SUM(x.severity = 'recommendation'), 0) AS recommendation,
         COALESCE(SUM(x.needs_part = 1), 0) AS needs_part,
         COALESCE(SUM(x.needs_part = 1 AND x.parts_ordered_at IS NULL), 0) AS to_order,
         COALESCE(SUM(x.state = 'waiting_part'), 0) AS waiting_part,
         MIN(x.created_at) AS oldest_created_at,
         TIMESTAMPDIFF(DAY, MIN(x.created_at), NOW()) AS oldest_days
       FROM (${DERIVED_SELECT}) x
       WHERE x.state <> 'resolved'`,
      [req.companyId]
    );
    res.json({
      open: Number(row.open_count),
      out_of_service: Number(row.out_of_service),
      in_service: Number(row.in_service),
      recommendation: Number(row.recommendation),
      needs_part: Number(row.needs_part),
      to_order: Number(row.to_order),
      waiting_part: Number(row.waiting_part),
      oldest_days: row.oldest_days === null ? null : Number(row.oldest_days)
    });
  } catch (err) {
    console.error('Failed to load findings summary:', err);
    res.status(500).json({ error: 'Failed to load findings summary' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Finding not found', code: 'finding_not_found' });
  try {
    const [[row]] = await db.query(`${WITH_LIVE_LOCATION} WHERE x.id = ?`, [req.companyId, id]);
    if (!row) return res.status(404).json({ error: 'Finding not found', code: 'finding_not_found' });
    const [events] = await db.query(
      `SELECT e.id, e.event_type, e.state, e.note, e.user_id, e.intervention_id, e.work_order_id, e.created_at,
              COALESCE(NULLIF(u.full_name, ''), u.username) AS user_name
       FROM finding_events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.finding_id = ? AND e.company_id = ?
       ORDER BY e.created_at ASC, e.id ASC`,
      [id, req.companyId]
    );
    const [[creator]] = row.created_by_user_id
      ? await db.query(
        `SELECT COALESCE(NULLIF(u.full_name, ''), u.username) AS name FROM users u
         INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ? WHERE u.id = ? LIMIT 1`,
        [req.companyId, row.created_by_user_id]
      )
      : [[null]];
    res.json({ ...serializeFinding(row), created_by_name: creator?.name || null, events });
  } catch (err) {
    console.error('Failed to load finding:', err);
    res.status(500).json({ error: 'Failed to load finding' });
  }
});

// POST /api/findings – manual add (admin or technician; viewer is stopped in index.js)
router.post('/', async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user_id ?? null;
  if (!['admin', 'technician'].includes(req.findingsRole)) {
    return res.status(403).json({ error: 'Viewers have read-only access and cannot create or change data', code: 'viewer_read_only' });
  }
  const body = req.body || {};
  const locationId = Number.parseInt(body.location_id, 10);
  if (!Number.isInteger(locationId)) return res.status(400).json({ error: 'Missing location_id', code: 'missing_required_fields' });
  const normalized = normalizeFinding(body, body.severity === undefined ? 'in_service' : String(body.severity));
  if (normalized.error) return res.status(normalized.error.status).json({ error: normalized.error.error, code: normalized.error.code });
  const clientRequestId = parseClientRequestId(body.client_request_id);

  try {
    const [[location]] = await db.query('SELECT id, name FROM locations WHERE id = ? AND company_id = ? LIMIT 1', [locationId, companyId]);
    if (!location) return res.status(404).json({ error: 'Location not found', code: 'location_not_found' });

    let elevatorId = null;
    let elevatorLabel = cleanText(body.elevator_label, 255);
    if (body.elevator_id !== undefined && body.elevator_id !== null && body.elevator_id !== '') {
      const [[elevator]] = await db.query(
        'SELECT id, label FROM elevators WHERE id = ? AND company_id = ? AND location_id = ? LIMIT 1',
        [Number.parseInt(body.elevator_id, 10), companyId, locationId]
      );
      if (!elevator) return res.status(404).json({ error: 'Elevator not found', code: 'elevator_not_found' });
      elevatorId = elevator.id;
      elevatorLabel = elevator.label;
    }
    if (!elevatorLabel) return res.status(400).json({ error: 'Missing elevator', code: 'missing_required_fields' });

    const findExisting = async () => {
      const [[row]] = await db.query('SELECT id FROM findings WHERE company_id = ? AND client_request_id = ? LIMIT 1', [companyId, clientRequestId]);
      return row || null;
    };
    if (clientRequestId) {
      const existing = await findExisting();
      if (existing) return res.status(200).json({ id: existing.id, duplicate: true });
    }

    const connection = await db.getConnection();
    let created;
    try {
      await connection.beginTransaction();
      created = await insertFindings(connection, {
        companyId, userId, locationId, locationName: location.name, sourceType: 'manual', clientRequestId: null,
        entries: [{ ...normalized.value, elevator_id: elevatorId, elevator_label: elevatorLabel, client_request_id: clientRequestId }]
      });
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      if (clientRequestId && isDuplicateEntry(err)) {
        const existing = await findExisting();
        if (existing) return res.status(200).json({ id: existing.id, duplicate: true });
      }
      throw err;
    } finally {
      connection.release();
    }

    notifyNewFindings({ companyId, actorUserId: userId, findings: created })
      .catch((err) => console.error('Finding notification failed:', err));
    res.status(201).json({ id: created[0].id });
  } catch (err) {
    console.error('Failed to create finding:', err);
    res.status(500).json({ error: 'Failed to create finding' });
  }
});

// POST /api/findings/:id/events { event_type, state?, note? }
//  comment (admin or technician, note required) | status_changed (state open|waiting_part|in_progress) | parts_ordered
//  | resolved | reopened (only from resolved) -- everything except comment is ADMIN ONLY.
const EVENT_TYPES = ['comment', 'status_changed', 'parts_ordered', 'resolved', 'reopened'];
router.post('/:id/events', async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user_id ?? null;
  const id = Number.parseInt(req.params.id, 10);
  const eventType = String(req.body?.event_type || '');
  if (!EVENT_TYPES.includes(eventType)) return res.status(400).json({ error: 'Invalid event type', code: 'invalid_request' });
  const role = req.findingsRole;
  if (!['admin', 'technician'].includes(role)) {
    return res.status(403).json({ error: 'Viewers have read-only access and cannot create or change data', code: 'viewer_read_only' });
  }
  if (eventType !== 'comment' && role !== 'admin') {
    return res.status(403).json({ error: 'Only an administrator can change a finding', code: 'findings_admin_only' });
  }
  const note = cleanText(req.body?.note, 2000) || null;
  if (eventType === 'comment' && !note) return res.status(400).json({ error: 'A comment needs text', code: 'finding_note_required' });
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Finding not found', code: 'finding_not_found' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // lock the finding row so two concurrent transitions are evaluated one after the other
    const [[finding]] = await connection.query('SELECT * FROM findings WHERE id = ? AND company_id = ? LIMIT 1 FOR UPDATE', [id, companyId]);
    if (!finding) {
      await connection.rollback();
      return res.status(404).json({ error: 'Finding not found', code: 'finding_not_found' });
    }
    const [[current]] = await connection.query(
      `SELECT state FROM finding_events WHERE finding_id = ? AND company_id = ? AND state IS NOT NULL
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [id, companyId]
    );
    const fromState = current?.state || 'open';

    let toState = null;
    if (eventType !== 'comment') {
      toState = nextState(fromState, eventType, req.body?.state);
      if (!toState) {
        await connection.rollback();
        return res.status(409).json({ error: 'This change is not allowed from the current state', code: 'invalid_finding_transition', state: fromState });
      }
      if (eventType === 'parts_ordered' && fromState === 'waiting_part') {
        const [[ordered]] = await connection.query(
          "SELECT 1 AS ok FROM finding_events WHERE finding_id = ? AND company_id = ? AND event_type = 'parts_ordered' LIMIT 1",
          [id, companyId]
        );
        if (ordered) {
          await connection.rollback();
          return res.status(409).json({ error: 'Parts were already ordered', code: 'parts_already_ordered', state: fromState });
        }
      }
    }

    const [result] = await connection.query(
      `INSERT INTO finding_events (finding_id, company_id, event_type, state, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, companyId, eventType, toState, note, userId]
    );
    if (eventType !== 'comment') {
      await logAudit({
        userId, companyId, action: `finding_${eventType}`,
        metadata: { finding_id: id, from: fromState, to: toState }, connection, throwOnError: true
      });
    }
    await connection.commit();

    if (eventType === 'parts_ordered' || eventType === 'resolved') {
      const [[loc]] = await db.query('SELECT name FROM locations WHERE id = ? AND company_id = ? LIMIT 1', [finding.location_id, companyId]);
      notifyFindingEvent({
        companyId, actorUserId: userId, eventType,
        finding: { id, elevator_label: finding.elevator_label, location_name: loc?.name || finding.location_name, created_by_user_id: finding.created_by_user_id }
      }).catch((err) => console.error('Finding notification failed:', err));
    }
    res.status(201).json({ id: result.insertId, state: toState || fromState });
  } catch (err) {
    await connection.rollback();
    console.error('Failed to add finding event:', err);
    res.status(500).json({ error: 'Failed to add finding event' });
  } finally {
    connection.release();
  }
});

module.exports = router;
