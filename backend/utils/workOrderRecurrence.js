// Recurring work orders (tables work_order_recurrences + work_order_recurrence_runs, migration 20261120).
//
// GENERATION IS LAZY (no scheduler): ensureRecurringWorkOrders(companyId) is called from Home, the work order list and the
// calendar. It creates every occurrence whose due date is inside the window [today - CATCH_UP_DAYS, today + LEAD_DAYS] and was
// not created yet. Older missed occurrences are skipped on purpose (an app that nobody opened for months must not dump a
// backlog). Idempotency: UNIQUE (recurrence_id, due_date) on work_order_recurrence_runs; the run row is inserted FIRST inside
// the same transaction as the work order, so a duplicate occurrence fails the insert and nothing else is written. A per-company
// MySQL named lock additionally serialises concurrent callers (the lock is only taken when something is actually due).
// Generated work orders are NORMAL work orders (status open, issued today, due = occurrence date) + the usual assignment
// notification (createNotification, same mechanism as POST /api/work-orders).
const db = require('../db');
const { createNotification } = require('./createNotification');

const FREQUENCIES = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
const LEAD_DAYS = 7;
const CATCH_UP_DAYS = 30;
const MAX_PER_RUN = 200;

const pad = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseYmd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return toYmd(d) === s ? d : null;
};
const addDays = (ymd, days) => { const d = parseYmd(ymd); d.setUTCDate(d.getUTCDate() + days); return toYmd(d); };
const todayYmd = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** k-th occurrence (k = 0 is the start date), anchored to the start day and clamped to the month end (31 Jan -> 28/29 Feb). */
const occurrenceAt = (startYmd, frequency, k) => {
  const start = parseYmd(startYmd);
  const step = FREQUENCIES[frequency];
  const monthIndex = start.getUTCMonth() + step * k;
  const year = start.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toYmd(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))));
};

/** All occurrence dates (YYYY-MM-DD) of a recurrence between from and to (inclusive), honouring start and end date. */
const occurrencesBetween = (rec, fromYmd, toYmdValue, limit = 400) => {
  if (!FREQUENCIES[rec.frequency] || !parseYmd(rec.start_date)) return [];
  const out = [];
  for (let k = 0; k < 10000 && out.length < limit; k += 1) {
    const date = occurrenceAt(rec.start_date, rec.frequency, k);
    if (date > toYmdValue) break;
    if (rec.end_date && date > rec.end_date) break;
    if (date >= fromYmd) out.push(date);
  }
  return out;
};

/** Next occurrence on or after `fromYmd` (null when the end date is passed). */
const nextOccurrence = (rec, fromYmd) => {
  if (!FREQUENCIES[rec.frequency] || !parseYmd(rec.start_date)) return null;
  for (let k = 0; k < 10000; k += 1) {
    const date = occurrenceAt(rec.start_date, rec.frequency, k);
    if (rec.end_date && date > rec.end_date) return null;
    if (date >= fromYmd) return date;
  }
  return null;
};

