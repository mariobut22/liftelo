const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { logAudit } = require('../utils/auditLog');
const { getUserIdentities } = require('../utils/identities');
const { establishSessionForUser } = require('../utils/sessionAuth');
const { linkIdentityToUser, findUserByEmail, findUserByProviderIdentity } = require('../utils/identities');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

const parseCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isSecureOrLocalhost = (urlValue) => {
  try {
    const url = new URL(urlValue);
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return true;
    return false;
  } catch {
    return false;
  }
};

const getGoogleConfig = () => ({
  clientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
  clientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
  redirectUri: (process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim(),
  appUrl: (process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/$/, ''),
});

const getAppleConfig = () => ({
  clientId: (process.env.APPLE_OAUTH_CLIENT_ID || '').trim(),
  clientSecret: (process.env.APPLE_OAUTH_CLIENT_SECRET || '').trim(),
  redirectUri: (process.env.APPLE_OAUTH_REDIRECT_URI || '').trim(),
  appUrl: (process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/$/, ''),
});

const decodeJwtPayload = (token) => {
  const payloadSegment = String(token || '').split('.')[1];
  if (!payloadSegment) return null;
  const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json);
};

const sanitizeReturnTo = (value) => {
  const returnTo = String(value || '').trim();
  if (!returnTo) return '/dashboard';
  if (!returnTo.startsWith('/')) return '/dashboard';
  if (returnTo.startsWith('//')) return '/dashboard';
  return returnTo;
};

const redirectToApp = (res, appUrl, path, params = {}) => {
  const url = new URL(path, `${appUrl}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return res.redirect(url.toString());
};

const ensureGoogleConfigured = (res) => {
  const config = getGoogleConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    res.status(503).json({ error: 'Google OAuth is not configured' });
    return null;
  }

  if (!isSecureOrLocalhost(config.redirectUri) || !isSecureOrLocalhost(config.appUrl)) {
    res.status(503).json({ error: 'Google OAuth URL configuration is invalid' });
    return null;
  }

  const allowedOrigins = parseCsv(process.env.OAUTH_ALLOWED_APP_ORIGINS);
  const defaultOrigin = new URL(config.appUrl).origin;
  const effectiveAllowedOrigins = allowedOrigins.length > 0 ? allowedOrigins : [defaultOrigin];
  if (!effectiveAllowedOrigins.includes(defaultOrigin)) {
    res.status(503).json({ error: 'APP_URL is not in OAUTH_ALLOWED_APP_ORIGINS' });
    return null;
  }

  return config;
};

const ensureAppleConfigured = (res) => {
  const config = getAppleConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    res.status(503).json({ error: 'Apple OAuth is not configured' });
    return null;
  }

  if (!isSecureOrLocalhost(config.redirectUri) || !isSecureOrLocalhost(config.appUrl)) {
    res.status(503).json({ error: 'Apple OAuth URL configuration is invalid' });
    return null;
  }

  const allowedOrigins = parseCsv(process.env.OAUTH_ALLOWED_APP_ORIGINS);
  const defaultOrigin = new URL(config.appUrl).origin;
  const effectiveAllowedOrigins = allowedOrigins.length > 0 ? allowedOrigins : [defaultOrigin];
  if (!effectiveAllowedOrigins.includes(defaultOrigin)) {
    res.status(503).json({ error: 'APP_URL is not in OAUTH_ALLOWED_APP_ORIGINS' });
    return null;
  }

  return config;
};

const clearGoogleOauthState = async (req) => {
  if (!req.session?.oauth_google) return;
  delete req.session.oauth_google;
  await new Promise((resolve) => {
    req.session.save(() => resolve(null));
  });
};

const clearAppleOauthState = async (req) => {
  if (!req.session?.oauth_apple) return;
  delete req.session.oauth_apple;
  await new Promise((resolve) => {
    req.session.save(() => resolve(null));
  });
};

const consumePendingInvitesForUser = async ({ userId, email }) => {
  const [pendingInvites] = await db.query(
    `SELECT id, company_id, role, invited_by
     FROM invitations
     WHERE email = ?
       AND status = 'pending'
       AND expires_at > NOW()
     ORDER BY created_at ASC`,
    [email]
  );

  for (const invite of pendingInvites) {
    await db.query(
      `INSERT IGNORE INTO user_companies (user_id, company_id, role, invited_by)
       VALUES (?, ?, ?, ?)` ,
      [userId, invite.company_id, invite.role, invite.invited_by]
    );

    await db.query('UPDATE invitations SET status = ? WHERE id = ? LIMIT 1', ['accepted', invite.id]);
  }

  if (pendingInvites.length > 0) {
    const firstCompanyId = pendingInvites[0].company_id;
    await db.query(
      'UPDATE users SET company_id = COALESCE(company_id, ?) WHERE id = ? LIMIT 1',
      [firstCompanyId, userId]
    );
  }

  return pendingInvites.length;
};

const provisionInvitedUser = async ({ email }) => {
  const [[invite]] = await db.query(
    `SELECT id, company_id, role, invited_by
     FROM invitations
     WHERE email = ?
       AND status = 'pending'
       AND expires_at > NOW()
     ORDER BY created_at ASC
     LIMIT 1`,
    [email]
  );

  if (!invite) {
    return null;
  }

  const generatedPassword = crypto.randomBytes(32).toString('hex');
  const hashedPassword = await bcrypt.hash(generatedPassword, 10);
  const safeRole = invite.role === 'admin' ? 'admin' : 'technician';

  const [insertResult] = await db.query(
    `INSERT INTO users (username, email, password, password_hash, role, company_id, is_active, is_verified, global_role)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
    [email, email, hashedPassword, hashedPassword, safeRole, invite.company_id]
  );

  const newUserId = insertResult.insertId;

  await db.query(
    `INSERT IGNORE INTO user_companies (user_id, company_id, role, invited_by)
     VALUES (?, ?, ?, ?)` ,
    [newUserId, invite.company_id, invite.role, invite.invited_by]
  );

  await db.query('UPDATE invitations SET status = ? WHERE id = ? LIMIT 1', ['accepted', invite.id]);

  return {
    id: newUserId,
    email,
  };
};

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

