const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { logAudit } = require('../utils/auditLog');

router.post('/set-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Missing token or password' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const [[userRow]] = await db.query(
      `SELECT id, invite_expires
       FROM users
       WHERE invite_token = ?
       LIMIT 1`,
      [token]
    );

    if (!userRow) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (!userRow.invite_expires || new Date(userRow.invite_expires) < new Date()) {
      return res.status(400).json({ error: 'Invite token expired' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      `UPDATE users
       SET password = ?, invite_token = NULL, invite_expires = NULL, is_active = 1
       WHERE id = ?`,
      [hashedPassword, userRow.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Greška pri postavljanju lozinke:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.json({ success: true });
  }

  try {
    const [[userRow]] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (userRow?.id) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await db.query(
        `INSERT INTO password_resets (user_id, token, expires_at, used)
         VALUES (?, ?, ?, 0)`,
        [userRow.id, token, expiresAt]
      );
      console.log(`[PASSWORD RESET] http://localhost:5173/reset-password?token=${token}`);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.json({ success: true });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body || {};

  if (!token || !new_password) {
    return res.status(400).json({ error: 'Missing token or password' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const [[resetRow]] = await db.query(
      `SELECT id, user_id, expires_at, used
       FROM password_resets
       WHERE token = ?
       LIMIT 1`,
      [token]
    );

    if (!resetRow || resetRow.used) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (new Date(resetRow.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token expired' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1', [
      hashedPassword,
      resetRow.user_id
    ]);
    await db.query('UPDATE password_resets SET used = 1 WHERE id = ? LIMIT 1', [resetRow.id]);

    await logAudit({
      userId: resetRow.user_id,
      companyId: null,
      action: 'reset_password',
      metadata: { ip: req.ip }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
