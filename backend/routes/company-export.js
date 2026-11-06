const express = require('express');
const db = require('../db');
const { logAudit } = require('../utils/auditLog');
const { buildExportArchive, planFiles, exportRetryAfterSeconds } = require('../utils/companyExport');

// Company data export for the company admin (data portability / switching provider).
// Mounted behind requireCompanyContext + requireSubscriptionAccess; both only GET, and GET is a "safe method" in the
// subscription gate, so a LOCKED company (expired trial, unpaid) can still export its data. Viewers/technicians: 403.
const router = express.Router();

// companies currently being exported (one export at a time per company; the cooldown itself is in the audit log)
const inProgress = new Set();

const requireCompanyAdmin = async (req, res, next) => {
  const userId = req.session?.user_id;
  const companyId = req.companyId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated', code: 'not_authenticated' });
  if (!companyId) return res.status(400).json({ error: 'Missing company context', code: 'missing_company_context' });
  try {
    const [[row]] = await db.query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!row || row.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }
    return next();
  } catch (err) {
    console.error('Export admin check failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

// What the next download would contain + whether the cooldown allows it now (does NOT count as an export)
router.get('/check', requireCompanyAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    const retryAfter = await exportRetryAfterSeconds(companyId);
    const { summary } = await planFiles(companyId);
    return res.json({
      allowed: retryAfter === 0 && !inProgress.has(companyId),
      retry_after_seconds: retryAfter,
      in_progress: inProgress.has(companyId),
      files: summary,
    });
  } catch (err) {
    console.error('Export check failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// The ZIP download
router.get('/', requireCompanyAdmin, async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session.user_id;

  if (inProgress.has(companyId)) {
    return res.status(429).json({ error: 'An export of this company is already running', code: 'export_in_progress' });
  }

  let locked = false;
  try {
    const retryAfter = await exportRetryAfterSeconds(companyId);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Export was requested recently, try again later', code: 'export_rate_limited', retry_after_seconds: retryAfter });
    }

    inProgress.add(companyId);
    locked = true;
    // the audit row doubles as the rate-limit marker, so it is written BEFORE any data leaves the server
    await logAudit({ userId, companyId, action: 'company_export', metadata: { format: 'zip' }, throwOnError: true });

    const { archive, tables, plan } = await buildExportArchive(companyId, { generatedBy: userId });

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.status(200);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="liftelo-export-company-${companyId}-${day}.zip"`,
      'Cache-Control': 'no-store',
    });

    const release = () => {
      if (locked) {
        inProgress.delete(companyId);
        locked = false;
      }
    };
    archive.on('error', (err) => {
      console.error('Company export failed while streaming:', err);
      release();
      res.destroy(err);
    });
    res.on('close', () => {
      if (!res.writableFinished) archive.abort(); // client went away: stop reading from the database
      release();
    });
    res.on('finish', () => {
      void logAudit({
        userId,
        companyId,
        action: 'company_export_completed',
        metadata: {
          bytes: archive.pointer(),
          files_included: plan.summary.included,
          files: plan.summary.count,
          rows: Object.fromEntries(Object.entries(tables).map(([name, s]) => [name, s.rows])),
        },
      });
    });

    archive.pipe(res);
    await archive.finalize();
    return undefined;
  } catch (err) {
    if (locked) inProgress.delete(companyId);
    console.error('Company export failed:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Export failed' });
    return res.destroy(err);
  }
});

module.exports = router;
