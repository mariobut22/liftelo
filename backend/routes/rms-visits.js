const express = require('express');
const router = express.Router();
const db = require('../db');

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
    return res.status(400).json({ error: 'Invalid signature status' });
  }
  const { location_id, user_id, visit_date, notes_general, rms_month } = req.body;
  const items = normalizeItems(req.body.items);
  const companyId = req.companyId;

  if (!location_id || !visit_date) {
    return res.status(400).json({ error: 'Missing location_id or visit_date' });
  }

  if (rms_month && Number.isNaN(Date.parse(rms_month))) {
    return res.status(400).json({ error: 'Invalid rms_month format' });
  }

  if (items.length === 0 && !notes_general) {
    return res.status(400).json({ error: 'Provide at least one item or notes_general' });
  }

  if (!validateItems(items)) {
    return res.status(400).json({ error: 'Invalid item status or label' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [visitResult] = await connection.query(
      `INSERT INTO rms_visits (location_id, user_id, visit_date, rms_month, notes_general, company_id)
       VALUES (?, ?, ?, ?, ?, ?)` ,
      [location_id, user_id || null, visit_date, rms_month || null, notes_general || null, companyId]
    );

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
    res.status(500).json({ error: 'Greška pri spremanju RMS posjeta' });
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
    res.status(500).json({ error: 'Greška pri dohvaćanju RMS posjeta' });
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
      return res.status(404).json({ error: 'RMS posjet nije pronađen' });
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
    res.status(500).json({ error: 'Greška pri dohvaćanju RMS posjeta' });
  }
});


module.exports = router;
