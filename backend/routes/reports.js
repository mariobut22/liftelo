const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { logAudit } = require('../utils/auditLog');
const { isCompanyAdmin, getCompanyRole } = require('../utils/membership');
const { TYPES, sniffFileType, safeUploadName, removeFiles, uploadsRoot } = require('../utils/uploadValidation');
const { resolveCompanyFile } = require('../utils/companyFiles');
const sig = require('../utils/reportSignatures');

const { hasColumn } = sig;

/*
 * Signing and late client completion of RMS visits / interventions. State machine, locking, hash and snapshots:
 * utils/reportSignatures.js and docs/infrastructure.md "Potpisi izvješća".
 *   POST /:type/:id/sign             technician signature (+ client signature drawn now); locks the content
 *   POST /:type/:id/client-signature client signs LATER in the app (name + role required)
 *   POST /:type/:id/client-scan      scan of the client-signed paper copy (PDF/JPG/PNG, <= 10 MB)
 *   POST /:type/:id/client-declined  client absent / declined, with a reason (NOT a client signature)
 *   GET  /:type/:id/signature        state + timeline;  GET /:type/:id/verify (admin)  recompute + compare hash
 *   GET  /:type/:id/snapshots/:snapshotId/pdf   the frozen PDF;   GET /awaiting-client   summary for Home
 * Viewer/locked-company gates run in index.js (requireSubscriptionAccess); every query filters by company_id.
 */

const router = express.Router();

const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
const SCAN_MAX_BYTES = 10 * 1024 * 1024;
const SCAN_TYPES = new Set([TYPES.pdf.mime, TYPES.jpeg.mime, TYPES.png.mime]);

const uploadMiddleware = (limitBytes, fields) => {
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limitBytes, files: 2, fields: 16, fieldSize: 4 * 1024 }
  }).fields(fields);
  return (req, res, next) => handler(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large', code: 'file_too_large' });
    return res.status(400).json({ error: 'Upload failed', code: 'upload_failed' });
  });
};
const signUpload = uploadMiddleware(SIGNATURE_MAX_BYTES, [{ name: 'technician_signature', maxCount: 1 }, { name: 'client_signature', maxCount: 1 }]);
const clientSignatureUpload = uploadMiddleware(SIGNATURE_MAX_BYTES, [{ name: 'client_signature', maxCount: 1 }]);
const scanUpload = uploadMiddleware(SCAN_MAX_BYTES, [{ name: 'scan', maxCount: 1 }]);

const cleanText = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const pickLanguage = (value) => (value === 'hr' || value === 'en' ? value : undefined);
const sessionIp = (req) => String(req.ip || '').slice(0, 100) || null;

// ---------- permissions ----------

// Admin: any report of the company. Technician: own RMS (user_id) or own intervention: created by them
// (interventions.created_by_user_id when the column exists) or named as technician / second technician (username or full name,
// case-insensitive; the name text is brittle, so the id link is preferred).
const canSignReport = async ({ companyId, reportType, reportId, userId, globalRole }) => {
  const admin = await isCompanyAdmin({ userId, companyId, globalRole });
  if (admin) return true;
  if (reportType === 'rms') {
    const [rows] = await db.query(
      'SELECT id FROM rms_visits WHERE id = ? AND company_id = ? AND user_id = ?',
      [reportId, companyId, userId]
    );
    return rows.length > 0;
  }
  const [[row]] = await db.query('SELECT * FROM interventions WHERE id = ? AND company_id = ?', [reportId, companyId]);
  if (!row) return false;
  if (row.created_by_user_id != null && Number(row.created_by_user_id) === Number(userId)) return true;
  const [[user]] = await db.query(
    'SELECT u.username, u.full_name FROM users u INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ? WHERE u.id = ? LIMIT 1',
    [companyId, userId]
  );
  const mine = [user?.username, user?.full_name].map((v) => cleanText(v, 255).toLowerCase()).filter(Boolean);
  const named = [row.technician, row.second_technician].map((v) => cleanText(v, 255).toLowerCase()).filter(Boolean);
  return named.some((name) => mine.includes(name));
};

// Late completion: any admin or technician of the company (viewer is already blocked by the write gate)
const canCompleteReport = async ({ companyId, userId, globalRole }) => {
  if (globalRole === 'superadmin') return true;
  const role = await getCompanyRole(userId, companyId);
  return role === 'admin' || role === 'technician';
};

