const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resolveCompanyFile } = require('./companyFiles');
const { TYPES, safeUploadName, uploadsRoot } = require('./uploadValidation');

/*
 * Signature states, content hash and frozen PDF snapshots of RMS visits and interventions.
 *
 * Row (rms_visits / interventions).signature_status:
 *   draft              nothing signed yet (content can still change where the module allows it)
 *   technician_signed  the technician signed: content is LOCKED and its hash frozen; the client has not signed (yet)
 *   signed             technician + client signed in the app at once (the historical meaning, still used for old rows)
 * Derived state (never stored): unsigned | awaiting_client | completed | closed_without_client  (deriveState)
 *   - completed = status 'signed', OR a report_completions row with method drawn (signature in the app) / scan (scan of the
 *     client-signed paper copy)
 *   - closed_without_client = only a 'declined' completion (client absent/refused): NOT a client signature
 * report_completions and report_snapshots are INSERT-only. Docs: docs/infrastructure.md "Potpisi izvješća".
 */

const REPORTS = {
  rms: { table: 'rms_visits', itemsTable: 'rms_visit_items', itemFk: 'visit_id', prefix: 'RMS' },
  intervention: { table: 'interventions', itemsTable: 'intervention_items', itemFk: 'intervention_id', prefix: 'INT' }
};

const HASH_VERSION = 1;

// Row columns that change when the report is signed (or only describe signing): excluded from the content hash so that
// signing / completing never changes the hash of the CONTENT. Everything else on the row is hashed (new content columns
// are covered automatically).
const SIGNING_COLUMNS = new Set([
  'technician_signature_path', 'client_signature_path', 'signed_by_user_id', 'signed_at', 'signature_ip',
  'signature_status', 'document_hash', 'technician_signed_at', 'technician_signed_by_user_id',
  'technician_signer_name', 'client_signer_name', 'client_signer_role', 'client_signed_at'
]);

const isReportType = (type) => Object.prototype.hasOwnProperty.call(REPORTS, type);
const documentNumber = (type, id) => `${REPORTS[type].prefix}-${String(id).padStart(6, '0')}`;
const isLocked = (row) => Boolean(row) && ['technician_signed', 'signed'].includes(row.signature_status);
const shortHash = (hash) => (hash ? String(hash).slice(0, 12) : null);

// information_schema check with a short cache (a missing column is re-checked every minute until the migration ran)
const columnCache = new Map();
const hasColumn = async (table, column) => {
  const key = `${table}.${column}`;
  const cached = columnCache.get(key);
  if (cached && (cached.present || Date.now() - cached.at < 60000)) return cached.present;
  const [rows] = await db.query(
    'SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  columnCache.set(key, { present: rows.length > 0, at: Date.now() });
  return rows.length > 0;
};

/* ---------- canonical serialisation + hashing ---------- */

const stable = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = stable(value[key]);
    }
    return out;
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(stable(value));
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const iso = (value) => (value ? stable(new Date(value)) : null);

const fileSha = (companyId, stored, legacyOwned = false) => {
  const file = resolveCompanyFile(companyId, stored, { legacyOwned });
  if (!file) return 'unreadable';
  try {
    return sha256(fs.readFileSync(file.abs));
  } catch {
    return 'missing';
  }
};

/*
 * Extension point for the content hash: every source returns { key, value } and is added to the hashed content.
 * Register further data that belongs to the report (e.g. the planned `findings` tables) with registerContentSource; the source
 * must be deterministic and filtered by company_id. Verification recomputes the SAME sources, so adding a source later only
 * changes the hash of reports signed afterwards if you bump HASH_VERSION and keep reading old snapshots by their hash_version.
 */
const contentSources = [];
const registerContentSource = (fn) => { contentSources.push(fn); };

const isMissingTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

