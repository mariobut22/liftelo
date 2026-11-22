// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD  (all roles, company-scoped, range max 100 days).
// One read-only endpoint that feeds the calendar page:
//   work_orders  - by due date; a technician only sees work orders assigned to him, admin/viewer see all
//   rms_deadlines - one item per calendar month end in the range (expected / done / missing locations), derived from rms_visits
//   recurrences  - FUTURE occurrences of active recurring templates that are not generated yet (generated ones are normal work
//                  orders); technician only his own. Generation of due occurrences is triggered lazily here too.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { getCompanyRole } = require('../utils/membership');
const { isRmsExpected } = require('../utils/rms-expectations');
const { effectiveDateSql } = require('../utils/rmsOverviewSync');
const {
  RECURRENCE_COLUMNS, parseYmd, todayYmd, addDays, occurrencesBetween, hasRecurrenceTables, ensureRecurringWorkOrders, LEAD_DAYS
} = require('../utils/workOrderRecurrence');

const MAX_RANGE_DAYS = 100;
const pad = (n) => String(n).padStart(2, '0');

router.get('/', async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user_id;
  if (!companyId || !userId) return res.status(401).json({ error: 'Missing company context', code: 'missing_company_context' });

  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);
  if (!fromDate || !toDate || to < from) return res.status(400).json({ error: 'Invalid date range', code: 'invalid_date_range' });
  if ((toDate - fromDate) / 86400000 > MAX_RANGE_DAYS) return res.status(400).json({ error: 'Date range too long', code: 'date_range_too_long' });

  try {
    const role = req.session?.global_role === 'superadmin' ? 'admin' : await getCompanyRole(userId, companyId);
    const own = role === 'technician';

    await ensureRecurringWorkOrders(companyId);

    // --- work orders by due date
    const [orders] = await db.query(
      `SELECT w.id, w.status, DATE_FORMAT(w.due_date, '%Y-%m-%d') AS due_date, l.name AS location_name,
              (SELECT i.description FROM work_order_items i WHERE i.work_order_id = w.id AND i.company_id = w.company_id
                ORDER BY i.sort_order ASC, i.id ASC LIMIT 1) AS title,
              (SELECT GROUP_CONCAT(COALESCE(u.full_name, u.username) SEPARATOR ', ')
                 FROM work_order_users wu INNER JOIN users u ON u.id = wu.user_id
                WHERE wu.work_order_id = w.id AND wu.company_id = w.company_id) AS assignees
       FROM work_orders w
       LEFT JOIN locations l ON l.id = w.location_id AND l.company_id = w.company_id
       WHERE w.company_id = ? AND w.due_date >= ? AND w.due_date <= ?
         ${own ? 'AND EXISTS (SELECT 1 FROM work_order_users me WHERE me.work_order_id = w.id AND me.company_id = w.company_id AND me.user_id = ?)' : ''}
       ORDER BY w.due_date ASC, w.id ASC
       LIMIT 500`,
      own ? [companyId, from, to, userId] : [companyId, from, to]
    );

    // --- RMS deadlines (month ends inside the range)
    const monthEnds = [];
    for (let y = fromDate.getUTCFullYear(), m = fromDate.getUTCMonth() + 1; ; ) {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const date = `${y}-${pad(m)}-${pad(last)}`;
      if (date > to) break;
      if (date >= from) monthEnds.push({ year: y, month: m, date });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    const rmsDeadlines = [];
    if (monthEnds.length) {
      const first = `${monthEnds[0].year}-${pad(monthEnds[0].month)}-01`;
      const [locations] = await db.query('SELECT id, name, rms_frequency FROM locations WHERE company_id = ? ORDER BY name ASC, id ASC', [companyId]);
      const eff = effectiveDateSql('v');
      const [visits] = await db.query(
        `SELECT v.location_id, YEAR(${eff}) AS y, MONTH(${eff}) AS m
         FROM rms_visits v
         WHERE v.company_id = ? AND ${eff} >= ? AND ${eff} <= ?
         GROUP BY v.location_id, YEAR(${eff}), MONTH(${eff})`,
        [companyId, first, monthEnds[monthEnds.length - 1].date]
      );
      const doneKeys = new Set(visits.map((r) => `${r.location_id}|${r.y}|${r.m}`));
      for (const { year, month, date } of monthEnds) {
        const expected = locations.filter((l) => isRmsExpected(l, year, month));
        const missing = expected.filter((l) => !doneKeys.has(`${l.id}|${year}|${month}`));
        if (!expected.length) continue;
        rmsDeadlines.push({
          date,
          month: `${year}-${pad(month)}`,
          expected: expected.length,
          done: expected.length - missing.length,
          missing: missing.length,
          missing_locations: missing.slice(0, 5).map((l) => ({ id: l.id, name: l.name }))
        });
      }
    }

    // --- upcoming recurring occurrences that are not generated yet
    const recurrences = [];
    if (await hasRecurrenceTables()) {
      const [recs] = await db.query(
        `SELECT r.company_id, ${RECURRENCE_COLUMNS}, l.name AS location_name
         FROM work_order_recurrences r
         LEFT JOIN locations l ON l.id = r.location_id AND l.company_id = r.company_id
         WHERE r.company_id = ? AND r.is_active = 1 ${own ? 'AND r.assigned_user_id = ?' : ''}`,
        own ? [companyId, userId] : [companyId]
      );
      const beyondGenerated = addDays(todayYmd(), LEAD_DAYS);
      const lower = from > beyondGenerated ? from : addDays(beyondGenerated, 1);
      if (recs.length && lower <= to) {
        const [runs] = await db.query(
          `SELECT recurrence_id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date FROM work_order_recurrence_runs
           WHERE company_id = ? AND due_date >= ? AND due_date <= ?`,
          [companyId, lower, to]
        );
        const generated = new Set(runs.map((r) => `${r.recurrence_id}|${r.due_date}`));
        for (const rec of recs) {
          for (const date of occurrencesBetween(rec, lower, to, 60)) {
            if (generated.has(`${rec.id}|${date}`)) continue;
            recurrences.push({ recurrence_id: rec.id, date, title: rec.description, location_name: rec.location_name || null, frequency: rec.frequency });
          }
        }
        recurrences.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.recurrence_id - b.recurrence_id));
      }
    }

    return res.json({
      from,
      to,
      role,
      work_orders: orders.map((o) => ({
        id: o.id, status: o.status, date: o.due_date, title: o.title || null, location_name: o.location_name || null, assignees: o.assignees || null
      })),
      rms_deadlines: rmsDeadlines,
      recurrences
    });
  } catch (err) {
    console.error('Calendar failed:', err);
    return res.status(500).json({ error: 'Failed to load calendar', code: 'calendar_failed' });
  }
});

module.exports = router;
