const { Readable } = require('stream');
const archiver = require('archiver');
const db = require('../db');
const { listCompanyFiles } = require('./companyFiles');

// Company data export (data portability): one ZIP with JSON + CSV per entity, the uploaded files and a manifest.
// Everything is read in pages (keyset on the primary key, PAGE_SIZE rows per query) and streamed into the archive, so memory
// stays flat for large companies. EVERY statement is filtered by company_id (directly or through the owning project) and
// parameterized. Never exported: password hashes, invite/reset tokens, sessions, billing/Stripe data, audit logs.

const PAGE_SIZE = 1000;
// Uploaded files are put into the ZIP only when all of them together stay below this size; otherwise they are only listed.
const MAX_INCLUDED_FILE_BYTES = 500 * 1024 * 1024;
const EXPORT_COOLDOWN_MINUTES = 10;

// Safety net: columns whose name looks like a secret are dropped from every entity (the users query already selects explicitly).
const SECRET_COLUMN = /(^|_)(password|passwd|secret|invite_token|reset_token)(_|$)|^token$/i;

// cursor = unique, increasing column used for keyset paging; single = small table read in one query
const ENTITIES = [
  { name: 'company', single: true, sql: 'SELECT * FROM companies WHERE id = ?' },
  {
    name: 'users', cursor: 'membership_id',
    sql: `SELECT uc.id AS membership_id, u.id AS user_id, u.username, u.full_name, u.email, uc.role AS company_role,
                 u.is_active, u.disabled_at, u.language, u.created_at, uc.created_at AS joined_at
          FROM user_companies uc INNER JOIN users u ON u.id = uc.user_id
          WHERE uc.company_id = ? AND uc.id > ? ORDER BY uc.id ASC LIMIT ?`,
  },
  { name: 'invitations', cursor: 'id', sql: 'SELECT id, email, role, status, expires_at, created_at, invited_by FROM invitations WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'locations', cursor: 'id', sql: 'SELECT * FROM locations WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'location_monthly_services', cursor: 'id', sql: 'SELECT * FROM location_monthly_services WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'elevators', cursor: 'id', sql: 'SELECT * FROM elevators WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'rms_visits', cursor: 'id', sql: 'SELECT * FROM rms_visits WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'rms_visit_items', cursor: 'id', sql: 'SELECT * FROM rms_visit_items WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'interventions', cursor: 'id', sql: 'SELECT * FROM interventions WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'intervention_items', cursor: 'id', sql: 'SELECT * FROM intervention_items WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'intervention_photos', cursor: 'id', sql: 'SELECT * FROM intervention_photos WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'intervention_work_lines', cursor: 'id', sql: 'SELECT * FROM intervention_work_lines WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'findings', cursor: 'id', sql: 'SELECT * FROM findings WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'finding_events', cursor: 'id', sql: 'SELECT * FROM finding_events WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'report_completions', cursor: 'id', sql: 'SELECT * FROM report_completions WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'report_snapshots', cursor: 'id', sql: 'SELECT * FROM report_snapshots WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'work_orders', cursor: 'id', sql: 'SELECT * FROM work_orders WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'work_order_items', cursor: 'id', sql: 'SELECT * FROM work_order_items WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'work_order_work_lines', cursor: 'id', sql: 'SELECT * FROM work_order_work_lines WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'work_order_elevators', cursor: 'id', sql: 'SELECT * FROM work_order_elevators WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'work_order_users', cursor: 'id', sql: 'SELECT * FROM work_order_users WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'work_order_activity', cursor: 'id', sql: 'SELECT * FROM work_order_activity WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'work_order_attachments', cursor: 'id', sql: 'SELECT * FROM work_order_attachments WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'projects', cursor: 'id', sql: 'SELECT * FROM projects WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  {
    name: 'project_sections', cursor: 'id',
    sql: 'SELECT ps.* FROM project_sections ps INNER JOIN projects p ON p.id = ps.project_id WHERE p.company_id = ? AND ps.id > ? ORDER BY ps.id ASC LIMIT ?',
  },
  {
    name: 'project_tasks', cursor: 'id',
    sql: `SELECT pt.* FROM project_tasks pt
          INNER JOIN project_sections ps ON ps.id = pt.project_section_id
          INNER JOIN projects p ON p.id = ps.project_id
          WHERE p.company_id = ? AND pt.id > ? ORDER BY pt.id ASC LIMIT ?`,
  },
  {
    name: 'project_task_users', cursor: 'id',
    sql: `SELECT ptu.* FROM project_task_users ptu
          INNER JOIN project_tasks pt ON pt.id = ptu.task_id
          INNER JOIN project_sections ps ON ps.id = pt.project_section_id
          INNER JOIN projects p ON p.id = ps.project_id
          WHERE p.company_id = ? AND ptu.id > ? ORDER BY ptu.id ASC LIMIT ?`,
  },
  { name: 'project_task_comments', cursor: 'id', sql: 'SELECT * FROM project_task_comments WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  {
    name: 'project_users', single: true,
    sql: 'SELECT pu.* FROM project_users pu INNER JOIN projects p ON p.id = pu.project_id WHERE p.company_id = ? ORDER BY pu.project_id ASC, pu.user_id ASC',
  },
  { name: 'project_activity', cursor: 'id', sql: 'SELECT * FROM project_activity WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'project_attachments', cursor: 'id', sql: 'SELECT * FROM project_attachments WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
  { name: 'vehicles', cursor: 'id', sql: 'SELECT * FROM vehicles WHERE company_id = ? AND id > ? ORDER BY id ASC LIMIT ?' },
];

const isMissingTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

// DATE/DATETIME as plain strings ('2026-11-05', '2026-11-05 14:30:00'), no timezone shifting
const runQuery = (sql, values) => db.query({ sql, values, dateStrings: true });

const cleanValue = (value) => (Buffer.isBuffer(value) ? value.toString('base64') : value);
const cleanRow = (row) => {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (!SECRET_COLUMN.test(key)) out[key] = cleanValue(value);
  }
  return out;
};

// async generator over all rows of an entity; `meta.fields` is filled from the first query (also when there are no rows)
async function* readRows(entity, companyId, meta) {
  try {
    yield* readRowsUnsafe(entity, companyId, meta);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    // database without this table (a migration has not been applied there): nothing to export for it
    meta.fields = meta.fields || [];
    meta.missing = true;
  }
}

async function* readRowsUnsafe(entity, companyId, meta) {
  if (entity.single) {
    const [rows, fields] = await runQuery(entity.sql, [companyId]);
    meta.fields = fields.map((f) => f.name).filter((name) => !SECRET_COLUMN.test(name));
    for (const row of rows) yield cleanRow(row);
    return;
  }
  let last = 0;
  for (;;) {
    const [rows, fields] = await runQuery(entity.sql, [companyId, last, PAGE_SIZE]);
    if (!meta.fields) meta.fields = fields.map((f) => f.name).filter((name) => !SECRET_COLUMN.test(name));
    for (const row of rows) yield cleanRow(row);
    if (rows.length < PAGE_SIZE) return;
    last = rows[rows.length - 1][entity.cursor];
  }
}

// ---- CSV helpers (RFC 4180; cells starting with = + @ tab CR (or - before a non-number) get a leading ' against spreadsheet formula injection)
const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (typeof value === 'string' && /^([=+@\t\r]|-(?![\d.\s]))/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Readable producing the JSON array text of an entity; counts rows into `stats`
const jsonStream = (entity, companyId, stats) => Readable.from((async function* gen() {
  const meta = {};
  let first = true;
  yield '[\n';
  for await (const row of readRows(entity, companyId, meta)) {
    yield `${first ? '' : ',\n'}${JSON.stringify(row)}`;
    first = false;
    stats.rows += 1;
  }
  if (meta.missing) stats.missing_table = true;
  yield first ? ']\n' : '\n]\n';
})());

// Readable producing the CSV text (header from the query's column list, so an empty table still has a header)
const csvStream = (entity, companyId) => Readable.from((async function* gen() {
  const meta = {};
  let headerSent = false;
  for await (const row of readRows(entity, companyId, meta)) {
    if (!headerSent) {
      yield `﻿${meta.fields.map(csvCell).join(',')}\r\n`;
      headerSent = true;
    }
    yield `${meta.fields.map((field) => csvCell(row[field])).join(',')}\r\n`;
  }
  if (!headerSent) {
    // no rows: still emit the header (fields are known after the first query)
    yield `﻿${(meta.fields || []).map(csvCell).join(',')}\r\n`;
  }
})());

// What a download would contain: the file list and whether the files fit into the ZIP
const planFiles = async (companyId) => {
  const files = await listCompanyFiles(companyId);
  const present = files.filter((f) => f.status === 'present');
  const bytes = present.reduce((sum, f) => sum + (f.size_bytes || 0), 0);
  return {
    files,
    summary: {
      count: present.length,
      bytes,
      missing: files.filter((f) => f.status === 'missing').length,
      refused: files.filter((f) => f.status === 'not_owned').length,
      included: bytes <= MAX_INCLUDED_FILE_BYTES,
      max_included_bytes: MAX_INCLUDED_FILE_BYTES,
    },
  };
};

// Seconds until this company may export again (0 = now). Based on the audit log, so it survives restarts and several processes.
const exportRetryAfterSeconds = async (companyId) => {
  const [[row]] = await db.query(
    `SELECT TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(created_at, INTERVAL ? MINUTE)) AS wait_seconds
     FROM audit_logs
     WHERE company_id = ? AND action = 'company_export' AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [EXPORT_COOLDOWN_MINUTES, companyId, EXPORT_COOLDOWN_MINUTES]
  );
  return row ? Math.max(1, Number(row.wait_seconds) || 1) : 0;
};

// Builds the archive (not yet piped). Resolves { archive, stats } where stats is filled while the archive is consumed.
const buildExportArchive = async (companyId, { generatedBy = null } = {}) => {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const plan = await planFiles(companyId);
  const includeFiles = plan.summary.included;
  const tables = {};

  for (const entity of ENTITIES) {
    const stats = { rows: 0 };
    tables[entity.name] = stats;
    archive.append(jsonStream(entity, companyId, stats), { name: `data/${entity.name}.json` });
    archive.append(csvStream(entity, companyId), { name: `data/${entity.name}.csv` });
  }

  const manifestEntries = plan.files.map((f) => ({
    path: f.stored,
    source_table: f.source_table,
    source_id: f.source_id,
    column: f.column,
    size_bytes: f.size_bytes,
    status: f.status,
    in_archive: includeFiles && f.status === 'present',
    archive_path: includeFiles && f.status === 'present' ? `files${f.stored.replace(/^\/uploads/, '')}` : null,
  }));

  if (includeFiles) {
    for (const f of plan.files) {
      if (f.status === 'present') archive.file(f.abs, { name: `files${f.stored.replace(/^\/uploads/, '')}`, store: true });
    }
  }

  // manifest is built lazily, i.e. after every table above has been streamed (the archive processes its entries in order)
  archive.append(Readable.from((async function* gen() {
    yield JSON.stringify({
      format: 'liftelo-company-export',
      format_version: 1,
      generated_at: new Date().toISOString(),
      company_id: companyId,
      generated_by_user_id: generatedBy,
      tables: Object.fromEntries(Object.entries(tables).map(([name, s]) => [name, { rows: s.rows, ...(s.missing_table ? { missing_table: true } : {}), json: `data/${name}.json`, csv: `data/${name}.csv` }])),
      files: {
        included_in_archive: includeFiles,
        count: plan.summary.count,
        total_bytes: plan.summary.bytes,
        max_included_bytes: MAX_INCLUDED_FILE_BYTES,
        note: includeFiles
          ? 'All uploaded files are in the files/ folder of this archive.'
          : 'The uploaded files are too large for one archive and are only listed here; ask support for a separate file transfer.',
        entries: manifestEntries,
      },
      not_included: [
        'password hashes, invitation and reset tokens, sessions',
        'billing and payment provider data',
        'audit log and legal-acceptance records (kept by Liftelo as security/evidence records)',
      ],
    }, null, 2);
  })()), { name: 'manifest.json' });

  return { archive, tables, plan };
};

module.exports = {
  ENTITIES,
  PAGE_SIZE,
  MAX_INCLUDED_FILE_BYTES,
  EXPORT_COOLDOWN_MINUTES,
  buildExportArchive,
  planFiles,
  exportRetryAfterSeconds,
  csvCell,
  readRows,
  isMissingTable,
};
