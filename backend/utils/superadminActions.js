const bcrypt = require('bcrypt');
const db = require('../db');
const { logAudit } = require('./auditLog');
const { ensureCompanySubscription, checkRoleCapacity, roleLimitErrorBody } = require('./subscriptions');
const { COMPANY_OVERVIEW_ONE_SQL, mapCompanyOverviewRow, toIso } = require('./superadminOverview');
const { CLOSURE_RETENTION_DAYS, CLOSURE_MIN_RETENTION_DAYS, CLOSURE_MAX_RETENTION_DAYS } = require('./closure');

// Audited, cross-tenant superadmin actions (route layer: routes/superadmin.js, guarded by requireSuperadmin).
// Every action: reason (>= 5 chars) + the superadmin's own current password (re-authentication), a transaction that
// changes the data AND writes the audit_logs row `superadmin_<name>` {reason, before, after, ...} (never the password).
// Stripe-managed companies (stripe_subscription_id set) are refused for plan/trial/grant/suspend/cancel (Stripe webhooks
// would overwrite them). Nothing here can create or promote a superadmin; a superadmin cannot target themselves.

const MIN_REASON = 5;
const MAX_REASON = 500;
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const COMPANY_ROLES = ['admin', 'technician', 'viewer'];
const DAY_MS = 86_400_000;

class ActionError extends Error {
  constructor(status, error, code, extra = {}) {
    super(error);
    this.status = status;
    this.body = { error, code, ...extra };
  }
}

// ---- password re-authentication with an in-memory rate limit (per superadmin user id) ----
const failedAttempts = new Map();

const recentFailures = (userId, now) => {
  const list = (failedAttempts.get(userId) || []).filter((ts) => now - ts < ATTEMPT_WINDOW_MS);
  if (list.length) failedAttempts.set(userId, list);
  else failedAttempts.delete(userId);
  return list;
};

const resetRateLimit = () => failedAttempts.clear();

const verifyActorPassword = async (req, actorId, password, { action, companyId }) => {
  const now = Date.now();
  const ip = req.ip || null;
  const failures = recentFailures(actorId, now);

  if (failures.length >= MAX_FAILED_ATTEMPTS) {
    await logAudit({
      userId: actorId,
      companyId,
      action: 'superadmin_auth_blocked',
      metadata: { attempted_action: action, ip },
    });
    throw new ActionError(429, 'Too many failed password attempts, try again later', 'too_many_attempts');
  }

  const [[row]] = await db.query(
    'SELECT password_hash, global_role, is_active, disabled_at FROM users WHERE id = ? LIMIT 1',
    [actorId]
  );
  if (!row || row.global_role !== 'superadmin' || row.is_active === 0 || row.disabled_at) {
    throw new ActionError(403, 'Forbidden', 'forbidden');
  }

  const valid = row.password_hash ? await bcrypt.compare(password, row.password_hash) : false;
  if (!valid) {
    failures.push(now);
    failedAttempts.set(actorId, failures);
    await logAudit({
      userId: actorId,
      companyId,
      action: 'superadmin_auth_failed',
      metadata: { attempted_action: action, ip, failed_in_window: failures.length },
    });
    throw new ActionError(403, 'Invalid password', 'invalid_password');
  }
  failedAttempts.delete(actorId);
};

// ---- input helpers ----
const parseId = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)) return Number(value);
  return null;
};

const parseIntInRange = (value, min, max) => {
  const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
};

