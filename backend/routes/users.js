const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { logAudit } = require('../utils/auditLog');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const { createNotification } = require('../utils/createNotification');

// Dohvati trenutnu sesiju korisnika
router.get('/session', async (req, res) => {
  console.log('[SESSION CHECK]', req.session?.user_id);
  console.log('[SESSION DIAG] cookie header:', req.headers.cookie || '(none)');
  console.log('[SESSION DIAG] sessionID:', req.sessionID || '(none)');
  if (req.session?.user_id) {
    let activeCompanyId = req.session.active_company_id ?? null;
    if (!activeCompanyId && req.session.global_role !== 'superadmin') {
      try {
        const [rows] = await db.query(
          `SELECT company_id
           FROM user_companies
           WHERE user_id = ?
           ORDER BY company_id ASC
           LIMIT 1`,
          [req.session.user_id]
        );
        if (rows.length > 0) {
          activeCompanyId = rows[0].company_id;
          req.session.active_company_id = activeCompanyId;
          await new Promise((resolve, reject) => {
            req.session.save((saveErr) => {
              if (saveErr) {
                reject(saveErr);
                return;
              }
              resolve(null);
            });
          });
        }
      } catch (err) {
        console.error('Failed to hydrate company context', err);
      }
    }
    const [[userRow]] = await db.query(
      'SELECT language FROM users WHERE id = ? LIMIT 1',
      [req.session.user_id]
    );

    let companyLanguage = null;
    if (activeCompanyId) {
      const [[companyRow]] = await db.query(
        'SELECT default_language FROM companies WHERE id = ? LIMIT 1',
        [activeCompanyId]
      );
      companyLanguage = companyRow?.default_language || null;
    }

    const resolvedLanguage = userRow?.language || companyLanguage || 'en';

    return res.json({
      user: {
        id: req.session.user_id,
        email: req.session.user_email,
        global_role: req.session.global_role,
        company_id: activeCompanyId,
        language: resolvedLanguage
      },
      active_company_id: activeCompanyId
    });
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

router.put('/me/language', async (req, res) => {
  const userId = req.session?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { language } = req.body ?? {};
  if (!['en', 'hr'].includes(language)) {
    return res.status(400).json({ error: 'Invalid language' });
  }

  try {
    await db.query('UPDATE users SET language = ? WHERE id = ? LIMIT 1', [language, userId]);

    req.session.user_language = language;
    await new Promise((resolve, reject) => {
      req.session.save((saveErr) => {
        if (saveErr) {
          reject(saveErr);
          return;
        }
        resolve(null);
      });
    });

    return res.json({ language });
  } catch (err) {
    console.error('Greška pri spremanju jezika korisnika:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.get('/companies', async (req, res) => {
  const userId = req.session?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const [rows] = await db.query(
      `SELECT c.id, c.name, c.logo_path, uc.role
       FROM user_companies uc
       INNER JOIN companies c ON c.id = uc.company_id
       WHERE uc.user_id = ?
       ORDER BY c.name ASC`,
      [userId]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju user companies:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.get('/companies/:companyId/users', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = Number(req.params.companyId);
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await db.query(
      `SELECT u.id, u.email, uc.role, u.is_active
       FROM user_companies uc
       INNER JOIN users u ON u.id = uc.user_id
       WHERE uc.company_id = ?
       ORDER BY u.email ASC`,
      [companyId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju company users:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/companies/:companyId/users/:userId', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = Number(req.params.companyId);
  const targetUserId = Number(req.params.userId);
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!targetUserId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  if (userId === targetUserId) {
    return res.status(400).json({ error: 'Cannot remove yourself' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await db.query(
      'DELETE FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [targetUserId, companyId]
    );

    await logAudit({
      userId,
      companyId,
      action: 'remove_user',
      metadata: { targetUserId }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Greška pri uklanjanju user company:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/companies/:companyId/users/:userId/disable', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = Number(req.params.companyId);
  const targetUserId = Number(req.params.userId);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!targetUserId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  if (userId === targetUserId) {
    return res.status(400).json({ error: 'Cannot disable yourself' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [[targetMembership]] = await db.query(
      'SELECT 1 FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [targetUserId, companyId]
    );

    if (!targetMembership) {
      return res.status(404).json({ error: 'User not found in company' });
    }

    await db.query('UPDATE users SET is_active = 0 WHERE id = ? LIMIT 1', [targetUserId]);

    await logAudit({
      userId,
      companyId,
      action: 'disable_user',
      metadata: { targetUserId }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Greška pri deaktivaciji usera:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Dohvati sve korisnike
router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    const includeDisabled = req.query.include_disabled === '1';
    const [rows] = await db.query(
      `SELECT id, username, full_name, role, company_id, disabled_at
       FROM users
       WHERE company_id = ?
         ${includeDisabled ? '' : 'AND disabled_at IS NULL'}`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju korisnika:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Dohvati jednog korisnika
router.get('/:id', async (req, res) => {
  try {
    const companyId = req.companyId;
    const includeDisabled = req.query.include_disabled === '1';
    const [rows] = await db.query(
      `SELECT id, username, full_name, role, company_id, disabled_at
       FROM users
       WHERE id = ?
         AND company_id = ?
         ${includeDisabled ? '' : 'AND disabled_at IS NULL'}`,
      [req.params.id, companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Korisnik nije pronađen' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Greška pri dohvaćanju korisnika:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Dodaj korisnika
router.post('/', async (req, res) => {
  const { username, full_name, role } = req.body;
  try {
    if (req.session?.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const companyId = req.companyId;
    if (!username || !full_name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const inviteToken = require('crypto').randomUUID();
    const [[companyRow]] = await db.query(
      'SELECT default_language FROM companies WHERE id = ? LIMIT 1',
      [companyId]
    );
    const companyLanguage = companyRow?.default_language || 'en';

    const [result] = await db.query(
      `INSERT INTO users (username, full_name, role, company_id, invite_token, invite_expires, is_active, language)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), 0, ?)`,
      [username, full_name, role, companyId, inviteToken, companyLanguage]
    );

    const inviteLink = `/set-password?token=${inviteToken}`;

    try {
      const { getEmailTranslations } = require('../utils/emailService');
      const t = getEmailTranslations(companyLanguage);
      await createNotification({
        userId: result.insertId,
        type: 'invite',
        title: t.invite.subject,
        message: t.invite.message,
        link: inviteLink
      });
    } catch (notifyErr) {
      console.error('Greška pri notifikaciji pozivnice:', notifyErr);
    }

    res.status(201).json({ message: 'Korisnik uspješno dodan', invite_link: inviteLink });
  } catch (err) {
    console.error('Greška pri dodavanju korisnika:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Soft-disable korisnika
router.post('/:id/disable', async (req, res) => {
  try {
    if (req.session?.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const companyId = req.companyId;
    const [result] = await db.query(
      'UPDATE users SET disabled_at = NOW() WHERE id = ? AND company_id = ? AND disabled_at IS NULL',
      [req.params.id, companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Korisnik nije pronađen' });
    }

    res.json({ message: 'Korisnik deaktiviran' });
  } catch (err) {
    console.error('Greška pri deaktivaciji korisnika:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Ažuriraj lozinku
router.put('/:id/password', async (req, res) => {
  const { newPassword } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.params.id]);
    res.json({ message: 'Lozinka ažurirana' });
  } catch (err) {
    console.error('Greška pri ažuriranju lozinke:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Promjena lozinke za trenutnog korisnika
router.put('/me/password', async (req, res) => {
  const userId = req.session?.user?.id;
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing password fields' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const [[userRow]] = await db.query('SELECT password, company_id FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userRow.company_id !== req.companyId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const valid = await bcrypt.compare(currentPassword, userRow.password);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Greška pri promjeni lozinke:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Statistika korisnika
router.get('/:id/stats', async (req, res) => {
  const userId = req.params.id;
  try {
    const companyId = req.companyId;
    const [rms7] = await db.query(
      'SELECT COUNT(*) AS count FROM rms_visits WHERE user_id = ? AND created_at >= NOW() - INTERVAL 7 DAY AND company_id = ?',
      [userId, companyId]
    );
    const [rms30] = await db.query(
      'SELECT COUNT(*) AS count FROM rms_visits WHERE user_id = ? AND created_at >= NOW() - INTERVAL 30 DAY AND company_id = ?',
      [userId, companyId]
    );
    const [int7] = await db.query(
      'SELECT COUNT(*) AS count FROM interventions WHERE technician = (SELECT username FROM users WHERE id = ?) AND created_at >= NOW() - INTERVAL 7 DAY AND company_id = ?',
      [userId, companyId]
    );
    const [int30] = await db.query(
      'SELECT COUNT(*) AS count FROM interventions WHERE technician = (SELECT username FROM users WHERE id = ?) AND created_at >= NOW() - INTERVAL 30 DAY AND company_id = ?',
      [userId, companyId]
    );
    const [rmsList] = await db.query(
      'SELECT id, visit_date AS date FROM rms_visits WHERE user_id = ? AND company_id = ? ORDER BY visit_date DESC LIMIT 5',
      [userId, companyId]
    );
    const [intList] = await db.query(
      'SELECT id, date FROM interventions WHERE technician = (SELECT username FROM users WHERE id = ?) AND company_id = ? ORDER BY date DESC LIMIT 5',
      [userId, companyId]
    );

    res.json({
      rms_last_7_days: rms7[0].count,
      rms_last_30_days: rms30[0].count,
      interventions_last_7_days: int7[0].count,
      interventions_last_30_days: int30[0].count,
      rmsList,
      intList
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju statistike:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Latest RMS records for user
router.get('/:id/rms-latest', async (req, res) => {
  const userId = req.params.id;
  try {
    const companyId = req.companyId;
    const [[user]] = await db.query('SELECT username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const [rms] = await db.query(
      'SELECT id, location_id as lift_id, created_at FROM rms_visits WHERE user_id = ? AND company_id = ? ORDER BY created_at DESC LIMIT 5',
      [user.id, companyId]
    );
    res.json(rms);
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS zapisa:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Latest interventions for user
router.get('/:id/interventions-latest', async (req, res) => {
  const userId = req.params.id;
  try {
    const companyId = req.companyId;
    const [[user]] = await db.query('SELECT username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const [interventions] = await db.query(
      'SELECT id, elevator_id as location_id, created_at FROM interventions WHERE technician = ? AND company_id = ? ORDER BY created_at DESC LIMIT 5',
      [user.username, companyId]
    );
    res.json(interventions);
  } catch (err) {
    console.error('Greška pri dohvaćanju intervencija:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PDF izvještaj korisnika
router.get('/:id/report', async (req, res) => {
  const userId = req.params.id;
  try {
    const companyId = req.companyId;
    const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const [rms] = await db.query(
      'SELECT * FROM rms_visits WHERE user_id = ? AND company_id = ? ORDER BY visit_date DESC',
      [user.id, companyId]
    );
    const [interventions] = await db.query(
      'SELECT * FROM interventions WHERE technician = ? AND company_id = ? ORDER BY date DESC',
      [user.username, companyId]
    );

    const html = await ejs.renderFile(
      path.join(__dirname, '../templates/user-report.ejs'),
      { user, rms, interventions }
    );

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=korisnik-${userId}.pdf`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Greška pri generiranju PDF-a:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
