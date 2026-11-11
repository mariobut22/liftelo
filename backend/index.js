const fs = require('fs');
const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const path = require('path');
const db = require('./db');
const { logAudit } = require('./utils/auditLog');
const { recordAcceptances, termsRequiredButMissing, shouldRecordAcceptance } = require('./utils/legal');

dotenv.config({ path: '.env', override: true });
if (fs.existsSync('.env.production')) {
  dotenv.config({ path: '.env.production', override: true });
}
const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;
const sessionSecret = (process.env.SESSION_SECRET || '').trim();
const isProductionLike = process.env.NODE_ENV === 'production';

if (!sessionSecret) {
  const message = '[FATAL] SESSION_SECRET is missing. Refusing to start to prevent runtime auth failures.';
  console.error(message);
  process.exit(1);
}

if (isProductionLike && sessionSecret === 'liftelo-local-dev-secret-change-me') {
  const message = '[FATAL] Insecure development SESSION_SECRET detected in production mode.';
  console.error(message);
  process.exit(1);
}

const isEmailWorkerEnabled = String(process.env.EMAIL_WORKER_ENABLED ?? 'true').toLowerCase() === 'true';
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});
const cors = require("cors");

const allowedOrigins = [
  'http://localhost:5173',
  'https://app.liftelo.app',
  'https://staging.liftelo.app',
  'https://www.staging.liftelo.app',
  'http://staging.liftelo.app'
]

const allowedOriginPatterns = [
  /^https:\/\/(?:[a-z0-9-]+\.)?liftelo\.app$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
]

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    if (allowedOriginPatterns.some((pattern) => pattern.test(origin))) return callback(null, true)
    console.warn('[CORS BLOCK]', { origin })
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: { action: 'sameorigin' },
    hidePoweredBy: true
  })
);