// 'YYYY-MM-DD' (end of that day, server time) or a full ISO date-time; must lie in the future, at most 5 years ahead
const parseFutureDate = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T23:59:59`) : new Date(text);
  const time = date.getTime();
  const now = Date.now();
  if (Number.isNaN(time) || time <= now || time > now + 5 * 366 * DAY_MS) return null;
  return date;
};

const invalid = (what) => new ActionError(400, `Invalid ${what}`, 'invalid_request');

const subscriptionSnapshot = (row) => (row
  ? {
      plan_code: row.plan_code,
      status: row.status,
      trial_ends_at: toIso(row.trial_ends_at),
      current_period_start: toIso(row.current_period_start),
      current_period_end: toIso(row.current_period_end),
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      admin_limit_override: row.admin_limit_override ?? null,
      technician_limit_override: row.technician_limit_override ?? null,
    }
  : null);

// locks the subscription row (FOR UPDATE) inside the transaction
const SUBSCRIPTION_SELECT = `
  SELECT cs.id, cs.company_id, cs.plan_id, cs.status, cs.trial_ends_at, cs.current_period_start, cs.current_period_end,
         cs.cancel_at_period_end, cs.admin_limit_override, cs.technician_limit_override, cs.stripe_subscription_id,
         sp.code AS plan_code
  FROM company_subscriptions cs
  INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = ?`;

const lockSubscription = async (conn, companyId) => {
  const [[row]] = await conn.query(`${SUBSCRIPTION_SELECT} LIMIT 1 FOR UPDATE`, [companyId]);
  return row || null;
};

const readSubscription = async (conn, companyId) => {
  const [[row]] = await conn.query(`${SUBSCRIPTION_SELECT} LIMIT 1`, [companyId]);
  return row || null;
};

const refuseIfStripeManaged = (sub) => {
  if (sub.stripe_subscription_id) {
    throw new ActionError(409, 'Company is managed by Stripe, change it in the Stripe portal', 'stripe_managed');
  }
};

const findActivePlan = async (conn, planCode) => {
  if (typeof planCode !== 'string' || !/^[a-z0-9_-]{1,50}$/i.test(planCode)) throw invalid('plan_code');
  const [[plan]] = await conn.query(
    'SELECT id, code, trial_days FROM subscription_plans WHERE code = ? AND is_active = 1 LIMIT 1',
    [planCode]
  );
  if (!plan) throw new ActionError(404, 'Plan not found', 'plan_not_found');
  return plan;
};

// ---- subscription actions: (ctx) -> { before, after, extra } ; sub = locked row ----
// ctx: { conn, companyId, body, actorId }

const applyUpdate = async (conn, subId, sets, params) => {
  await conn.query(
    `UPDATE company_subscriptions SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ? LIMIT 1`,
    [...params, subId]
  );
};

const actions = {};

actions.change_plan = {
  needsSubscription: true,
  async perform({ conn, companyId, body, sub }) {
    refuseIfStripeManaged(sub);
    const plan = await findActivePlan(conn, body.plan_code);

    let newStatus = sub.status;
    if (body.status !== undefined && body.status !== null) {
      if (!['active', 'trial'].includes(body.status)) throw new ActionError(400, 'Invalid status', 'invalid_status');
      newStatus = body.status;
    }
    const trialEnd = body.trial_ends_at === undefined || body.trial_ends_at === null ? null : parseFutureDate(body.trial_ends_at);
    const periodEnd = body.period_end === undefined || body.period_end === null ? null : parseFutureDate(body.period_end);
    if (body.trial_ends_at != null && (!trialEnd || newStatus !== 'trial')) throw new ActionError(400, 'Invalid trial end', 'invalid_date');
    if (body.period_end != null && (!periodEnd || newStatus !== 'active')) throw new ActionError(400, 'Invalid period end', 'invalid_date');

    const sets = ['plan_id = ?'];
    const params = [plan.id];
    const statusChanges = newStatus !== sub.status;
    if (statusChanges) {
      sets.push('status = ?');
      params.push(newStatus);
    }

    if (newStatus === 'trial') {
      if (trialEnd) {
        sets.push('trial_ends_at = ?', 'current_period_end = ?');
        params.push(trialEnd, trialEnd);
      } else if (statusChanges || !sub.trial_ends_at) {
        const days = Number(plan.trial_days) > 0 ? Number(plan.trial_days) : 14;
        const end = new Date(Date.now() + days * DAY_MS);
        sets.push('trial_ends_at = ?', 'current_period_end = ?');
        params.push(end, end);
      }
      if (statusChanges) sets.push('current_period_start = NOW()');
    } else if (newStatus === 'active') {
      if (statusChanges) {
        sets.push('cancel_at_period_end = 0', 'current_period_start = NOW()');
      }
      if (periodEnd) {
        sets.push('current_period_end = ?');
        params.push(periodEnd);
      } else if (statusChanges || !sub.current_period_end) {
        sets.push('current_period_end = DATE_ADD(NOW(), INTERVAL 1 MONTH)');
      }
    }

    await applyUpdate(conn, sub.id, sets, params);
    return {};
  },
};

actions.trial = {
  needsSubscription: true,
  async perform({ conn, body, sub }) {
    refuseIfStripeManaged(sub);
    if (sub.status !== 'trial') {
      throw new ActionError(409, 'Company is not on a trial', 'invalid_subscription_state');
    }
    const hasDays = body.days !== undefined && body.days !== null;
    const hasDate = body.trial_ends_at !== undefined && body.trial_ends_at !== null;
    if (hasDays === hasDate) throw invalid('trial change (send either days or trial_ends_at)');

    let newEnd;
    if (hasDays) {
      const days = parseIntInRange(body.days, 1, 90);
      if (days === null) throw new ActionError(400, 'days must be an integer from 1 to 90', 'invalid_request');
      const existing = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
      newEnd = new Date(Math.max(Date.now(), existing) + days * DAY_MS);
    } else {
      newEnd = parseFutureDate(body.trial_ends_at);
      if (!newEnd) throw new ActionError(400, 'Invalid trial end', 'invalid_date');
    }
    await applyUpdate(conn, sub.id, ['trial_ends_at = ?', 'current_period_end = ?'], [newEnd, newEnd]);
    return {};
  },
};

actions.grant_free_period = {
  needsSubscription: true,
  async perform({ conn, body, sub }) {
    refuseIfStripeManaged(sub);
    const months = parseIntInRange(body.months, 1, 12);
    if (months === null) throw new ActionError(400, 'months must be an integer from 1 to 12', 'invalid_request');
    const sets = [
      "status = 'active'",
      'cancel_at_period_end = 0',
      'current_period_start = NOW()',
      'current_period_end = DATE_ADD(NOW(), INTERVAL ? MONTH)',
    ];
    const params = [months];
    if (body.plan_code !== undefined && body.plan_code !== null) {
      const plan = await findActivePlan(conn, body.plan_code);
      sets.unshift('plan_id = ?');
      params.unshift(plan.id);
    }
    await applyUpdate(conn, sub.id, sets, params);
    return { extra: { months } };
  },
};

actions.suspend = {
  needsSubscription: true,
  async perform({ conn, sub }) {
    refuseIfStripeManaged(sub);
    if (sub.status === 'suspended') throw new ActionError(409, 'Company is already suspended', 'invalid_subscription_state');
    await applyUpdate(conn, sub.id, ["status = 'suspended'"], []);
    return {};
  },
};

actions.unsuspend = {
  needsSubscription: true,
  async perform({ conn, companyId, sub }) {
    refuseIfStripeManaged(sub);
    if (sub.status !== 'suspended') throw new ActionError(409, 'Company is not suspended', 'invalid_subscription_state');
    // restore the status from before the last superadmin suspension (trial|active), else active
    const [[last]] = await conn.query(
      `SELECT metadata FROM audit_logs
       WHERE company_id = ? AND action = 'superadmin_suspend'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [companyId]
    );
    let restored = 'active';
    if (last?.metadata) {
      try {
        const meta = typeof last.metadata === 'string' ? JSON.parse(last.metadata) : last.metadata;
        if (['trial', 'active'].includes(meta?.before?.status)) restored = meta.before.status;
      } catch (_err) {
        restored = 'active';
      }
    }
    await applyUpdate(conn, sub.id, ['status = ?'], [restored]);
    return { extra: { restored_status: restored } };
  },
};