router.get('/google/start', async (req, res) => {
  const config = ensureGoogleConfigured(res);
  if (!config) return;

  try {
    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');
    const returnTo = sanitizeReturnTo(req.query.return_to);

    req.session.oauth_google = {
      state,
      nonce,
      return_to: returnTo,
      created_at: Date.now(),
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(null);
      });
    });

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('prompt', 'select_account');

    return res.redirect(authUrl.toString());
  } catch (err) {
    console.error('Google OAuth start error:', err);
    return res.status(500).json({ error: 'Failed to initialize Google login' });
  }
});

router.get('/google/callback', async (req, res) => {
  const config = ensureGoogleConfigured(res);
  if (!config) return;

  const oauthState = req.session?.oauth_google;
  const returnTo = sanitizeReturnTo(oauthState?.return_to);

  const fail = async (reason) => {
    await clearGoogleOauthState(req);
    return redirectToApp(res, config.appUrl, '/login', { oauth_error: reason });
  };

  try {
    if (req.query.error) {
      return await fail('google_auth_denied');
    }

    const state = String(req.query.state || '');
    const code = String(req.query.code || '');
    if (!oauthState || !state || !code || oauthState.state !== state) {
      return await fail('google_state_mismatch');
    }

    if (Date.now() - Number(oauthState.created_at || 0) > 10 * 60 * 1000) {
      return await fail('google_state_expired');
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('Google token exchange failed:', tokenResponse.status, text);
      return await fail('google_token_exchange_failed');
    }

    const tokenPayload = await tokenResponse.json();
    const idToken = tokenPayload.id_token;
    if (!idToken) {
      return await fail('google_missing_id_token');
    }

    const idTokenClaims = decodeJwtPayload(idToken);
    const tokenInfoResponse = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
    if (!tokenInfoResponse.ok) {
      const text = await tokenInfoResponse.text();
      console.error('Google tokeninfo failed:', tokenInfoResponse.status, text);
      return await fail('google_token_validation_failed');
    }

    const tokenInfo = await tokenInfoResponse.json();
    const email = String(tokenInfo.email || '').trim().toLowerCase();
    const sub = String(tokenInfo.sub || '').trim();
    const audience = String(tokenInfo.aud || '').trim();
    const emailVerified = String(tokenInfo.email_verified || '').toLowerCase() === 'true';

    if (!email || !sub || audience !== config.clientId || !emailVerified) {
      return await fail('google_claims_invalid');
    }

    if (oauthState.nonce && idTokenClaims?.nonce && oauthState.nonce !== idTokenClaims.nonce) {
      return await fail('google_nonce_mismatch');
    }

    let user = await findUserByProviderIdentity({ provider: 'google', providerSub: sub });
    if (!user) {
      user = await findUserByEmail(email);
    }

    if (!user) {
      const provisioned = await provisionInvitedUser({ email });
      if (provisioned) {
        user = await findUserByEmail(email);
      }
    }

    if (!user) {
      return await fail('google_account_not_allowed');
    }

    if (user.is_active === 0) {
      return await fail('google_account_inactive');
    }

    await consumePendingInvitesForUser({ userId: user.id, email });

    await linkIdentityToUser({
      userId: user.id,
      provider: 'google',
      providerSub: sub,
      emailAtLinkTime: email,
    });

    const context = await establishSessionForUser(req, user.id);
    if (!context || context.error === 'inactive') {
      return await fail('google_account_inactive');
    }

    if (context.error === 'no_company' && context.user?.global_role !== 'superadmin') {
      return await fail('google_no_company_access');
    }

    await logAudit({
      userId: user.id,
      companyId: context?.activeCompanyId || null,
      action: 'login_google',
      metadata: { ip: req.ip, email },
    });

    await clearGoogleOauthState(req);

    return redirectToApp(res, config.appUrl, returnTo);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return await fail('google_callback_failed');
  }
});

