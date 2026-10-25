const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { linkIdentityToUser } = require('../utils/identities');
const { logAudit } = require('../utils/auditLog');
const { establishSessionForUser } = require('../utils/sessionAuth');

router.use(express.json()); // ✅ Dodano lokalno parsiranje JSON-a

router.post('/', async (req, res) => {
  try {
    console.log('✅ POST /login primljen');
    console.log('📦 Body:', req.body);
    console.log('[SESSION DEBUG]', {
      NODE_ENV: process.env.NODE_ENV,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
      secure: req.secure,
      proto: req.headers['x-forwarded-proto']
    });
    console.log('[LOGIN DIAG] incoming cookie header:', req.headers.cookie || '(none)');

    const { password, email } = req.body;
    console.log('[LOGIN HIT]', email);

    const rateLimiter = req.app.get('loginRateLimiter');
    const ip = req.ip;
    if (rateLimiter?.isRateLimited?.(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Nedostaju podaci.' });
    }

    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (users.length === 0) {
      rateLimiter?.recordFailedAttempt?.(ip);
      return res.status(401).json({ error: 'Neispravno korisničko ime ili lozinka.' });
    }

    const user = users[0];

    const hashedPassword = user.password_hash;
    if (!hashedPassword) {
      rateLimiter?.recordFailedAttempt?.(ip);
      return res.status(401).json({ error: 'Neispravno korisničko ime ili lozinka.' });
    }
    const valid = await bcrypt.compare(password, hashedPassword);
    if (!valid) {
      rateLimiter?.recordFailedAttempt?.(ip);
      return res.status(401).json({ error: 'Neispravno korisničko ime ili lozinka.' });
    }

    if (user.disabled_at) {
      return res.status(401).json({ error: 'Account disabled' });
    }

    if (user.is_active === 0) {
      return res.status(401).json({ error: 'Account not active' });
    }

    console.log('[LOGIN USER]', { user_id: user.id, global_role: user.global_role });

    const context = await establishSessionForUser(req, user.id);
    if (!context) {
      return res.status(401).json({ error: 'Neispravno korisničko ime ili lozinka.' });
    }
    if (context.error === 'inactive') {
      return res.status(401).json({ error: 'Account not active' });
    }
    if (context.error === 'no_company') {
      return res.status(403).json({ error: 'No company access' });
    }

    try {
      await linkIdentityToUser({
        userId: user.id,
        provider: 'local',
        providerSub: null,
        emailAtLinkTime: user.email,
      });
    } catch (identityErr) {
      console.error('Failed to sync local identity mapping:', identityErr);
    }

    console.log('[LOGIN SESSION]', {
      user_id: req.session.user_id,
      active_company_id: req.session.active_company_id,
      global_role: req.session.global_role
    });

    rateLimiter?.clearAttempts?.(ip);
    await logAudit({
      userId: user.id,
      companyId: context.activeCompanyId,
      action: 'login',
      metadata: { ip }
    });

    return res.json({
      success: true,
      user: req.session.user
    });
  } catch (err) {
    console.error('Login greška:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// ✅ Endpoint za provjeru sesije
router.get('/check', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Nije prijavljen' });
  }
});

module.exports = router;
