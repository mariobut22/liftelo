const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { ensureCompanySubscription } = require('../utils/subscriptions');
const { establishSessionForUser } = require('../utils/sessionAuth');
const { logAudit } = require('../utils/auditLog');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const buildUsernameFromEmail = (email) => {
  const localPart = email.split('@')[0] || 'user';
  return localPart
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 70) || 'user';
};

const ensureUniqueUsername = async (connection, baseUsername) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? baseUsername : `${baseUsername}${attempt + 1}`;
    const [rows] = await connection.query('SELECT id FROM users WHERE username = ? LIMIT 1', [candidate]);
    if (rows.length === 0) {
      return candidate;
    }
  }
  return `${baseUsername}${Date.now()}`;
};

router.post('/', async (req, res) => {
  const companyName = String(req.body?.company_name || '').trim();
  const fullName = String(req.body?.full_name || '').trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!companyName || !fullName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Email is invalid' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Email already exists' });
    }

    const username = await ensureUniqueUsername(connection, buildUsernameFromEmail(email));

    const [companyResult] = await connection.query(
      'INSERT INTO companies (name) VALUES (?)',
      [companyName]
    );
    const companyId = companyResult.insertId;

    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await connection.query(
      `INSERT INTO users (username, full_name, password, role, company_id, email, password_hash, is_active, global_role)
       VALUES (?, ?, ?, 'admin', ?, ?, ?, 1, 'user')`,
      [username, fullName, hashedPassword, companyId, email, hashedPassword]
    );

    const userId = userResult.insertId;

    await connection.query(
      `INSERT INTO user_companies (user_id, company_id, role, invited_by)
       VALUES (?, ?, 'admin', ?)`,
      [userId, companyId, userId]
    );

    await connection.query(
      `UPDATE users
       SET last_active_company_id = ?
       WHERE id = ?
       LIMIT 1`,
      [companyId, userId]
    );

    await connection.commit();

    await ensureCompanySubscription(companyId);

    const context = await establishSessionForUser(req, userId);
    if (!context || context.error) {
      return res.status(500).json({ error: 'Failed to establish user session' });
    }

    await logAudit({
      userId,
      companyId,
      action: 'signup',
      metadata: { email }
    });

    return res.status(201).json({
      success: true,
      user: req.session.user,
    });
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
