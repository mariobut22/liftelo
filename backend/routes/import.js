'use strict';
/*
 * Import of locations + elevators from Excel/CSV (admin only).
 *   GET  /api/import/template.xlsx|.csv?lang=hr|en   ready template
 *   POST /api/import/locations/preview               multipart `file` -> row-by-row validation report, writes NOTHING
 *   POST /api/import/locations/apply                 multipart `file` (+ client_request_id, include_warnings) -> creates in ONE transaction
 * Apply takes the file again and revalidates it from scratch (no trust in anything the client parsed); replays of the same
 * client_request_id return the stored counts (the idempotency record is the audit_logs row written in the same transaction).
 * Mounted behind requireCompanyContext + requireSubscriptionAccess (viewer 403, locked company 402).
 */
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { isCompanyAdmin } = require('../utils/membership');
const { logAudit } = require('../utils/auditLog');
const { parseClientRequestId } = require('../utils/clientRequestId');
const {
  LIMITS, ImportError, locationKey, parseImportFile, buildReport, buildPlan, publicReport
} = require('../utils/locationImport');
const { buildTemplateXlsx, buildTemplateCsv, templateFileName, normalizeLang } = require('../utils/locationImportTemplate');

const router = express.Router();
const AUDIT_ACTION = 'locations_import';

const requireAdmin = async (req, res, next) => {
  try {
    const ok = req.companyId && await isCompanyAdmin({
      userId: req.session?.user_id, companyId: req.companyId, globalRole: req.session?.global_role
    });
    if (!ok) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    return next();
  } catch (err) {
    console.error('Import admin check failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.MAX_BYTES, files: 1, fields: 8, parts: 10 }
}).single('file');

const receiveFile = (req, res, next) => {
  uploader(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'The file is too large', code: 'import_file_too_large' });
    }
    return res.status(400).json({ error: 'Upload failed', code: 'upload_failed' });
  });
};

const sendImportError = (res, err, label) => {
  if (err instanceof ImportError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(label, err);
  return res.status(500).json({ error: 'Import failed' });
};

const keysOf = (rows) => new Set(rows.map((r) => locationKey(r.name, r.address)));
const flag = (v) => v === '1' || v === 'true' || v === true;

router.get(['/template.xlsx', '/template.csv'], requireAdmin, async (req, res) => {
  try {
    const lang = normalizeLang(req.query.lang);
    const isCsv = req.path.endsWith('.csv');
    const body = isCsv ? buildTemplateCsv(lang) : Buffer.from(await buildTemplateXlsx(lang));
    res.set({
      'Content-Type': isCsv ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${templateFileName(isCsv ? 'csv' : 'xlsx', lang)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(body);
  } catch (err) {
    console.error('Import template failed:', err);
    return res.status(500).json({ error: 'Failed to build the template' });
  }
});

router.post('/locations/preview', requireAdmin, receiveFile, async (req, res) => {
  try {
    const parsed = await parseImportFile(req.file);
    const [existing] = await db.query('SELECT name, address FROM locations WHERE company_id = ?', [req.companyId]);
    const { report, groups } = buildReport(parsed.rows, keysOf(existing));
    return res.json(publicReport(report, groups, parsed.columns, parsed.type));
  } catch (err) {
    return sendImportError(res, err, 'Import preview failed:');
  }
});

router.post('/locations/apply', requireAdmin, receiveFile, async (req, res) => {
  let connection;
  try {
    const parsed = await parseImportFile(req.file);
    const includeWarnings = flag(req.body?.include_warnings);
    const clientRequestId = parseClientRequestId(req.body?.client_request_id);
    const companyId = req.companyId;

    connection = await db.getConnection();
    await connection.beginTransaction();
    // one import per company at a time: serialises replays and concurrent imports
    await connection.query('SELECT id FROM companies WHERE id = ? FOR UPDATE', [companyId]);

    if (clientRequestId) {
      const [prev] = await connection.query(
        `SELECT metadata FROM audit_logs
         WHERE company_id = ? AND action = ? AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.client_request_id')) = ?
         ORDER BY id ASC LIMIT 1`,
        [companyId, AUDIT_ACTION, clientRequestId]
      );
      if (prev.length) {
        await connection.rollback();
        const meta = typeof prev[0].metadata === 'string' ? JSON.parse(prev[0].metadata) : (prev[0].metadata || {});
        return res.json({
          locations_created: Number(meta.locations_created) || 0,
          elevators_created: Number(meta.elevators_created) || 0,
          skipped: Number(meta.skipped) || 0,
          duplicate: true
        });
      }
    }

    // revalidated against the CURRENT locations of this company, inside the transaction
    const [existing] = await connection.query('SELECT name, address FROM locations WHERE company_id = ?', [companyId]);
    const { report, groups } = buildReport(parsed.rows, keysOf(existing));
    const plan = buildPlan(report, groups, includeWarnings);

    for (const item of plan.locations) {
      const loc = item.location;
      const [result] = await connection.query(
        `INSERT INTO locations (name, address, latitude, longitude, contact_person, contact_phone, notes, company_id, rms_frequency, upravitelj, kljuc_strojarnice)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loc.name, loc.address, loc.contact_person || null, loc.contact_phone || null, loc.notes || null,
          companyId, loc.rms_frequency || 1, loc.upravitelj || null, loc.kljuc_strojarnice || null
        ]
      );
      for (const el of item.elevators) {
        await connection.query(
          `INSERT INTO elevators (location_id, company_id, label, serial_number, control_group_type, cabin_door_type, lock_type, machine_room_key, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            result.insertId, companyId, el.label, el.serial_number || null, el.control_group_type || null,
            el.cabin_door_type || null, el.lock_type || null, el.machine_room_key || null, el.comment || null
          ]
        );
      }
    }

    const counts = { locations_created: plan.counts.locations, elevators_created: plan.counts.elevators, skipped: plan.counts.skipped };
    // counts only, never file content; written in the same transaction (a failing audit row rolls the import back)
    await logAudit({
      userId: req.session?.user_id,
      companyId,
      action: AUDIT_ACTION,
      metadata: { client_request_id: clientRequestId, source: parsed.type, rows: report.length, include_warnings: includeWarnings, ...counts },
      connection,
      throwOnError: true
    });
    await connection.commit();
    return res.status(201).json(counts);
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch { /* connection already gone */ } }
    return sendImportError(res, err, 'Import apply failed:');
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
