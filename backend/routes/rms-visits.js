const express = require('express');
const router = express.Router();
const db = require('../db');
const { parseClientRequestId, hasClientRequestColumn, isDuplicateEntry } = require('../utils/clientRequestId');

const allowedStatuses = [
  'O.K.',
  'Potreban popravak - Dizalo u funkciji',
  'Potreban popravak - Dizalo nije u funkciji'
];

const normalizeItems = (items = []) => (Array.isArray(items) ? items : []);

const validateItems = (items) => {
  for (const item of items) {
    if (!item.elevator_label || !allowedStatuses.includes(item.status)) {
      return false;
    }
  }
  return true;
};

router.post('/', async (req, res) => {
  if (req.body?.signature_status === 'signed') {
    return res.status(400).json({ error: 'Invalid signature status', code: 'invalid_request' });
  }
  const { location_id, user_id, visit_date, notes_general, rms_month } = req.body;
  const items = normalizeItems(req.body.items);
  const companyId = req.companyId;
  const clientRequestId = parseClientRequestId(req.body?.client_request_id);

  if (!location_id || !visit_date) {
    return res.status(400).json({ error: 'Missing location_id or visit_date', code: 'missing_required_fields' });
  }

  if (rms_month && Number.isNaN(Date.parse(rms_month))) {
    return res.status(400).json({ error: 'Invalid rms_month format', code: 'invalid_date' });
  }

  if (items.length === 0 && !notes_general) {
    return res.status(400).json({ error: 'Provide at least one item or notes_general', code: 'items_required' });
  }

  if (!validateItems(items)) {
    return res.status(400).json({ error: 'Invalid item status or label', code: 'invalid_request' });
  }

  const connection = await db.getConnection();
  try {
    // Tenant isolation: location_id and user_id come from the request body and must belong to the caller's company
    const [[ownedLocation]] = await connection.query(
      'SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1',
      [location_id, companyId]
    );
    if (!ownedLocation) {
      return res.status(404).json({ error: 'Location not found', code: 'location_not_found' });
    }
    if (user_id) {
      const [[member]] = await connection.query(
        'SELECT 1 AS ok FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
        [user_id, companyId]
      );
      if (!member) {
        return res.status(404).json({ error: 'User not found', code: 'user_not_found' });
      }
    }

    // Idempotent retry (offline outbox): the same client_request_id returns the stored visit instead of a duplicate
    const useRequestId = Boolean(clientRequestId) && await hasClientRequestColumn('rms_visits');
    const findExisting = async () => {
      const [[row]] = await connection.query(
        'SELECT id FROM rms_visits WHERE company_id = ? AND client_request_id = ? LIMIT 1',
        [companyId, clientRequestId]
      );
      return row || null;
    };
    if (useRequestId) {
      const existing = await findExisting();
      if (existing) return res.status(200).json({ id: existing.id, duplicate: true });
    }

    await connection.beginTransaction();

    // The visit belongs to the logged-in technician unless the caller names another member (needed so the technician can sign it)
    const visitUserId = user_id || req.session?.user_id || null;
    let visitResult;
    try {
      [visitResult] = useRequestId
        ? await connection.query(
          `INSERT INTO rms_visits (location_id, user_id, visit_date, rms_month, notes_general, company_id, client_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)` ,
          [location_id, visitUserId, visit_date, rms_month || null, notes_general || null, companyId, clientRequestId]
        )
        : await connection.query(
          `INSERT INTO rms_visits (location_id, user_id, visit_date, rms_month, notes_general, company_id)
           VALUES (?, ?, ?, ?, ?, ?)` ,
          [location_id, visitUserId, visit_date, rms_month || null, notes_general || null, companyId]
        );
    } catch (insertErr) {
      // two requests with the same id raced: the loser returns the winner's visit
      if (useRequestId && isDuplicateEntry(insertErr)) {
        await connection.rollback();
        const existing = await findExisting();
        if (existing) return res.status(200).json({ id: existing.id, duplicate: true });
      }
      throw insertErr;
    }

    const visitId = visitResult.insertId;

    for (const item of items) {
      await connection.query(
        `INSERT INTO rms_visit_items (visit_id, elevator_label, status, comment, company_id)
         VALUES (?, ?, ?, ?, ?)` ,
        [visitId, item.elevator_label, item.status, item.comment || null, companyId]
      );
    }

    await connection.commit();

    const effectiveDate = rms_month || visit_date;
    const dateObj = new Date(effectiveDate);
    const year = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth() + 1;

    console.log('[RMS VISIT SYNC] upserting monthly service', {
      companyId,
      locationId: location_id,
      year,
      month,
      service_date: effectiveDate
    });

    await db.query(
      `INSERT INTO location_monthly_services
        (company_id, location_id, year, month, service_date, invoice_status)
       VALUES (?, ?, ?, ?, ?, 'not_invoiced')
       ON DUPLICATE KEY UPDATE
         service_date = VALUES(service_date)`,
      [companyId, location_id, year, month, effectiveDate]
    );

    const [debugRows] = await db.query(
      `SELECT * FROM location_monthly_services
       WHERE company_id = ? AND location_id = ? AND year = ? AND month = ?`,
      [companyId, location_id, year, month]
    );

    console.log('[RMS VISIT SYNC VERIFY]', debugRows);

    res.status(201).json({ id: visitId });
  } catch (err) {
    await connection.rollback();
    console.error('Greška pri spremanju RMS posjeta:', err);
    res.status(500).json({ error: 'Failed to save RMS visit' });
  } finally {
    connection.release();
  }
});

router.get('/location/:id', async (req, res) => {
  const locationId = req.params.id;
  try {
    const companyId = req.companyId;
    const [visits] = await db.query(
      `SELECT * FROM rms_visits WHERE location_id = ? AND company_id = ?
       ORDER BY visit_date DESC, created_at DESC`,
      [locationId, companyId]
    );

    if (!visits.length) {
      return res.json([]);
    }

    const visitIds = visits.map(visit => visit.id);
    const [items] = await db.query(
      `SELECT * FROM rms_visit_items
       WHERE visit_id IN (${visitIds.map(() => '?').join(',')})
         AND company_id = ?`,
      [...visitIds, companyId]
    );

    const itemsByVisit = items.reduce((acc, item) => {
      acc[item.visit_id] = acc[item.visit_id] || [];
      acc[item.visit_id].push(item);
      return acc;
    }, {});

    const payload = visits.map(visit => ({
      ...visit,
      items: itemsByVisit[visit.id] || []
    }));

    res.json(payload);
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS posjeta:', err);
    res.status(500).json({ error: 'Failed to load RMS visits' });
  }
});

router.get('/:id', async (req, res) => {
  const visitId = req.params.id;
  try {
    const companyId = req.companyId;
    const [visits] = await db.query(
      `SELECT v.*, u.username AS technician_name
       FROM rms_visits v
       LEFT JOIN users u ON v.user_id = u.id
       WHERE v.id = ? AND v.company_id = ?`,
      [visitId, companyId]
    );
    if (!visits.length) {
      return res.status(404).json({ error: 'RMS visit not found', code: 'rms_not_found' });
    }

    const [items] = await db.query(
      'SELECT * FROM rms_visit_items WHERE visit_id = ? AND company_id = ?',
      [visitId, companyId]
    );
    res.json({
      ...visits[0],
      items
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS posjeta:', err);
    res.status(500).json({ error: 'Failed to load RMS visits' });
  }
});


module.exports = router;