async function buildContent(conn, type, companyId, row, { technician, client }) {
  const cfg = REPORTS[type];
  const report = {};
  for (const [key, value] of Object.entries(row)) {
    if (!SIGNING_COLUMNS.has(key)) report[key] = value;
  }

  const [items] = await conn.query(
    `SELECT * FROM ${cfg.itemsTable} WHERE ${cfg.itemFk} = ? AND company_id = ? ORDER BY id ASC`,
    [row.id, companyId]
  );

  const content = { type, report, items, technician: technician || null, client: client || null };

  if (type === 'intervention') {
    let photos = [];
    try {
      const [photoRows] = await conn.query(
        `SELECT id, file_path, mime, size_bytes, width, height, kind, caption, taken_at, created_at
         FROM intervention_photos WHERE intervention_id = ? AND company_id = ? ORDER BY id ASC`,
        [row.id, companyId]
      );
      photos = photoRows.map((photo) => ({ ...photo, sha256: fileSha(companyId, photo.file_path) }));
    } catch (err) {
      if (!isMissingTable(err)) throw err;
    }
    const legacy = String(row.uploaded_files || '').split(',').map((p) => p.trim()).filter(Boolean)
      .map((p) => ({ path: p, sha256: fileSha(companyId, p, true) }));
    content.photos = photos;
    content.legacy_files = legacy;
  }

  for (const source of contentSources) {
    const part = await source({ conn, type, companyId, row });
    if (part && part.key) content[part.key] = part.value;
  }
  return content;
}

const documentHashOf = (content) => sha256(canonicalJson({ v: HASH_VERSION, ...content }));

/* ---------- blocks (who signed what, when) ---------- */

const technicianBlockFromRow = (companyId, row) => ({
  name: row.technician_signer_name || null,
  user_id: row.technician_signed_by_user_id || null,
  signed_at: iso(row.technician_signed_at || row.signed_at),
  signature_sha256: fileSha(companyId, row.technician_signature_path)
});

const clientBlockFromRow = (companyId, row) => ({
  method: 'drawn',
  name: row.client_signer_name || null,
  role: row.client_signer_role || null,
  signed_at: iso(row.client_signed_at || row.signed_at),
  signature_sha256: fileSha(companyId, row.client_signature_path)
});

const clientBlockFromCompletion = (companyId, completion) => ({
  method: completion.method,
  name: completion.signer_name || null,
  role: completion.signer_role || null,
  note: completion.note || null,
  signed_at: iso(completion.created_at),
  by_user_id: completion.created_by || null,
  signature_sha256: completion.signature_path ? fileSha(companyId, completion.signature_path) : null,
  scan_sha256: completion.scan_path ? fileSha(companyId, completion.scan_path) : null,
  scan_mime: completion.scan_mime || null,
  scan_size: completion.scan_size ?? null
});

/* ---------- loading ---------- */

const loadReport = async (conn, type, companyId, id, { forUpdate = false } = {}) => {
  const [[row]] = await conn.query(
    `SELECT * FROM ${REPORTS[type].table} WHERE id = ? AND company_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, companyId]
  );
  return row || null;
};

const loadCompletions = async (conn, type, companyId, id) => {
  try {
    const [rows] = await conn.query(
      'SELECT * FROM report_completions WHERE company_id = ? AND report_type = ? AND report_id = ? ORDER BY id ASC',
      [companyId, type, id]
    );
    return rows;
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
};

const loadSnapshots = async (conn, type, companyId, id) => {
  try {
    const [rows] = await conn.query(
      'SELECT * FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ? ORDER BY snapshot_no ASC',
      [companyId, type, id]
    );
    return rows;
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
};

/* ---------- derived state ---------- */

function deriveState(row, completions = []) {
  const status = row?.signature_status;
  if (status === 'signed') return 'completed';
  if (status === 'technician_signed') {
    if (completions.some((c) => c.method === 'drawn' || c.method === 'scan')) return 'completed';
    if (completions.some((c) => c.method === 'declined')) return 'closed_without_client';
    return 'awaiting_client';
  }
  return 'unsigned';
}

// The completion that counts as "the client signed" (earliest drawn/scan), else the latest declined one.
const effectiveCompletion = (completions) =>
  completions.find((c) => c.method === 'drawn' || c.method === 'scan')
  || [...completions].reverse().find((c) => c.method === 'declined')
  || null;

const usersNameMap = async (ids, companyId) => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.username FROM users u INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = ?
     WHERE u.id IN (${unique.map(() => '?').join(',')})`,
    [companyId, ...unique]
  );
  return new Map(rows.map((u) => [u.id, u.full_name || u.username || null]));
};

