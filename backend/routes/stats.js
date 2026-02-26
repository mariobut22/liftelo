const express = require('express');
const router = express.Router();
const db = require('../db');
const { isRmsExpected } = require('../utils/rms-expectations');

// GET /api/stats – vraća osnovnu statistiku
router.get('/', (req, res) => {
  const stats = {};

  const queries = [
    { key: 'users', sql: 'SELECT COUNT(*) AS count FROM users' },
    { key: 'locations', sql: 'SELECT COUNT(*) AS count FROM locations' },
    { key: 'rms', sql: 'SELECT COUNT(*) AS count FROM rms_visits' },
    { key: 'interventions', sql: 'SELECT COUNT(*) AS count FROM interventions' }
  ];

  let completed = 0;

  queries.forEach(q => {
    db.query(q.sql, (err, results) => {
      if (err) {
        console.error(`Greška u statistici za ${q.key}:`, err);
        stats[q.key] = 0;
      } else {
        stats[q.key] = results[0].count;
      }

      completed++;
      if (completed === queries.length) {
        res.json(stats);
      }
    });
  });
});

// GET /api/stats/rms – mjesečni RMS statusi (odradeno/zakašnjelo/nedostaje)
router.get('/rms', async (req, res) => {
  const companyId = req.companyId;
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year or month' });
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  try {
    const [locationRows] = await db.query(
      'SELECT id, rms_frequency FROM locations WHERE company_id = ?',
      [companyId]
    );

    const totalLocations = locationRows.length;
    if (totalLocations === 0) {
      return res.json({
        total_locations: 0,
        expected_rms: 0,
        done_count: 0,
        late_count: 0,
        missing_count: 0,
        coverage_percent: 0
      });
    }

    const locationIds = locationRows.map(row => row.id);
    const locationById = locationRows.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});

    const [currentRows] = await db.query(
      `SELECT l.id AS location_id,
              MAX(CASE WHEN YEAR(COALESCE(v.rms_month, v.visit_date)) = ? AND MONTH(COALESCE(v.rms_month, v.visit_date)) = ? THEN 1 ELSE 0 END) AS has_rms
       FROM locations l
       LEFT JOIN rms_visits v
         ON v.location_id = l.id
        AND v.company_id = l.company_id
       WHERE l.company_id = ?
         AND l.id IN (${locationIds.map(() => '?').join(',')})
       GROUP BY l.id`,
      [year, month, companyId, ...locationIds]
    );

    const [nextRows] = await db.query(
      `SELECT l.id AS location_id,
              MAX(CASE WHEN YEAR(COALESCE(v.rms_month, v.visit_date)) = ? AND MONTH(COALESCE(v.rms_month, v.visit_date)) = ? THEN 1 ELSE 0 END) AS has_rms
       FROM locations l
       LEFT JOIN rms_visits v
         ON v.location_id = l.id
        AND v.company_id = l.company_id
       WHERE l.company_id = ?
         AND l.id IN (${locationIds.map(() => '?').join(',')})
       GROUP BY l.id`,
      [nextYear, nextMonth, companyId, ...locationIds]
    );

    const nextByLocation = nextRows.reduce((acc, row) => {
      acc[row.location_id] = Boolean(row.has_rms);
      return acc;
    }, {});

    let doneCount = 0;
    let lateCount = 0;
    let missingCount = 0;
    let expectedCount = 0;

    currentRows.forEach(row => {
      const location = locationById[row.location_id];
      if (!location || !isRmsExpected(location, year, month)) {
        return;
      }
      expectedCount += 1;

      if (row.has_rms) {
        doneCount += 1;
      } else if (nextByLocation[row.location_id]) {
        lateCount += 1;
      } else {
        missingCount += 1;
      }
    });

    const coveragePercent = expectedCount
      ? Math.round((doneCount / expectedCount) * 100)
      : 0;

    res.json({
      total_locations: totalLocations,
      expected_rms: expectedCount,
      done_count: doneCount,
      late_count: lateCount,
      missing_count: missingCount,
      coverage_percent: coveragePercent
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS statistike:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju RMS statistike' });
  }
});