const userDisplayName = async (userId, companyId) => {
  const [[user]] = await db.query(
    'SELECT u.full_name, u.username FROM users u INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ? WHERE u.id = ? LIMIT 1',
    [companyId, userId]
  );
  return cleanText(user?.full_name || user?.username || '', 150) || null;
};

// ---------- helpers ----------

const parseTarget = (req, res) => {
  const { type } = req.params;
  const reportId = Number(req.params.id);
  if (!sig.isReportType(type)) {
    res.status(400).json({ error: 'Invalid report type', code: 'invalid_request' });
    return null;
  }
  if (!Number.isInteger(reportId) || reportId <= 0) {
    res.status(400).json({ error: 'Invalid report id', code: 'invalid_request' });
    return null;
  }
  return { type, reportId };
};

const requireSession = (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user_id;
  if (!companyId || !userId) {
    res.status(401).json({ error: 'Unauthorized', code: 'not_authenticated' });
    return null;
  }
  return { companyId, userId };
};

const isPng = (file) => Boolean(file) && sniffFileType(file.buffer) === TYPES.png;

const writeUpload = (dir, name, buffer, written) => {
  fs.mkdirSync(uploadsRoot(dir), { recursive: true });
  const abs = uploadsRoot(dir, name);
  fs.writeFileSync(abs, buffer);
  written.push(abs);
  return `/uploads/${dir}/${name}`;
};

const mysqlNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);

const respondWithSignature = async (res, status, { type, companyId, reportId, extra = {} }) => {
  const row = await sig.loadReport(db, type, companyId, reportId);
  const signature = await sig.describeForApi({ type, companyId, row });
  return res.status(status).json({ ...extra, id: reportId, signature_status: row.signature_status, signature_state: signature.state, signature });
};

const snapshotsAfter = async ({ type, companyId, reportId, userId, language }) => {
  try {
    await sig.ensureSnapshots({ type, companyId, reportId, userId, language });
    return true;
  } catch (err) {
    console.error('Snapshot creation failed (report stays locked, retried on the next PDF download):', err);
    return false;
  }
};

// ---------- POST /:type/:id/sign ----------

