const express = require('express');
const router = express.Router();
const fs = require('fs');
const db = require('../db');
const { generatePdfForRms } = require('../utils/rms-pdf');
const { isRmsExpected } = require('../utils/rms-expectations');

// ✅ POST: RMS posjeti su append-only, kreiraju se preko /api/rms-visits
router.post('/', async (req, res) => {
  res.status(400).json({ error: 'RMS posjeti se kreiraju preko /api/rms-visits.' });
});


// ✅ GET: Dohvati sve RMS zapise
router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(`
      SELECT v.id,
             v.visit_date AS date,
             v.created_at,
             v.notes_general,
             l.name AS location_name,
             u.username AS technician
      FROM rms_visits v
      LEFT JOIN locations l ON v.location_id = l.id
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.company_id = ?
      ORDER BY v.visit_date DESC, v.created_at DESC
    `, [companyId]);
    res.json(rows);
  } catch (err) {
    console.error('❌ Greška kod dohvaćanja svih RMS zapisa:', err);
    res.status(500).json({ error: 'Greška kod dohvaćanja RMS zapisa' });
  }
});

// ✅ PUT: Status RMS zapisa se ne ažurira ovdje (per-elevator statusi su u rms_visit_items)
router.put('/:id/status', async (req, res) => {
  res.status(400).json({ error: 'Status RMS posjete je definiran po dizalima u rms_visit_items.' });
});


// ✅ GET: RMS po lokaciji
router.get('/by-location/:locationId', async (req, res) => {
  const locationId = req.params.locationId;
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(`
      SELECT v.id,
             v.visit_date AS date,
             v.created_at,
             v.notes_general,
             u.username AS technician
      FROM rms_visits v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.location_id = ?
        AND v.company_id = ?
      ORDER BY v.visit_date DESC, v.created_at DESC
      LIMIT 10
    `, [locationId, companyId]);
    res.json(rows);
  } catch (err) {
    console.error('❌ Greška kod dohvaćanja RMS po lokaciji:', err);
    res.status(500).json({ error: 'Greška kod dohvaćanja RMS zapisa' });
  }
});


// ✅ GET: RMS po korisniku (serviseru)
router.get('/by-user/:username', (req, res) => {
  const { username } = req.params;
  const companyId = req.companyId;
  const query = `
    SELECT v.id,
           v.visit_date AS date,
           v.created_at,
           v.notes_general,
           l.name AS location_name,
           u.username AS technician
    FROM rms_visits v
    LEFT JOIN locations l ON v.location_id = l.id
    LEFT JOIN users u ON v.user_id = u.id
    WHERE u.username = ?
      AND v.company_id = ?
    ORDER BY v.visit_date DESC, v.created_at DESC
  `;
  db.query(query, [username, companyId], (err, rows) => {
    if (err) {
      console.error('❌ Greška kod dohvaćanja RMS po korisniku:', err);
      return res.sendStatus(500);
    }
    res.json(rows);
  });
});


// ✅ GET: Statistika po korisniku
router.get('/user-stats/:username', (req, res) => {
  const username = req.params.username;

  const companyId = req.companyId;
  const query = `
    SELECT 
      COUNT(*) AS total_rms,
      SUM(CASE WHEN DATE(visit_date) >= CURDATE() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_7_days,
      SUM(CASE WHEN MONTH(visit_date) = MONTH(CURRENT_DATE()) AND YEAR(visit_date) = YEAR(CURRENT_DATE()) THEN 1 ELSE 0 END) AS this_month
    FROM rms_visits
    WHERE user_id = (SELECT id FROM users WHERE username = ?)
      AND company_id = ?
  `;

  db.query(query, [username, companyId], (err, results) => {
    if (err) {
      console.error('❌ Greška kod dohvaćanja RMS statistike:', err);
      return res.status(500).json({ error: 'Greška kod dohvaćanja statistike' });
    }
    res.json(results[0]);
  });
});

// ✅ GET: RMS monthly overview (per location)
router.get('/monthly-overview', async (req, res) => {
  const companyId = req.companyId;
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year or month' });
  }

  try {
    const [rows] = await db.query(
      `SELECT l.id AS location_id,
              l.name AS location_name,
              l.rms_frequency,
              MAX(COALESCE(v.rms_month, v.visit_date)) AS last_rms_visit_date,
              MAX(CASE WHEN YEAR(COALESCE(v.rms_month, v.visit_date)) = ? AND MONTH(COALESCE(v.rms_month, v.visit_date)) = ? THEN 1 ELSE 0 END) AS has_rms
       FROM locations l
       LEFT JOIN rms_visits v
         ON v.location_id = l.id
        AND v.company_id = l.company_id
       WHERE l.company_id = ?
       GROUP BY l.id
       ORDER BY l.name ASC`,
      [year, month, companyId]
    );

    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    const [nextRows] = await db.query(
      `SELECT l.id AS location_id,
              MAX(COALESCE(v.rms_month, v.visit_date)) AS last_rms_visit_date,
              MAX(CASE WHEN YEAR(COALESCE(v.rms_month, v.visit_date)) = ? AND MONTH(COALESCE(v.rms_month, v.visit_date)) = ? THEN 1 ELSE 0 END) AS has_rms
       FROM locations l
       LEFT JOIN rms_visits v
         ON v.location_id = l.id
        AND v.company_id = l.company_id
       WHERE l.company_id = ?
       GROUP BY l.id`,
      [nextYear, nextMonth, companyId]
    );

    const nextByLocation = nextRows.reduce((acc, row) => {
      acc[row.location_id] = {
        has_rms: Boolean(row.has_rms),
        last_rms_visit_date: row.last_rms_visit_date
      };
      return acc;
    }, {});

    const payload = rows.map(row => ({
      location_id: row.location_id,
      location_name: row.location_name,
      rms_frequency: row.rms_frequency ?? 1,
      year,
      month,
      expected: isRmsExpected(row, year, month),
      has_rms: Boolean(row.has_rms),
      last_rms_visit_date: row.last_rms_visit_date,
      next_has_rms: nextByLocation[row.location_id]?.has_rms || false,
      next_last_rms_visit_date: nextByLocation[row.location_id]?.last_rms_visit_date || null
    }));

    res.json(payload);
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS pregleda po mjesecu:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju RMS pregleda' });
  }
});

// ✅ GET: Preuzmi PDF RMS zapisa
router.get('/:id/pdf', async (req, res) => {
  const rmsId = req.params.id;
  const companyId = req.companyId ?? null;

  if (!companyId) {
    return res.sendStatus(404);
  }
  
  try {
    const [rows] = await db.query(
      'SELECT id FROM rms_visits WHERE id = ? AND company_id = ?',
      [rmsId, companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'RMS zapis nije pronađen' });
    }

    // Generiraj PDF on-the-fly
    const result = await generatePdfForRms(rmsId, companyId);
    
    if (fs.existsSync(result.filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=rms-${rmsId}.pdf`);
      res.sendFile(result.filePath);
    } else {
      res.status(404).json({ error: 'PDF datoteka nije pronađena' });
    }
  } catch (err) {
    console.error('Greška pri generiranju PDF-a:', err);
    res.status(500).json({ error: 'Greška pri generiranju PDF-a: ' + err.message });
  }
});

module.exports = router;