/*
 * Everything the PDF and the API need to show the signature block. `upTo` (a completion or null) renders the document as it
 * was at a given snapshot; without it the current state is used.
 */
function describeSignatures(type, row, completions, { upTo, names = new Map(), documentHash = null } = {}) {
  const locked = isLocked(row);
  const usable = upTo === undefined ? completions : (upTo ? completions.filter((c) => c.id <= upTo.id) : []);
  const state = upTo === undefined
    ? deriveState(row, completions)
    : deriveState(row, usable);
  let technician = null;
  if (locked && row.technician_signature_path) {
    technician = {
      name: row.technician_signer_name || null,
      at: row.technician_signed_at || (row.signature_status === 'signed' ? row.signed_at : null),
      path: row.technician_signature_path
    };
  }
  let client = null;
  if (row.signature_status === 'signed' && row.client_signature_path) {
    client = {
      method: 'drawn', path: row.client_signature_path, name: row.client_signer_name || null, role: row.client_signer_role || null,
      at: row.client_signed_at || row.signed_at, by_name: null, note: null
    };
  } else if (row.signature_status === 'technician_signed') {
    const c = effectiveCompletion(usable);
    if (c) {
      client = {
        method: c.method, path: c.signature_path || null, name: c.signer_name || null, role: c.signer_role || null, at: c.created_at,
        by_name: c.created_by_name || names.get(c.created_by) || null, note: c.note || null, scan_path: c.scan_path || null,
        completion_id: c.id
      };
    }
  }
  return { state, locked, document_number: documentNumber(type, row.id), document_hash: documentHash, technician, client };
}

/* ---------- PDFs / snapshots ---------- */

const signedReportsDir = () => uploadsRoot('signed-reports');

async function companyLanguageOf(companyId) {
  const [[company]] = await db.query('SELECT default_language FROM companies WHERE id = ? LIMIT 1', [companyId]);
  return company?.default_language === 'en' ? 'en' : 'hr';
}

// Generates the PDF of one snapshot target into uploads/signed-reports and returns { abs, stored }.
async function renderSnapshotPdf({ type, companyId, row, info, language, no }) {
  fs.mkdirSync(signedReportsDir(), { recursive: true });
  const fileName = safeUploadName(companyId, TYPES.pdf, `${type === 'rms' ? 'rms' : 'int'}${row.id}s${no}`);
  const abs = path.join(signedReportsDir(), fileName);
  if (type === 'rms') {
    const { generatePdfForRms } = require('./rms-pdf');
    await generatePdfForRms(row.id, companyId, { language, outputPath: abs, signatureInfo: info });
  } else {
    const { generateInterventionPdfById } = require('./intervention-pdf');
    await generateInterventionPdfById(row.id, companyId, abs, { language, signatureInfo: info });
  }
  return { abs, stored: `/uploads/signed-reports/${fileName}` };
}

const isDuplicate = (err) => err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;

/*
 * Makes sure every issued document has its frozen copy: snapshot 1 (technician signature, or both signatures at once) and one
 * snapshot per completion. Idempotent and race-safe (UNIQUE key); returns the snapshots created by THIS call.
 * Content is locked at technician signing, so a late call produces the same content hash as an immediate one.
 */
