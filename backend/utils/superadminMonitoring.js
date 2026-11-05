const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const db = require('../db');
const { getAccessState } = require('./subscriptions');

// Superadmin "nadzor" (phase 3): revenue, system health, audit log viewer, growth.
// Everything here is read-only, cross-tenant by design (only reachable from routes/superadmin.js behind requireSuperadmin),
// parameterized, and never returns secrets, tokens, Stripe ids, e-mail addresses of recipients/bodies or webhook payloads.

const DAY_MS = 24 * 60 * 60 * 1000;
const processStartedAt = new Date(Date.now() - process.uptime() * 1000);

const truncate = (value, max = 200) => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  // an error text can contain a recipient address or a key; drop e-mail-like and long token-like pieces
  const cleaned = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(sk|pk|rk|whsec|key)_[A-Za-z0-9_]{8,}/g, '[key]');
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
};

const toIso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// ---------------------------------------------------------------- revenue

// MRR rule (shown in the UI): status = active, workspace not locked, plan price > 0, and not a free period granted by a
// superadmin without Stripe. Trial, past_due, suspended, canceled never count. Prices are monthly (EUR cents).
const REVENUE_SQL = `
  SELECT cs.company_id,
         c.name AS company_name,
         cs.status,
         cs.trial_started_at,
         cs.trial_ends_at,
         cs.current_period_start,
         cs.updated_at,
         (cs.stripe_subscription_id IS NOT NULL) AS stripe_managed,
         sp.code AS plan_code,
         sp.name AS plan_name,
         sp.price_cents,
         (SELECT COUNT(*) FROM audit_logs al
           WHERE al.company_id = cs.company_id
             AND al.action = 'superadmin_grant_free_period'
             AND al.created_at >= DATE_SUB(cs.current_period_start, INTERVAL 5 MINUTE)) AS free_grants
  FROM company_subscriptions cs
  INNER JOIN companies c ON c.id = cs.company_id
  INNER JOIN subscription_plans sp ON sp.id = cs.plan_id`;

async function getRevenue() {
  const [rows] = await db.query(REVENUE_SQL);
  const [[companyCount]] = await db.query('SELECT COUNT(*) AS total FROM companies');
  const now = Date.now();
  const soon = now + 7 * DAY_MS;
  const monthAgo = now - 30 * DAY_MS;
  const cohortFrom = now - 90 * DAY_MS;

  const byPlan = new Map();
  const planEntry = (row) => {
    if (!byPlan.has(row.plan_code)) {
      byPlan.set(row.plan_code, {
        plan_code: row.plan_code,
        plan_name: row.plan_name,
        price_cents: row.price_cents === null ? null : Number(row.price_cents),
        total: 0, trial: 0, paying: 0, free_granted: 0, other: 0, mrr_cents: 0,
      });
    }
    return byPlan.get(row.plan_code);
  };

  const summary = {
    mrr_cents: 0, mrr_stripe_cents: 0, mrr_manual_cents: 0, paying_companies: 0, free_granted: 0,
    trial_active: 0, trial_expired: 0, past_due: 0, suspended: 0, canceled: 0, active_free_plan: 0,
  };
  const upcoming = [];
  let canceled30 = 0;
  let cohort = 0;
  let converted = 0;

  for (const row of rows) {
    const price = Number(row.price_cents || 0);
    const stripeManaged = Number(row.stripe_managed) === 1;
    const access = getAccessState({ status: row.status, trial_ends_at: row.trial_ends_at });
    const entry = planEntry(row);
    entry.total += 1;
    const freeGranted = row.status === 'active' && !stripeManaged && Number(row.free_grants) > 0;

    if (row.status === 'trial') {
      if (access.locked) { summary.trial_expired += 1; entry.other += 1; } else { summary.trial_active += 1; entry.trial += 1; }
      const ends = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
      if (!access.locked && ends !== null && ends <= soon) {
        upcoming.push({ company_id: row.company_id, company_name: row.company_name, plan_code: row.plan_code, trial_ends_at: toIso(row.trial_ends_at) });
      }
    } else if (row.status === 'active' && !access.locked) {
      if (freeGranted) { summary.free_granted += 1; entry.free_granted += 1; }
      else if (price > 0) {
        summary.mrr_cents += price;
        if (stripeManaged) summary.mrr_stripe_cents += price; else summary.mrr_manual_cents += price;
        summary.paying_companies += 1;
        entry.paying += 1;
        entry.mrr_cents += price;
      } else { summary.active_free_plan += 1; entry.other += 1; }
    } else {
      if (row.status === 'past_due') summary.past_due += 1;
      if (row.status === 'suspended') summary.suspended += 1;
      if (row.status === 'canceled') {
        summary.canceled += 1;
        if (row.updated_at && new Date(row.updated_at).getTime() >= monthAgo) canceled30 += 1;
      }
      entry.other += 1;
    }

    // conversion cohort: trial started and ended in the last 90 days; "converted" = now actively paying (current state)
    const trialEnd = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
    if (row.trial_started_at && trialEnd !== null && trialEnd <= now && trialEnd >= cohortFrom) {
      cohort += 1;
      if (row.status === 'active' && !access.locked && price > 0 && !freeGranted) converted += 1;
    }
  }

  upcoming.sort((a, b) => String(a.trial_ends_at).localeCompare(String(b.trial_ends_at)));
  return {
    currency: 'EUR',
    summary: {
      ...summary,
      arr_cents: summary.mrr_cents * 12,
      companies_total: Number(companyCount.total),
      without_subscription: Math.max(0, Number(companyCount.total) - rows.length),
    },
    by_plan: [...byPlan.values()].sort((a, b) => (b.mrr_cents - a.mrr_cents) || (b.total - a.total) || a.plan_code.localeCompare(b.plan_code)),
    upcoming_trials: upcoming.slice(0, 50),
    churn: {
      // company_subscriptions has no cancellation date: updated_at of a canceled row is the best available proxy
      // (it is also bumped by later edits of that row). Cancel events by Stripe are in billing_events, not per company.
      canceled_last_30_days: canceled30,
      canceled_total: summary.canceled,
      basis: 'subscription_updated_at',
    },
    conversion: {
      // derived from the current subscription state only: there is no billing/payment history per company
      cohort_trials_ended_90d: cohort,
      converted_to_paid: converted,
      rate: cohort > 0 ? Math.round((converted / cohort) * 1000) / 10 : null,
      basis: 'current_state',
    },
  };
}