actions.cancel = {
  needsSubscription: true,
  async perform({ conn, sub }) {
    refuseIfStripeManaged(sub);
    if (sub.status === 'canceled') throw new ActionError(409, 'Company is already canceled', 'invalid_subscription_state');
    await applyUpdate(conn, sub.id, ["status = 'canceled'"], []);
    return {};
  },
};

// ---- company closure (request / cancel). Deletes NOTHING: it cancels the subscription (workspace read-only, export still works),
// records closure_requested_at + closure_purge_after and remembers the status before. The permanent deletion is the manual script
// backend/scripts/purge-company.js (dry-run by default; refuses before closure_purge_after).
const RESTORABLE_STATUSES = ['trial', 'active', 'past_due', 'suspended'];

actions.request_closure = {
  needsSubscription: true,
  async perform({ conn, companyId, body, sub }) {
    refuseIfStripeManaged(sub);
    const days = body.retention_days === undefined || body.retention_days === null
      ? CLOSURE_RETENTION_DAYS
      : parseIntInRange(body.retention_days, CLOSURE_MIN_RETENTION_DAYS, CLOSURE_MAX_RETENTION_DAYS);
    if (days === null) {
      throw new ActionError(400, `retention_days must be an integer from ${CLOSURE_MIN_RETENTION_DAYS} to ${CLOSURE_MAX_RETENTION_DAYS}`, 'invalid_request');
    }
    const [[company]] = await conn.query('SELECT closure_requested_at FROM companies WHERE id = ? LIMIT 1 FOR UPDATE', [companyId]);
    if (!company) throw new ActionError(404, 'Company not found', 'company_not_found');
    if (company.closure_requested_at) throw new ActionError(409, 'Closure was already requested', 'closure_already_requested');

    await conn.query(
      `UPDATE companies
       SET closure_requested_at = NOW(), closure_purge_after = DATE_ADD(NOW(), INTERVAL ? DAY), closure_status_before = ?
       WHERE id = ? LIMIT 1`,
      [days, sub.status, companyId]
    );
    await applyUpdate(conn, sub.id, ["status = 'canceled'"], []);
    const [[after]] = await conn.query('SELECT closure_requested_at, closure_purge_after FROM companies WHERE id = ? LIMIT 1', [companyId]);
    return { extra: { retention_days: days, status_before: sub.status, closure_purge_after: toIso(after.closure_purge_after) } };
  },
};