// ✅ Parsiranje JSON i URL-encoded tijela zahtjeva
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Backward-compatibility for older frontend bundles that may call /api/api/*
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/api/')) {
    const normalized = req.url.replace('/api/api/', '/api/')
    console.warn('[API PATH NORMALIZED]', { from: req.url, to: normalized })
    req.url = normalized
  }
  next()
})

// ✅ MySQL session store konfiguracija
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'liftelo',
  port: process.env.DB_PORT || 3306
});

console.log('[SESSION INIT CHECK]', {
  SESSION_SECRET_EXISTS: Boolean(sessionSecret)
});

app.use(session({
  name: 'liftelo.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
  }
}));

// ✅ Company context (Phase 3)
app.use(async (req, res, next) => {
  req.companyId = req.session?.active_company_id ?? null;

  // Multi-company disabled: keep non-superadmin sessions pinned to their primary company
  // (also fixes sessions that were already switched to another company before the flag was turned off).
  const userId = req.session?.user_id;
  if (userId && req.session?.global_role !== 'superadmin' && !isMultiCompanyEnabled()) {
    try {
      const primary = await getPrimaryMembership(userId);
      if (primary && Number(primary.company_id) !== Number(req.session.active_company_id)) {
        req.session.active_company_id = primary.company_id;
        if (req.session.user) {
          req.session.user.company_id = primary.company_id;
          req.session.user.role = primary.role;
        }
        req.companyId = primary.company_id;
        await new Promise((resolve) => req.session.save(() => resolve(null)));
      }
    } catch (err) {
      console.error('Failed to pin primary company:', err);
    }
  }

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
      return req.session.destroy(() => res.status(401).json({ error: 'Account disabled', code: 'account_disabled' }));
    }
    return next();
  } catch (err) {
    console.error('Greška pri provjeri deaktivacije korisnika:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ✅ Require company context for authenticated JSON API routes
const requireCompanyContext = async (req, res, next) => {
  const allowWithoutCompanyContext =
    req.baseUrl === '/api/users' && req.path === '/companies' && req.method === 'POST';

  if (allowWithoutCompanyContext) {
    return next();
  }

  // Tenant isolation: every company route needs an authenticated session (previously an anonymous
  // request fell through with req.companyId = null). PDF routes get the same membership check as all others.
  const userId = req.session?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  }

  if (req.session?.global_role === 'superadmin') {
    return next();
  }

  if (!req.companyId) {
    try {
      const [rows] = await db.query(
        `SELECT uc.company_id
         FROM user_companies uc
         LEFT JOIN users u ON u.id = uc.user_id
         WHERE uc.user_id = ?
         ORDER BY (uc.company_id = u.last_active_company_id) DESC, uc.company_id ASC
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
    return res.status(401).json({ error: 'Missing company context', code: 'missing_company_context' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, req.companyId]
    );

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    if (req.session?.user && req.session.user.role !== membership.role) {
      req.session.user.role = membership.role;
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
    console.error('Failed to verify company membership', err);
    return res.status(500).json({ error: 'Database error' });
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
      return res.status(500).json({ error: 'Server error' });
    }
  });
}

// ✅ Staticki fajlovi
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard', express.static(path.join(__dirname, 'public/dashboard')));
// Uploads are tenant data: require a session whose company owns the file (see utils/uploadsAccess.js),
// and never let uploaded HTML/SVG/etc. run as a page on the app origin.
const { uploadsAccess, uploadsStaticOptions } = require('./utils/uploadsAccess');
// Serve uploads from /uploads (not from /public/uploads)
app.use('/uploads', uploadsAccess, express.static(path.join(__dirname, 'uploads'), uploadsStaticOptions));
// Serve uploads via /api/uploads for reverse-proxy setups that only forward /api
app.use('/api/uploads', uploadsAccess, express.static(path.join(__dirname, 'uploads'), uploadsStaticOptions));

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
      return req.session.destroy(() => res.status(401).json({ error: 'Session expired', code: 'session_expired' }));
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
const { FILE_TYPE_ERRORS } = require('./utils/uploadErrors');
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
const billingRouter = require('./routes/billing');
const billingWebhookRouter = require('./routes/billing-webhook');
const { ensureCompanySubscription, checkRoleCapacity, roleLimitErrorBody, getAccessState } = require('./utils/subscriptions');
const { isMultiCompanyEnabled } = require('./utils/features');
const { getPrimaryMembership } = require('./utils/membership');
const { startEmailWorker } = require('./utils/email-worker');

const isSafeMethod = (method) => ['GET', 'HEAD', 'OPTIONS'].includes(method);
// Technicians lose only the creation of new RMS visits and interventions when the workspace is locked.
const technicianLockedCreateRoutes = new Set(['/api/rms', '/api/rms-visits', '/api/interventions']);

// Writes that must keep working for everyone (own profile, read-only POSTs, creating a new company).
const isWriteExempt = (req) =>
  (req.baseUrl === '/api/users' && (req.path === '/companies' || req.path.startsWith('/me/'))) ||
  (req.baseUrl === '/api/records' && req.path === '/filter') ||
  (req.baseUrl === '/api/filters' && req.path === '/filter');

// Write gate for company routes:
//  - viewer: read-only always
//  - locked workspace (trial ended / unpaid): admin read-only, technician cannot create RMS/interventions
const requireSubscriptionAccess = async (req, res, next) => {
  const userId = req.session?.user_id;

  if (!userId) {
    return next();
  }

  if (req.session?.global_role === 'superadmin') {
    return next();
  }

  if (!req.companyId) {
    return next();
  }

  if (isSafeMethod(req.method)) {
    return next();
  }

  if (isWriteExempt(req)) {
    return next();
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, req.companyId]
    );
    const role = membership?.role;

    if (role === 'viewer') {
      return res.status(403).json({
        error: 'Viewers have read-only access and cannot create or change data',
        code: 'viewer_read_only',
      });
    }

    const subscription = await ensureCompanySubscription(req.companyId);
    req.subscription = subscription;

    const access = getAccessState(subscription);
    if (!access.locked) {
      return next();
    }

    if (role === 'technician') {
      if (req.method === 'POST' && technicianLockedCreateRoutes.has(req.baseUrl)) {
        return res.status(402).json({
          error: 'The service is currently disabled. Contact your company administrator',
          code: 'service_disabled_technician',
          reason: access.reason,
        });
      }
      return next();
    }

    return res.status(402).json({
      error: 'Subscription required',
      code: 'subscription_locked',
      reason: access.reason,
      status: subscription.status,
    });
  } catch (err) {
    console.error('Subscription access check failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

app.get('/api/companies/:companyId/users', requireCompanyContext, async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = Number(req.params.companyId);
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
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

app.use('/api/users', requireCompanyContext, requireSubscriptionAccess, usersRouter);
app.use('/api/locations', requireCompanyContext, requireSubscriptionAccess, locationsRouter);
app.use('/api/rms', requireCompanyContext, requireSubscriptionAccess, rmsRouter);
app.use('/api/rms-visits', requireCompanyContext, requireSubscriptionAccess, rmsVisitsRouter);
app.use('/api/interventions', requireCompanyContext, requireSubscriptionAccess, interventionsRouter);
app.use('/api/findings', requireCompanyContext, requireSubscriptionAccess, require('./routes/findings'));
app.use('/api/stats', requireCompanyContext, requireSubscriptionAccess, statsRouter);
app.use('/api/home', requireCompanyContext, requireSubscriptionAccess, homeRouter);
app.use('/api/elevators', requireCompanyContext, requireSubscriptionAccess, elevatorsRouter);
app.use('/api/rms-pdf', requireCompanyContext, rmsPdfRouter);
app.use('/api/records', requireCompanyContext, requireSubscriptionAccess, recordsRoutes);
// export first: GET only, so it also works for a locked (read-only) company; admin check is inside the router
app.use('/api/company/export', requireCompanyContext, requireSubscriptionAccess, require('./routes/company-export'));
app.use('/api/company', requireCompanyContext, requireSubscriptionAccess, companyRouter);
app.use('/api/signup', signupRouter);
app.use('/api/legal', require('./routes/legal'));
app.use('/api/work-orders', requireCompanyContext, requireSubscriptionAccess, workOrdersRouter);
app.use('/api/export', requireCompanyContext, requireSubscriptionAccess, exportRouter);
app.use('/api/vehicles', requireCompanyContext, requireSubscriptionAccess, vehiclesRouter);
app.use('/api/rms-overview', requireCompanyContext, requireSubscriptionAccess, rmsOverviewRouter);
app.use('/api/projects', requireCompanyContext, requireSubscriptionAccess, projectsRouter);
app.use('/api/auth', authRouter);
app.use('/api/reports', requireCompanyContext, requireSubscriptionAccess, reportsRouter);
app.use('/api/superadmin', superadminRouter);
app.use('/api/billing', billingWebhookRouter);
app.use('/api/billing', requireCompanyContext, billingRouter);
app.post('/api/switch-company', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = Number(req.body?.company_id);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  }

  if (!companyId) {
    return res.status(400).json({ error: 'Missing company_id', code: 'missing_company_context' });
  }

  if (!isMultiCompanyEnabled() && req.session?.global_role !== 'superadmin') {
    return res.status(403).json({
      error: 'Switching between companies is temporarily disabled',
      code: 'multi_company_disabled',
    });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    const membershipRole = rows[0].role;
    req.session.active_company_id = companyId;
    if (req.session.user) {
      req.session.user.company_id = companyId;
      if (req.session.global_role !== 'superadmin') {
        req.session.user.role = membershipRole;
      }
    }
    await new Promise((resolve, reject) => {
      req.session.save((saveErr) => {
        if (saveErr) {
          reject(saveErr);
          return;
        }
        resolve(null);
      });
    });

    try {
      await db.query('UPDATE users SET last_active_company_id = ? WHERE id = ? LIMIT 1', [companyId, userId]);
    } catch (workspaceErr) {
      console.error('Failed to persist last active company:', workspaceErr);
    }

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
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  }

  if (!normalizedEmail || !role) {
    return res.status(400).json({ error: 'Missing fields', code: 'missing_required_fields' });
  }

  const allowedRoles = ['admin', 'technician', 'viewer'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role', code: 'invalid_role' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    if (req.session?.global_role !== 'superadmin') {
      const access = getAccessState(await ensureCompanySubscription(companyId));
      if (access.locked) {
        return res.status(402).json({
          error: 'Subscription required',
          code: 'subscription_locked',
          reason: access.reason,
        });
      }
    }

    const capacity = await checkRoleCapacity(companyId, role);
    if (!capacity.allowed) {
      await logAudit({
        userId,
        companyId,
        action: 'seat_limit_blocked_invite',
        metadata: { role, limit: capacity.limit, used: capacity.used, pending_invites: capacity.reserved }
      });

      return res.status(409).json(roleLimitErrorBody(capacity));
    }

    const [[existingUser]] = await db.query(
      `SELECT id, email, is_active, disabled_at
       FROM users
       WHERE LOWER(email) = LOWER(?)
       LIMIT 1`,
      [normalizedEmail]
    );

    if (existingUser) {
      if (existingUser.disabled_at || existingUser.is_active === 0) {
        return res.status(409).json({ error: 'User account is inactive', code: 'user_account_inactive' });
      }

      const [[alreadyMember]] = await db.query(
        'SELECT 1 FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
        [existingUser.id, companyId]
      );

      if (alreadyMember) {
        return res.status(409).json({ error: 'User is already a member of this company', code: 'already_member' });
      }

      await db.query(
        `INSERT IGNORE INTO user_companies (user_id, company_id, role, invited_by)
         VALUES (?, ?, ?, ?)`,
        [existingUser.id, companyId, role, userId]
      );

      await db.query(
        'UPDATE users SET company_id = COALESCE(company_id, ?) WHERE id = ? LIMIT 1',
        [companyId, existingUser.id]
      );

      await logAudit({
        userId,
        companyId,
        action: 'invite_existing_user',
        metadata: { email: normalizedEmail, role, targetUserId: existingUser.id }
      });

      return res.status(201).json({
        success: true,
        mode: 'existing_user_added',
      });
    }

    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const [[pendingInvite]] = await db.query(
      `SELECT id
       FROM invitations
       WHERE company_id = ?
         AND email = ?
         AND status = 'pending'
         AND expires_at > NOW()
       LIMIT 1`,
      [companyId, normalizedEmail]
    );

    if (pendingInvite) {
      return res.status(200).json({ success: true, mode: 'invite_already_pending' });
    }

    await db.query(
      `INSERT INTO invitations (email, company_id, role, token, expires_at, status, invited_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [normalizedEmail, companyId, role, token, expiresAt, userId]
    );

    await logAudit({
      userId,
      companyId,
      action: 'invite_user',
      metadata: { email: normalizedEmail, role }
    });

    console.log(`[INVITE LINK] http://localhost:5173/accept-invite?token=${token}`);

    return res.status(201).json({ success: true, mode: 'invite_created' });
  } catch (err) {
    console.error('Invite user error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/invitations/accept', async (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !password) {
    return res.status(400).json({ error: 'Missing token or password', code: 'missing_required_fields' });
  }

  try {
    const [[invite]] = await db.query(
      `SELECT * FROM invitations WHERE token = ? LIMIT 1`,
      [token]
    );

    if (!invite || invite.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid or expired token', code: 'invalid_or_expired_token' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await db.query('UPDATE invitations SET status = ? WHERE id = ?', ['expired', invite.id]);
      return res.status(400).json({ error: 'Invite expired', code: 'invite_expired' });
    }

    const [[existingUser]] = await db.query(
      'SELECT id, email, global_role FROM users WHERE email = ? LIMIT 1',
      [invite.email]
    );

    // Re-check the plan limit at acceptance time (limits may have changed since the invite was sent).
    // The invite itself is already reserved, so it is excluded from the pending count.
    let alreadyMember = false;
    if (existingUser) {
      const [[memberRow]] = await db.query(
        'SELECT 1 AS found FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
        [existingUser.id, invite.company_id]
      );
      alreadyMember = Boolean(memberRow);
    }
    if (!alreadyMember) {
      const capacity = await checkRoleCapacity(invite.company_id, invite.role, { excludeInviteId: invite.id });
      if (!capacity.allowed) {
        await logAudit({
          userId: existingUser?.id ?? null,
          companyId: invite.company_id,
          action: 'seat_limit_blocked_invite_accept',
          metadata: { role: invite.role, limit: capacity.limit, used: capacity.used }
        });
        return res.status(409).json(roleLimitErrorBody(capacity));
      }
    }

    let userId = existingUser?.id ?? null;
    let globalRole = existingUser?.global_role || 'user';

    if (!userId && termsRequiredButMissing(req.body)) {
      // a brand-new account must accept the Terms + Privacy Policy (existing accounts accept via the in-app dialog)
      return res.status(400).json({ error: 'Acceptance of the Terms and Privacy Policy is required', code: 'terms_required' });
    }

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
      if (shouldRecordAcceptance(req.body)) await recordAcceptances({ userId, companyId: invite.company_id, method: 'invitation' });
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
    return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  }

  try {
    const [[membership]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    const [result] = await db.query(
      `UPDATE invitations
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW() AND company_id = ?`,
      [companyId]
    );

    return res.json({ success: true, updated: result.affectedRows });
  } catch (err) {
    console.error('Cleanup expired invites error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.use('/api/settings', requireCompanyContext, requireSubscriptionAccess, settingsRouter);
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
  res.status(404).json({ message: 'Not found', error: 'Not found', code: 'not_found' });
});

// Last-resort error handler (multer file-type errors, body parser errors, CORS...). Same status codes as
// Express' default handler, but JSON and never leaking err.message to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[unhandled error]', req.method, req.originalUrl, err);
  const status = Number(err?.status || err?.statusCode);
  const httpStatus = status >= 400 && status < 600 ? status : 500;
  if (FILE_TYPE_ERRORS.has(err?.message)) {
    return res.status(httpStatus).json({ error: 'Invalid file type', code: 'invalid_file_type' });
  }
  if (httpStatus === 413) {
    return res.status(413).json({ error: 'Request is too large', code: 'request_too_large' });
  }
  if (httpStatus < 500) {
    return res.status(httpStatus).json({ error: 'Invalid request', code: 'invalid_request' });
  }
  return res.status(httpStatus).json({ error: 'Internal server error' });
});

// ✅ Pokreni cron job za dnevnu statistiku
const { startDailyStatsCron } = require('./utils/daily-stats-cron');
startDailyStatsCron();

// ✅ Pokretanje servera
app.listen(PORT, () => {
  console.log(`✅ Liftelo backend radi na http://localhost:${PORT}`);
  if (isEmailWorkerEnabled) {
    startEmailWorker();
  } else {
    console.log('[email-worker] disabled by EMAIL_WORKER_ENABLED=false');
  }
});
