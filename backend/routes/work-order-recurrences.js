// Recurring work order templates (admin only). Mounted at /api/work-order-recurrences behind requireCompanyContext +
// requireSubscriptionAccess. Deleting a template never deletes the work orders it generated (they are normal work orders).
// Generation itself is lazy: see utils/workOrderRecurrence.js.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { isCompanyAdmin } = require('../utils/membership');
const { logAudit } = require('../utils/auditLog');
const {
  FREQUENCIES, RECURRENCE_COLUMNS, parseYmd, todayYmd, nextOccurrence, hasRecurrenceTables, ensureRecurringWorkOrders
} = require('../utils/workOrderRecurrence');

router.use(async (req, res, next) => {
  const companyId = req.companyId;
  const userId = req.session?.user_id;
  if (!userId || !companyId) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  try {
    const ok = await isCompanyAdmin({ userId, companyId, globalRole: req.session?.global_role });
    if (!ok) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    if (!(await hasRecurrenceTables())) {
      return res.status(503).json({ error: 'Recurring work orders are not available yet', code: 'recurrences_unavailable' });
    }
    return next();
  } catch (err) {
    console.error('Recurrence gate failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

const clean = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, max);

const serialize = (row, today) => ({
  id: row.id,
  location_id: row.location_id,
  location_name: row.location_name || null,
  elevator_id: row.elevator_id,
  elevator_label: row.elevator_label || null,
  description: row.description,
  general_comment: row.general_comment,
  frequency: row.frequency,
  start_date: row.start_date,
  end_date: row.end_date,
  assigned_user_id: row.assigned_user_id,
  assigned_user_name: row.assigned_user_name || null,
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
  generated_count: Number(row.generated_count || 0),
  last_work_order_id: row.last_work_order_id || null,
  next_due_date: nextOccurrence(row, today > row.start_date ? today : row.start_date)
});

// GET /api/work-order-recurrences -> { items }
router.get('/', async (req, res) => {
  const companyId = req.companyId;
  try {
    const [rows] = await db.query(
      `SELECT ${RECURRENCE_COLUMNS},
              l.name AS location_name, e.label AS elevator_label,
              COALESCE(u.full_name, u.username) AS assigned_user_name,
              (SELECT COUNT(*) FROM work_order_recurrence_runs x WHERE x.recurrence_id = r.id AND x.company_id = r.company_id AND x.work_order_id IS NOT NULL) AS generated_count,
              (SELECT x.work_order_id FROM work_order_recurrence_runs x WHERE x.recurrence_id = r.id AND x.company_id = r.company_id AND x.work_order_id IS NOT NULL ORDER BY x.due_date DESC LIMIT 1) AS last_work_order_id
       FROM work_order_recurrences r
       LEFT JOIN locations l ON l.id = r.location_id AND l.company_id = r.company_id
       LEFT JOIN elevators e ON e.id = r.elevator_id AND e.company_id = r.company_id
       LEFT JOIN users u ON u.id = r.assigned_user_id
       WHERE r.company_id = ?
       ORDER BY r.is_active DESC, r.id DESC`,
      [companyId]
    );
    const today = todayYmd();
    return res.json({ items: rows.map((row) => serialize(row, today)) });
  } catch (err) {
    console.error('Recurrence list failed:', err);
    return res.status(500).json({ error: 'Failed to load recurring work orders', code: 'recurrences_failed' });
  }
});

// POST /api/work-order-recurrences { location_id, elevator_id?, description, general_comment?, frequency, start_date, end_date?, assigned_user_id? }
router.post('/', async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user_id ?? null;
  const body = req.body || {};
  const locationId = Number(body.location_id);
  const elevatorId = body.elevator_id ? Number(body.elevator_id) : null;
  const assigneeId = body.assigned_user_id ? Number(body.assigned_user_id) : null;
  const description = clean(body.description, 500);
  const comment = clean(body.general_comment, 2000) || null;
  const frequency = String(body.frequency || '');
  const startDate = String(body.start_date || '');
  const endDate = body.end_date ? String(body.end_date) : null;

  if (!Number.isInteger(locationId) || locationId < 1) return res.status(400).json({ error: 'Missing location_id', code: 'missing_required_fields' });
  if (!description) return res.status(400).json({ error: 'Description is required', code: 'item_description_required' });
  if (!FREQUENCIES[frequency]) return res.status(400).json({ error: 'Invalid frequency', code: 'invalid_frequency' });
  if (!parseYmd(startDate) || (endDate && !parseYmd(endDate))) return res.status(400).json({ error: 'Invalid date', code: 'invalid_date' });
  if (endDate && endDate < startDate) return res.status(400).json({ error: 'End date is before start date', code: 'invalid_date_range' });
  if (elevatorId !== null && (!Number.isInteger(elevatorId) || elevatorId < 1)) return res.status(400).json({ error: 'Invalid elevator', code: 'invalid_elevators' });
  if (assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId < 1)) return res.status(400).json({ error: 'Invalid assignee', code: 'invalid_assigned_users' });

  try {
    const [[loc]] = await db.query('SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1', [locationId, companyId]);
    if (!loc) return res.status(403).json({ error: 'Invalid location', code: 'invalid_location' });
    if (elevatorId !== null) {
      const [[elev]] = await db.query(
        'SELECT id FROM elevators WHERE id = ? AND company_id = ? AND location_id = ? LIMIT 1',
        [elevatorId, companyId, locationId]
      );
      if (!elev) return res.status(400).json({ error: 'Invalid elevator', code: 'invalid_elevators' });
    }
    if (assigneeId !== null) {
      const [[usr]] = await db.query(
        `SELECT u.id FROM users u INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ?
         WHERE u.id = ? LIMIT 1`,
        [companyId, assigneeId]
      );
      if (!usr) return res.status(400).json({ error: 'Invalid assignee', code: 'invalid_assigned_users' });
    }
    const [result] = await db.query(
      `INSERT INTO work_order_recurrences
        (company_id, location_id, elevator_id, description, general_comment, frequency, start_date, end_date, assigned_user_id, is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [companyId, locationId, elevatorId, description, comment, frequency, startDate, endDate, assigneeId, userId]
    );
    logAudit({ companyId, userId, action: 'work_order_recurrence_created', metadata: { recurrence_id: result.insertId, frequency } });
    // Generate right away when the first occurrence is already due (the admin sees the work order immediately).
    await ensureRecurringWorkOrders(companyId);
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Recurrence create failed:', err);
    return res.status(500).json({ error: 'Failed to save recurring work order', code: 'recurrences_failed' });
  }
});

// PATCH /api/work-order-recurrences/:id { is_active: boolean }  (pause / resume)
router.patch('/:id', async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || typeof req.body?.is_active !== 'boolean') {
    return res.status(400).json({ error: 'Invalid request', code: 'invalid_request' });
  }
  try {
    const [result] = await db.query(
      'UPDATE work_order_recurrences SET is_active = ? WHERE id = ? AND company_id = ?',
      [req.body.is_active ? 1 : 0, id, companyId]
    );
    if (!result.affectedRows) {
      const [[exists]] = await db.query('SELECT id FROM work_order_recurrences WHERE id = ? AND company_id = ? LIMIT 1', [id, companyId]);
      if (!exists) return res.status(404).json({ error: 'Recurrence not found', code: 'recurrence_not_found' });
    }
    logAudit({ companyId, userId: req.session?.user_id, action: req.body.is_active ? 'work_order_recurrence_resumed' : 'work_order_recurrence_paused', metadata: { recurrence_id: id } });
    if (req.body.is_active) await ensureRecurringWorkOrders(companyId);
    return res.json({ id, is_active: req.body.is_active });
  } catch (err) {
    console.error('Recurrence update failed:', err);
    return res.status(500).json({ error: 'Failed to update recurring work order', code: 'recurrences_failed' });
  }
});

// DELETE /api/work-order-recurrences/:id  (generated work orders and the run rows stay)
router.delete('/:id', async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request', code: 'invalid_request' });
  try {
    const [result] = await db.query('DELETE FROM work_order_recurrences WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Recurrence not found', code: 'recurrence_not_found' });
    logAudit({ companyId, userId: req.session?.user_id, action: 'work_order_recurrence_deleted', metadata: { recurrence_id: id } });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Recurrence delete failed:', err);
    return res.status(500).json({ error: 'Failed to delete recurring work order', code: 'recurrences_failed' });
  }
});

module.exports = router;
