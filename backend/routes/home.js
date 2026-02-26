const express = require('express');
const router = express.Router();
const db = require('../db');
const { isRmsExpected } = require('../utils/rms-expectations');

const getCurrentYearMonth = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

const computeRmsSummary = async (companyId, year, month) => {
  const [locations] = await db.query(
    'SELECT id, name, rms_frequency FROM locations WHERE company_id = ?',
    [companyId]
  );

  if (!locations.length) {
    return {
      expected: 0,
      done: 0,
      late: 0,
      missing: 0,
      missing_locations: []
    };
  }

  const locationIds = locations.map(row => row.id);
  const locationById = locations.reduce((acc, row) => {
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

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

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

  let expected = 0;
  let done = 0;
  let late = 0;
  let missing = 0;
  const missingLocations = [];

  currentRows.forEach(row => {
    const location = locationById[row.location_id];
    if (!location || !isRmsExpected(location, year, month)) {
      return;
    }

    expected += 1;
    if (row.has_rms) {
      done += 1;
      return;
    }

    if (nextByLocation[row.location_id]) {
      late += 1;
      missingLocations.push({ id: location.id, name: location.name });
      return;
    }

    missing += 1;
    missingLocations.push({ id: location.id, name: location.name });
  });

  return {
    expected,
    done,
    late,
    missing,
    missing_locations: missingLocations
  };
};

const computeRmsAlertsCount = async (companyId, year, month) => {
  const [[companyRow]] = await db.query(
    'SELECT created_at FROM companies WHERE id = ? LIMIT 1',
    [companyId]
  );

  const companyCreatedAt = companyRow?.created_at ? new Date(companyRow.created_at) : new Date();
  const companyStartIndex = companyCreatedAt.getFullYear() * 12 + companyCreatedAt.getMonth();

  const [locations] = await db.query(
    'SELECT id, rms_frequency FROM locations WHERE company_id = ?',
    [companyId]
  );

  if (!locations.length) {
    return 0;
  }

  const [visits] = await db.query(
    `SELECT location_id,
            COALESCE(rms_month, visit_date) AS effective_date
     FROM rms_visits
     WHERE company_id = ?`,
    [companyId]
  );

  const monthsByLocation = new Map();
  visits.forEach(visit => {
    const effectiveDate = new Date(visit.effective_date);
    if (Number.isNaN(effectiveDate.getTime())) return;
    const monthIndex = effectiveDate.getFullYear() * 12 + effectiveDate.getMonth();
    const existingSet = monthsByLocation.get(visit.location_id) || new Set();
    existingSet.add(monthIndex);
    monthsByLocation.set(visit.location_id, existingSet);
  });

  const targetIndex = year * 12 + (month - 1);
  let alertCount = 0;

  locations.forEach(location => {
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
      alertCount += 1;
    }
  });

  return alertCount;
};

const computeVehicleAlerts = async (companyId) => {
  const [rows] = await db.query(
    `SELECT id, name, registration_expiry_date
     FROM vehicles
     WHERE company_id = ?
       AND registration_expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
     ORDER BY registration_expiry_date ASC`,
    [companyId]
  );

  return {
    expiring_soon_count: rows.length,
    expiring_soon_list: rows.map(row => ({
      id: row.id,
      name: row.name,
      registration_expiry_date: row.registration_expiry_date
    }))
  };
};

router.get('/summary', async (req, res) => {
  const companyId = req.companyId;
  const user = req.session?.user;

  if (!companyId || !user) {
    return res.status(401).json({ error: 'Missing company context' });
  }

  const { year, month } = getCurrentYearMonth();

  try {
    const [[rmsRow]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM rms_visits
       WHERE company_id = ?
         AND user_id = ?
         AND YEAR(created_at) = ?
         AND MONTH(created_at) = ?`,
      [companyId, user.id, year, month]
    );

    const [[interventionRow]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM interventions
       WHERE company_id = ?
         AND YEAR(created_at) = ?
         AND MONTH(created_at) = ?`,
      [companyId, year, month]
    );

    const rmsSummary = await computeRmsSummary(companyId, year, month);
    const alertCount = await computeRmsAlertsCount(companyId, year, month);

    const [[workOrderCountRow]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM work_orders w
       INNER JOIN work_order_users wou
         ON w.id = wou.work_order_id
        AND w.company_id = wou.company_id
       WHERE w.company_id = ?
         AND w.status = 'open'
         AND wou.user_id = ?`,
      [companyId, user.id]
    );

    const [workOrderRows] = await db.query(
      `SELECT w.id,
              w.location_id,
              w.due_date,
              l.name AS location_name
       FROM work_orders w
       INNER JOIN work_order_users wou
         ON w.id = wou.work_order_id
        AND w.company_id = wou.company_id
       LEFT JOIN locations l ON w.location_id = l.id
       WHERE w.company_id = ?
         AND w.status = 'open'
         AND wou.user_id = ?
       ORDER BY w.due_date ASC, w.created_at ASC
       LIMIT 5`,
      [companyId, user.id]
    );

    const [[overdueWorkOrdersRow]] = await db.query(
      `SELECT COUNT(DISTINCT w.id) AS count
       FROM work_orders w
       INNER JOIN work_order_users wou
         ON w.id = wou.work_order_id
        AND w.company_id = wou.company_id
       WHERE w.company_id = ?
         AND w.status = 'open'
         AND w.due_date IS NOT NULL
         AND w.due_date < CURDATE()`,
      [companyId]
    );

    const coveragePercent = rmsSummary.expected > 0
      ? (rmsSummary.done / rmsSummary.expected) * 100
      : 100;

    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [user.id, companyId]
    );
    const vehicles = membership?.role === 'admin'
      ? await computeVehicleAlerts(companyId)
      : null;

    res.json({
      user: {
        id: user.id,
        name: user.full_name || user.username
      },
      user_stats: {
        rms_count: rmsRow?.count || 0,
        intervention_count: interventionRow?.count || 0
      },
      rms_summary: {
        expected: rmsSummary.expected,
        done: rmsSummary.done,
        late: rmsSummary.late,
        missing: rmsSummary.missing
      },
      rms_missing_locations: rmsSummary.missing_locations,
      alerts: {
        count: alertCount
      },
      work_orders: {
        open_assigned_count: workOrderCountRow?.count || 0,
        items: workOrderRows.map(row => ({
          id: row.id,
          location_id: row.location_id,
          location_name: row.location_name,
          due_date: row.due_date
        }))
      },
      vehicles,
      notifications: {
        has_rms_alerts: alertCount > 0,
        overdue_work_orders_count: overdueWorkOrdersRow?.count || 0,
        rms_coverage_low: coveragePercent < 80
      }
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju home summary:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju home summary' });
  }
});

module.exports = router;