// ---------------------------------------------------------------- health

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const WALK_MAX_ENTRIES = 50000;
const WALK_MAX_MS = 2000;
const WALK_MAX_DEPTH = 6;

// Bounded, symlink-safe walk: stops after WALK_MAX_ENTRIES entries or WALK_MAX_MS ms and reports `truncated`.
async function measureUploads(root = UPLOADS_DIR) {
  const started = Date.now();
  let files = 0;
  let bytes = 0;
  let seen = 0;
  let truncated = false;
  const stack = [{ dir: root, depth: 0 }];
  try {
    while (stack.length && !truncated) {
      const { dir, depth } = stack.pop();
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (_err) {
        continue;
      }
      for (const entry of entries) {
        seen += 1;
        if (seen > WALK_MAX_ENTRIES || Date.now() - started > WALK_MAX_MS) { truncated = true; break; }
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth < WALK_MAX_DEPTH) stack.push({ dir: full, depth: depth + 1 });
          else truncated = true;
        } else if (entry.isFile()) {
          try {
            const stat = await fs.promises.stat(full);
            files += 1;
            bytes += stat.size;
          } catch (_err) { /* file vanished */ }
        }
      }
    }
  } catch (_err) {
    return { available: false, files: 0, bytes: 0, truncated: false };
  }
  return { available: true, files, bytes, truncated };
}

let cachedCommit;
function readCommit() {
  if (cachedCommit !== undefined) return Promise.resolve(cachedCommit);
  const fromEnv = process.env.GIT_COMMIT || process.env.APP_COMMIT;
  if (fromEnv && /^[0-9a-f]{7,40}$/i.test(fromEnv)) {
    cachedCommit = fromEnv.slice(0, 12);
    return Promise.resolve(cachedCommit);
  }
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: __dirname, timeout: 1500, windowsHide: true }, (err, stdout) => {
      const out = err ? '' : String(stdout).trim();
      cachedCommit = /^[0-9a-f]{7,40}$/i.test(out) ? out : null;
      resolve(cachedCommit);
    });
  });
}

const readVersion = () => {
  try {
    // eslint-disable-next-line global-require
    return require('../package.json').version || null;
  } catch (_err) {
    return null;
  }
};