actions.cancel_closure = {
  needsSubscription: true,
  async perform({ conn, companyId, sub }) {
    const [[company]] = await conn.query(
      'SELECT closure_requested_at, closure_status_before FROM companies WHERE id = ? LIMIT 1 FOR UPDATE',
      [companyId]
    );
    if (!company) throw new ActionError(404, 'Company not found', 'company_not_found');
    if (!company.closure_requested_at) throw new ActionError(409, 'No closure was requested', 'closure_not_requested');

    await conn.query(
      'UPDATE companies SET closure_requested_at = NULL, closure_purge_after = NULL, closure_status_before = NULL WHERE id = ? LIMIT 1',
      [companyId]
    );
    // restore the subscription only if it is still the canceled state set by the closure request (a superadmin may have changed it since)
    let restored = sub.status;
    if (sub.status === 'canceled') {
      restored = RESTORABLE_STATUSES.includes(company.closure_status_before) ? company.closure_status_before : 'suspended';
      await applyUpdate(conn, sub.id, ['status = ?'], [restored]);
    }
    return { extra: { restored_status: restored } };
  },
};

const LIMIT_FIELDS = ['admin_limit_override', 'technician_limit_override'];

actions.limits = {
  needsSubscription: true,
  async perform({ conn, body, sub }) {
    const sets = [];
    const params = [];
    for (const field of LIMIT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const raw = body[field];
      if (raw === null) {
        sets.push(`${field} = NULL`);
      } else {
        const value = parseIntInRange(raw, 0, 1000);
        if (value === null) throw new ActionError(400, `${field} must be null or an integer from 0 to 1000`, 'invalid_request');
        sets.push(`${field} = ?`);
        params.push(value);
      }
    }
    if (!sets.length) throw invalid('limits (send admin_limit_override and/or technician_limit_override)');
    await applyUpdate(conn, sub.id, sets, params);
    return {};
  },
};

