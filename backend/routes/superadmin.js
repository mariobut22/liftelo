const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

const requireSuperadmin = (req, res, next) => {
  const user = req.session?.user;
  if (!user || user.global_role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};

router.use(requireSuperadmin);

router.get('/companies', async (_req, res) => {
  try {
    const [companies] = await db.query(
      `SELECT c.id,
              c.name,
              c.created_at,
              c.subscription_status,
              COUNT(DISTINCT l.id) AS total_locations,
              COUNT(DISTINCT u.id) AS total_users,
              COUNT(DISTINCT rv.id) AS total_rms,
              COUNT(DISTINCT i.id) AS total_interventions
       FROM companies c
       LEFT JOIN locations l ON l.company_id = c.id
       LEFT JOIN users u ON u.company_id = c.id
       LEFT JOIN rms_visits rv ON rv.company_id = c.id
       LEFT JOIN interventions i ON i.company_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );

    return res.json(companies);
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

    return res.json({
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
    return res.status(400).json({ error: 'Missing company or admin details' });
  }

  if (admin_password.length < 8) {
    return res.status(400).json({ error: 'Admin password must be at least 8 characters' });
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

router.patch('/companies/:id/status', async (req, res) => {
  const { status } = req.body || {};
  const companyId = Number(req.params.id);

  if (!companyId || !['trial', 'active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid company status' });
  }

  try {
    await db.query(
      'UPDATE companies SET subscription_status = ? WHERE id = ? LIMIT 1',
      [status, companyId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Superadmin company status update error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