async function hasColumn(table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function getHealth() {
  const result = { generated_at: new Date().toISOString() };

  // database ping
  const pingStart = Date.now();
  try {
    await db.query('SELECT 1');
    result.database = { ok: true, ping_ms: Date.now() - pingStart };
  } catch (_err) {
    result.database = { ok: false, ping_ms: null };
  }

  // outbox (counts + last failures without recipient, subject or body)
  try {
    const [counts] = await db.query(
      `SELECT status, COUNT(*) AS total,
              SUM(created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS last_24h,
              MIN(created_at) AS oldest
       FROM email_outbox GROUP BY status`
    );
    const out = { pending: 0, sending: 0, sent: 0, failed: 0, sent_last_24h: 0, failed_last_24h: 0, pending_last_24h: 0, oldest_pending_at: null };
    for (const row of counts) {
      if (!(row.status in out)) continue;
      out[row.status] = Number(row.total);
      if (row.status === 'sent') out.sent_last_24h = Number(row.last_24h || 0);
      if (row.status === 'failed') out.failed_last_24h = Number(row.last_24h || 0);
      if (row.status === 'pending') { out.pending_last_24h = Number(row.last_24h || 0); out.oldest_pending_at = toIso(row.oldest); }
    }
    const withError = await hasColumn('email_outbox', 'last_error');
    const [failed] = await db.query(
      `SELECT id, type, company_id, attempts, created_at, ${withError ? 'last_error' : 'NULL AS last_error'}
       FROM email_outbox WHERE status = 'failed' ORDER BY created_at DESC, id DESC LIMIT 10`
    );
    result.outbox = {
      available: true,
      ...out,
      last_failed: failed.map((row) => ({
        id: Number(row.id), type: row.type || null, company_id: row.company_id === null ? null : Number(row.company_id),
        attempts: Number(row.attempts || 0), created_at: toIso(row.created_at), error: truncate(row.last_error),
      })),
    };
  } catch (_err) {
    result.outbox = { available: false };
  }

  // Stripe webhook events (payload_json is never selected)
  try {
    const [counts] = await db.query(
      `SELECT status, COUNT(*) AS total FROM billing_events
       WHERE processed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY status`
    );
    const [[last]] = await db.query('SELECT MAX(processed_at) AS last_at FROM billing_events');
    const [failed] = await db.query(
      `SELECT id, provider, event_type, processed_at, error_message FROM billing_events
       WHERE status = 'failed' ORDER BY processed_at DESC, id DESC LIMIT 10`
    );
    const byStatus = { processed: 0, ignored: 0, failed: 0 };
    for (const row of counts) if (row.status in byStatus) byStatus[row.status] = Number(row.total);
    result.billing = {
      available: true,
      last_event_at: toIso(last.last_at),
      last_7_days: byStatus,
      last_failed: failed.map((row) => ({
        id: Number(row.id), provider: row.provider, event_type: truncate(row.event_type, 80),
        processed_at: toIso(row.processed_at), error: truncate(row.error_message),
      })),
    };
  } catch (_err) {
    result.billing = { available: false };
  }

  result.uploads = await measureUploads();
  result.app = {
    version: readVersion(),
    commit: await readCommit(),
    node: process.version,
    env: process.env.NODE_ENV || null,
    uptime_seconds: Math.round(process.uptime()),
    started_at: processStartedAt.toISOString(),
  };
  return result;
}

// ---------------------------------------------------------------- audit log viewer

const AUDIT_DEFAULT_LIMIT = 25;
const AUDIT_MAX_LIMIT = 100;
const AUDIT_MAX_OFFSET = 100000;
const SENSITIVE_KEY = /pass|token|secret|hash|authorization|cookie|api[-_]?key|private|credential|otp|session|signature/i;
const META_MAX_STRING = 300;
const META_MAX_KEYS = 40;
const META_MAX_DEPTH = 4;

// Metadata is shown to the superadmin, but any value under a sensitive-looking key is replaced, long text is cut, size is bounded.
function sanitizeMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.length > META_MAX_STRING ? `${value.slice(0, META_MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= META_MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.slice(0, META_MAX_KEYS).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).slice(0, META_MAX_KEYS)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeMetadata(value[key], depth + 1);
    }
    return out;
  }
  return null;
}

const parseMetadata = (raw) => {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sanitizeMetadata(parsed);
  } catch (_err) {
    return null;
  }
};

const positiveInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : undefined;
};

const parseDay = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? undefined : value;
};

// Returns { error } for invalid input (caller answers 400 invalid_request) or { rows, limit, offset, has_more, actions }.
async function getAuditLog(query = {}) {
  const companyId = positiveInt(query.company_id);
  const userId = positiveInt(query.user_id);
  const from = parseDay(query.from);
  const to = parseDay(query.to);
  const action = query.action === undefined || query.action === '' ? null : String(query.action);
  const scope = query.scope === 'superadmin' ? 'superadmin' : 'all';
  let limit = query.limit === undefined || query.limit === '' ? AUDIT_DEFAULT_LIMIT : Number(query.limit);
  let offset = query.offset === undefined || query.offset === '' ? 0 : Number(query.offset);
  if (companyId === undefined || userId === undefined || from === undefined || to === undefined
      || (action !== null && !/^[A-Za-z0-9_.:-]{1,100}$/.test(action))
      || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) {
    return { error: 'Invalid audit filter' };
  }
  limit = Math.min(limit, AUDIT_MAX_LIMIT);
  offset = Math.min(offset, AUDIT_MAX_OFFSET);

  const where = [];
  const params = [];
  if (companyId !== null) { where.push('al.company_id = ?'); params.push(companyId); }
  if (userId !== null) { where.push('al.user_id = ?'); params.push(userId); }
  if (action !== null) { where.push('al.action = ?'); params.push(action); }
  if (scope === 'superadmin') where.push("al.action LIKE 'superadmin\\_%'");
  if (from !== null) { where.push('al.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (to !== null) { where.push('al.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${to} 00:00:00`); }

  const [rows] = await db.query(
    `SELECT al.id, al.created_at, al.action, al.user_id, u.email AS user_email,
            al.company_id, c.name AS company_name, al.metadata
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     LEFT JOIN companies c ON c.id = al.company_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit + 1, offset]
  );
  const result = {
    limit,
    offset,
    has_more: rows.length > limit,
    rows: rows.slice(0, limit).map((row) => ({
      id: Number(row.id),
      created_at: toIso(row.created_at),
      action: row.action,
      user_id: row.user_id === null ? null : Number(row.user_id),
      user_email: row.user_email || null,
      company_id: row.company_id === null ? null : Number(row.company_id),
      company_name: row.company_name || null,
      metadata: parseMetadata(row.metadata),
    })),
  };
  if (offset === 0) {
    const [actions] = await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action LIMIT 200');
    result.actions = actions.map((row) => row.action);
  }
  return result;
}

// ---------------------------------------------------------------- growth

const GROWTH_WEEKS = 12;
const WEEK_START_SQL = (column) => `DATE_FORMAT(DATE_SUB(DATE(${column}), INTERVAL WEEKDAY(${column}) DAY), '%Y-%m-%d')`;
const SERIES_FROM_SQL = 'DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + ? * 7) DAY)';

// Per ISO week (Monday start) for the last 12 weeks: new companies, new users, active companies. "Active" = a company
// with at least one audit_logs row that week (logins, switches, invitations ...), superadmin_* actions excluded
// because they are done TO a company, not by it.
async function getGrowth() {
  const span = GROWTH_WEEKS - 1;
  const [companies] = await db.query(
    `SELECT ${WEEK_START_SQL('created_at')} AS week, COUNT(*) AS total FROM companies
     WHERE created_at >= ${SERIES_FROM_SQL} GROUP BY week`, [span]);
  const [users] = await db.query(
    `SELECT ${WEEK_START_SQL('created_at')} AS week, COUNT(*) AS total FROM users
     WHERE created_at >= ${SERIES_FROM_SQL} AND COALESCE(global_role, 'user') <> 'superadmin' GROUP BY week`, [span]);
  const [active] = await db.query(
    `SELECT ${WEEK_START_SQL('created_at')} AS week, COUNT(DISTINCT company_id) AS total FROM audit_logs
     WHERE created_at >= ${SERIES_FROM_SQL} AND company_id IS NOT NULL AND action NOT LIKE 'superadmin\\_%' GROUP BY week`, [span]);
  const [[start]] = await db.query(`SELECT DATE_FORMAT(${SERIES_FROM_SQL}, '%Y-%m-%d') AS d`, [span]);

  const index = (list) => new Map(list.map((row) => [row.week, Number(row.total)]));
  const c = index(companies);
  const u = index(users);
  const a = index(active);
  const weeks = [];
  const cursor = new Date(`${start.d}T00:00:00Z`);
  for (let i = 0; i < GROWTH_WEEKS; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    weeks.push({ week_start: key, new_companies: c.get(key) || 0, new_users: u.get(key) || 0, active_companies: a.get(key) || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return {
    weeks,
    totals: {
      new_companies: weeks.reduce((s, w) => s + w.new_companies, 0),
      new_users: weeks.reduce((s, w) => s + w.new_users, 0),
    },
  };
}

module.exports = { getRevenue, getHealth, getAuditLog, getGrowth, sanitizeMetadata, measureUploads, truncate };