// ---- user actions inside a company ----
const loadMember = async (conn, companyId, targetUserId, actorId) => {
  const userId = parseId(targetUserId);
  if (!userId) throw invalid('user id');
  if (userId === actorId) throw new ActionError(400, 'Superadmin cannot target their own account', 'cannot_target_self');
  const [[row]] = await conn.query(
    `SELECT u.id, u.email, u.is_active, u.disabled_at, u.global_role, uc.role
     FROM user_companies uc
     INNER JOIN users u ON u.id = uc.user_id
     WHERE uc.company_id = ? AND uc.user_id = ?
     LIMIT 1
     FOR UPDATE`,
    [companyId, userId]
  );
  if (!row) throw new ActionError(404, 'User not found in company', 'user_not_found');
  if (row.global_role === 'superadmin') {
    throw new ActionError(403, 'Superadmin accounts cannot be changed here', 'cannot_target_superadmin');
  }
  return row;
};

const memberSnapshot = (row) => ({
  role: row.role,
  is_active: row.is_active === 1 || row.is_active === true,
  disabled: Boolean(row.disabled_at),
});

const otherCompanies = async (conn, userId, companyId) => {
  const [[row]] = await conn.query(
    'SELECT COUNT(*) AS cnt FROM user_companies WHERE user_id = ? AND company_id <> ?',
    [userId, companyId]
  );
  return Number(row?.cnt || 0);
};

actions.user_disable = {
  user: true,
  async perform({ conn, companyId, member }) {
    if (!member.is_active || member.disabled_at) {
      throw new ActionError(409, 'User is already disabled', 'invalid_user_state');
    }
    // same two flags the login/session checks read (users.is_active and users.disabled_at)
    await conn.query('UPDATE users SET is_active = 0, disabled_at = NOW() WHERE id = ? LIMIT 1', [member.id]);
    const [[after]] = await conn.query('SELECT is_active, disabled_at FROM users WHERE id = ? LIMIT 1', [member.id]);
    return {
      before: memberSnapshot(member),
      after: memberSnapshot({ ...member, ...after }),
      extra: { other_companies: await otherCompanies(conn, member.id, companyId) },
    };
  },
};

actions.user_enable = {
  user: true,
  async perform({ conn, companyId, member }) {
    if (member.is_active && !member.disabled_at) {
      throw new ActionError(409, 'User is already active', 'invalid_user_state');
    }
    await conn.query('UPDATE users SET is_active = 1, disabled_at = NULL WHERE id = ? LIMIT 1', [member.id]);
    return {
      before: memberSnapshot(member),
      after: memberSnapshot({ ...member, is_active: 1, disabled_at: null }),
      extra: { other_companies: await otherCompanies(conn, member.id, companyId) },
    };
  },
};

actions.user_remove = {
  user: true,
  async perform({ conn, companyId, member }) {
    // only the membership of this company; the user account itself is never deleted
    await conn.query('DELETE FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1', [member.id, companyId]);
    return { before: memberSnapshot(member), after: { member: false } };
  },
};

actions.user_role = {
  user: true,
  async perform({ conn, companyId, body, member }) {
    if (!COMPANY_ROLES.includes(body.role)) throw new ActionError(400, 'Invalid role', 'invalid_role');
    if (body.role === member.role) throw new ActionError(409, 'User already has this role', 'invalid_user_state');
    if (member.is_active && !member.disabled_at) {
      // inactive members are not counted against plan limits, so only active ones need capacity in the new role
      const capacity = await checkRoleCapacity(companyId, body.role);
      if (!capacity.allowed) throw new ActionError(409, roleLimitErrorBody(capacity).error, 'role_limit_reached', {
        role: capacity.role,
        limit: capacity.limit,
        used: capacity.used,
        pending_invites: capacity.reserved,
      });
    }
    await conn.query('UPDATE user_companies SET role = ? WHERE user_id = ? AND company_id = ? LIMIT 1', [body.role, member.id, companyId]);
    return { before: { role: member.role }, after: { role: body.role } };
  },
};

