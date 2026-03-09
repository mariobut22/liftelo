const express = require('express');
const router = express.Router();
const db = require('../db');
const { logAudit } = require('../utils/auditLog');
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

router.get('/company', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  try {
    const [[row]] = await db.query(
      'SELECT default_language FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    res.json({ default_language: row?.default_language || 'hr' });
  } catch (err) {
    console.error('Greška pri dohvaćanju company postavki:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/company', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user?.id;
  const { default_language } = req.body || {};
  const allowed = ['hr', 'en'];
  if (!allowed.includes(default_language)) {
    return res.status(400).json({ error: 'Invalid default_language' });
  }

  try {
    const [[currentRow]] = await db.query(
      'SELECT default_language FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    await db.query('UPDATE companies SET default_language = ? WHERE id = ?', [default_language, companyId]);
    await logAudit({
      userId,
      companyId,
      action: 'company_default_language_updated',
      metadata: { from: currentRow?.default_language || 'hr', to: default_language }
    });
    res.json({ success: true, default_language });
  } catch (err) {
    console.error('Greška pri ažuriranju company postavki:', err);
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
    const [[langRow]] = await db.query(
      `SELECT u.language, c.default_language
       FROM users u
       INNER JOIN companies c ON u.company_id = c.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );
    const resolvedLanguage = langRow?.language || langRow?.default_language || 'en';
    const { getEmailTranslations } = require('../utils/emailService');
    const t = getEmailTranslations(resolvedLanguage);
    const html = `${t.testEmail.message} ${new Date().toISOString()}`;
    const { enqueueEmail } = require('../utils/email-outbox');
    await enqueueEmail({
      companyId,
      userId,
      toEmail: userRow.email,
      subject: t.testEmail.subject,
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
    const resolvedLanguage = 'en';
    const { getEmailTranslations } = require('../utils/emailService');
    const t = getEmailTranslations(resolvedLanguage);

    await sendEmail({
      to,
      subject: t.smtpTest.subject,
      template: 'notification',
      language: resolvedLanguage,
      data: {
        title: t.smtpTest.subject,
        message: t.smtpTest.message
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Greška pri test emailu:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
