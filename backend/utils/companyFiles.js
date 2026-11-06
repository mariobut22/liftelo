const fs = require('fs');
const path = require('path');
const db = require('../db');

// Uploaded files that belong to ONE company: which stored paths exist in its rows and where they live on disk.
// Used by the company data export (routes/company-export.js) and the purge script (scripts/purge-company.js).
// Ownership follows utils/uploadsAccess.js: new files carry "<companyId>-" in the name, legacy intervention photos are
// owned through interventions.uploaded_files of the company. Anything else (odd names, nested paths, ..) is refused.

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const PREFIXED_DIRS = new Set(['company-logos', 'vehicles', 'signatures', 'work-orders', 'projects', 'interventions']);
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

// '/uploads/<dir>/<file>' (also '/api/uploads/...' or 'uploads/...') -> { dir, file } or null
const parseStoredPath = (stored) => {
  if (typeof stored !== 'string') return null;
  let value = stored.trim().split('?')[0];
  if (!value || value.includes('\0') || value.includes('\\')) return null;
  value = value.replace(/^\/?api\//, '/').replace(/^\//, '');
  const segments = value.split('/');
  if (segments.length !== 3 || segments[0] !== 'uploads') return null;
  const [, dir, file] = segments;
  if (!PREFIXED_DIRS.has(dir) || !SAFE_NAME.test(file) || file === '.' || file === '..') return null;
  return { dir, file };
};

// `legacyOwned`: the path was read from interventions.uploaded_files of THIS company (no company id in the old file names)
const resolveCompanyFile = (companyId, stored, { legacyOwned = false } = {}) => {
  const parsed = parseStoredPath(stored);
  if (!parsed) return null;
  const prefixed = /^(\d+)-/.exec(parsed.file);
  const owned = prefixed
    ? Number(prefixed[1]) === Number(companyId)
    : legacyOwned && parsed.dir === 'interventions';
  if (!owned) return null;
  const abs = path.join(UPLOADS_ROOT, parsed.dir, parsed.file);
  if (!abs.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return { dir: parsed.dir, file: parsed.file, abs, stored: `/uploads/${parsed.dir}/${parsed.file}` };
};

const isMissingTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

// Reads every stored file path referenced by the company's rows (all queries filtered by company_id).
// Returns [{ source_table, source_id, stored_path, column, legacy }] (not yet checked against the disk).
const referencedPaths = async (companyId) => {
  const out = [];
  const add = (source_table, source_id, column, value, legacy = false) => {
    if (value) out.push({ source_table, source_id, column, stored_path: String(value).trim(), legacy });
  };
  const run = async (sql, handler) => {
    try {
      const [rows] = await db.query(sql, [companyId]);
      rows.forEach(handler);
    } catch (err) {
      if (!isMissingTable(err)) throw err; // an older database without that table simply has no files there
    }
  };

  await run('SELECT id, logo_path FROM companies WHERE id = ?', (r) => add('companies', r.id, 'logo_path', r.logo_path));
  await run('SELECT id, image_path FROM vehicles WHERE company_id = ?', (r) => add('vehicles', r.id, 'image_path', r.image_path));
  await run(
    'SELECT id, uploaded_files, pdf_path, technician_signature_path, client_signature_path FROM interventions WHERE company_id = ?',
    (r) => {
      String(r.uploaded_files || '').split(',').forEach((p) => add('interventions', r.id, 'uploaded_files', p, true));
      add('interventions', r.id, 'pdf_path', r.pdf_path);
      add('interventions', r.id, 'technician_signature_path', r.technician_signature_path);
      add('interventions', r.id, 'client_signature_path', r.client_signature_path);
    }
  );
  await run(
    'SELECT id, technician_signature_path, client_signature_path FROM rms_visits WHERE company_id = ?',
    (r) => {
      add('rms_visits', r.id, 'technician_signature_path', r.technician_signature_path);
      add('rms_visits', r.id, 'client_signature_path', r.client_signature_path);
    }
  );
  await run('SELECT id, file_path FROM intervention_photos WHERE company_id = ?', (r) => add('intervention_photos', r.id, 'file_path', r.file_path));
  await run('SELECT id, file_path FROM work_order_attachments WHERE company_id = ?', (r) => add('work_order_attachments', r.id, 'file_path', r.file_path));
  await run('SELECT id, file_path FROM project_attachments WHERE company_id = ?', (r) => add('project_attachments', r.id, 'file_path', r.file_path));
  return out;
};

// Distinct files of the company with their state on disk: [{ ..., stored, abs, size_bytes, status }]
// status: present | missing (path is valid but the file is gone) | not_owned (path refused: not this company's / unsafe)
const listCompanyFiles = async (companyId) => {
  const refs = await referencedPaths(companyId);
  const seen = new Map();
  for (const ref of refs) {
    const resolved = resolveCompanyFile(companyId, ref.stored_path, { legacyOwned: ref.legacy });
    const key = resolved ? resolved.stored : `refused:${ref.stored_path}`;
    if (seen.has(key)) continue;
    if (!resolved) {
      seen.set(key, { ...ref, stored: ref.stored_path, abs: null, size_bytes: null, status: 'not_owned' });
      continue;
    }
    let size = null;
    let status = 'present';
    try {
      const st = await fs.promises.stat(resolved.abs);
      if (st.isFile()) size = st.size;
      else status = 'missing';
    } catch {
      status = 'missing';
    }
    seen.set(key, { ...ref, stored: resolved.stored, abs: resolved.abs, size_bytes: size, status });
  }
  return [...seen.values()];
};

module.exports = { UPLOADS_ROOT, parseStoredPath, resolveCompanyFile, referencedPaths, listCompanyFiles };
