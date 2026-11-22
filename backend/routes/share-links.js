// Read-only share link ("building manager page") of ONE location. Admin management endpoints, mounted in index.js at
// /api/locations/:id/share-link behind requireCompanyContext + requireSubscriptionAccess.
// The token is random (32 bytes, base64url) and is returned ONCE by POST; only its SHA-256 hash is stored.
// Rows are INSERT-only; DELETE (revoke) just sets revoked_at.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { logAudit } = require('../utils/auditLog');
const { isCompanyAdmin } = require('../utils/membership');
const { hashShareToken } = require('../utils/shareLinks');

const router = express.Router({ mergeParams: true });
const MAX_EXPIRY_DAYS = 730;

const noTable = (err) => err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE');
const unavailable = (res) => res.status(503).json({ error: 'Share links are not available yet', code: 'share_unavailable' });

router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try {
    const admin = await isCompanyAdmin({ userId: req.session?.user_id, companyId: req.companyId, globalRole: req.session?.global_role });
    if (!admin) return res.status(403).json({ error: 'Admin only', code: 'forbidden' });
    const locationId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(locationId) || locationId <= 0) return res.status(404).json({ error: 'Location not found', code: 'location_not_found' });
    const [[loc]] = await db.query('SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1', [locationId, req.companyId]);
    if (!loc) return res.status(404).json({ error: 'Location not found', code: 'location_not_found' });
    req.shareLocationId = locationId;
    return next();
  } catch (err) {
    console.error('Share link gate failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// GET -> current link state (never the token)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, created_at, expires_at, (expires_at IS NOT NULL AND expires_at <= NOW()) AS expired
       FROM location_share_links
       WHERE company_id = ? AND location_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [req.companyId, req.shareLocationId]
    );
    const row = rows[0];
    if (!row) return res.json({ enabled: false, link: null });
    const expired = Boolean(Number(row.expired));
    return res.json({
      enabled: !expired,
      link: { id: row.id, created_at: row.created_at, expires_at: row.expires_at, expired }
    });
  } catch (err) {
    if (noTable(err)) return unavailable(res);
    console.error('Share link status failed:', err);
    return res.status(500).json({ error: 'Failed to load share link' });
  }
});

// POST { expires_at?: 'YYYY-MM-DD' | null } -> revokes any active link of the location and creates a new one (= regenerate).
router.post('/', async (req, res) => {
  let expiresAt = null;
  const rawExpiry = req.body?.expires_at;
  if (rawExpiry !== undefined && rawExpiry !== null && rawExpiry !== '') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(rawExpiry));
    const end = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59)) : null;
    const valid = end && !Number.isNaN(end.getTime()) && end.getUTCMonth() === Number(m[2]) - 1;
    if (!valid || end.getTime() <= Date.now() || end.getTime() > Date.now() + MAX_EXPIRY_DAYS * 86400000) {
      return res.status(400).json({ error: 'expires_at must be a future date (YYYY-MM-DD), at most 2 years ahead', code: 'invalid_expiry' });
    }
    expiresAt = `${m[1]}-${m[2]}-${m[3]} 23:59:59`;
  }

  const token = crypto.randomBytes(32).toString('base64url'); // 256 bits, 43 chars
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [revoked] = await connection.query(
      'UPDATE location_share_links SET revoked_at = NOW() WHERE company_id = ? AND location_id = ? AND revoked_at IS NULL',
      [req.companyId, req.shareLocationId]
    );
    const [ins] = await connection.query(
      'INSERT INTO location_share_links (company_id, location_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?, ?)',
      [req.companyId, req.shareLocationId, hashShareToken(token), req.session?.user_id ?? null, expiresAt]
    );
    await logAudit({
      userId: req.session?.user_id ?? null, companyId: req.companyId, connection, throwOnError: true,
      action: 'location_share_link_created',
      metadata: { location_id: req.shareLocationId, link_id: ins.insertId, expires_at: expiresAt, replaced: revoked.affectedRows }
    });
    await connection.commit();
    return res.status(201).json({ id: ins.insertId, token, path: `/s/${token}`, expires_at: expiresAt });
  } catch (err) {
    try { await connection.rollback(); } catch { /* ignore */ }
    if (noTable(err)) return unavailable(res);
    console.error('Share link create failed:', err);
    return res.status(500).json({ error: 'Failed to create share link' });
  } finally {
    connection.release();
  }
});

// DELETE -> revoke (immediately dead; the row stays)
router.delete('/', async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE location_share_links SET revoked_at = NOW() WHERE company_id = ? AND location_id = ? AND revoked_at IS NULL',
      [req.companyId, req.shareLocationId]
    );
    if (result.affectedRows > 0) {
      await logAudit({
        userId: req.session?.user_id ?? null, companyId: req.companyId, action: 'location_share_link_revoked',
        metadata: { location_id: req.shareLocationId, revoked: result.affectedRows }
      });
    }
    return res.json({ revoked: result.affectedRows });
  } catch (err) {
    if (noTable(err)) return unavailable(res);
    console.error('Share link revoke failed:', err);
    return res.status(500).json({ error: 'Failed to revoke share link' });
  }
});

module.exports = router;