// ---- runner ----
const runAction = (name, key = name) => async (req, res) => {
  const def = actions[key];
  let conn = null;
  try {
    const actorId = parseId(req.session?.user_id);
    if (!actorId) throw new ActionError(401, 'Not authenticated', 'not_authenticated');
    const companyId = parseId(req.params?.id);
    if (!companyId) throw invalid('company id');
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
      throw new ActionError(400, `reason must be ${MIN_REASON}-${MAX_REASON} characters`, 'reason_required');
    }
    if (typeof body.password !== 'string' || !body.password) {
      throw new ActionError(400, 'Password is required', 'password_required');
    }

    await verifyActorPassword(req, actorId, body.password, { action: name, companyId });

    const [[company]] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [companyId]);
    if (!company) throw new ActionError(404, 'Company not found', 'company_not_found');

    if (def.needsSubscription) await ensureCompanySubscription(companyId);

    conn = await db.getConnection();
    await conn.beginTransaction();

    const ctx = { conn, companyId, body, actorId };
    let before = null;
    let sub = null;
    let member = null;
    if (def.needsSubscription) {
      sub = await lockSubscription(conn, companyId);
      if (!sub) throw new ActionError(404, 'Company not found', 'company_not_found');
      before = subscriptionSnapshot(sub);
      ctx.sub = sub;
    }
    if (def.user) {
      member = await loadMember(conn, companyId, req.params?.userId, actorId);
      ctx.member = member;
    }

    const result = (await def.perform(ctx)) || {};
    let after = result.after;
    if (def.needsSubscription) after = subscriptionSnapshot(await readSubscription(conn, companyId));

    await logAudit({
      userId: actorId,
      companyId,
      action: `superadmin_${name}`,
      metadata: {
        reason,
        before: result.before !== undefined ? result.before : before,
        after,
        ...(member ? { target_user_id: member.id, target_email: member.email } : {}),
        ...(result.extra || {}),
      },
      connection: conn,
      throwOnError: true,
    });

    await conn.commit();
    return res.json({ success: true, action: name, before: result.before !== undefined ? result.before : before, after });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('Superadmin action rollback failed:', rollbackErr);
      }
    }
    if (err instanceof ActionError) return res.status(err.status).json(err.body);
    console.error(`[SUPERADMIN ACTION ${name}]`, err);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
};

const handlers = {
  changePlan: runAction('change_plan'),
  trial: runAction('trial'),
  grantFreePeriod: runAction('grant_free_period'),
  suspend: runAction('suspend'),
  unsuspend: runAction('unsuspend'),
  cancel: runAction('cancel'),
  limits: runAction('limits'),
  requestClosure: runAction('request_closure'),
  cancelClosure: runAction('cancel_closure'),
  userDisable: runAction('user_disable'),
  userEnable: runAction('user_enable'),
  userRemove: runAction('user_remove'),
  userRole: runAction('user_role'),
};

// ---- company detail ----
const AUDIT_META_KEYS = ['reason', 'before', 'after', 'target_user_id', 'target_email', 'months', 'restored_status', 'other_companies', 'attempted_action', 'retention_days', 'status_before', 'closure_purge_after'];

const safeAuditMetadata = (action, metadata) => {
  if (!String(action).startsWith('superadmin_') || !metadata) return null;
  let meta = metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch (_err) {
      return null;
    }
  }
  if (!meta || typeof meta !== 'object') return null;
  const safe = {};
  for (const key of AUDIT_META_KEYS) if (key in meta) safe[key] = meta[key];
  return safe;
};