// GET /api/stats/rms-alerts – lokacije s uzastopnim mjesecima bez RMS
router.get('/rms-alerts', async (req, res) => {
  const companyId = req.companyId;
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!companyId) {
    return res.status(401).json({ error: 'Missing company context' });
  }

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year or month' });
  }

  try {
    const [[companyRow]] = await db.query(
      'SELECT created_at FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );

    const companyCreatedAt = companyRow?.created_at ? new Date(companyRow.created_at) : new Date();
    const companyStartIndex = companyCreatedAt.getFullYear() * 12 + companyCreatedAt.getMonth();

    const [locations] = await db.query(
      'SELECT id, name, rms_frequency FROM locations WHERE company_id = ?',
      [companyId]
    );

    if (!locations.length) {
      return res.json([]);
    }

    const [visits] = await db.query(
      `SELECT location_id,
              COALESCE(rms_month, visit_date) AS effective_date,
              visit_date
       FROM rms_visits
       WHERE company_id = ?`,
      [companyId]
    );

    const monthsByLocation = new Map();
    const lastVisitByLocation = new Map();

    visits.forEach(visit => {
      const effectiveDate = new Date(visit.effective_date);
      if (Number.isNaN(effectiveDate.getTime())) return;

      const monthIndex = effectiveDate.getFullYear() * 12 + effectiveDate.getMonth();
      const existingSet = monthsByLocation.get(visit.location_id) || new Set();
      existingSet.add(monthIndex);
      monthsByLocation.set(visit.location_id, existingSet);

      if (visit.visit_date) {
        const visitDate = new Date(visit.visit_date);
        const existingLast = lastVisitByLocation.get(visit.location_id);
        if (!existingLast || visitDate > existingLast) {
          lastVisitByLocation.set(visit.location_id, visitDate);
        }
      }
    });

    const targetIndex = year * 12 + (month - 1);

    const results = locations.reduce((acc, location) => {
      const monthSet = monthsByLocation.get(location.id) || new Set();
      let consecutiveMissing = 0;

      for (let idx = targetIndex; idx >= companyStartIndex; idx -= 1) {
        const yearValue = Math.floor(idx / 12);
        const monthValue = (idx % 12) + 1;

        if (!isRmsExpected(location, yearValue, monthValue)) {
          continue;
        }

        const hasRms = monthSet.has(idx);
        const nextHasRms = monthSet.has(idx + 1);

        if (hasRms || nextHasRms) {
          break;
        }
        consecutiveMissing += 1;
      }

      if (consecutiveMissing >= 3) {
        const lastVisit = lastVisitByLocation.get(location.id);
        acc.push({
          location_id: location.id,
          location_name: location.name,
          consecutive_missing_months: consecutiveMissing,
          last_rms_visit_date: lastVisit ? lastVisit.toISOString() : null
        });
      }

      return acc;
    }, []);

    res.json(results);
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS alert podataka:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju RMS alert podataka' });
  }
});

// GET /api/stats/daily – dnevna aktivnost za graf
router.get('/daily', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        d.date AS date,
        COALESCE(r.rms_count, 0) AS rms_count,
        COALESCE(i.intervention_count, 0) AS intervention_count
      FROM (
        SELECT DATE(visit_date) AS date FROM rms_visits
        UNION
        SELECT DATE(date) AS date FROM interventions
      ) d
      LEFT JOIN (
        SELECT DATE(visit_date) AS date, COUNT(*) AS rms_count
        FROM rms_visits
        GROUP BY DATE(visit_date)
      ) r ON r.date = d.date
      LEFT JOIN (
        SELECT DATE(date) AS date, COUNT(*) AS intervention_count
        FROM interventions
        GROUP BY DATE(date)
      ) i ON i.date = d.date
      ORDER BY d.date ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju dnevne statistike:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju dnevne statistike' });
  }
});

module.exports = router;
