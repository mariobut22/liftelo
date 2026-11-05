const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { COMPANY_OVERVIEW_SQL, mapCompanyOverviewRow } = require('../utils/superadminOverview');

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

router.post('/companies', async (req, res) => {
  const { name, admin_email, admin_password } = req.body || {};

  if (!name || !admin_email || !admin_password) {
    return res.status(400).json({ error: 'Missing company or admin details', code: 'missing_required_fields' });
  }

  if (admin_password.length < 8) {
    return res.status(400).json({ error: 'Admin password must be at least 8 characters', code: 'password_too_short' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [companyResult] = await connection.query(
      'INSERT INTO companies (name) VALUES (?)',
      [name]
    );
    const companyId = companyResult.insertId;

    const hashedPassword = await bcrypt.hash(admin_password, 10);

    const [userResult] = await connection.query(
      `INSERT INTO users (username, full_name, email, password, role, company_id)
       VALUES (?, ?, ?, ?, 'admin', ?)`,
      [admin_email, admin_email, admin_email, hashedPassword, companyId]
    );

    // membership row: member counts, limits and login context read user_companies (not users.company_id)
    await connection.query(
      `INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, 'admin')`,
      [userResult.insertId, companyId]
    );

    await connection.commit();

    return res.status(201).json({
      company_id: companyId,
      admin_user_id: userResult.insertId,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Superadmin company creation error:', err);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