const getCompanyDetail = async (companyId, actorId) => {
  const [rows] = await db.query(COMPANY_OVERVIEW_ONE_SQL, [companyId]);
  if (!rows.length) return null;
  const row = rows[0];
  const overview = mapCompanyOverviewRow(row);

  const [[elevators]] = await db.query('SELECT COUNT(*) AS cnt FROM elevators WHERE company_id = ?', [companyId]);
  let closure = null;
  try {
    const [[c]] = await db.query('SELECT closure_requested_at, closure_purge_after, closure_status_before FROM companies WHERE id = ? LIMIT 1', [companyId]);
    if (c && c.closure_requested_at) {
      closure = {
        requested_at: toIso(c.closure_requested_at),
        purge_after: toIso(c.closure_purge_after),
        status_before: c.closure_status_before || null,
        purge_due: Boolean(c.closure_purge_after) && new Date(c.closure_purge_after).getTime() <= Date.now(),
      };
    }
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err; // migration 20261112_company_closure.sql not applied yet
  }
  const [members] = await db.query(
    `SELECT u.id, u.email, u.full_name, u.is_active, u.disabled_at, u.global_role, uc.role, uc.created_at AS joined_at,
            (SELECT COUNT(*) FROM user_companies x WHERE x.user_id = u.id AND x.company_id <> uc.company_id) AS other_companies,
            (SELECT MAX(al.created_at) FROM audit_logs al
              WHERE al.user_id = u.id AND al.action IN ('login', 'login_google', 'login_apple')) AS last_login_at
     FROM user_companies uc
     INNER JOIN users u ON u.id = uc.user_id
     WHERE uc.company_id = ?
     ORDER BY FIELD(uc.role, 'admin', 'technician', 'viewer'), u.email`,
    [companyId]
  );
  const [invitations] = await db.query(
    `SELECT id, email, role, status, expires_at, created_at
     FROM invitations
     WHERE company_id = ? AND status = 'pending' AND expires_at > NOW()
     ORDER BY created_at DESC, id DESC`,
    [companyId]
  );
  const [auditRows] = await db.query(
    `SELECT al.id, al.action, al.user_id, u.email AS user_email, al.metadata, al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.company_id = ?
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT 30`,
    [companyId]
  );
  const [plans] = await db.query(
    `SELECT code, name, price_cents, admin_limit, technician_limit, trial_days
     FROM subscription_plans WHERE is_active = 1 ORDER BY price_cents ASC, id ASC`
  );

  return {
    ...overview,
    total_elevators: Number(elevators?.cnt || 0),
    closure,
    plan_limits: {
      admin: row.admin_limit === null || row.admin_limit === undefined ? null : Number(row.admin_limit),
      technician: row.technician_limit === null || row.technician_limit === undefined ? null : Number(row.technician_limit),
    },
    members: members.map((m) => ({
      id: m.id,
      email: m.email,
      full_name: m.full_name,
      role: m.role,
      is_active: m.is_active === 1 || m.is_active === true,
      disabled_at: toIso(m.disabled_at),
      is_superadmin: m.global_role === 'superadmin',
      is_self: m.id === actorId,
      other_companies: Number(m.other_companies || 0),
      joined_at: toIso(m.joined_at),
      last_login_at: toIso(m.last_login_at),
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expires_at: toIso(i.expires_at),
      created_at: toIso(i.created_at),
    })),
    audit: auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      user_id: a.user_id,
      user_email: a.user_email,
      created_at: toIso(a.created_at),
      metadata: safeAuditMetadata(a.action, a.metadata),
    })),
    plans: plans.map((p) => ({
      code: p.code,
      name: p.name,
      price_cents: p.price_cents === null ? null : Number(p.price_cents),
      admin_limit: p.admin_limit === null ? null : Number(p.admin_limit),
      technician_limit: p.technician_limit === null ? null : Number(p.technician_limit),
      trial_days: Number(p.trial_days || 0),
    })),
  };
};

module.exports = {
  handlers,
  getCompanyDetail,
  parseId,
  ActionError,
  resetRateLimit,
  MAX_FAILED_ATTEMPTS,
};
