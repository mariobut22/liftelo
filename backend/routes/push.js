const express = require('express');
const db = require('../db');
const { isPushEnabled, getPublicKey, pushToUsers, endpointHash } = require('../utils/push');
const { translate } = require('../utils/i18n/translate');
const { getRecipientLanguage } = require('../utils/i18n/getResolvedLanguage');

/*
 * Web Push subscriptions of the SESSION USER (mounted at /api/push behind requireCompanyContext). A user can only ever
 * read/create/delete his own subscriptions; every statement carries company_id (req.companyId) and user_id (session).
 */
const router = express.Router();

const MAX_SUBSCRIPTIONS_PER_USER = 20;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

const notAvailable = (res) => res.status(409).json({ error: 'Push notifications are not available', code: 'push_not_available' });
const notConfigured = (res) => res.status(409).json({ error: 'Push notifications are not configured on this server', code: 'push_not_configured' });
const invalid = (res) => res.status(400).json({ error: 'Invalid push subscription', code: 'invalid_subscription' });

const isEndpoint = (value) => {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const isKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= 255 && BASE64URL.test(value);

// { enabled, public_key }: the UI hides the whole feature when enabled is false
router.get('/config', (req, res) => {
  const enabled = isPushEnabled();
  res.json({ enabled, public_key: enabled ? getPublicKey() : null });
});

router.post('/subscribe', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  if (!userId || !companyId) return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  if (!isPushEnabled()) return notConfigured(res);

  const endpoint = req.body?.endpoint;
  const p256dh = req.body?.keys?.p256dh;
  const auth = req.body?.keys?.auth;
  if (!isEndpoint(endpoint) || !isKey(p256dh) || !isKey(auth)) return invalid(res);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 255) || null;
  const hash = endpointHash(endpoint);

  try {
    const [[existing]] = await db.query(
      'SELECT id FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ? AND company_id = ? LIMIT 1',
      [hash, userId, companyId]
    );
    if (!existing) {
      const [[count]] = await db.query(
        'SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ? AND company_id = ?',
        [userId, companyId]
      );
      if (Number(count.c) >= MAX_SUBSCRIPTIONS_PER_USER) {
        return res.status(409).json({ error: 'Too many push subscriptions', code: 'too_many_subscriptions' });
      }
    }
    // same device (endpoint) subscribing again - possibly as another user on a shared phone - re-assigns the row
    await db.query(
      `INSERT INTO push_subscriptions (company_id, user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE company_id = VALUES(company_id), user_id = VALUES(user_id), endpoint = VALUES(endpoint),
                               p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
      [companyId, userId, endpoint, hash, p256dh, auth, userAgent]
    );
    return res.status(201).json({ subscribed: true });
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return notAvailable(res);
    console.error('Push subscribe failed:', err.code || err.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  if (!userId || !companyId) return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  const endpoint = req.body?.endpoint;
  if (!isEndpoint(endpoint)) return invalid(res);
  try {
    const [result] = await db.query(
      'DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ? AND company_id = ?',
      [endpointHash(endpoint), userId, companyId]
    );
    return res.json({ removed: result.affectedRows });
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json({ removed: 0 });
    console.error('Push unsubscribe failed:', err.code || err.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Sends a test push to the session user's OWN subscriptions (nobody else's)
router.post('/test', async (req, res) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  if (!userId || !companyId) return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  if (!isPushEnabled()) return notConfigured(res);
  try {
    const [[row]] = await db.query(
      `SELECT u.language, c.default_language
       FROM users u INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ?
       LEFT JOIN companies c ON c.id = uc.company_id
       WHERE u.id = ? LIMIT 1`,
      [companyId, userId]
    );
    const language = await getRecipientLanguage({ userId, companyId, userLanguage: row?.language, companyLanguage: row?.default_language });
    const result = await pushToUsers([userId], {
      title: translate('notifications:pushTest.title', language),
      body: translate('notifications:pushTest.message', language),
      link: '/dashboard',
      tag: 'push-test'
    });
    return res.json(result);
  } catch (err) {
    console.error('Push test failed:', err.code || err.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
