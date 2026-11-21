const express = require('express');
const router = express.Router();
const db = require('../db');
const { isCompanyAdmin } = require('../utils/membership');

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;
const LIMIT = 5;

// LIKE wildcards in user input are escaped with "!" (ESCAPE '!'), so "%" and "_" only match themselves.
const escapeLike = (value) => value.replace(/[!%_]/g, (ch) => `!${ch}`);

// GET /api/search?q=  (all roles; vehicles only for admins because the vehicles page is admin-only)
// Every statement filters by company_id (also on the joined locations) and is parameterized.
router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    const raw = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_LENGTH) : '';
    const empty = { locations: [], elevators: [], vehicles: [], rms: [], interventions: [], work_orders: [] };
    if (raw.length < MIN_LENGTH) {
      return res.json({ query: raw, ...empty });
    }

    const like = `%${escapeLike(raw)}%`;
    const numeric = /^#?\d{1,9}$/.test(raw) ? Number(raw.replace('#', '')) : -1;

    const admin = await isCompanyAdmin({
      userId: req.session?.user_id,
      companyId,
      globalRole: req.session?.global_role
    });

    const [locations] = await db.query(
      `SELECT id, name, address
       FROM locations
       WHERE company_id = ? AND (name LIKE ? ESCAPE '!' OR address LIKE ? ESCAPE '!')
       ORDER BY name ASC
       LIMIT ${LIMIT}`,
      [companyId, like, like]
    );

    const [elevators] = await db.query(
      `SELECT e.id, e.label, e.serial_number, e.location_id, l.name AS location_name
       FROM elevators e
       INNER JOIN locations l ON l.id = e.location_id AND l.company_id = e.company_id
       WHERE e.company_id = ? AND (e.label LIKE ? ESCAPE '!' OR e.serial_number LIKE ? ESCAPE '!')
       ORDER BY e.label ASC
       LIMIT ${LIMIT}`,
      [companyId, like, like]
    );

    let vehicles = [];
    if (admin) {
      [vehicles] = await db.query(
        `SELECT id, name
         FROM vehicles
         WHERE company_id = ? AND name LIKE ? ESCAPE '!'
         ORDER BY name ASC
         LIMIT ${LIMIT}`,
        [companyId, like]
      );
    }

    const [rms] = await db.query(
      `SELECT r.id, r.visit_date AS date, r.location_id, l.name AS location_name
       FROM rms_visits r
       INNER JOIN locations l ON l.id = r.location_id AND l.company_id = r.company_id
       WHERE r.company_id = ? AND (l.name LIKE ? ESCAPE '!' OR l.address LIKE ? ESCAPE '!' OR r.id = ?)
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ${LIMIT}`,
      [companyId, like, like, numeric]
    );

    const [interventions] = await db.query(
      `SELECT i.id, i.date, i.location_id, l.name AS location_name
       FROM interventions i
       INNER JOIN locations l ON l.id = i.location_id AND l.company_id = i.company_id
       WHERE i.company_id = ? AND (l.name LIKE ? ESCAPE '!' OR l.address LIKE ? ESCAPE '!' OR i.id = ?)
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT ${LIMIT}`,
      [companyId, like, like, numeric]
    );

    const [workOrders] = await db.query(
      `SELECT w.id, w.status, w.due_date, w.location_id, l.name AS location_name
       FROM work_orders w
       INNER JOIN locations l ON l.id = w.location_id AND l.company_id = w.company_id
       WHERE w.company_id = ? AND (l.name LIKE ? ESCAPE '!' OR l.address LIKE ? ESCAPE '!' OR w.id = ?)
       ORDER BY w.created_at DESC, w.id DESC
       LIMIT ${LIMIT}`,
      [companyId, like, like, numeric]
    );

    return res.json({
      query: raw,
      locations,
      elevators,
      vehicles,
      rms,
      interventions,
      work_orders: workOrders
    });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
