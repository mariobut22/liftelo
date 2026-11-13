const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { logAudit } = require('../utils/auditLog');
const { getOpenForElevator } = require('../utils/findings');

// ---- QR labels -------------------------------------------------------------------------------------------------
// The QR code encodes https://<app>/q/<qr_token>. The token is an opaque random value (never the numeric id) and is
// only meaningful to an authenticated member of the SAME company: every lookup filters by company_id.
const QR_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const newQrToken = () => crypto.randomBytes(18).toString('base64url'); // 144 bits, 24 url-safe chars

async function requireCompanyAdmin(req, res) {
  const userId = req.session?.user?.id || req.session?.user_id;
  const companyId = req.companyId;
  if (!userId || !companyId) {
    res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    return false;
  }
  const [[row]] = await db.query(
    'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
    [userId, companyId]
  );
  if (!row || row.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    return false;
  }
  return true;
}

const LABEL_SELECT = `SELECT e.id, e.label, e.serial_number, e.location_id, e.qr_token, l.name AS location_name
       FROM elevators e
       JOIN locations l ON l.id = e.location_id AND l.company_id = e.company_id`;

// Race-safe: only fills a NULL token (WHERE qr_token IS NULL); retries on the (astronomically unlikely) unique clash.
async function assignQrToken(elevatorId, companyId, { overwrite = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [result] = await db.query(
        `UPDATE elevators SET qr_token = ? WHERE id = ? AND company_id = ?${overwrite ? '' : ' AND qr_token IS NULL'}`,
        [newQrToken(), elevatorId, companyId]
      );
      return result.affectedRows > 0;
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
    }
  }
  throw new Error('Could not generate a unique QR token');
}

router.get('/', (req, res) => {
  const companyId = req.companyId;
  db.query(
    'SELECT * FROM elevators WHERE company_id = ?',
    [companyId],
    (err, rows) => {
      if (err) return res.sendStatus(500);
      res.json(rows);
  });
});

router.get('/by-location/:locationId', (req, res) => {
  const companyId = req.companyId;
  db.query(
    'SELECT * FROM elevators WHERE location_id = ? AND company_id = ?',
    [req.params.locationId, companyId],
    (err, rows) => {
      if (err) return res.sendStatus(500);
      res.json(rows);
    }
  );
});

