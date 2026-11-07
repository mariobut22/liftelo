#!/usr/bin/env node
/*
 * End-to-end test of the signature system (technician signature = lock + frozen snapshot, late client completion by drawn
 * signature / scan / declined, content hash + verification, tenant isolation, roles) against a THROWAWAY MySQL/MariaDB.
 * Same requirements as tenant-isolation-test.js (see its header and docs/infrastructure.md section 15): a fresh scratch database
 * named "tt" / "*_test" on localhost loaded from liftelo.sql + ALL migrations (incl. 20261114_report_signature_completion.sql).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3471 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   TENANT_TEST_PORT=3473 node backend/scripts/signatures-test.js
 *
 * Exit code 0 = all checks passed. Writes signature/snapshot files into backend/uploads/* and removes them again.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const cfg = {
  host: process.env.TENANT_TEST_DB_HOST || '127.0.0.1',
  port: process.env.TENANT_TEST_DB_PORT || '3306',
  user: process.env.TENANT_TEST_DB_USER || 'root',
  password: process.env.TENANT_TEST_DB_PASSWORD || '',
  name: process.env.TENANT_TEST_DB_NAME || ''
};
if (!['127.0.0.1', 'localhost'].includes(cfg.host) || !/^(tt|.*_test|.*_tmp|tenant.*)$/i.test(cfg.name) || process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: needs TENANT_TEST_DB_NAME like "tt" / "*_test" on localhost (never a real database).');
  process.exit(2);
}

process.chdir(os.tmpdir());
const PORT = Number(process.env.TENANT_TEST_PORT || 3473);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'signatures-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
  MULTI_COMPANY_ENABLED: 'false'
});

const BACKEND = path.join(__dirname, '..');
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'));
const db = require(path.join(BACKEND, 'db'));

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};

const BASE = `http://127.0.0.1:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n% scan fixture\n'), crypto.randomBytes(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(64)]);

async function call(method, url, { cookie, json, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  } catch (err) {
    return { status: 0, body: `no response (${err.message})`, headers: new Headers(), buf: Buffer.alloc(0) };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  let parsed = null;
  try { parsed = JSON.parse(buf.toString('utf8')); } catch { parsed = null; }
  return { status: res.status, body: parsed, headers: res.headers, buf };
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

const blob = (buf, type) => new Blob([buf], { type });
function signForm({ tech, client, name, role, techBuf = PNG, clientBuf = PNG, techType = 'image/png', clientType = 'image/png' }) {
  const form = new FormData();
  if (tech) form.append('technician_signature', blob(techBuf, techType), 'technician.png');
  if (client) form.append('client_signature', blob(clientBuf, clientType), 'client.png');
  if (name !== undefined) form.append('client_signer_name', name);
  if (role !== undefined) form.append('client_signer_role', role);
  return form;
}
function scanForm(buf, type, note) {
  const form = new FormData();
  if (buf) form.append('scan', blob(buf, type), 'scan.bin');
  if (note) form.append('note', note);
  return form;
}
function clientForm({ name, role, buf = PNG }) {
  const form = new FormData();
  form.append('client_signature', blob(buf, 'image/png'), 'client.png');
  if (name !== undefined) form.append('signer_name', name);
  if (role !== undefined) form.append('signer_role', role);
  return form;
}

const uploadsRoot = path.join(BACKEND, 'uploads');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const startedAt = Date.now();
// signature files of THIS run whose name starts with `prefix` (names carry a 13-digit timestamp; older leftovers are ignored)
const sigFiles = (prefix) => fs.readdirSync(path.join(uploadsRoot, 'signatures'))
  .filter((f) => f.startsWith(prefix) && Number((/-(\d{13})-/.exec(f) || [])[1]) >= startedAt);

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Sig A');
  const B = await mkCompany('Sig B');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@sig.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, `Full ${label}`, companyId, email]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email, username: `${label}-${tag}`, full_name: `Full ${label}` };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const techA = await mkUser('techA', A, 'technician');
  const tech2A = await mkUser('tech2A', A, 'technician');
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin');
  const locA = (await q('INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [`LocA-${tag}`, 'A street 1', A])).insertId;
  const locB = (await q('INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [`LocB-${tag}`, 'B street 1', B])).insertId;
  await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [locA, A, 'EL-A']);

  const mkRms = async (userId, companyId = A, locationId = locA) => {
    const id = (await q(
      'INSERT INTO rms_visits (location_id, user_id, visit_date, notes_general, company_id) VALUES (?, ?, CURDATE(), ?, ?)',
      [locationId, userId, `visit note ${tag}`, companyId]
    )).insertId;
    await q('INSERT INTO rms_visit_items (visit_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [id, 'EL-A', 'O.K.', 'fine', companyId]);
    return id;
  };
  const mkInt = async (technician, extra = {}) => {
    const cols = ['date', 'technician', 'location_id', 'company_id', 'uploaded_files', 'status', 'notes'];
    const vals = [technician, locA, A, '', 'O.K.', `intervention note ${tag}`];
    const id = (await q(
      `INSERT INTO interventions (date, technician, location_id, company_id, uploaded_files, status, notes${extra.created_by ? ', created_by_user_id' : ''})
       VALUES (NOW(), ?, ?, ?, ?, ?, ?${extra.created_by ? ', ?' : ''})`,
      extra.created_by ? [...vals, extra.created_by] : vals
    )).insertId;
    void cols;
    await q('INSERT INTO intervention_items (intervention_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [id, 'EL-A', 'O.K.', 'item', A]);
    return id;
  };

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));

  const cAdminA = await login(adminA.email, pw);
  const cTechA = await login(techA.email, pw);
  const cTech2A = await login(tech2A.email, pw);
  const cViewerA = await login(viewerA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  const reportRow = async (type, id) => (await q(`SELECT * FROM ${type === 'rms' ? 'rms_visits' : 'interventions'} WHERE id = ?`, [id]))[0];
  const sign = (cookie, type, id, form) => call('POST', `/api/reports/${type}/${id}/sign`, { cookie, form });
  const state = async (cookie, type, id) => (await call('GET', `/api/reports/${type}/${id}/signature`, { cookie })).body;

  // ------------------------------------------------------------------ state machine + lock at technician signature
  console.log('\n[state machine: technician signs, client signs later]');
  const rms1 = await mkRms(techA.id);
  let st = await state(cTechA, 'rms', rms1);
  check('new report is unsigned', st?.state === 'unsigned' && st.locked === false, JSON.stringify(st));
  let r = await sign(cTechA, 'rms', rms1, signForm({ tech: true }));
  check('technician signs alone (client not present) -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.body)}`);
  check('state is awaiting_client, row technician_signed', r.body?.signature_state === 'awaiting_client' && r.body?.signature_status === 'technician_signed', JSON.stringify(r.body));
  check('snapshot created at signing', r.body?.snapshot_ok === true && (await count('SELECT COUNT(*) c FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', rms1])) === 1);
  let row = await reportRow('rms', rms1);
  check('row: technician path/time/user/name stored, hash frozen, no client data',
    row.technician_signature_path && row.technician_signed_at && row.technician_signed_by_user_id === techA.id
    && row.technician_signer_name === techA.full_name && /^[0-9a-f]{64}$/.test(row.document_hash)
    && !row.client_signature_path && !row.client_signer_name && !row.signed_at);
  const snap1 = (await q('SELECT * FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', rms1]))[0];
  check('snapshot hash equals the row hash; file exists with matching sha256', snap1.document_hash === row.document_hash
    && fs.existsSync(path.join(BACKEND, snap1.file_path)) && sha(fs.readFileSync(path.join(BACKEND, snap1.file_path))) === snap1.pdf_sha256);
  check('snapshot file name carries the company prefix', path.basename(snap1.file_path).startsWith(`${A}-`) && snap1.file_path.startsWith('/uploads/signed-reports/'));
  r = await sign(cTechA, 'rms', rms1, signForm({ tech: true }));
  check('signing again -> 403 report_already_signed', r.status === 403 && r.body?.code === 'report_already_signed', `got ${r.status}`);
  const intLocked = await mkInt(techA.username);
  r = await sign(cTechA, 'intervention', intLocked, signForm({ tech: true }));
  check('intervention technician-signed too', r.status === 200 && r.body?.signature_state === 'awaiting_client');
  const photoForm = new FormData();
  photoForm.append('photo', blob(PNG, 'image/png'), 'p.png');
  r = await call('POST', `/api/interventions/${intLocked}/photos`, { cookie: cTechA, form: photoForm });
  check('content locked at technician signature: photo upload -> 403 report_signed_locked', r.status === 403 && r.body?.code === 'report_signed_locked', `got ${r.status}`);
  r = await call('PUT', `/api/interventions/${intLocked}/status`, { cookie: cAdminA, json: { status: 'O.K.' } });
  check('content locked: status change -> 403 report_signed_locked', r.status === 403 && r.body?.code === 'report_signed_locked', `got ${r.status}`);

  console.log('\n[atomic signing: two parallel sign calls]');
  const raceId = await mkRms(techA.id);
  const [r1, r2] = await Promise.all([
    sign(cTechA, 'rms', raceId, signForm({ tech: true })),
    sign(cTechA, 'rms', raceId, signForm({ tech: true }))
  ]);
  const statuses = [r1.status, r2.status].sort();
  check('exactly one parallel sign succeeds (200 + 403)', statuses[0] === 200 && statuses[1] === 403, JSON.stringify(statuses));
  check('only one technician signature file for the race report', sigFiles(`${A}-rms${raceId}tech-`).length === 1);
  check('exactly one snapshot for the race report', (await count('SELECT COUNT(*) c FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', raceId])) === 1);
  const raceB = await mkRms(techA.id);
  const [x1, x2] = await Promise.all([
    sign(cAdminA, 'rms', raceB, signForm({ tech: true, client: true, name: 'Ivo Ivic', role: 'Manager' })),
    sign(cTechA, 'rms', raceB, signForm({ tech: true, client: true, name: 'Pero Peric', role: 'Owner' }))
  ]);
  check('parallel sign with both signatures: still one winner', [x1.status, x2.status].sort().join() === '200,403', `${x1.status},${x2.status}`);

  // ------------------------------------------------------------------ validation
  console.log('\n[validation: signer details, image content, size]');
  const v1 = await mkRms(techA.id);
  r = await sign(cTechA, 'rms', v1, signForm({ tech: true, client: true }));
  check('client signature without signer name -> 400 signer_name_required', r.status === 400 && r.body?.code === 'signer_name_required', `got ${r.status}`);
  r = await sign(cTechA, 'rms', v1, signForm({ tech: true, client: true, name: 'Ivo Ivic' }));
  check('client signature without role -> 400 signer_role_required', r.status === 400 && r.body?.code === 'signer_role_required', `got ${r.status}`);
  r = await sign(cTechA, 'rms', v1, signForm({ tech: true, techBuf: Buffer.from('this is not a png, just text pretending to be one'), techType: 'image/png' }));
  check('fake PNG (wrong magic bytes, image/png mimetype) -> 415', r.status === 415 && r.body?.code === 'invalid_file_type', `got ${r.status}`);
  r = await sign(cTechA, 'rms', v1, signForm({ tech: true, techBuf: JPG }));
  check('JPEG sent as signature -> 415', r.status === 415);
  r = await sign(cTechA, 'rms', v1, signForm({ tech: true, techBuf: Buffer.concat([PNG, Buffer.alloc(2.5 * 1024 * 1024)]) }));
  check('signature over 2 MB -> 413 file_too_large', r.status === 413 && r.body?.code === 'file_too_large', `got ${r.status}`);
  r = await sign(cTechA, 'rms', v1, signForm({}));
  check('no signatures -> 400 no_signatures_provided', r.status === 400 && r.body?.code === 'no_signatures_provided');
  r = await sign(cTechA, 'rms', v1, signForm({ client: true, name: 'Ivo', role: 'Manager' }));
  check('client-only on an unsigned report -> 400 technician_signature_required', r.status === 400 && r.body?.code === 'technician_signature_required', `got ${r.status}`);
  row = await reportRow('rms', v1);
  check('rejected requests changed nothing (still draft, no files kept)', row.signature_status === 'draft' && !row.technician_signature_path
    && sigFiles(`${A}-rms${v1}`).length === 0);

  console.log('\n[both signatures at once]');
  r = await sign(cTechA, 'rms', v1, signForm({ tech: true, client: true, name: '  Ivo   Ivic ', role: 'Building manager' }));
  check('technician + client with name and role -> 200 completed', r.status === 200 && r.body?.signature_state === 'completed' && r.body?.signature_status === 'signed', JSON.stringify(r.body));
  row = await reportRow('rms', v1);
  check('client name (whitespace normalised), role and time stored on the row', row.client_signer_name === 'Ivo Ivic' && row.client_signer_role === 'Building manager' && row.client_signed_at && row.signed_at && row.signed_by_user_id === techA.id);
  let ver = await call('GET', `/api/reports/rms/${v1}/verify`, { cookie: cAdminA });
  check('verify -> ok', ver.status === 200 && ver.body?.status === 'ok' && ver.body.snapshots.length === 1, JSON.stringify(ver.body));

  // ------------------------------------------------------------------ late completion: drawn
  console.log('\n[late completion: drawn signature in the app]');
  const idDrawn = rms1; // technician-signed above, awaiting the client
  r = await call('POST', `/api/reports/rms/${idDrawn}/client-signature`, { cookie: cTech2A, form: clientForm({ role: 'Manager' }) });
  check('late client signature without name -> 400 signer_name_required', r.status === 400 && r.body?.code === 'signer_name_required');
  r = await call('POST', `/api/reports/rms/${idDrawn}/client-signature`, { cookie: cTech2A, form: clientForm({ name: 'Ana Anic' }) });
  check('late client signature without role -> 400 signer_role_required', r.status === 400 && r.body?.code === 'signer_role_required');
  r = await call('POST', `/api/reports/rms/${idDrawn}/client-signature`, { cookie: cTech2A, form: clientForm({ name: 'Ana Anic', role: 'Manager', buf: Buffer.from('not a png at all, sorry') }) });
  check('late client signature with a fake PNG -> 415', r.status === 415);
  r = await call('POST', `/api/reports/rms/${idDrawn}/client-signature`, { cookie: cViewerA, form: clientForm({ name: 'Ana Anic', role: 'Manager' }) });
  check('viewer cannot collect the client signature -> 403 viewer_read_only', r.status === 403 && r.body?.code === 'viewer_read_only', `got ${r.status}`);
  r = await call('POST', `/api/reports/rms/${v1 + 100000}/client-signature`, { cookie: cTech2A, form: clientForm({ name: 'Ana Anic', role: 'Manager' }) });
  check('unknown report -> 404', r.status === 404);
  const unsignedRms = await mkRms(techA.id);
  r = await call('POST', `/api/reports/rms/${unsignedRms}/client-signature`, { cookie: cTech2A, form: clientForm({ name: 'Ana Anic', role: 'Manager' }) });
  check('completion on an unsigned report -> 409 report_not_signed', r.status === 409 && r.body?.code === 'report_not_signed', `got ${r.status}`);
  const before = await reportRow('rms', idDrawn);
  r = await call('POST', `/api/reports/rms/${idDrawn}/client-signature`, { cookie: cTech2A, form: clientForm({ name: 'Ana Anic', role: 'Building manager' }) });
  check('another technician of the company collects the client signature -> 201 completed', r.status === 201 && r.body?.signature_state === 'completed' && r.body?.signature?.client?.method === 'drawn', `got ${r.status} ${JSON.stringify(r.body)}`);
  const after = await reportRow('rms', idDrawn);
  check('original report row untouched by the completion (INSERT-only)', JSON.stringify(before) === JSON.stringify(after));
  const comp = (await q('SELECT * FROM report_completions WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', idDrawn]))[0];
  check('completion record: method, name, role, who', comp?.method === 'drawn' && comp.signer_name === 'Ana Anic' && comp.signer_role === 'Building manager' && comp.created_by === tech2A.id && comp.created_by_name === tech2A.full_name && comp.signature_sha256 === sha(PNG));
  check('second snapshot created for the completion', (await count('SELECT COUNT(*) c FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', idDrawn])) === 2);
  r = await call('POST', `/api/reports/rms/${idDrawn}/client-signature`, { cookie: cTech2A, form: clientForm({ name: 'Ana Anic', role: 'Manager' }) });
  check('second completion -> 409 already_completed', r.status === 409 && r.body?.code === 'already_completed', `got ${r.status}`);
  r = await call('POST', `/api/reports/rms/${idDrawn}/client-declined`, { cookie: cTech2A, json: { reason: 'client was absent today' } });
  check('declined on a completed report -> 409', r.status === 409);
  st = await state(cViewerA, 'rms', idDrawn);
  check('viewer can read the state; timeline has created / technician / client events', st?.state === 'completed'
    && st.timeline.map((e) => e.type).join() === 'created,technician_signed,client_signed' && st.client.name === 'Ana Anic' && st.short_hash?.length === 12, JSON.stringify(st?.timeline));
  ver = await call('GET', `/api/reports/rms/${idDrawn}/verify`, { cookie: cAdminA });
  check('verify -> ok for both snapshots', ver.body?.status === 'ok' && ver.body.snapshots.length === 2 && ver.body.snapshots.every((s) => s.hash_ok && s.pdf_ok), JSON.stringify(ver.body));

  // ------------------------------------------------------------------ late completion: scan
  console.log('\n[late completion: scan of the signed paper copy]');
  const intScan = await mkInt(techA.username);
  r = await sign(cTechA, 'intervention', intScan, signForm({ tech: true }));
  check('intervention signed by its technician (name match)', r.status === 200);
  r = await call('POST', `/api/reports/intervention/${intScan}/client-scan`, { cookie: cAdminA, form: scanForm(null) });
  check('scan endpoint without a file -> 400 scan_required', r.status === 400 && r.body?.code === 'scan_required');
  r = await call('POST', `/api/reports/intervention/${intScan}/client-scan`, { cookie: cAdminA, form: scanForm(Buffer.concat([Buffer.from('MZ'), crypto.randomBytes(200)]), 'application/pdf') });
  check('EXE with a pdf mimetype -> 415', r.status === 415 && r.body?.code === 'invalid_file_type', `got ${r.status}`);
  r = await call('POST', `/api/reports/intervention/${intScan}/client-scan`, { cookie: cAdminA, form: scanForm(Buffer.concat([Buffer.from('PK\u0003\u0004'), crypto.randomBytes(200)]), 'application/pdf') });
  check('ZIP -> 415', r.status === 415);
  r = await call('POST', `/api/reports/intervention/${intScan}/client-scan`, { cookie: cAdminA, form: scanForm(Buffer.concat([PDF, Buffer.alloc(10.5 * 1024 * 1024)]), 'application/pdf') });
  check('scan over 10 MB -> 413 file_too_large', r.status === 413 && r.body?.code === 'file_too_large', `got ${r.status}`);
  check('rejected scans stored nothing', (await count('SELECT COUNT(*) c FROM report_completions WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'intervention', intScan])) === 0);
  r = await call('POST', `/api/reports/intervention/${intScan}/client-scan`, { cookie: cViewerA, form: scanForm(PDF, 'application/pdf') });
  check('viewer cannot attach a scan -> 403', r.status === 403);
  r = await call('POST', `/api/reports/intervention/${intScan}/client-scan`, { cookie: cAdminA, form: scanForm(PDF, 'application/pdf', 'e-mailed by the building manager') });
  check('valid PDF scan -> 201 completed (scan)', r.status === 201 && r.body?.signature_state === 'completed' && r.body?.signature?.client?.method === 'scan', `got ${r.status} ${JSON.stringify(r.body)}`);
  const scanComp = (await q('SELECT * FROM report_completions WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'intervention', intScan]))[0];
  check('scan record: path with company prefix, mime, size, sha256, note, who', scanComp?.scan_path?.startsWith('/uploads/signed-reports/') && path.basename(scanComp.scan_path).startsWith(`${A}-`)
    && scanComp.scan_mime === 'application/pdf' && scanComp.scan_size === PDF.length && scanComp.scan_sha256 === sha(PDF)
    && scanComp.note === 'e-mailed by the building manager' && scanComp.created_by === adminA.id);
  r = await call('GET', `/api/uploads${scanComp.scan_path.replace('/uploads', '')}`, { cookie: cAdminA });
  check('scan readable by its company', r.status === 200 && r.buf.equals(PDF));
  r = await call('GET', `/api/uploads${scanComp.scan_path.replace('/uploads', '')}`, { cookie: cAdminB });
  check('scan not readable by another company -> 404', r.status === 404);
  const intScan2 = await mkInt(techA.username);
  await sign(cTechA, 'intervention', intScan2, signForm({ tech: true }));
  r = await call('POST', `/api/reports/intervention/${intScan2}/client-scan`, { cookie: cTechA, form: scanForm(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(100)]), 'image/png') });
  check('PNG scan accepted', r.status === 201);
  const intScan3 = await mkInt(techA.username);
  await sign(cTechA, 'intervention', intScan3, signForm({ tech: true }));
  r = await call('POST', `/api/reports/intervention/${intScan3}/client-scan`, { cookie: cTechA, form: scanForm(JPG, 'image/jpeg') });
  check('JPEG scan accepted', r.status === 201);

  // ------------------------------------------------------------------ declined
  console.log('\n[declined / absent]');
  const decl = await mkRms(techA.id);
  await sign(cTechA, 'rms', decl, signForm({ tech: true }));
  r = await call('POST', `/api/reports/rms/${decl}/client-declined`, { cookie: cTechA, json: { reason: 'no' } });
  check('declined without a real reason -> 400 reason_required', r.status === 400 && r.body?.code === 'reason_required');
  r = await call('POST', `/api/reports/rms/${decl}/client-declined`, { cookie: cTechA, json: { reason: 'Building manager refused to sign' } });
  check('declined with reason -> 201 closed_without_client (not a client signature)', r.status === 201 && r.body?.signature_state === 'closed_without_client' && r.body?.signature?.client?.method === 'declined', JSON.stringify(r.body));
  row = await reportRow('rms', decl);
  check('declined leaves the client columns empty', !row.client_signature_path && !row.client_signer_name && row.signature_status === 'technician_signed');
  r = await call('POST', `/api/reports/rms/${decl}/client-declined`, { cookie: cTechA, json: { reason: 'Building manager refused again' } });
  check('declined twice -> 409', r.status === 409);
  let list = await call('POST', '/api/records/filter', { cookie: cAdminA, json: { type: 'rms', signature_state: 'closed_without_client' } });
  check('list filter closed_without_client returns it', list.status === 200 && list.body.some((x) => x.id === decl && x.signature_state === 'closed_without_client'));
  r = await call('POST', `/api/reports/rms/${decl}/client-scan`, { cookie: cAdminA, form: scanForm(PDF, 'application/pdf', 'client sent the signed copy later') });
  check('scan after declined is allowed -> completed', r.status === 201 && r.body?.signature_state === 'completed');
  check('both completion records are kept (append-only)', (await count('SELECT COUNT(*) c FROM report_completions WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', decl])) === 2);
  st = await state(cAdminA, 'rms', decl);
  check('timeline shows declined then scan', st.timeline.map((e) => e.type).join() === 'created,technician_signed,client_declined,client_signed', JSON.stringify(st.timeline.map((e) => e.type)));

  // ------------------------------------------------------------------ waiting list, filter, summary
  console.log('\n[waiting list / filter / summary]');
  const wait1 = await mkRms(techA.id);
  await sign(cTechA, 'rms', wait1, signForm({ tech: true }));
  list = await call('POST', '/api/records/filter', { cookie: cAdminA, json: { type: 'rms', signature_state: 'awaiting_client' } });
  check('filter awaiting_client lists the waiting report', list.status === 200 && list.body.some((x) => x.id === wait1 && x.signature_state === 'awaiting_client'));
  check('...and not the completed ones', !list.body.some((x) => x.id === idDrawn || x.id === v1));
  list = await call('POST', '/api/records/filter', { cookie: cAdminA, json: { type: 'rms' } });
  check('unfiltered list carries signature_state for every row', list.body.every((x) => ['unsigned', 'awaiting_client', 'completed', 'closed_without_client'].includes(x.signature_state)));
  list = await call('POST', '/api/records/filter', { cookie: cAdminA, json: { type: 'rms', signature_state: 'bogus' } });
  check('invalid signature_state -> 400', list.status === 400);
  const waiting = await call('GET', '/api/reports/awaiting-client', { cookie: cTechA });
  const expectWaiting = await count("SELECT (SELECT COUNT(*) FROM rms_visits WHERE company_id = ? AND signature_status = 'technician_signed') + (SELECT COUNT(*) FROM interventions WHERE company_id = ? AND signature_status = 'technician_signed') AS c", [A, A]);
  const expectDone = await count(
    "SELECT COUNT(*) AS c FROM report_completions WHERE company_id = ? AND method IN ('drawn','scan')", [A]);
  check('awaiting-client summary: count, oldest_at, items', waiting.status === 200 && waiting.body.count > 0 && waiting.body.count <= expectWaiting && waiting.body.oldest_at && waiting.body.items.length >= 1 && expectDone > 0, JSON.stringify(waiting.body));
  check('summary of company B is empty (tenant)', (await call('GET', '/api/reports/awaiting-client', { cookie: cAdminB })).body.count === 0);

  // ------------------------------------------------------------------ PDFs: frozen copy + footer
  console.log('\n[frozen PDF]');
  const pdf = await call('GET', `/api/rms/${wait1}/pdf`, { cookie: cAdminA });
  const snapWait = (await q('SELECT * FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', wait1]))[0];
  check('GET /api/rms/:id/pdf serves the frozen snapshot byte for byte', pdf.status === 200 && sha(pdf.buf) === snapWait.pdf_sha256, `got ${pdf.status}`);
  const live = await call('GET', `/api/rms/${wait1}/pdf?live=1`, { cookie: cAdminA });
  check('?live=1 regenerates a live PDF', live.status === 200 && live.headers.get('content-type')?.includes('pdf') && sha(live.buf) !== snapWait.pdf_sha256);
  const frozenIntPdf = await call('GET', `/api/interventions/${intScan}/pdf`, { cookie: cAdminA });
  const snapsInt = await q('SELECT * FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ? ORDER BY snapshot_no DESC', [A, 'intervention', intScan]);
  check('intervention PDF = latest frozen snapshot', frozenIntPdf.status === 200 && sha(frozenIntPdf.buf) === snapsInt[0].pdf_sha256 && snapsInt.length === 2);
  const snapPdf = await call('GET', `/api/reports/rms/${wait1}/snapshots/${snapWait.id}/pdf`, { cookie: cViewerA });
  check('snapshot PDF endpoint readable by a viewer', snapPdf.status === 200 && sha(snapPdf.buf) === snapWait.pdf_sha256);
  try {
    const tmpPdf = path.join(os.tmpdir(), `sig-${tag}.pdf`);
    fs.writeFileSync(tmpPdf, pdf.buf);
    const text = execFileSync('pdftotext', ['-layout', tmpPdf, '-'], { encoding: 'utf8' });
    fs.unlinkSync(tmpPdf);
    check('PDF footer/signature block: document number, hash prefix, signer name, date and time',
      text.includes(`RMS-${String(wait1).padStart(6, '0')}`) && text.includes(snapWait.document_hash.slice(0, 12)) && text.includes(techA.full_name)
      && /\d{4}[.,]? \d{1,2}:\d{2}:\d{2}/.test(text), text.slice(-600));
  } catch (err) {
    console.log(`  skip  pdftotext not available (${err.code || err.message})`);
  }

  // ------------------------------------------------------------------ verification / tampering
  console.log('\n[verification: tampering is detected]');
  ver = await call('GET', `/api/reports/rms/${wait1}/verify`, { cookie: cAdminA });
  check('verify ok before tampering', ver.body?.status === 'ok');
  await q('UPDATE rms_visits SET notes_general = ? WHERE id = ?', ['TAMPERED note', wait1]);
  ver = await call('GET', `/api/reports/rms/${wait1}/verify`, { cookie: cAdminA });
  check('row tampered -> "differs"', ver.body?.status === 'differs' && ver.body.snapshots[0].hash_ok === false, JSON.stringify(ver.body));
  await q('UPDATE rms_visits SET notes_general = ? WHERE id = ?', [`visit note ${tag}`, wait1]);
  ver = await call('GET', `/api/reports/rms/${wait1}/verify`, { cookie: cAdminA });
  check('restored -> ok again', ver.body?.status === 'ok');
  await q('UPDATE rms_visit_items SET comment = ? WHERE visit_id = ? AND company_id = ?', ['changed item', wait1, A]);
  ver = await call('GET', `/api/reports/rms/${wait1}/verify`, { cookie: cAdminA });
  check('RMS item tampered -> "differs"', ver.body?.status === 'differs');
  await q('UPDATE rms_visit_items SET comment = ? WHERE visit_id = ? AND company_id = ?', ['fine', wait1, A]);
  const pdfAbs = path.join(BACKEND, snapWait.file_path);
  const pdfOriginal = fs.readFileSync(pdfAbs);
  fs.writeFileSync(pdfAbs, Buffer.concat([pdfOriginal, Buffer.from('\n% tampered')]));
  ver = await call('GET', `/api/reports/rms/${wait1}/verify`, { cookie: cAdminA });
  check('stored PDF file tampered -> "differs" (pdf_ok false)', ver.body?.status === 'differs' && ver.body.snapshots[0].pdf_ok === false && ver.body.snapshots[0].hash_ok === true);
  fs.writeFileSync(pdfAbs, pdfOriginal);
  // intervention: item + photo are part of the hash
  const photoFile = `${A}-i${intScan2}-${Date.now()}-abcdef.png`;
  const intHashBefore = (await call('GET', `/api/reports/intervention/${intScan2}/verify`, { cookie: cAdminA })).body;
  check('intervention verify ok', intHashBefore?.status === 'ok');
  await q('UPDATE intervention_items SET comment = ? WHERE intervention_id = ? AND company_id = ?', ['edited', intScan2, A]);
  check('intervention item tampered -> "differs"', (await call('GET', `/api/reports/intervention/${intScan2}/verify`, { cookie: cAdminA })).body?.status === 'differs');
  await q('UPDATE intervention_items SET comment = ? WHERE intervention_id = ? AND company_id = ?', ['item', intScan2, A]);
  fs.mkdirSync(path.join(uploadsRoot, 'interventions'), { recursive: true });
  fs.writeFileSync(path.join(uploadsRoot, 'interventions', photoFile), PNG);
  await q('INSERT INTO intervention_photos (company_id, intervention_id, file_path, mime, size_bytes, kind) VALUES (?, ?, ?, ?, ?, ?)', [A, intScan2, `/uploads/interventions/${photoFile}`, 'image/png', PNG.length, 'other']);
  check('photo added after signing -> "differs"', (await call('GET', `/api/reports/intervention/${intScan2}/verify`, { cookie: cAdminA })).body?.status === 'differs');
  await q('DELETE FROM intervention_photos WHERE company_id = ? AND intervention_id = ?', [A, intScan2]);
  check('...and ok again without it', (await call('GET', `/api/reports/intervention/${intScan2}/verify`, { cookie: cAdminA })).body?.status === 'ok');
  // a signed intervention WITH a photo: file bytes are part of the hash
  const intPhoto = await mkInt(techA.username);
  const photo2 = `${A}-i${intPhoto}-${Date.now()}-123456.png`;
  fs.writeFileSync(path.join(uploadsRoot, 'interventions', photo2), PNG);
  await q('INSERT INTO intervention_photos (company_id, intervention_id, file_path, mime, size_bytes, kind) VALUES (?, ?, ?, ?, ?, ?)', [A, intPhoto, `/uploads/interventions/${photo2}`, 'image/png', PNG.length, 'before']);
  await sign(cTechA, 'intervention', intPhoto, signForm({ tech: true }));
  check('signed intervention with a photo verifies ok', (await call('GET', `/api/reports/intervention/${intPhoto}/verify`, { cookie: cAdminA })).body?.status === 'ok');
  fs.writeFileSync(path.join(uploadsRoot, 'interventions', photo2), Buffer.concat([PNG, Buffer.from('x')]));
  check('photo file replaced -> "differs"', (await call('GET', `/api/reports/intervention/${intPhoto}/verify`, { cookie: cAdminA })).body?.status === 'differs');

  // ------------------------------------------------------------------ historical record
  console.log('\n[historical signed record (before this feature)]');
  fs.mkdirSync(path.join(uploadsRoot, 'signatures'), { recursive: true });
  const histTech = `${A}-rms-hist-tech-${tag}.png`;
  const histClient = `${A}-rms-hist-client-${tag}.png`;
  fs.writeFileSync(path.join(uploadsRoot, 'signatures', histTech), PNG);
  fs.writeFileSync(path.join(uploadsRoot, 'signatures', histClient), PNG);
  const hist = (await q(
    `INSERT INTO rms_visits (location_id, user_id, visit_date, company_id, technician_signature_path, client_signature_path, signed_by_user_id, signed_at, signature_ip, signature_status, document_hash)
     VALUES (?, ?, CURDATE(), ?, ?, ?, ?, NOW(), '::1', 'signed', 'bc45af9302d2e9ed93af4524707b7944a802038c5a8be5195a05041075c1eb84')`,
    [locA, techA.id, A, `/uploads/signatures/${histTech}`, `/uploads/signatures/${histClient}`, techA.id]
  )).insertId;
  st = await state(cAdminA, 'rms', hist);
  check('historical row reads as completed with timeline', st?.state === 'completed' && st.locked && st.technician && st.client?.method === 'drawn' && st.snapshots.length === 0, JSON.stringify(st));
  r = await sign(cAdminA, 'rms', hist, signForm({ tech: true }));
  check('historical signed row cannot be signed again -> 403', r.status === 403 && r.body?.code === 'report_already_signed');
  r = await call('POST', `/api/reports/rms/${hist}/client-declined`, { cookie: cAdminA, json: { reason: 'should not be possible' } });
  check('historical signed row cannot get a completion -> 409', r.status === 409);
  const histPdf = await call('GET', `/api/rms/${hist}/pdf`, { cookie: cAdminA });
  check('historical row still renders its (live) PDF', histPdf.status === 200 && histPdf.buf.subarray(0, 5).toString() === '%PDF-');
  check('...without creating a retroactive snapshot', (await count('SELECT COUNT(*) c FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', hist])) === 0);
  ver = await call('GET', `/api/reports/rms/${hist}/verify`, { cookie: cAdminA });
  check('verify says no_snapshot for it (not verifiable)', ver.body?.status === 'no_snapshot');

  // ------------------------------------------------------------------ roles + intervention-to-technician link
  console.log('\n[roles and ownership]');
  const own = await mkRms(techA.id);
  r = await sign(cTech2A, 'rms', own, signForm({ tech: true }));
  check('technician cannot sign another technician\'s RMS -> 403 forbidden', r.status === 403 && r.body?.code === 'forbidden', `got ${r.status}`);
  r = await sign(cViewerA, 'rms', own, signForm({ tech: true }));
  check('viewer cannot sign -> 403 viewer_read_only', r.status === 403 && r.body?.code === 'viewer_read_only');
  r = await sign(cAdminA, 'rms', own, signForm({ tech: true }));
  check('admin can sign any report of the company', r.status === 200);
  row = await reportRow('rms', own);
  check('...technician name on the row is the signing admin', row.technician_signer_name === adminA.full_name && row.technician_signed_by_user_id === adminA.id);
  const intNameCase = await mkInt(` ${techA.username.toUpperCase()} `);
  r = await sign(cTechA, 'intervention', intNameCase, signForm({ tech: true }));
  check('intervention link by name is robust (case/space-insensitive)', r.status === 200, `got ${r.status}`);
  const intById = await mkInt('Somebody Else', { created_by: tech2A.id });
  r = await sign(cTech2A, 'intervention', intById, signForm({ tech: true }));
  check('intervention link by created_by_user_id works when the name differs', r.status === 200, `got ${r.status}`);
  const intOther = await mkInt('Somebody Else');
  r = await sign(cTechA, 'intervention', intOther, signForm({ tech: true }));
  check('technician cannot sign an intervention of someone else -> 403', r.status === 403);
  const intSecond = (await q(`INSERT INTO interventions (date, technician, second_technician, location_id, company_id, uploaded_files, status) VALUES (NOW(), 'Somebody Else', ?, ?, ?, '', 'O.K.')`, [techA.username, locA, A])).insertId;
  r = await sign(cTechA, 'intervention', intSecond, signForm({ tech: true }));
  check('second technician (named) may sign too', r.status === 200);
  ver = await call('GET', `/api/reports/rms/${own}/verify`, { cookie: cTechA });
  check('technician cannot verify (admin only) -> 403', ver.status === 403);
  ver = await call('GET', `/api/reports/rms/${own}/verify`, { cookie: cViewerA });
  check('viewer cannot verify -> 403', ver.status === 403);
  r = await call('GET', '/api/reports/rms/abc/signature', { cookie: cAdminA });
  check('invalid id -> 400', r.status === 400);
  r = await call('GET', '/api/reports/bogus/1/signature', { cookie: cAdminA });
  check('invalid type -> 400', r.status === 400);
  r = await call('GET', `/api/reports/rms/${own}/signature`);
  check('anonymous -> 401', r.status === 401);

  // ------------------------------------------------------------------ tenant isolation
  console.log('\n[tenant isolation: company B vs company A\'s reports]');
  const targetWaiting = await mkRms(techA.id);
  await sign(cTechA, 'rms', targetWaiting, signForm({ tech: true }));
  const targetDraft = await mkRms(techA.id);
  const snapshotOfA = (await q('SELECT * FROM report_snapshots WHERE company_id = ? AND report_id = ? AND report_type = ?', [A, targetWaiting, 'rms']))[0];
  const rowBefore = JSON.stringify(await reportRow('rms', targetDraft));
  r = await sign(cAdminB, 'rms', targetDraft, signForm({ tech: true, client: true, name: 'X', role: 'Y' }));
  check('B admin cannot sign A\'s draft -> 404', r.status === 404, `got ${r.status}`);
  check('A\'s draft is unchanged', JSON.stringify(await reportRow('rms', targetDraft)) === rowBefore);
  check('no signature files created in B\'s name for it', sigFiles(`${B}-`).length === 0);
  r = await call('POST', `/api/reports/rms/${targetWaiting}/client-signature`, { cookie: cAdminB, form: clientForm({ name: 'X', role: 'Y' }) });
  check('B admin cannot complete A\'s report (drawn) -> 404', r.status === 404);
  r = await call('POST', `/api/reports/rms/${targetWaiting}/client-scan`, { cookie: cAdminB, form: scanForm(PDF, 'application/pdf') });
  check('B admin cannot attach a scan to A\'s report -> 404', r.status === 404);
  r = await call('POST', `/api/reports/rms/${targetWaiting}/client-declined`, { cookie: cAdminB, json: { reason: 'tenant attack' } });
  check('B admin cannot close A\'s report as declined -> 404', r.status === 404);
  check('no completion rows were written for A\'s report', (await count('SELECT COUNT(*) c FROM report_completions WHERE report_id = ? AND report_type = ?', [targetWaiting, 'rms'])) === 0);
  r = await call('GET', `/api/reports/rms/${targetWaiting}/verify`, { cookie: cAdminB });
  check('B admin cannot verify A\'s report -> 404', r.status === 404);
  r = await call('GET', `/api/reports/rms/${targetWaiting}/signature`, { cookie: cAdminB });
  check('B admin cannot read A\'s signature state -> 404', r.status === 404);
  r = await call('GET', `/api/reports/rms/${targetWaiting}/snapshots/${snapshotOfA.id}/pdf`, { cookie: cAdminB });
  check('B admin cannot read A\'s snapshot PDF via the API -> 404', r.status === 404);
  r = await call('GET', `/api/uploads${snapshotOfA.file_path.replace('/uploads', '')}`, { cookie: cAdminB });
  check('B admin cannot read A\'s snapshot file via /uploads -> 404', r.status === 404);
  r = await call('GET', `/api/uploads${snapshotOfA.file_path.replace('/uploads', '')}`, { cookie: cAdminA });
  check('A admin can read it -> 200', r.status === 200);
  r = await call('GET', `/api/rms/${targetWaiting}/pdf`, { cookie: cAdminB });
  check('B admin cannot download A\'s PDF -> 404', r.status === 404);
  list = await call('POST', '/api/records/filter', { cookie: cAdminB, json: { type: 'rms', signature_state: 'awaiting_client' } });
  check('B\'s list never shows A\'s waiting reports', list.status === 200 && list.body.length === 0);
  const rmsB = await mkRms(adminB.id, B, locB);
  r = await sign(cAdminA, 'rms', rmsB, signForm({ tech: true }));
  check('A admin cannot sign B\'s report -> 404', r.status === 404);

  // ------------------------------------------------------------------ locked subscription
  console.log('\n[subscription lock: writes 402, reading still works]');
  const lockedRms = await mkRms(techA.id);
  await sign(cTechA, 'rms', lockedRms, signForm({ tech: true }));
  await call('GET', '/api/billing/current', { cookie: cAdminA });
  await q("UPDATE company_subscriptions SET status = 'suspended' WHERE company_id = ?", [A]);
  r = await call('POST', `/api/reports/rms/${lockedRms}/client-declined`, { cookie: cAdminA, json: { reason: 'locked workspace test' } });
  check('locked workspace: admin completion -> 402', r.status === 402, `got ${r.status}`);
  r = await call('GET', `/api/reports/rms/${lockedRms}/signature`, { cookie: cAdminA });
  check('locked workspace: reading the state works', r.status === 200);
  r = await call('GET', `/api/rms/${lockedRms}/pdf`, { cookie: cAdminA });
  check('locked workspace: downloading the PDF works', r.status === 200);
  r = await call('GET', `/api/reports/rms/${lockedRms}/verify`, { cookie: cAdminA });
  check('locked workspace: verify works', r.status === 200 && r.body?.status === 'ok');
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [A]);

  console.log(`\n${passed} passed, ${failed} failed`);

  // ------------------------------------------------------------------ cleanup of files created by this run
  const stored = [
    ...(await q('SELECT file_path AS p FROM report_snapshots WHERE company_id IN (?, ?)', [A, B])),
    ...(await q('SELECT scan_path AS p FROM report_completions WHERE company_id IN (?, ?) AND scan_path IS NOT NULL', [A, B])),
    ...(await q('SELECT signature_path AS p FROM report_completions WHERE company_id IN (?, ?) AND signature_path IS NOT NULL', [A, B])),
    ...(await q('SELECT technician_signature_path AS p FROM rms_visits WHERE company_id IN (?, ?) AND technician_signature_path IS NOT NULL', [A, B])),
    ...(await q('SELECT client_signature_path AS p FROM rms_visits WHERE company_id IN (?, ?) AND client_signature_path IS NOT NULL', [A, B])),
    ...(await q('SELECT technician_signature_path AS p FROM interventions WHERE company_id IN (?, ?) AND technician_signature_path IS NOT NULL', [A, B])),
    ...(await q('SELECT client_signature_path AS p FROM interventions WHERE company_id IN (?, ?) AND client_signature_path IS NOT NULL', [A, B])),
    ...(await q('SELECT file_path AS p FROM intervention_photos WHERE company_id IN (?, ?)', [A, B]))
  ];
  for (const { p } of stored) { try { fs.unlinkSync(path.join(BACKEND, p)); } catch { /* gone */ } }
  for (const f of [photoFile, photo2]) { try { fs.unlinkSync(path.join(uploadsRoot, 'interventions', f)); } catch { /* gone */ } }
}

main()
  .catch((err) => { console.error('test run crashed:', err); failed++; })
  .finally(() => process.exit(failed ? 1 : 0));