router.get('/apple/start', async (req, res) => {
  const config = ensureAppleConfigured(res);
  if (!config) return;

  try {
    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');
    const returnTo = sanitizeReturnTo(req.query.return_to);

    req.session.oauth_apple = {
      state,
      nonce,
      return_to: returnTo,
      created_at: Date.now(),
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(null);
      });
    });

    const authUrl = new URL(APPLE_AUTH_URL);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('response_mode', 'form_post');
    authUrl.searchParams.set('scope', 'name email');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    return res.redirect(authUrl.toString());
  } catch (err) {
    console.error('Apple OAuth start error:', err);
    return res.status(500).json({ error: 'Failed to initialize Apple login' });
  }
});

const handleAppleCallback = async (req, res) => {
  const config = ensureAppleConfigured(res);
  if (!config) return;

  const oauthState = req.session?.oauth_apple;
  const returnTo = sanitizeReturnTo(oauthState?.return_to);

  const fail = async (reason) => {
    await clearAppleOauthState(req);
    return redirectToApp(res, config.appUrl, '/login', { oauth_error: reason });
  };

  try {
    if (req.body?.error || req.query.error) {
      return await fail('apple_auth_denied');
    }

    const state = String(req.body?.state || req.query.state || '');
    const code = String(req.body?.code || req.query.code || '');
    if (!oauthState || !state || !code || oauthState.state !== state) {
      return await fail('apple_state_mismatch');
    }

    if (Date.now() - Number(oauthState.created_at || 0) > 10 * 60 * 1000) {
      return await fail('apple_state_expired');
    }

    const tokenResponse = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('Apple token exchange failed:', tokenResponse.status, text);
      return await fail('apple_token_exchange_failed');
    }

    const tokenPayload = await tokenResponse.json();
    const idToken = tokenPayload.id_token;
    if (!idToken) {
      return await fail('apple_missing_id_token');
    }

    const claims = decodeJwtPayload(idToken);
    const sub = String(claims?.sub || '').trim();
    const audience = String(claims?.aud || '').trim();
    const email = String(claims?.email || '').trim().toLowerCase();
    const emailVerified = Boolean(claims?.email_verified === true || claims?.email_verified === 'true');

    if (!sub || audience !== config.clientId) {
      return await fail('apple_claims_invalid');
    }

    if (oauthState.nonce && claims?.nonce && oauthState.nonce !== claims.nonce) {
      return await fail('apple_nonce_mismatch');
    }

    let user = await findUserByProviderIdentity({ provider: 'apple', providerSub: sub });
    if (!user && email && emailVerified) {
      user = await findUserByEmail(email);
    }

    if (!user && email && emailVerified) {
      const provisioned = await provisionInvitedUser({ email });
      if (provisioned) {
        user = await findUserByEmail(email);
      }
    }

    if (!user) {
      return await fail('apple_account_not_allowed');
    }

    if (user.is_active === 0) {
      return await fail('apple_account_inactive');
    }

    if (email) {
      await consumePendingInvitesForUser({ userId: user.id, email });
    }

    await linkIdentityToUser({
      userId: user.id,
      provider: 'apple',
      providerSub: sub,
      emailAtLinkTime: email || user.email,
    });

    const context = await establishSessionForUser(req, user.id);
    if (!context || context.error === 'inactive') {
      return await fail('apple_account_inactive');
    }

    if (context.error === 'no_company' && context.user?.global_role !== 'superadmin') {
      return await fail('apple_no_company_access');
    }

    await logAudit({
      userId: user.id,
      companyId: context?.activeCompanyId || null,
      action: 'login_apple',
      metadata: { ip: req.ip, email: email || user.email },
    });

    await clearAppleOauthState(req);
    return redirectToApp(res, config.appUrl, returnTo);
  } catch (err) {
    console.error('Apple OAuth callback error:', err);
    return await fail('apple_callback_failed');
  }
};

router.post('/apple/callback', async (req, res) => handleAppleCallback(req, res));
router.get('/apple/callback', async (req, res) => handleAppleCallback(req, res));

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

router.get('/identities/me', async (req, res) => {
  const userId = req.session?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const identities = await getUserIdentities(userId);
    return res.json({ identities });
  } catch (err) {
    console.error('Identities fetch error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
