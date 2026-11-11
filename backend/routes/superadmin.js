const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { COMPANY_OVERVIEW_SQL, mapCompanyOverviewRow } = require('../utils/superadminOverview');
const { handlers, getCompanyDetail, parseId } = require('../utils/superadminActions');
const { logAudit } = require('../utils/auditLog');
const monitoring = require('../utils/superadminMonitoring');

const router = express.Router();

const requireSuperadmin = (req, res, next) => {
  const user = req.session?.user;
  if (!user || user.global_role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  return next();
};

router.use(requireSuperadmin);

// Overview of all companies from the real billing tables (see utils/superadminOverview.js for the payload).
router.get('/companies', async (_req, res) => {
  try {
    const [rows] = await db.query(COMPANY_OVERVIEW_SQL);
    return res.json(rows.map(mapCompanyOverviewRow));
  } catch (err) {
    console.error('[SUPERADMIN COMPANIES ERROR]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Company detail: subscription, members, pending invitations, counts, last 30 audit rows, plan list. Never returns Stripe ids or tokens.
router.get('/companies/:id', async (req, res) => {
  const companyId = parseId(req.params.id);
  if (!companyId) {
    return res.status(400).json({ error: 'Invalid company id', code: 'invalid_request' });
  }
  try {
    const detail = await getCompanyDetail(companyId, parseId(req.session?.user_id));
    if (!detail) {
      return res.status(404).json({ error: 'Company not found', code: 'company_not_found' });
    }
    return res.json(detail);
  } catch (err) {
    console.error('[SUPERADMIN COMPANY DETAIL ERROR]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Phase 3 "nadzor": read-only monitoring (see utils/superadminMonitoring.js). No secrets, tokens, Stripe ids or e-mail bodies are returned.
router.get('/revenue', async (_req, res) => {
  try {
    return res.json(await monitoring.getRevenue());
  } catch (err) {
    console.error('[SUPERADMIN REVENUE ERROR]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.get('/health', async (_req, res) => {
  try {
    return res.json(await monitoring.getHealth());
  } catch (err) {
    console.error('[SUPERADMIN HEALTH ERROR]', err);
    return res.status(500).json({ error: 'Health check failed' });
  }
});

// Audit log viewer. Query: company_id, user_id, action (exact), scope=superadmin, from/to (YYYY-MM-DD), limit (max 100), offset.
router.get('/audit', async (req, res) => {
  try {
    const result = await monitoring.getAuditLog(req.query);
    if (result.error) return res.status(400).json({ error: result.error, code: 'invalid_request' });
    return res.json(result);
  } catch (err) {
    console.error('[SUPERADMIN AUDIT ERROR]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.get('/growth', async (_req, res) => {
  try {
    return res.json(await monitoring.getGrowth());
  } catch (err) {
    console.error('[SUPERADMIN GROWTH ERROR]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Audited actions. Body of each: { reason (>= 5 chars), password (superadmin's own, re-authentication), ...fields }.
// Details, guards and error codes: utils/superadminActions.js and docs/infrastructure.md "Superadmin API".
router.post('/companies/:id/plan', handlers.changePlan);
router.post('/companies/:id/trial', handlers.trial);
router.post('/companies/:id/grant-free-period', handlers.grantFreePeriod);
router.post('/companies/:id/limits', handlers.limits);
router.post('/companies/:id/suspend', handlers.suspend);
router.post('/companies/:id/unsuspend', handlers.unsuspend);
router.post('/companies/:id/cancel', handlers.cancel);
router.post('/companies/:id/request-closure', handlers.requestClosure);
router.post('/companies/:id/cancel-closure', handlers.cancelClosure);
router.post('/companies/:id/users/:userId/disable', handlers.userDisable);
router.post('/companies/:id/users/:userId/enable', handlers.userEnable);
router.post('/companies/:id/users/:userId/remove', handlers.userRemove);
router.post('/companies/:id/users/:userId/role', handlers.userRole);

router.get('/stats', async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  const hasYear = Number.isFinite(year) && year > 0;
  const hasMonth = Number.isFinite(month) && month >= 1 && month <= 12;

  try {
    const [[companiesRow]] = await db.query('SELECT COUNT(*) AS totalCompanies FROM companies');
    const [[usersRow]] = await db.query('SELECT COUNT(*) AS totalUsers FROM users');

    const rmsWhere = [hasYear ? 'YEAR(visit_date) = ?' : null, hasMonth ? 'MONTH(visit_date) = ?' : null]
      .filter(Boolean)
      .join(' AND ');
    const rmsParams = [hasYear ? year : null, hasMonth ? month : null].filter((value) => value !== null);
    const rmsSql = `SELECT COUNT(*) AS totalRms FROM rms_visits${rmsWhere ? ` WHERE ${rmsWhere}` : ''}`;
    const [[rmsRow]] = await db.query(rmsSql, rmsParams);

    const intWhere = [hasYear ? 'YEAR(created_at) = ?' : null, hasMonth ? 'MONTH(created_at) = ?' : null]
      .filter(Boolean)
      .join(' AND ');
    const intParams = [hasYear ? year : null, hasMonth ? month : null].filter((value) => value !== null);
    const intSql = `SELECT COUNT(*) AS totalInterventions FROM interventions${intWhere ? ` WHERE ${intWhere}` : ''}`;
    const [[intRow]] = await db.query(intSql, intParams);

    // companies per plan / per subscription status (real company_subscriptions; no row = 'none')
    const [planRows] = await db.query(
      `SELECT COALESCE(sp.code, 'none') AS code, COUNT(*) AS cnt
       FROM companies c
       LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
       LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
       GROUP BY COALESCE(sp.code, 'none')`
    );
    const [statusRows] = await db.query(
      `SELECT COALESCE(cs.status, 'none') AS status, COUNT(*) AS cnt
       FROM companies c
       LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
       GROUP BY COALESCE(cs.status, 'none')`
    );
    const byPlan = {};
    for (const row of planRows) byPlan[row.code] = Number(row.cnt || 0);
    const byStatus = {};
    for (const row of statusRows) byStatus[row.status] = Number(row.cnt || 0);

    return res.json({
      byPlan,
      byStatus,
      totalCompanies: companiesRow?.totalCompanies ?? 0,
      totalUsers: usersRow?.totalUsers ?? 0,
      totalRms: rmsRow?.totalRms ?? 0,
      totalInterventions: intRow?.totalInterventions ?? 0,
    });
  } catch (err) {
    console.error('Superadmin stats fetch error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Creates a company + its first admin (never a superadmin) + the starter trial subscription.
// Optional: plan_code (active plan, default starter), trial_days (1..90, default = plan.trial_days).
router.post('/companies', async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const adminEmail = typeof body.admin_email === 'string' ? body.admin_email.trim() : '';
  const adminPassword = typeof body.admin_password === 'string' ? body.admin_password : '';

  if (!name || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Missing company or admin details', code: 'missing_required_fields' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.length > 255) {
    return res.status(400).json({ error: 'Invalid admin email', code: 'invalid_email' });
  }

  if (adminPassword.length < 8) {
    return res.status(400).json({ error: 'Admin password must be at least 8 characters', code: 'password_too_short' });
  }

  const planCode = body.plan_code === undefined || body.plan_code === null || body.plan_code === '' ? 'starter' : body.plan_code;
  if (typeof planCode !== 'string' || !/^[a-z0-9_-]{1,50}$/i.test(planCode)) {
    return res.status(400).json({ error: 'Invalid plan_code', code: 'invalid_request' });
  }
  let trialDays = null;
  if (body.trial_days !== undefined && body.trial_days !== null && body.trial_days !== '') {
    const n = Number(body.trial_days);
    if (!Number.isInteger(n) || n < 1 || n > 90) {
      return res.status(400).json({ error: 'trial_days must be an integer from 1 to 90', code: 'invalid_request' });
    }
    trialDays = n;
  }

  const connection = await db.getConnection();

  try {
    const [[plan]] = await connection.query(
      'SELECT id, trial_days FROM subscription_plans WHERE code = ? AND is_active = 1 LIMIT 1',
      [planCode]
    );
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found', code: 'plan_not_found' });
    }

    const [[existingUser]] = await connection.query(
      'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
      [adminEmail, adminEmail]
    );
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists', code: 'email_exists' });
    }

    await connection.beginTransaction();

    const [companyResult] = await connection.query(
      'INSERT INTO companies (name) VALUES (?)',
      [name]
    );
    const companyId = companyResult.insertId;

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // login reads password_hash; `password` is the legacy NOT NULL column. global_role stays 'user': this route never creates a superadmin.
    const [userResult] = await connection.query(
      `INSERT INTO users (username, full_name, email, password, password_hash, role, company_id, is_active, global_role)
       VALUES (?, ?, ?, ?, ?, 'admin', ?, 1, 'user')`,
      [adminEmail, adminEmail, adminEmail, hashedPassword, hashedPassword, companyId]
    );

    // membership row: member counts, limits and login context read user_companies (not users.company_id)
    await connection.query(
      `INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, 'admin')`,
      [userResult.insertId, companyId]
    );

    // starter-style trial of the plan's trial_days (same shape as ensureCompanySubscription)
    const days = trialDays ?? (Number(plan.trial_days) > 0 ? Number(plan.trial_days) : 14);
    await connection.query(
      `INSERT INTO company_subscriptions
         (company_id, plan_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end)
       VALUES (?, ?, 'trial', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [companyId, plan.id, days, days]
    );

    await logAudit({
      userId: req.session?.user_id || null,
      companyId,
      action: 'superadmin_create_company',
      metadata: { plan_code: planCode, trial_days: days, admin_user_id: userResult.insertId },
      connection,
      throwOnError: true,
    });

    await connection.commit();

    return res.status(201).json({
      company_id: companyId,
      admin_user_id: userResult.insertId,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      console.error('Superadmin company creation rollback failed:', rollbackErr);
    }
    console.error('Superadmin company creation error:', err);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