async function ensureSnapshots({ type, companyId, reportId, userId = null, language: requestedLanguage }) {
  const created = [];
  const row = await loadReport(db, type, companyId, reportId);
  if (!row || !isLocked(row)) return created;
  // historical fully-signed rows (before this feature) keep the live PDF; they get no retroactive 'frozen at signing' copy
  if (row.signature_status === 'signed' && !row.technician_signed_at) return created;
  const completions = await loadCompletions(db, type, companyId, reportId);
  const snapshots = await loadSnapshots(db, type, companyId, reportId);
  // language of the issued document: the signer's UI language when given, then the first snapshot's, then the company default
  const language = requestedLanguage || snapshots[0]?.language || await companyLanguageOf(companyId);
  const names = await usersNameMap(completions.map((c) => c.created_by), companyId);

  const targets = [{ completion: null }, ...completions.map((completion) => ({ completion }))];
  let nextNo = snapshots.reduce((max, s) => Math.max(max, s.snapshot_no), 0);
  for (const target of targets) {
    const completionId = target.completion ? target.completion.id : null;
    if (snapshots.some((s) => (s.completion_id ?? null) === completionId)) continue;

    const immediate = !target.completion && row.signature_status === 'signed';
    const client = target.completion
      ? clientBlockFromCompletion(companyId, target.completion)
      : (immediate ? clientBlockFromRow(companyId, row) : null);
    const content = await buildContent(db, type, companyId, row, { technician: technicianBlockFromRow(companyId, row), client });
    const hash = documentHashOf(content);
    nextNo += 1;
    const info = describeSignatures(type, row, completions, { upTo: target.completion, names, documentHash: hash });
    const pdf = await renderSnapshotPdf({ type, companyId, row, info, language, no: nextNo });
    const pdfSha = sha256(fs.readFileSync(pdf.abs));
    try {
      const [result] = await db.query(
        `INSERT INTO report_snapshots
          (company_id, report_type, report_id, snapshot_no, completion_id, document_number, file_path, pdf_sha256, document_hash, hash_version, language, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [companyId, type, reportId, nextNo, completionId, documentNumber(type, reportId), pdf.stored, pdfSha, hash, HASH_VERSION, language, userId]
      );
      created.push({ id: result.insertId, snapshot_no: nextNo, document_hash: hash });
    } catch (err) {
      try { fs.unlinkSync(pdf.abs); } catch { /* already gone */ }
      if (!isDuplicate(err)) throw err;
      // a parallel request stored this snapshot first: continue with the numbers it used
      const fresh = await loadSnapshots(db, type, companyId, reportId);
      snapshots.splice(0, snapshots.length, ...fresh);
      nextNo = fresh.reduce((max, s) => Math.max(max, s.snapshot_no), 0);
    }
  }
  return created;
}

// Current signature info for a live PDF (state + latest frozen hash), from an already loaded report row.
async function loadSignatureInfo(type, companyId, row) {
  const completions = await loadCompletions(db, type, companyId, row.id);
  const snapshots = await loadSnapshots(db, type, companyId, row.id);
  const names = await usersNameMap(completions.map((c) => c.created_by), companyId);
  const latest = snapshots[snapshots.length - 1] || null;
  return describeSignatures(type, row, completions, { names, documentHash: latest?.document_hash || null });
}

// Latest frozen PDF of the report (creating missing snapshots first), or null when there is none (unsigned / historical rows).
async function findFrozenPdf({ type, companyId, reportId, userId = null }) {
  try {
    await ensureSnapshots({ type, companyId, reportId, userId });
  } catch (err) {
    console.error('ensureSnapshots failed while serving a PDF:', err);
  }
  const snapshots = await loadSnapshots(db, type, companyId, reportId);
  for (let i = snapshots.length - 1; i >= 0; i -= 1) {
    const file = resolveCompanyFile(companyId, snapshots[i].file_path);
    if (file && fs.existsSync(file.abs)) return { abs: file.abs, snapshot: snapshots[i] };
  }
  return null;
}

// The signature tables/columns exist (migration 20261114 applied). Before that the lists and Home simply skip the signature data.
let schemaCache = { ready: false, at: 0 };
async function schemaReady() {
  if (schemaCache.ready || Date.now() - schemaCache.at < 60000) return schemaCache.ready;
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('report_completions', 'report_snapshots')`
  );
  schemaCache = { ready: Number(rows[0].n) === 2, at: Date.now() };
  return schemaCache.ready;
}

// SQL expression (derived state) for list queries; `alias` is the report table alias, `type` rms|intervention
function stateSql(alias, type) {
  const done = (methods) => `EXISTS (SELECT 1 FROM report_completions rc WHERE rc.company_id = ${alias}.company_id AND rc.report_type = '${type}' AND rc.report_id = ${alias}.id AND rc.method IN (${methods}))`;
  return `(CASE ${alias}.signature_status WHEN 'signed' THEN 'completed' WHEN 'technician_signed' THEN CASE WHEN ${done("'drawn','scan'")} THEN 'completed' WHEN ${done("'declined'")} THEN 'closed_without_client' ELSE 'awaiting_client' END ELSE 'unsigned' END)`;
}

/* ---------- verification ---------- */

async function verifyReport({ type, companyId, reportId }) {
  const row = await loadReport(db, type, companyId, reportId);
  if (!row) return null;
  const completions = await loadCompletions(db, type, companyId, reportId);
  const snapshots = await loadSnapshots(db, type, companyId, reportId);
  const result = { document_number: documentNumber(type, reportId), state: deriveState(row, completions), snapshots: [] };
  if (snapshots.length === 0) {
    result.status = isLocked(row) ? 'no_snapshot' : 'not_signed';
    return result;
  }
  for (const snap of snapshots) {
    const completion = snap.completion_id ? completions.find((c) => c.id === snap.completion_id) : null;
    const immediate = !snap.completion_id && row.signature_status === 'signed';
    const client = completion ? clientBlockFromCompletion(companyId, completion) : (immediate ? clientBlockFromRow(companyId, row) : null);
    let hashOk = false;
    let pdfOk = false;
    if (!snap.completion_id || completion) {
      const content = await buildContent(db, type, companyId, row, { technician: technicianBlockFromRow(companyId, row), client });
      hashOk = documentHashOf(content) === snap.document_hash;
    }
    const pdfFile = resolveCompanyFile(companyId, snap.file_path);
    if (pdfFile) {
      try { pdfOk = sha256(fs.readFileSync(pdfFile.abs)) === snap.pdf_sha256; } catch { pdfOk = false; }
    }
    result.snapshots.push({
      id: snap.id, snapshot_no: snap.snapshot_no, completion_id: snap.completion_id, created_at: snap.created_at,
      document_hash: snap.document_hash, short_hash: shortHash(snap.document_hash), hash_ok: hashOk, pdf_ok: pdfOk
    });
  }
  const rowHashOk = !row.document_hash || row.document_hash.length !== 64 || row.document_hash === snapshots[0].document_hash;
  result.row_hash_ok = rowHashOk;
  result.status = result.snapshots.every((s) => s.hash_ok && s.pdf_ok) && rowHashOk ? 'ok' : 'differs';
  return result;
}

/* ---------- timeline for the API ---------- */

async function describeForApi({ type, companyId, row }) {
  const completions = await loadCompletions(db, type, companyId, row.id);
  const snapshots = await loadSnapshots(db, type, companyId, row.id);
  const names = await usersNameMap([row.technician_signed_by_user_id, row.signed_by_user_id, ...completions.map((c) => c.created_by)], companyId);
  const latest = snapshots[snapshots.length - 1] || null;
  const info = describeSignatures(type, row, completions, { names, documentHash: latest?.document_hash || null });
  const technicianName = info.technician
    ? (info.technician.name || names.get(row.technician_signed_by_user_id) || names.get(row.signed_by_user_id) || null)
    : null;

  const timeline = [{ type: 'created', at: row.created_at }];
  if (info.technician) timeline.push({ type: 'technician_signed', at: info.technician.at, name: technicianName });
  if (row.signature_status === 'signed' && info.client) {
    timeline.push({ type: 'client_signed', method: 'drawn', at: info.client.at, name: info.client.name, role: info.client.role });
  }
  for (const c of completions) {
    timeline.push({
      type: c.method === 'declined' ? 'client_declined' : 'client_signed', method: c.method, at: c.created_at,
      name: c.signer_name || null, role: c.signer_role || null, note: c.note || null,
      by_name: c.created_by_name || names.get(c.created_by) || null, completion_id: c.id,
      scan_path: c.scan_path || null
    });
  }
  return {
    state: info.state,
    locked: info.locked,
    document_number: info.document_number,
    document_hash: latest?.document_hash || null,
    short_hash: shortHash(latest?.document_hash),
    technician: info.technician ? { name: technicianName, at: info.technician.at } : null,
    client: info.client
      ? { method: info.client.method, name: info.client.name, role: info.client.role, at: info.client.at, note: info.client.note, by_name: info.client.by_name }
      : null,
    awaiting_since: info.state === 'awaiting_client' ? (row.technician_signed_at || row.signed_at || row.created_at) : null,
    timeline,
    snapshots: snapshots.map((s) => ({
      id: s.id, snapshot_no: s.snapshot_no, completion_id: s.completion_id, created_at: s.created_at, short_hash: shortHash(s.document_hash),
      language: s.language
    })),
    scans: completions.filter((c) => c.method === 'scan').map((c) => ({
      completion_id: c.id, file_path: c.scan_path, mime: c.scan_mime, size_bytes: c.scan_size, created_at: c.created_at
    }))
  };
}

// Findings (defects) created together with the report: part of the hashed content. Only the findings rows themselves
// (INSERT-only); their lifecycle events change later and are NOT part of the document.
registerContentSource(async ({ conn, type, companyId, row }) => {
  const columns = 'f.id, f.elevator_id, f.elevator_label, f.description, f.category, f.severity, f.needs_part, f.part_note, f.created_by_user_id, f.created_at';
  try {
    const [rows] = type === 'intervention'
      ? await conn.query(
        `SELECT ${columns} FROM findings f WHERE f.company_id = ? AND f.source_type = 'intervention' AND f.source_id = ? ORDER BY f.id ASC`,
        [companyId, row.id]
      )
      : await conn.query(
        `SELECT ${columns} FROM findings f
         INNER JOIN rms_visit_items i ON i.id = f.source_id AND i.company_id = f.company_id
         WHERE f.company_id = ? AND f.source_type = 'rms_visit_item' AND i.visit_id = ? ORDER BY f.id ASC`,
        [companyId, row.id]
      );
    return { key: 'findings', value: rows };
  } catch (err) {
    if (isMissingTable(err)) return { key: 'findings', value: [] };
    throw err;
  }
});

module.exports = {
  REPORTS,
  HASH_VERSION,
  SIGNING_COLUMNS,
  isReportType,
  hasColumn,
  documentNumber,
  isLocked,
  shortHash,
  canonicalJson,
  sha256,
  buildContent,
  documentHashOf,
  registerContentSource,
  technicianBlockFromRow,
  clientBlockFromRow,
  clientBlockFromCompletion,
  loadReport,
  loadCompletions,
  loadSnapshots,
  deriveState,
  effectiveCompletion,
  describeSignatures,
  loadSignatureInfo,
  describeForApi,
  usersNameMap,
  ensureSnapshots,
  findFrozenPdf,
  schemaReady,
  stateSql,
  verifyReport,
  isDuplicate
};
