const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });
if (fs.existsSync('.env.production')) {
  dotenv.config({ path: '.env.production', override: true });
}
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const path = require('path');
const db = require('./db');
const { logAudit } = require('./utils/auditLog');
const app = express();
app.set('trust proxy', 1);
const PORT = 3000;
console.log('[ENV CHECK]', {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET_EXISTS: !!process.env.SESSION_SECRET
});
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});
const cors = require("cors");

app.use(cors({
  origin: ['https://app.liftelo.app'],
  credentials: true
}));

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: { action: 'sameorigin' },
    hidePoweredBy: true
  })
);


// ✅ Parsiranje JSON i URL-encoded tijela zahtjeva
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ MySQL session store konfiguracija
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'liftelo',
  port: process.env.DB_PORT || 3306
});

app.use(session({
  name: 'liftelo.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  }
}));

// ✅ Company context (Phase 3)
app.use((req, res, next) => {
  req.companyId = req.session?.active_company_id ?? null;
  next();
});

// ✅ Simple in-memory login rate limiting
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const isRateLimited = (ip) => {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
};
const recordFailedAttempt = (ip) => {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttemptAt: Date.now() });
    return;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
};
const clearAttempts = (ip) => {
  loginAttempts.delete(ip);
};

// ✅ Block disabled users on next authenticated request
app.use(async (req, res, next) => {
  const userId = req.session?.user_id;
  if (!userId) {
    return next();
  }

  try {
    const [[row]] = await db.query('SELECT is_active FROM users WHERE id = ? LIMIT 1', [userId]);
    if (row && row.is_active === 0) {
      return req.session.destroy(() => res.status(401).json({ error: 'Account disabled' }));
    }
    return next();
  } catch (err) {
    console.error('Greška pri provjeri deaktivacije korisnika:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ✅ Require company context for authenticated JSON API routes
const requireCompanyContext = async (req, res, next) => {
  if (req.path.endsWith('/pdf')) {
    return next();
  }

  const userId = req.session?.user_id;
  if (!userId) {
    return next();
  }

  if (req.session?.global_role === 'superadmin') {
    return next();
  }

  if (!req.companyId) {
    try {
      const [rows] = await db.query(
        `SELECT company_id
         FROM user_companies
         WHERE user_id = ?
         ORDER BY company_id ASC
         LIMIT 1`,
        [userId]
      );
      if (rows.length > 0) {
        req.session.active_company_id = rows[0].company_id;
        req.companyId = rows[0].company_id;
        await new Promise((resolve, reject) => {
          req.session.save((saveErr) => {
            if (saveErr) {
              reject(saveErr);
              return;
            }
            resolve(null);
          });
        });
        return next();
      }
    } catch (err) {
      console.error('Failed to hydrate company context', err);
    }
    return res.status(401).json({ error: 'Missing company context' });
  }

  return next();
};

// ✅ Dev-only login bypass (localhost testing only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/dev-login', async (req, res) => {
    try {
      const [[defaultCompany]] = await require('./db').query(
        'SELECT id FROM companies WHERE name = ? LIMIT 1',
        ['Rijeka Dizalo']
      );

      req.session.user = {
        id: 1,
        username: 'admin',
        role: 'admin',
        company_id: defaultCompany ? defaultCompany.id : null
      };

      return res.redirect('/dashboard/rms.html');
    } catch (err) {
      console.error('Dev login error:', err);
      return res.status(500).json({ error: 'Greška na serveru.' });
    }
  });
}

// ✅ Staticki fajlovi
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard', express.static(path.join(__dirname, 'public/dashboard')));
// Serve uploads from /uploads (not from /public/uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Session timeout middleware
app.use(async (req, res, next) => {
  try {
    const [[row]] = await db.query(
      'SELECT session_timeout_hours FROM app_settings ORDER BY id ASC LIMIT 1'
    );
    const timeoutHours = row?.session_timeout_hours ?? 720;

    if (!req.session || !req.sessionID) {
      return next();
    }

    const timeoutMs = Number(timeoutHours) * 60 * 60 * 1000;
    const sessionId = req.sessionID;
    const [[sessionRow]] = await db.query(
      'SELECT expires FROM sessions WHERE session_id = ? LIMIT 1',
      [sessionId]
    );

    if (!sessionRow?.expires) {
      return next();
    }

    if (Date.now() > sessionRow.expires * 1000 + timeoutMs) {
      await db.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
      return req.session.destroy(() => res.status(401).json({ error: 'Session expired' }));
    }

    return next();
  } catch (err) {
    console.error('Session timeout check failed:', err);
    return next();
  }
});

// ✅ API rute
const usersRouter = require('./routes/users');
const locationsRouter = require('./routes/locations');
const rmsRouter = require('./routes/rms');
const rmsVisitsRouter = require('./routes/rms-visits');
const interventionsRouter = require('./routes/interventions');
const statsRouter = require('./routes/stats');
const loginRouter = require('./routes/login');
const elevatorsRouter = require('./routes/elevators');
const rmsPdfRouter = require('./routes/rms-pdf');
const recordsRoutes = require('./routes/records');
const companyRouter = require('./routes/company');
const signupRouter = require('./routes/signup');
const homeRouter = require('./routes/home');
const workOrdersRouter = require('./routes/work-orders');
const exportRouter = require('./routes/export');
const vehiclesRouter = require('./routes/vehicles');
const rmsOverviewRouter = require('./routes/rms-overview');
const projectsRouter = require('./routes/projects');
const authRouter = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const notificationsRouter = require('./routes/notifications');
const reportsRouter = require('./routes/reports');
const superadminRouter = require('./routes/superadmin');
const { startEmailWorker } = require('./utils/email-worker');

app.get('/api/companies/:companyId/users', requireCompanyContext, async (req, res) => {
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

app.use('/api/users', requireCompanyContext, usersRouter);
app.use('/api/locations', requireCompanyContext, locationsRouter);
app.use('/api/rms', requireCompanyContext, rmsRouter);
app.use('/api/rms-visits', requireCompanyContext, rmsVisitsRouter);
app.use('/api/interventions', requireCompanyContext, interventionsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/home', requireCompanyContext, homeRouter);
app.use('/api/elevators', requireCompanyContext, elevatorsRouter);
app.use('/api/rms-pdf', rmsPdfRouter);
app.use('/api/records', requireCompanyContext, recordsRoutes);
app.use('/api/company', requireCompanyContext, companyRouter);
app.use('/api/signup', signupRouter);
app.use('/api/work-orders', requireCompanyContext, workOrdersRouter);
app.use('/api/export', requireCompanyContext, exportRouter);
app.use('/api/vehicles', requireCompanyContext, vehiclesRouter);
app.use('/api/rms-overview', requireCompanyContext, rmsOverviewRouter);
app.use('/api/projects', requireCompanyContext, projectsRouter);
app.use('/api/auth', authRouter);
app.use('/api/reports', requireCompanyContext, reportsRouter);
app.use('/api/superadmin', superadminRouter);
app.post('/api/switch-company', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = Number(req.body?.company_id);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!companyId) {
    return res.status(400).json({ error: 'Missing company_id' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.session.active_company_id = companyId;
    await logAudit({
      userId,
      companyId,
      action: 'switch_company',
      metadata: { ip: req.ip }
    });
    return res.json({ success: true, active_company_id: companyId });
  } catch (err) {
    console.error('Switch company error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// expose rate limit helpers for login
app.set('loginRateLimiter', {
  isRateLimited,
  recordFailedAttempt,
  clearAttempts
});

app.post('/api/companies/:companyId/invite', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = Number(req.params.companyId);
  const { email, role } = req.body || {};

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!email || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const allowedRoles = ['admin', 'technician', 'viewer'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO invitations (email, company_id, role, token, expires_at, status, invited_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [email, companyId, role, token, expiresAt, userId]
    );

    await logAudit({
      userId,
      companyId,
      action: 'invite_user',
      metadata: { email, role }
    });

    console.log(`[INVITE LINK] http://localhost:5173/accept-invite?token=${token}`);

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Invite user error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/invitations/accept', async (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !password) {
    return res.status(400).json({ error: 'Missing token or password' });
  }

  try {
    const [[invite]] = await db.query(
      `SELECT * FROM invitations WHERE token = ? LIMIT 1`,
      [token]
    );

    if (!invite || invite.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await db.query('UPDATE invitations SET status = ? WHERE id = ?', ['expired', invite.id]);
      return res.status(400).json({ error: 'Invite expired' });
    }

    const [[existingUser]] = await db.query(
      'SELECT id, email, global_role FROM users WHERE email = ? LIMIT 1',
      [invite.email]
    );

    let userId = existingUser?.id ?? null;
    let globalRole = existingUser?.global_role || 'user';

    if (!userId) {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        `INSERT INTO users (email, password_hash, is_active, is_verified, global_role)
         VALUES (?, ?, 1, 1, 'user')`,
        [invite.email, hashedPassword]
      );
      userId = result.insertId;
      globalRole = 'user';
    }

    await db.query(
      `INSERT IGNORE INTO user_companies (user_id, company_id, role, invited_by)
       VALUES (?, ?, ?, ?)` ,
      [userId, invite.company_id, invite.role, invite.invited_by]
    );

    await db.query('UPDATE invitations SET status = ? WHERE id = ?', ['accepted', invite.id]);

    const [companies] = await db.query(
      `SELECT company_id, role
       FROM user_companies
       WHERE user_id = ?
       ORDER BY company_id ASC`,
      [userId]
    );

    const activeCompanyId = invite.company_id;
    req.session.user_id = userId;
    req.session.user_email = invite.email;
    req.session.active_company_id = activeCompanyId;
    req.session.global_role = globalRole;

    await logAudit({
      userId,
      companyId: activeCompanyId,
      action: 'accept_invite',
      metadata: { email: invite.email }
    });

    return res.json({
      id: userId,
      email: invite.email,
      companies,
      active_company_id: activeCompanyId
    });
  } catch (err) {
    console.error('Accept invite error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/cleanup-expired-invites', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;

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

    const [result] = await db.query(
      `UPDATE invitations
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()`
    );

    return res.json({ success: true, updated: result.affectedRows });
  } catch (err) {
    console.error('Cleanup expired invites error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.use('/api/settings', requireCompanyContext, settingsRouter);
app.use('/api/notifications', notificationsRouter);

// ✅ Ruta za login
app.use('/login', loginRouter);
app.use('/api/login', loginRouter);

// ✅ HTML rute
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.post('/api/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true });
  }
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.use((req, res) => {
  console.warn('[404]', req.method, req.originalUrl);
  res.status(404).json({ message: 'Not found' });
});

// ✅ Pokreni cron job za dnevnu statistiku
const { startDailyStatsCron } = require('./utils/daily-stats-cron');
startDailyStatsCron();

// ✅ Pokretanje servera
app.listen(PORT, () => {
  console.log(`✅ Liftelo backend radi na http://localhost:${PORT}`);
  startEmailWorker();
});
