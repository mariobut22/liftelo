const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendEmail } = require('../utils/emailService');

const ensureAdmin = async (req, res, next) => {
  const userId = req.session?.user?.id;
  const companyId = req.companyId;
  if (!userId || !companyId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const [[row]] = await require('../db').query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!row || row.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  } catch (err) {
    console.error('ensureAdmin error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

router.get('/session', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT session_timeout_hours FROM app_settings ORDER BY id ASC LIMIT 1'
    );
    res.json({ session_timeout_hours: row?.session_timeout_hours ?? 720 });
  } catch (err) {
    console.error('Greška pri dohvaćanju postavki:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/session', ensureAdmin, async (req, res) => {
  const { session_timeout_hours } = req.body;

  try {
    const parsed = Number(session_timeout_hours);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return res.status(400).json({ error: 'session_timeout_hours must be >= 1' });
    }

    await db.query('UPDATE app_settings SET session_timeout_hours = ?', [parsed]);
    res.json({ success: true, session_timeout_hours: parsed });
  } catch (err) {
    console.error('Greška pri ažuriranju postavki:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/email', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  try {
    const [[row]] = await db.query(
      'SELECT email_notifications_enabled FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    const smtpConfigured = Boolean(process.env.SMTP_HOST);
    res.json({
      company_email_enabled: Boolean(row?.email_notifications_enabled),
      smtp_configured: smtpConfigured
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju email postavki:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/email', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const { company_email_enabled } = req.body;
  try {
    const value = company_email_enabled ? 1 : 0;
    await db.query(
      'UPDATE companies SET email_notifications_enabled = ? WHERE id = ?',
      [value, companyId]
    );
    res.json({ success: true, company_email_enabled: Boolean(value) });
  } catch (err) {
    console.error('Greška pri ažuriranju email postavki:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/email/test', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user?.id;
  try {
    const [[userRow]] = await db.query(
      'SELECT email FROM users WHERE id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!userRow?.email) {
      return res.status(400).json({ error: 'User email missing' });
    }

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const html = `If you received this, SMTP works. Time: ${new Date().toISOString()}`;
    const { enqueueEmail } = require('../utils/email-outbox');
    await enqueueEmail({
      companyId,
      userId,
      toEmail: userRow.email,
      subject: 'Liftelo test email',
      html,
      text: html,
      type: 'test_email'
    });

    res.json({ queued: true });
  } catch (err) {
    console.error('Greška pri slanju test emaila:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/test-email', ensureAdmin, async (req, res) => {
  const { to } = req.body;
  if (!to) {
    return res.status(400).json({ error: 'Missing recipient' });
  }

  try {
    await sendEmail({
      to,
      subject: 'Liftelo SMTP test',
      template: 'notification',
      data: {
        title: 'Liftelo SMTP test',
        message: 'SMTP konfiguracija radi.'
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Greška pri test emailu:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
