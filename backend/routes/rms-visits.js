const express = require('express');
const router = express.Router();
const db = require('../db');
const { parseClientRequestId, hasClientRequestColumn, isDuplicateEntry } = require('../utils/clientRequestId');
const { syncMonthlyServiceForVisit } = require('../utils/rmsOverviewSync');
const {
  hasFindingsTables, prepareRequestFindings, insertFindings, notifyNewFindings,
  prepareFindingUpdates, applyFindingFixedReports, notifyFindingReportedFixed, notifyFindingEvent, getCompanyLanguage
} = require('../utils/findings');
const { getCompanyRole } = require('../utils/membership');

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

  // Findings (defects) ride along in the same request/transaction; each needs an item with a repair status
  const prepared = prepareRequestFindings(req.body.findings, items);
  if (prepared.error) {
    return res.status(prepared.error.status).json({ error: prepared.error.error, code: prepared.error.code });
  }
  if (prepared.findings.length > 0 && !(await hasFindingsTables())) {
    return res.status(503).json({ error: 'Findings are not available yet', code: 'findings_unavailable' });
  }

  // "Fixed in this visit" for faults already open on these elevators: finding_updates = [{ finding_id, action: 'fixed' }]
  const preparedUpdates = prepareFindingUpdates(req.body.finding_updates);
  if (preparedUpdates.error) {
    return res.status(preparedUpdates.error.status).json({ error: preparedUpdates.error.error, code: preparedUpdates.error.code });
  }
  if (preparedUpdates.updates.length > 0 && !(await hasFindingsTables())) {
    return res.status(503).json({ error: 'Findings are not available yet', code: 'findings_unavailable' });
  }

  const connection = await db.getConnection();
  let createdFindings = [];
  let appliedUpdates = { resolved: [], reported: [] };
  try {
    // Tenant isolation: location_id and user_id come from the request body and must belong to the caller's company
    const [[ownedLocation]] = await connection.query(
      'SELECT id, name FROM locations WHERE id = ? AND company_id = ? LIMIT 1',
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

    // Every reported finding must be this company's and belong to this location (else 404, nothing is written)
    if (preparedUpdates.updates.length > 0) {
      const ids = preparedUpdates.updates.map((u) => u.finding_id);
      const [owned] = await connection.query(
        `SELECT id FROM findings WHERE company_id = ? AND location_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
        [companyId, location_id, ...ids]
      );
      if (owned.length !== ids.length) {
        return res.status(404).json({ error: 'Finding not found', code: 'finding_not_found' });
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

    const itemIds = new Map();
    for (const item of items) {
      const [itemResult] = await connection.query(
        `INSERT INTO rms_visit_items (visit_id, elevator_label, status, comment, company_id)
         VALUES (?, ?, ?, ?, ?)` ,
        [visitId, item.elevator_label, item.status, item.comment || null, companyId]
      );
      itemIds.set(item.elevator_label, itemResult.insertId);
    }

    if (prepared.findings.length > 0) {
      createdFindings = await insertFindings(connection, {
        companyId,
        userId: req.session?.user_id ?? visitUserId,
        locationId: location_id,
        locationName: ownedLocation.name,
        sourceType: 'rms_visit_item',
        clientRequestId,
        entries: prepared.findings.map((f) => ({ ...f, source_id: itemIds.get(f.elevator_label) ?? null }))
      });
    }

    if (preparedUpdates.updates.length > 0) {
      const userId = req.session?.user_id ?? null;
      const role = req.session?.global_role === 'superadmin' ? 'admin' : await getCompanyRole(userId, companyId);
      appliedUpdates = await applyFindingFixedReports(connection, {
        companyId, userId, role: role === 'admin' ? 'admin' : 'technician', locationId: location_id, rmsVisitId: visitId,
        updates: preparedUpdates.updates, noteLanguage: await getCompanyLanguage(companyId)
      });
    }

    // Annual overview entry in the SAME transaction: the RMS and its overview date succeed or fail together
    await syncMonthlyServiceForVisit(connection, { companyId, locationId: location_id, visitId });

    await connection.commit();

    for (const finding of appliedUpdates.resolved) {
      notifyFindingEvent({ companyId, actorUserId: req.session?.user_id ?? null, eventType: 'resolved', finding })
        .catch((notifyErr) => console.error('Finding notification failed:', notifyErr));
    }
    if (appliedUpdates.reported.length > 0) {
      notifyFindingReportedFixed({ companyId, actorUserId: req.session?.user_id ?? null, findings: appliedUpdates.reported, rmsVisitId: visitId })
        .catch((notifyErr) => console.error('Finding notification failed:', notifyErr));
    }

    if (createdFindings.length > 0) {
      notifyNewFindings({ companyId, actorUserId: req.session?.user_id ?? null, findings: createdFindings })
        .catch((notifyErr) => console.error('Finding notification failed:', notifyErr));
    }

    res.status(201).json({ id: visitId });
  } catch (err) {
    await connection.rollback();
    console.error('Greška pri spremanju RMS posjeta:', err);
    res.status(500).json({ error: 'Failed to save RMS visit' });
  } finally {
    connection.release();
  }
});

// GET /api/rms-visits/prefill/location/:id - template for "Prefill from last RMS" (read-only, company scoped).
// Per elevator label the comment of its most recent visit (created_at order), plus the general note of the latest visit.
// Never returns signatures, photos, dates or findings; the form only copies text into its fields, a new visit is created on save.
router.get('/prefill/location/:id', async (req, res) => {
  const locationId = Number(req.params.id);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return res.status(400).json({ error: 'Invalid location', code: 'invalid_request' });
  }
  try {
    const companyId = req.companyId;
    const [[latest]] = await db.query(
      `SELECT id, visit_date, notes_general FROM rms_visits
       WHERE location_id = ? AND company_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [locationId, companyId]
    );
    if (!latest) return res.json({ found: false });
    const [rows] = await db.query(
      `SELECT i.elevator_label, i.comment, v.id AS visit_id
       FROM rms_visit_items i
       INNER JOIN rms_visits v ON v.id = i.visit_id AND v.company_id = i.company_id
       WHERE v.location_id = ? AND v.company_id = ?
       ORDER BY v.created_at DESC, v.id DESC, i.id DESC
       LIMIT 500`,
      [locationId, companyId]
    );
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      if (seen.has(row.elevator_label)) continue;
      seen.add(row.elevator_label);
      items.push({ elevator_label: row.elevator_label, comment: row.comment || '', visit_id: row.visit_id });
    }
    res.json({ found: true, visit_id: latest.id, visit_date: latest.visit_date, notes_general: latest.notes_general || '', items });
  } catch (err) {
    console.error('Greška pri dohvaćanju predloška RMS posjeta:', err);
    res.status(500).json({ error: 'Failed to load RMS prefill' });
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