router.post('/:type/:id/sign', signUpload, async (req, res) => {
  const written = [];
  let conn = null;
  try {
    const session = requireSession(req, res);
    if (!session) return undefined;
    const { companyId, userId } = session;
    const target = parseTarget(req, res);
    if (!target) return undefined;
    const { type, reportId } = target;

    const technicianFile = req.files?.technician_signature?.[0];
    const clientFile = req.files?.client_signature?.[0];
    if (!technicianFile && !clientFile) {
      return res.status(400).json({ error: 'No signatures provided', code: 'no_signatures_provided' });
    }
    // The real content must be a PNG (magic bytes); the client's mimetype is ignored
    if ((technicianFile && !isPng(technicianFile)) || (clientFile && !isPng(clientFile))) {
      return res.status(415).json({ error: 'Invalid file type', code: 'invalid_file_type' });
    }
    const signerName = cleanText(req.body?.client_signer_name, 150);
    const signerRole = cleanText(req.body?.client_signer_role, 100);
    if (clientFile && !signerName) {
      return res.status(400).json({ error: 'Client signer name is required', code: 'signer_name_required' });
    }
    if (clientFile && !signerRole) {
      return res.status(400).json({ error: 'Client signer role is required', code: 'signer_role_required' });
    }
    const language = pickLanguage(req.body?.language);

    const allowed = await canSignReport({ companyId, reportType: type, reportId, userId, globalRole: req.session?.global_role });
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    const cfg = sig.REPORTS[type];
    conn = await db.getConnection();
    await conn.beginTransaction();
    // Row lock: a parallel sign call waits here and then sees the locked state; the conditional UPDATE below is the second guard
    const row = await sig.loadReport(conn, type, companyId, reportId, { forUpdate: true });
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: 'Report not found', code: 'report_not_found' });
    }
    if (sig.isLocked(row)) {
      await conn.rollback();
      return res.status(403).json({ error: 'Report already signed', code: 'report_already_signed' });
    }
    if (technicianFile && row.technician_signature_path) {
      await conn.rollback();
      return res.status(400).json({ error: 'Technician signature already exists', code: 'signature_exists' });
    }
    if (clientFile && row.client_signature_path) {
      await conn.rollback();
      return res.status(400).json({ error: 'Client signature already exists', code: 'signature_exists' });
    }
    if (!technicianFile && !row.technician_signature_path) {
      await conn.rollback();
      return res.status(400).json({ error: 'The technician must sign first', code: 'technician_signature_required' });
    }

    const now = mysqlNow();
    const technicianName = await userDisplayName(userId, companyId);
    const label = type === 'rms' ? 'rms' : 'int';
    const technicianPath = technicianFile
      ? writeUpload('signatures', safeUploadName(companyId, TYPES.png, `${label}${reportId}tech`), technicianFile.buffer, written)
      : row.technician_signature_path;
    const clientPath = clientFile
      ? writeUpload('signatures', safeUploadName(companyId, TYPES.png, `${label}${reportId}client`), clientFile.buffer, written)
      : row.client_signature_path;
    const bothSigned = Boolean(technicianPath && clientPath);

    const technicianBlock = {
      name: technicianName,
      user_id: userId,
      signed_at: now.toISOString(),
      signature_sha256: technicianFile ? sig.sha256(technicianFile.buffer) : sig.technicianBlockFromRow(companyId, row).signature_sha256
    };
    let clientBlock = null;
    if (bothSigned) {
      clientBlock = {
        method: 'drawn',
        name: clientFile ? signerName : (row.client_signer_name || null),
        role: clientFile ? signerRole : (row.client_signer_role || null),
        signed_at: technicianBlock.signed_at,
        signature_sha256: clientFile ? sig.sha256(clientFile.buffer) : sig.clientBlockFromRow(companyId, row).signature_sha256
      };
    }
    const content = await sig.buildContent(conn, type, companyId, row, { technician: technicianBlock, client: clientBlock });
    const documentHash = sig.documentHashOf(content);

    const sets = [
      'technician_signature_path = ?', 'technician_signed_at = ?', 'technician_signed_by_user_id = ?', 'technician_signer_name = ?',
      'signature_ip = ?', 'signature_status = ?', 'document_hash = ?'
    ];
    const params = [technicianPath, now, userId, technicianName, sessionIp(req), bothSigned ? 'signed' : 'technician_signed', documentHash];
    if (bothSigned) {
      sets.push('client_signature_path = ?', 'client_signer_name = ?', 'client_signer_role = ?', 'client_signed_at = ?', 'signed_at = ?', 'signed_by_user_id = ?');
      params.push(clientPath, clientBlock.name, clientBlock.role, now, now, userId);
    }
    // Conditional UPDATE: only a draft report can be signed, exactly once
    const [result] = await conn.query(
      `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = ? AND company_id = ? AND signature_status = 'draft'`,
      [...params, reportId, companyId]
    );
    if (result.affectedRows !== 1) {
      await conn.rollback();
      removeFiles(written);
      return res.status(403).json({ error: 'Report already signed', code: 'report_already_signed' });
    }
    await conn.commit();
    conn.release();
    conn = null;

    await logAudit({
      userId, companyId, action: 'sign_report',
      metadata: { reportId, type, state: bothSigned ? 'completed' : 'awaiting_client' }
    });
    const snapshotOk = await snapshotsAfter({ type, companyId, reportId, userId, language });
    return respondWithSignature(res, 200, { type, companyId, reportId, extra: { snapshot_ok: snapshotOk } });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch { /* connection already gone */ }
    }
    removeFiles(written);
    console.error('Signature upload error:', err);
    return res.status(500).json({ error: 'Signature upload failed', code: 'upload_failed' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------- late client completion ----------

/*
 * Shared flow: lock the report row, check the state, INSERT one report_completions row, commit, then freeze a snapshot.
 * `build(row, { written, now })` returns the column values of the completion (and may write files).
 */
async function completeClientSide(req, res, build) {
  const written = [];
  let conn = null;
  try {
    const session = requireSession(req, res);
    if (!session) return undefined;
    const { companyId, userId } = session;
    const target = parseTarget(req, res);
    if (!target) return undefined;
    const { type, reportId } = target;

    const allowed = await canCompleteReport({ companyId, userId, globalRole: req.session?.global_role });
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    const row = await sig.loadReport(conn, type, companyId, reportId, { forUpdate: true });
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: 'Report not found', code: 'report_not_found' });
    }
    if (row.signature_status === 'draft' || !row.signature_status) {
      await conn.rollback();
      return res.status(409).json({ error: 'The technician has not signed this report yet', code: 'report_not_signed' });
    }
    const completions = await sig.loadCompletions(conn, type, companyId, reportId);
    const state = sig.deriveState(row, completions);
    if (state === 'completed') {
      await conn.rollback();
      return res.status(409).json({ error: 'The client side of this report is already completed', code: 'already_completed' });
    }

    const values = await build({ row, completions, state, written, companyId, type, reportId });
    if (!values) {
      await conn.rollback();
      removeFiles(written);
      return undefined; // build() already answered
    }
    const createdByName = await userDisplayName(userId, companyId);
    const [insert] = await conn.query(
      `INSERT INTO report_completions
        (company_id, report_type, report_id, method, signer_name, signer_role, signature_path, signature_sha256,
         scan_path, scan_mime, scan_size, scan_sha256, note, ip, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, type, reportId, values.method, values.signer_name ?? null, values.signer_role ?? null,
        values.signature_path ?? null, values.signature_sha256 ?? null, values.scan_path ?? null, values.scan_mime ?? null,
        values.scan_size ?? null, values.scan_sha256 ?? null, values.note ?? null, sessionIp(req), userId, createdByName]
    );
    await conn.commit();
    conn.release();
    conn = null;

    await logAudit({
      userId, companyId, action: 'report_client_completion',
      metadata: { reportId, type, method: values.method, completionId: insert.insertId }
    });
    const snapshotOk = await snapshotsAfter({ type, companyId, reportId, userId, language: pickLanguage(req.body?.language) });
    return respondWithSignature(res, 201, { type, companyId, reportId, extra: { completion_id: insert.insertId, snapshot_ok: snapshotOk } });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch { /* connection already gone */ }
    }
    removeFiles(written);
    console.error('Client completion error:', err);
    return res.status(500).json({ error: 'Failed to complete the report', code: 'upload_failed' });
  } finally {
    if (conn) conn.release();
  }
}

router.post('/:type/:id/client-signature', clientSignatureUpload, (req, res) =>
  completeClientSide(req, res, async ({ written, companyId, type, reportId }) => {
    const file = req.files?.client_signature?.[0];
    if (!file) {
      res.status(400).json({ error: 'No signatures provided', code: 'no_signatures_provided' });
      return null;
    }
    if (!isPng(file)) {
      res.status(415).json({ error: 'Invalid file type', code: 'invalid_file_type' });
      return null;
    }
    const name = cleanText(req.body?.signer_name, 150);
    const role = cleanText(req.body?.signer_role, 100);
    if (!name) {
      res.status(400).json({ error: 'Client signer name is required', code: 'signer_name_required' });
      return null;
    }
    if (!role) {
      res.status(400).json({ error: 'Client signer role is required', code: 'signer_role_required' });
      return null;
    }
    const stored = writeUpload('signatures', safeUploadName(companyId, TYPES.png, `${type === 'rms' ? 'rms' : 'int'}${reportId}client`), file.buffer, written);
    return { method: 'drawn', signer_name: name, signer_role: role, signature_path: stored, signature_sha256: sig.sha256(file.buffer) };
  }));

router.post('/:type/:id/client-scan', scanUpload, (req, res) =>
  completeClientSide(req, res, async ({ written, companyId, type, reportId }) => {
    const file = req.files?.scan?.[0];
    if (!file) {
      res.status(400).json({ error: 'Scan file is required', code: 'scan_required' });
      return null;
    }
    const kind = sniffFileType(file.buffer);
    if (!kind || !SCAN_TYPES.has(kind.mime)) {
      res.status(415).json({ error: 'Invalid file type', code: 'invalid_file_type' });
      return null;
    }
    const stored = writeUpload(
      'signed-reports',
      safeUploadName(companyId, kind, `scan${type === 'rms' ? 'rms' : 'int'}${reportId}`),
      file.buffer,
      written
    );
    return {
      method: 'scan',
      signer_name: cleanText(req.body?.signer_name, 150) || null,
      signer_role: cleanText(req.body?.signer_role, 100) || null,
      scan_path: stored,
      scan_mime: kind.mime,
      scan_size: file.size,
      scan_sha256: sig.sha256(file.buffer),
      note: cleanText(req.body?.note, 500) || null
    };
  }));

router.post('/:type/:id/client-declined', express.json({ limit: '16kb' }), (req, res) =>
  completeClientSide(req, res, async ({ state }) => {
    const reason = cleanText(req.body?.reason, 500);
    if (reason.length < 5) {
      res.status(400).json({ error: 'A reason is required', code: 'reason_required' });
      return null;
    }
    if (state === 'closed_without_client') {
      res.status(409).json({ error: 'The report is already closed without a client signature', code: 'already_completed' });
      return null;
    }
    return { method: 'declined', note: reason };
  }));

// ---------- reading ----------

router.get('/awaiting-client', async (req, res) => {
  try {
    const companyId = req.companyId;
    const out = { count: 0, oldest_at: null, items: [] };
    if (!companyId) return res.json(out);
    if (!(await sig.schemaReady())) return res.json(out);
    const parts = [];
    for (const type of ['rms', 'intervention']) {
      const cfg = sig.REPORTS[type];
      const [rows] = await db.query(
        `SELECT t.id, ? AS type, COALESCE(t.technician_signed_at, t.created_at) AS since, l.name AS location_name
         FROM ${cfg.table} t
         LEFT JOIN locations l ON l.id = t.location_id AND l.company_id = t.company_id
         WHERE t.company_id = ? AND t.signature_status = 'technician_signed'
           AND ${sig.stateSql('t', type)} = 'awaiting_client'`,
        [type, companyId]
      );
      parts.push(...rows);
    }
    parts.sort((a, b) => new Date(a.since) - new Date(b.since));
    out.count = parts.length;
    out.oldest_at = parts[0]?.since || null;
    out.items = parts.slice(0, 5).map((r) => ({ type: r.type, id: r.id, since: r.since, location_name: r.location_name }));
    return res.json(out);
  } catch (err) {
    console.error('awaiting-client summary failed:', err);
    return res.status(500).json({ error: 'Failed to load reports', code: 'load_failed' });
  }
});

router.get('/:type/:id/signature', async (req, res) => {
  try {
    const session = requireSession(req, res);
    if (!session) return undefined;
    const target = parseTarget(req, res);
    if (!target) return undefined;
    const row = await sig.loadReport(db, target.type, session.companyId, target.reportId);
    if (!row) return res.status(404).json({ error: 'Report not found', code: 'report_not_found' });
    const signature = await sig.describeForApi({ type: target.type, companyId: session.companyId, row });
    return res.json({ id: target.reportId, type: target.type, ...signature });
  } catch (err) {
    console.error('signature state failed:', err);
    return res.status(500).json({ error: 'Failed to load signature state', code: 'load_failed' });
  }
});

// Admin only: recompute the content hash and compare with the stored snapshots (ok | differs | no_snapshot | not_signed)
router.get('/:type/:id/verify', async (req, res) => {
  try {
    const session = requireSession(req, res);
    if (!session) return undefined;
    const target = parseTarget(req, res);
    if (!target) return undefined;
    const admin = await isCompanyAdmin({ userId: session.userId, companyId: session.companyId, globalRole: req.session?.global_role });
    if (!admin) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    const result = await sig.verifyReport({ type: target.type, companyId: session.companyId, reportId: target.reportId });
    if (!result) return res.status(404).json({ error: 'Report not found', code: 'report_not_found' });
    return res.json(result);
  } catch (err) {
    console.error('verify failed:', err);
    return res.status(500).json({ error: 'Verification failed', code: 'load_failed' });
  }
});

router.get('/:type/:id/snapshots/:snapshotId/pdf', async (req, res) => {
  try {
    const session = requireSession(req, res);
    if (!session) return undefined;
    const target = parseTarget(req, res);
    if (!target) return undefined;
    const snapshotId = Number(req.params.snapshotId);
    const [[snap]] = await db.query(
      'SELECT * FROM report_snapshots WHERE id = ? AND company_id = ? AND report_type = ? AND report_id = ? LIMIT 1',
      [snapshotId, session.companyId, target.type, target.reportId]
    );
    const file = snap ? resolveCompanyFile(session.companyId, snap.file_path) : null;
    if (!snap || !file || !fs.existsSync(file.abs)) {
      return res.status(404).json({ error: 'Snapshot not found', code: 'snapshot_not_found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${snap.document_number}-${snap.snapshot_no}.pdf`);
    return res.sendFile(path.resolve(file.abs), { dotfiles: 'allow' });
  } catch (err) {
    console.error('snapshot pdf failed:', err);
    return res.status(500).json({ error: 'Failed to load PDF', code: 'load_failed' });
  }
});

module.exports = router;
module.exports.canSignReport = canSignReport;
