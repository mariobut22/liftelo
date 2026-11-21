// RMS deadlines: the monthly RMS of every location is due by the end of the calendar month.
// Everything here is DERIVED from rms_visits (effective date = COALESCE(rms_month, DATE(visit_date))); nothing is stored
// except the in-app reminder notification (table notifications, type 'rms_deadline', never an e-mail).
const db = require('../db');
const { isRmsExpected } = require('./rms-expectations');
const { effectiveDateSql } = require('./rmsOverviewSync');
const { normalizeLanguage } = require('./i18n/getResolvedLanguage');
const { translate } = require('./i18n/translate');

// Admins get the reminder when this many days (or fewer) are left in the month and locations are still missing.
const NOTIFY_DAYS_LEFT = 5;
const WARNING_DAYS_LEFT = 7;
const CRITICAL_DAYS_LEFT = 2; // last 3 days of the month: days_left 2, 1, 0
const NOTIFICATION_TYPE = 'rms_deadline';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (year, month, day = 1) => `${year}-${pad(month)}-${pad(day)}`;

/**
 * Deadline state of one company for the month of `today` (a Date, server time).
 * days_left = days_in_month - day_of_month (0 on the last day).
 * missing = expected this month, no RMS with an effective date in this month.
 * overdue = expected LAST month, no RMS in last month and none yet this month (a visit this month counts as made up),
 *   only for locations that already had an RMS before this month (a location added/started this month is not "overdue")
 *   and only if the company existed before this month began.
 * urgency: 'done' (nothing missing/overdue) | 'critical' (overdue or <= 3 days left) | 'warning' (<= 7 days left) | 'normal'.
 */
async function computeDeadlines(companyId, today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysLeft = daysInMonth - today.getDate();
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const curStart = ymd(year, month);
  const nextStart = month === 12 ? ymd(year + 1, 1) : ymd(year, month + 1);
  const prevStart = ymd(prevYear, prevMonth);

  const eff = effectiveDateSql('v');
  const [rows] = await db.query(
    `SELECT l.id, l.name, l.rms_frequency,
            MAX(CASE WHEN ${eff} >= ? AND ${eff} < ? THEN 1 ELSE 0 END) AS has_current,
            MAX(CASE WHEN ${eff} >= ? AND ${eff} < ? THEN 1 ELSE 0 END) AS has_previous,
            MAX(CASE WHEN ${eff} < ? THEN 1 ELSE 0 END) AS has_earlier
     FROM locations l
     LEFT JOIN rms_visits v ON v.location_id = l.id AND v.company_id = l.company_id
     WHERE l.company_id = ?
     GROUP BY l.id, l.name, l.rms_frequency
     ORDER BY l.name ASC, l.id ASC`,
    [curStart, nextStart, prevStart, curStart, curStart, companyId]
  );

  const [[company]] = await db.query('SELECT created_at FROM companies WHERE id = ? LIMIT 1', [companyId]);
  const companyExistedBefore = !company?.created_at || new Date(company.created_at) < new Date(year, month - 1, 1);

  let expected = 0;
  let done = 0;
  const missing = [];
  const overdue = [];
  rows.forEach((row) => {
    if (isRmsExpected(row, year, month)) {
      expected += 1;
      if (row.has_current) done += 1;
      else missing.push({ id: row.id, name: row.name });
    }
    if (companyExistedBefore && isRmsExpected(row, prevYear, prevMonth)
      && !row.has_previous && !row.has_current && row.has_earlier) {
      overdue.push({ id: row.id, name: row.name, year: prevYear, month: prevMonth });
    }
  });

  let urgency = 'normal';
  if (!missing.length && !overdue.length) urgency = 'done';
  else if (overdue.length || daysLeft <= CRITICAL_DAYS_LEFT) urgency = 'critical';
  else if (daysLeft <= WARNING_DAYS_LEFT) urgency = 'warning';

  return {
    year,
    month,
    days_in_month: daysInMonth,
    days_left: daysLeft,
    urgency,
    expected,
    done,
    missing_count: missing.length,
    overdue_count: overdue.length,
    missing_locations: missing,
    overdue_locations: overdue
  };
}

/**
 * Lazy, idempotent in-app reminder for the company admins: when <= NOTIFY_DAYS_LEFT days remain and locations are still
 * missing, every active admin gets ONE notification per month (type 'rms_deadline'; the link carries the month and is the
 * idempotency key: an existing row with the same user + type + link means "already sent"). A per-company MySQL named lock
 * serialises concurrent callers so two simultaneous requests cannot both insert. Never sends e-mail (plain INSERT, not
 * createNotification). Returns the number of notifications created. Called from GET /api/rms/deadlines; never throws.
 */
async function notifyAdminsIfDue(companyId, deadlines) {
  if (deadlines.days_left > NOTIFY_DAYS_LEFT || deadlines.missing_count === 0) return 0;
  const link = `/dashboard/rms-overview?deadline=${deadlines.year}-${pad(deadlines.month)}`;
  let conn;
  try {
    conn = await db.getConnection();
    const lockName = `rms_deadline_${companyId}`;
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 5) AS got', [lockName]);
    if (!lock || Number(lock.got) !== 1) return 0;
    try {
      const [admins] = await conn.query(
        `SELECT u.id, u.language, c.default_language
         FROM user_companies uc
         INNER JOIN users u ON u.id = uc.user_id
         INNER JOIN companies c ON c.id = uc.company_id
         WHERE uc.company_id = ? AND uc.role = 'admin' AND u.is_active = 1 AND u.disabled_at IS NULL`,
        [companyId]
      );
      if (!admins.length) return 0;
      const [existing] = await conn.query(
        `SELECT user_id FROM notifications WHERE type = ? AND link = ? AND user_id IN (${admins.map(() => '?').join(',')})`,
        [NOTIFICATION_TYPE, link, ...admins.map((a) => a.id)]
      );
      const already = new Set(existing.map((r) => r.user_id));
      const params = { days: deadlines.days_left, count: deadlines.missing_count };
      const values = admins.filter((a) => !already.has(a.id)).map((a) => {
        const lang = normalizeLanguage(a.language, normalizeLanguage(a.default_language));
        return [a.id, NOTIFICATION_TYPE, translate('notifications:rmsDeadline.title', lang, params),
          translate('notifications:rmsDeadline.message', lang, params), link];
      });
      if (!values.length) return 0;
      await conn.query('INSERT INTO notifications (user_id, type, title, message, link) VALUES ?', [values]);
      return values.length;
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    }
  } catch (err) {
    console.error('RMS deadline notification failed:', err.message);
    return 0;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { computeDeadlines, notifyAdminsIfDue, NOTIFY_DAYS_LEFT };
