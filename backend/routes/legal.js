const express = require('express');
const { getAcceptanceStatus, getRawAcceptanceStatus, recordAcceptances, isAcceptanceEnabled, LEGAL_DOCUMENTS } = require('../utils/legal');
const { logAudit } = require('../utils/auditLog');

// Mounted WITHOUT requireSubscriptionAccess (a locked workspace must still be able to accept) and without a company
// context (any signed-in user, also a superadmin without a company). Enforcement is in the UI; the server only records.
const router = express.Router();

const requireSignedIn = (req, res, next) => {
  if (!req.session?.user_id) {
    return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  }
  return next();
};

// Tiny in-memory per-IP limit for the public config lookup (60 requests / minute)
const configHits = new Map();
const configRateLimited = (ip) => {
  const now = Date.now();
  const entry = configHits.get(ip);
  if (!entry || now - entry.start > 60 * 1000) {
    configHits.set(ip, { start: now, count: 1 });
    if (configHits.size > 5000) configHits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > 60;
};

// PUBLIC (no auth, no secrets): is the mandatory acceptance switched on? The frontend reads it for register / invite pages.
router.get('/config', (req, res) => {
  if (configRateLimited(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many requests', code: 'too_many_attempts' });
  }
  res.set('Cache-Control', 'public, max-age=60');
  return res.json({ acceptance_enabled: isAcceptanceEnabled() });
});

// What the signed-in user still has to accept
router.get('/status', requireSignedIn, async (req, res) => {
  try {
    return res.json(await getAcceptanceStatus(req.session.user_id));
  } catch (err) {
    console.error('Legal status error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Accepts the CURRENT versions of every document not yet accepted. Body: { accept: true }
router.post('/accept', requireSignedIn, async (req, res) => {
  if (req.body?.accept !== true) {
    return res.status(400).json({ error: 'Acceptance of the Terms and Privacy Policy is required', code: 'terms_required' });
  }

  const userId = req.session.user_id;
  const companyId = req.session.active_company_id || null;
  try {
    const status = await getRawAcceptanceStatus(userId);
    const pending = LEGAL_DOCUMENTS.filter((document) => !status.accepted[document]);
    if (pending.length > 0) {
      await recordAcceptances({ userId, companyId, method: 'prompt', documents: pending });
      await logAudit({
        userId,
        companyId,
        action: 'legal_accept',
        metadata: { documents: pending.map((document) => ({ document, version: status.versions[document] })) },
      });
    }
    return res.json(await getAcceptanceStatus(userId));
  } catch (err) {
    console.error('Legal accept error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
