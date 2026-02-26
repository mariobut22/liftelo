const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');

router.post('/', async (req, res) => {
  const { company_name, full_name, username, password } = req.body;

  if (!company_name || !full_name || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Username already exists' });
    }

    const [companyResult] = await connection.query(
      'INSERT INTO companies (name) VALUES (?)',
      [company_name]
    );
    const companyId = companyResult.insertId;

    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await connection.query(
      'INSERT INTO users (username, full_name, password, role, company_id) VALUES (?, ?, ?, ?, ?)',
      [username, full_name, hashedPassword, 'admin', companyId]
    );

    await connection.commit();

    req.session.user = {
      id: userResult.insertId,
      username,
      role: 'admin',
      full_name,
      company_id: companyId
    };

    res.status(201).json({ success: true, redirect: '/dashboard/stats.html' });
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