// Resolve a scanned QR token (any role of the company, read-only). Another company's token is a plain 404.
router.get('/by-qr/:token', async (req, res) => {
  const companyId = req.companyId;
  const token = String(req.params.token || '');
  if (!QR_TOKEN_RE.test(token)) {
    return res.status(404).json({ error: 'QR code not found', code: 'qr_not_found' });
  }
  try {
    const [[elevator]] = await db.query(
      `SELECT e.id, e.label, e.serial_number, e.control_group_type, e.cabin_door_type, e.lock_type,
              e.machine_room_key, e.comment, e.location_id, l.name AS location_name, l.address AS location_address
       FROM elevators e
       JOIN locations l ON l.id = e.location_id AND l.company_id = e.company_id
       WHERE e.qr_token = ? AND e.company_id = ?
       LIMIT 1`,
      [token, companyId]
    );
    if (!elevator) {
      return res.status(404).json({ error: 'QR code not found', code: 'qr_not_found' });
    }
    // Recent history of this elevator (matched by label within its location, as the rest of the app does)
    const [rmsRows] = await db.query(
      `SELECT v.id, v.visit_date AS date, v.created_at, i.status, i.comment
       FROM rms_visit_items i
       JOIN rms_visits v ON v.id = i.visit_id AND v.company_id = i.company_id
       WHERE i.company_id = ? AND v.location_id = ? AND i.elevator_label = ?
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT 5`,
      [companyId, elevator.location_id, elevator.label]
    );
    const [interventionRows] = await db.query(
      `SELECT n.id, n.date, n.created_at, i.status, i.comment
       FROM intervention_items i
       JOIN interventions n ON n.id = i.intervention_id AND n.company_id = i.company_id
       WHERE i.company_id = ? AND n.location_id = ? AND i.elevator_label = ?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 5`,
      [companyId, elevator.location_id, elevator.label]
    );
    const history = [
      ...rmsRows.map((row) => ({ ...row, source: 'rms' })),
      ...interventionRows.map((row) => ({ ...row, source: 'intervention' })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    // Open faults of THIS elevator only (same login + company gate as the rest of the response; none for other companies)
    const open_findings = await getOpenForElevator(companyId, elevator);
    res.json({ elevator, history, open_findings });
  } catch (err) {
    console.error('QR lookup failed:', err);
    res.status(500).json({ error: 'Failed to resolve QR code' });
  }
});

// Admin only: label data (creates missing tokens lazily). Body: { location_id } | { elevator_id } | {} (all elevators).
router.post('/qr-labels', async (req, res) => {
  try {
    if (!(await requireCompanyAdmin(req, res))) return;
    const companyId = req.companyId;
    const locationId = req.body?.location_id != null ? Number(req.body.location_id) : null;
    const elevatorId = req.body?.elevator_id != null ? Number(req.body.elevator_id) : null;
    if ((locationId != null && !Number.isInteger(locationId)) || (elevatorId != null && !Number.isInteger(elevatorId))) {
      return res.status(400).json({ error: 'Invalid id', code: 'invalid_id' });
    }

    const where = ['e.company_id = ?'];
    const params = [companyId];
    if (locationId != null) { where.push('e.location_id = ?'); params.push(locationId); }
    if (elevatorId != null) { where.push('e.id = ?'); params.push(elevatorId); }
    const query = `${LABEL_SELECT} WHERE ${where.join(' AND ')} ORDER BY l.name ASC, e.label ASC, e.id ASC`;

    let [rows] = await db.query(query, params);
    if ((locationId != null || elevatorId != null) && rows.length === 0) {
      return res.status(404).json({ error: 'Elevator not found', code: 'elevator_not_found' });
    }
    const missing = rows.filter((row) => !row.qr_token);
    if (missing.length > 0) {
      for (const row of missing) await assignQrToken(row.id, companyId);
      await logAudit({
        userId: req.session?.user?.id || req.session?.user_id,
        companyId,
        action: 'elevator_qr_generated',
        metadata: { elevator_ids: missing.map((row) => row.id) },
      });
      [rows] = await db.query(query, params);
    }
    res.json(rows);
  } catch (err) {
    console.error('QR labels failed:', err);
    res.status(500).json({ error: 'Failed to generate QR labels' });
  }
});

// Admin only: revoke the printed sticker by issuing a new token (the old code then 404s).
router.post('/:id/qr-token/regenerate', async (req, res) => {
  try {
    if (!(await requireCompanyAdmin(req, res))) return;
    const companyId = req.companyId;
    const [[owned]] = await db.query('SELECT id FROM elevators WHERE id = ? AND company_id = ? LIMIT 1', [req.params.id, companyId]);
    if (!owned) {
      return res.status(404).json({ error: 'Elevator not found', code: 'elevator_not_found' });
    }
    await assignQrToken(owned.id, companyId, { overwrite: true });
    await logAudit({
      userId: req.session?.user?.id || req.session?.user_id,
      companyId,
      action: 'elevator_qr_regenerated',
      metadata: { elevator_id: owned.id },
    });
    const [[row]] = await db.query(`${LABEL_SELECT} WHERE e.id = ? AND e.company_id = ? LIMIT 1`, [owned.id, companyId]);
    res.json(row);
  } catch (err) {
    console.error('QR regenerate failed:', err);
    res.status(500).json({ error: 'Failed to regenerate QR code' });
  }
});

router.delete('/:id', async (req, res) => {
  const { user } = req.session || {};
  const companyId = req.companyId;
  if (!user || !companyId) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }

  const [[row]] = await require('../db').query(
    'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
    [user.id, companyId]
  );
  if (!row || row.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  try {
    // Tenant isolation: only delete an elevator that belongs to the caller's company
    const [result] = await db.query('DELETE FROM elevators WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Elevator not found', code: 'elevator_not_found' });
    }
    res.json({ message: 'Elevator deleted' });
  } catch (err) {
    console.error('Greška pri brisanju dizala:', err);
    res.status(500).json({ error: 'Failed to delete elevator' });
  }
});

router.put('/:id', async (req, res) => {
  const { user } = req.session || {};
  const companyId = req.companyId;
  if (!user || !companyId) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }

  const [[row]] = await require('../db').query(
    'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
    [user.id, companyId]
  );
  if (!row || row.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }

  const {
    label,
    serial_number,
    control_group_type,
    cabin_door_type,
    lock_type,
    machine_room_key,
    comment
  } = req.body;

  try {
    // Tenant isolation: only update an elevator that belongs to the caller's company
    const [[ownedElevator]] = await db.query('SELECT id FROM elevators WHERE id = ? AND company_id = ? LIMIT 1', [req.params.id, companyId]);
    if (!ownedElevator) {
      return res.status(404).json({ error: 'Elevator not found', code: 'elevator_not_found' });
    }
    await db.query(
      `UPDATE elevators
       SET label = ?,
           serial_number = ?,
           control_group_type = ?,
           cabin_door_type = ?,
           lock_type = ?,
           machine_room_key = ?,
           comment = ?
       WHERE id = ? AND company_id = ?`,
      [
        label,
        serial_number || null,
        control_group_type || null,
        cabin_door_type || null,
        lock_type || null,
        machine_room_key || null,
        comment || null,
        req.params.id,
        companyId
      ]
    );
    res.json({ message: 'Elevator updated' });
  } catch (err) {
    console.error('Greška pri ažuriranju dizala:', err);
    res.status(500).json({ error: 'Failed to update elevator' });
  }
});

module.exports = router;