let tablesCache = { present: false, checkedAt: 0 };
const hasRecurrenceTables = async () => {
  if (tablesCache.present) return true;
  if (tablesCache.checkedAt && Date.now() - tablesCache.checkedAt < 60 * 1000) return false;
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('work_order_recurrences', 'work_order_recurrence_runs')`
  );
  tablesCache = { present: Number(rows[0].c) === 2, checkedAt: Date.now() };
  return tablesCache.present;
};

const RECURRENCE_COLUMNS = `r.id, r.location_id, r.elevator_id, r.description, r.general_comment, r.frequency,
  DATE_FORMAT(r.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(r.end_date, '%Y-%m-%d') AS end_date,
  r.assigned_user_id, r.is_active, r.created_by_user_id, r.created_at`;

/** Creates one occurrence inside its own transaction. Returns the work order id, or null when it already exists / cannot be made. */
async function createOccurrence(conn, rec, dueDate, today) {
  const companyId = rec.company_id;
  await conn.beginTransaction();
  try {
    const [run] = await conn.query(
      'INSERT IGNORE INTO work_order_recurrence_runs (company_id, recurrence_id, due_date) VALUES (?, ?, ?)',
      [companyId, rec.id, dueDate]
    );
    if (!run.affectedRows) { await conn.rollback(); return null; }

    const [[loc]] = await conn.query('SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1', [rec.location_id, companyId]);
    if (!loc) { await conn.commit(); return null; } // location deleted: occurrence is recorded as skipped (no work order)

    const [wo] = await conn.query(
      `INSERT INTO work_orders (company_id, location_id, created_by_user_id, status, issued_date, due_date, general_comment)
       VALUES (?, ?, ?, 'open', ?, ?, ?)`,
      [companyId, rec.location_id, rec.created_by_user_id ?? null, today, dueDate, rec.general_comment || null]
    );
    const workOrderId = wo.insertId;
    await conn.query(
      'INSERT INTO work_order_items (work_order_id, company_id, description, sort_order) VALUES (?, ?, ?, 1)',
      [workOrderId, companyId, rec.description]
    );
    if (rec.elevator_id) {
      const [[elev]] = await conn.query(
        'SELECT id FROM elevators WHERE id = ? AND company_id = ? AND location_id = ? LIMIT 1',
        [rec.elevator_id, companyId, rec.location_id]
      );
      if (elev) {
        await conn.query('INSERT INTO work_order_elevators (work_order_id, company_id, elevator_id) VALUES (?, ?, ?)', [workOrderId, companyId, elev.id]);
      }
    }
    let assignee = null;
    if (rec.assigned_user_id) {
      const [[usr]] = await conn.query(
        `SELECT u.id FROM users u
         INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ?
         WHERE u.id = ? AND u.disabled_at IS NULL LIMIT 1`,
        [companyId, rec.assigned_user_id]
      );
      if (usr) {
        assignee = usr.id;
        await conn.query('INSERT INTO work_order_users (work_order_id, company_id, user_id) VALUES (?, ?, ?)', [workOrderId, companyId, usr.id]);
      }
    }
    if (rec.created_by_user_id) {
      await conn.query(
        "INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta) VALUES (?, ?, ?, 'edited', NULL)",
        [workOrderId, companyId, rec.created_by_user_id]
      );
    }
    await conn.query(
      'UPDATE work_order_recurrence_runs SET work_order_id = ? WHERE recurrence_id = ? AND due_date = ? AND company_id = ?',
      [workOrderId, rec.id, dueDate, companyId]
    );
    await conn.commit();

    if (assignee) {
      try {
        await createNotification({
          userId: assignee,
          type: 'work_order',
          titleKey: 'notifications:workOrderAssigned.title',
          messageKey: 'notifications:workOrderAssigned.message',
          params: { id: workOrderId },
          link: `/dashboard/work-order-detail.html?id=${workOrderId}`
        });
      } catch (err) {
        console.error('Recurring work order notification failed:', err.message);
      }
    }
    return workOrderId;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    throw err;
  }
}

/**
 * Generates the due occurrences of every ACTIVE recurrence of the company. Never throws (returns the number created).
 * `now` is injectable for tests.
 */
async function ensureRecurringWorkOrders(companyId, now = new Date()) {
  let conn;
  try {
    if (!(await hasRecurrenceTables())) return 0;
    const today = todayYmd(now);
    const from = addDays(today, -CATCH_UP_DAYS);
    const to = addDays(today, LEAD_DAYS);

    const [recs] = await db.query(
      `SELECT r.company_id, ${RECURRENCE_COLUMNS} FROM work_order_recurrences r
       WHERE r.company_id = ? AND r.is_active = 1 AND r.start_date <= ? AND (r.end_date IS NULL OR r.end_date >= ?)`,
      [companyId, to, from]
    );
    const candidates = [];
    for (const rec of recs) {
      for (const date of occurrencesBetween(rec, from, to)) candidates.push({ rec, date });
    }
    if (!candidates.length) return 0;

    // Cheap pre-filter without the lock: occurrences already generated are skipped.
    const [done] = await db.query(
      `SELECT recurrence_id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date FROM work_order_recurrence_runs
       WHERE company_id = ? AND recurrence_id IN (${recs.map(() => '?').join(',')}) AND due_date >= ? AND due_date <= ?`,
      [companyId, ...recs.map((r) => r.id), from, to]
    );
    const doneSet = new Set(done.map((r) => `${r.recurrence_id}|${r.due_date}`));
    const todo = candidates.filter((c) => !doneSet.has(`${c.rec.id}|${c.date}`)).slice(0, MAX_PER_RUN);
    if (!todo.length) return 0;

    conn = await db.getConnection();
    const lockName = `wo_recurrence_${companyId}`;
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 10) AS got', [lockName]);
    if (!lock || Number(lock.got) !== 1) return 0;
    let created = 0;
    try {
      for (const { rec, date } of todo) {
        // re-check the template under the lock: it may have been paused/deleted meanwhile
        const [[fresh]] = await conn.query(
          `SELECT r.company_id, ${RECURRENCE_COLUMNS} FROM work_order_recurrences r WHERE r.id = ? AND r.company_id = ? AND r.is_active = 1`,
          [rec.id, companyId]
        );
        if (!fresh) continue;
        if (await createOccurrence(conn, fresh, date, today)) created += 1;
      }
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    }
    return created;
  } catch (err) {
    console.error('Recurring work order generation failed:', err.message);
    return 0;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  FREQUENCIES, LEAD_DAYS, CATCH_UP_DAYS, RECURRENCE_COLUMNS,
  parseYmd, todayYmd, addDays, occurrenceAt, occurrencesBetween, nextOccurrence,
  hasRecurrenceTables, ensureRecurringWorkOrders
};
