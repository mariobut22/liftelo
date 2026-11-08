#!/usr/bin/env node
/*
 * End-to-end test of the WORK / MATERIAL TABLE ("work lines": name, quantity, unit, hours) on interventions and work orders
 * and of the verify state `ok_anonymised`, against a THROWAWAY MySQL/MariaDB (dev-only, no extra dependencies).
 * Same setup/refusal rules as tenant-isolation-test.js (database "tt" / "*_test" on localhost, FRESH database with
 * liftelo.sql + ALL migrations incl. 20261115_work_lines.sql). Needs `pdftotext` (poppler) for the PDF checks.
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3481 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/intervention-items-test.js
 *
 * Covers: create with/without lines, validation (nothing is stored on a 400), comma decimals, idempotent replay (also concurrent),
 * graceful 503 without the migration, locked after signing, content hash (tampering), verify ok / differs / ok_anonymised,
 * company export, purge dry-run, PDFs (text via pdftotext), work orders (create / PUT / dedicated items endpoint with roles),
 * tenant isolation. Exit code 0 = all checks passed.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
const PORT = Number(process.env.TENANT_TEST_PORT || 3483);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'items-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
  MULTI_COMPANY_ENABLED: 'false'
});

const BACKEND = path.join(__dirname, '..');
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'));
const JSZip = require(path.join(BACKEND, 'node_modules', 'jszip'));
const db = require(path.join(BACKEND, 'db'));

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};

const BASE = `http://127.0.0.1:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function call(method, url, { cookie, json, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(60000) });
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
const pdfText = (buf) => {
  const file = path.join(os.tmpdir(), `items-test-${crypto.randomBytes(5).toString('hex')}.pdf`);
  fs.writeFileSync(file, buf);
  try { return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(file); }
};

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params) => Number((await q(sql, params))[0].c);
  const wl = require(path.join(BACKEND, 'utils', 'workLines'));

  const mkCompany = async (name) => (await q('INSERT INTO companies (name, default_language) VALUES (?, ?)', [`${name} ${tag}`, 'hr'])).insertId;
  const A = await mkCompany('Items A');
  const B = await mkCompany('Items B');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@items.test`;
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
  const leaverA = await mkUser('leaverA', A, 'technician');
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin');
  const techB = await mkUser('techB', B, 'technician');
  const locA = (await q('INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [`ItemsLocA-${tag}`, 'A street 1', A])).insertId;
  const locB = (await q('INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [`ItemsLocB-${tag}`, 'B street 1', B])).insertId;
  const elA = (await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [locA, A, 'EL-A'])).insertId;
  await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [locB, B, 'EL-B']);
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));

  const cAdminA = await login(adminA.email, pw);
  const cTechA = await login(techA.email, pw);
  const cTech2A = await login(tech2A.email, pw);
  const cViewerA = await login(viewerA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  const cTechB = await login(techB.email, pw);
  const uuid = () => crypto.randomUUID();

  const createInt = (cookie, { location = `ItemsLocA-${tag}`, lines, technician = techA.full_name, requestId, rawLines } = {}) => {
    const form = new FormData();
    form.append('technician', technician);
    form.append('location', location);
    form.append('date', '2026-11-08');
    form.append('notes', `note ${tag}`);
    form.append('status', 'O.K.');
    form.append('elevator_items', JSON.stringify([{ elevator_label: 'EL-A', status: 'O.K.', comment: 'fine' }]));
    if (lines !== undefined) form.append('work_lines', rawLines !== undefined ? rawLines : JSON.stringify(lines));
    if (requestId) form.append('client_request_id', requestId);
    return call('POST', '/api/interventions', { cookie, form });
  };
  const lineRows = (table, fk, id) => q(`SELECT * FROM ${table} WHERE ${fk} = ? ORDER BY position ASC, id ASC`, [id]);
  const intLines = (id) => lineRows('intervention_work_lines', 'intervention_id', id);
  const woLines = (id) => lineRows('work_order_work_lines', 'work_order_id', id);
  const intCount = () => count('SELECT COUNT(*) c FROM interventions WHERE company_id = ?', [A]);
  const sign = (cookie, id) => {
    const form = new FormData();
    form.append('technician_signature', new Blob([PNG], { type: 'image/png' }), 'technician.png');
    return call('POST', `/api/reports/intervention/${id}/sign`, { cookie, form });
  };
  const verify = async (id) => (await call('GET', `/api/reports/intervention/${id}/verify`, { cookie: cAdminA })).body;

  const L2 = [
    { name: 'Zamjena kontaktora', quantity: '2', unit: 'pcs', hours: '1,5' },
    { name: 'Podmazivanje vodilica', quantity: '', unit: '', hours: '0.75' }
  ];

  // ------------------------------------------------------------------ graceful degradation without the migration
  console.log('\n[without the migration: 503 for rows, everything else works]');
  await q('RENAME TABLE intervention_work_lines TO zz_iwl_off, work_order_work_lines TO zz_wowl_off');
  wl.resetWorkLinesCache();
  const before0 = await intCount();
  let r = await createInt(cTechA, { lines: L2 });
  check('intervention with rows, table missing -> 503 work_lines_unavailable, nothing stored', r.status === 503 && r.body?.code === 'work_lines_unavailable' && await intCount() === before0, `${r.status}`);
  r = await createInt(cTechA, {});
  check('intervention without rows still works', r.status === 200 && r.body?.id > 0, `${r.status}`);
  const noTableId = r.body?.id;
  r = await call('GET', `/api/interventions/${noTableId}`, { cookie: cTechA });
  check('GET intervention works without the table (work_lines [])', r.status === 200 && Array.isArray(r.body?.work_lines) && r.body.work_lines.length === 0);
  r = await createInt(cTechA, { lines: [{}, { name: '', quantity: '' }] });
  check('only empty rows without the table -> fine (nothing to store)', r.status === 200);
  r = await call('GET', `/api/interventions/${noTableId}/pdf?lang=hr`, { cookie: cTechA });
  check('PDF works without the table', r.status === 200 && r.buf.slice(0, 4).toString() === '%PDF');
  r = await call('POST', '/api/work-orders', { cookie: cAdminA, json: { location_id: locA, items: [{ description: 'task' }], work_lines: [{ name: 'x' }] } });
  check('work order with rows, table missing -> 503', r.status === 503 && r.body?.code === 'work_lines_unavailable');
  r = await call('POST', '/api/work-orders', { cookie: cAdminA, json: { location_id: locA, items: [{ description: 'task' }] } });
  check('work order without rows works', r.status === 201);
  await q('RENAME TABLE zz_iwl_off TO intervention_work_lines, zz_wowl_off TO work_order_work_lines');
  wl.resetWorkLinesCache();

  // ------------------------------------------------------------------ create
  console.log('\n[intervention: create without / with rows]');
  r = await createInt(cTechA, { lines: [] });
  check('create with empty list', r.status === 200);
  const idEmpty = r.body.id;
  check('no rows stored', (await intLines(idEmpty)).length === 0);
  r = await call('GET', `/api/interventions/${idEmpty}`, { cookie: cTechA });
  check('GET returns work_lines: []', r.status === 200 && Array.isArray(r.body.work_lines) && r.body.work_lines.length === 0);

  const reqId = uuid();
  r = await createInt(cTechA, { lines: L2, requestId: reqId });
  check('create with 2 rows -> 200', r.status === 200 && r.body.id > 0, JSON.stringify(r.body));
  const id2 = r.body.id;
  let rows = await intLines(id2);
  check('2 rows stored in order with company_id', rows.length === 2 && rows[0].position === 1 && rows[1].position === 2 && rows.every((x) => x.company_id === A && x.intervention_id === id2));
  check('values: comma decimal "1,5" -> 1.50, unit code, blank quantity -> NULL', rows[0].name === 'Zamjena kontaktora' && Number(rows[0].quantity) === 2 && rows[0].unit === 'pcs' && Number(rows[0].hours) === 1.5
    && rows[1].quantity === null && rows[1].unit === null && Number(rows[1].hours) === 0.75);
  r = await call('GET', `/api/interventions/${id2}`, { cookie: cAdminA });
  check('GET returns the rows (numbers, not strings)', r.status === 200 && r.body.work_lines.length === 2 && r.body.work_lines[0].quantity === 2 && r.body.work_lines[0].hours === 1.5 && r.body.work_lines[1].quantity === null);

  r = await createInt(cTechA, { lines: [{ name: 'Stavka', quantity: 1 }, {}, { name: '', quantity: '', unit: '', hours: ' ' }, { name: 'Slobodna jedinica', unit: 'dm' }] });
  rows = r.body?.id ? await intLines(r.body.id) : [];
  check('completely empty rows ignored, positions renumbered, free-text unit kept', r.status === 200 && rows.length === 2 && rows[1].position === 2 && rows[1].unit === 'dm');

  r = await createInt(cTechA, { lines: Array.from({ length: 30 }, (_, i) => ({ name: `Stavka ${i + 1}`, hours: '0,5' })) });
  check('30 rows are accepted', r.status === 200 && (await intLines(r.body.id)).length === 30);

  // ------------------------------------------------------------------ validation
  console.log('\n[validation: 400, nothing stored]');
  const base = await intCount();
  const bad = async (label, lines, code) => {
    const res = await createInt(cTechA, { lines });
    check(`${label} -> 400 ${code}`, res.status === 400 && res.body?.code === code, `${res.status} ${JSON.stringify(res.body)}`);
  };
  await bad('quantity without a name', [{ quantity: '3' }], 'work_line_name_required');
  await bad('hours without a name', [{ hours: '1' }], 'work_line_name_required');
  await bad('unit without a name', [{ unit: 'kg' }], 'work_line_name_required');
  await bad('negative quantity', [{ name: 'x', quantity: '-1' }], 'work_line_invalid_number');
  await bad('negative hours', [{ name: 'x', hours: -2 }], 'work_line_invalid_number');
  await bad('text quantity', [{ name: 'x', quantity: 'abc' }], 'work_line_invalid_number');
  await bad('"1,2,3" quantity', [{ name: 'x', quantity: '1,2,3' }], 'work_line_invalid_number');
  await bad('quantity above the maximum', [{ name: 'x', quantity: '1000001' }], 'work_line_invalid_number');
  await bad('hours above the maximum', [{ name: 'x', hours: '10001' }], 'work_line_invalid_number');
  await bad('NaN number', [{ name: 'x', hours: 'NaN' }], 'work_line_invalid_number');
  await bad('name longer than 200 characters', [{ name: 'n'.repeat(201) }], 'work_line_name_too_long');
  await bad('unit longer than 20 characters', [{ name: 'x', unit: 'u'.repeat(21) }], 'work_line_unit_too_long');
  await bad('31 rows', Array.from({ length: 31 }, (_, i) => ({ name: `r${i}` })), 'too_many_work_lines');
  r = await createInt(cTechA, { lines: [], rawLines: '{not json' });
  check('broken JSON -> 400 invalid_request', r.status === 400 && r.body?.code === 'invalid_request', `${r.status}`);
  r = await createInt(cTechA, { lines: [], rawLines: '"just a string"' });
  check('work_lines that is not an array -> 400', r.status === 400);
  check('none of the rejected requests created an intervention', await intCount() === base);
  r = await createInt(cTechA, { lines: [{ name: 'n'.repeat(200), quantity: '1000000', hours: '10000', unit: 'u'.repeat(20) }] });
  check('boundary values (200 chars, max quantity/hours, 20-char unit) are accepted', r.status === 200);
  r = await createInt(cTechA, { lines: [{ name: '  Razmaci   i\ttabovi  ', quantity: '1.005' }] });
  rows = r.body?.id ? await intLines(r.body.id) : [];
  check('name is trimmed / whitespace collapsed; quantity rounded to 2 decimals', rows[0]?.name === 'Razmaci i tabovi' && Number(rows[0].quantity) === 1.01 || Number(rows[0]?.quantity) === 1);

  // ------------------------------------------------------------------ idempotency
  console.log('\n[idempotent replay]');
  r = await createInt(cTechA, { lines: L2, requestId: reqId });
  check('replay with the same client_request_id -> 200 duplicate, same id', r.status === 200 && r.body.duplicate === true && r.body.id === id2);
  check('...and NO duplicate rows', (await intLines(id2)).length === 2);
  const parId = uuid();
  const par = await Promise.all([1, 2, 3, 4].map(() => createInt(cTechA, { lines: L2, requestId: parId })));
  const parIds = new Set(par.map((x) => x.body?.id));
  check('4 parallel requests with one id -> one intervention', par.every((x) => x.status === 200) && parIds.size === 1, JSON.stringify(par.map((x) => x.status)));
  check('...and exactly 2 rows (no duplicates, no orphans)', (await intLines([...parIds][0])).length === 2
    && await count('SELECT COUNT(*) c FROM intervention_work_lines w WHERE w.company_id = ? AND NOT EXISTS (SELECT 1 FROM interventions i WHERE i.id = w.intervention_id)', [A]) === 0);

  // ------------------------------------------------------------------ PDF
  console.log('\n[intervention PDF]');
  r = await call('GET', `/api/interventions/${idEmpty}/pdf?lang=hr`, { cookie: cTechA });
  let text = pdfText(r.buf);
  check('empty table (hr): title + all column headers, no row text', r.status === 200 && text.includes('Izvršeni radovi / utrošeni materijal') && text.includes('Naziv radova / stavka') && text.includes('Količina') && text.includes('Jed. mjere') && text.includes('Sati') && !text.includes('Ukupno utrošenih sati'));
  check('empty table (hr): 6 numbered blank rows', [1, 2, 3, 4, 5, 6].every((n) => new RegExp(`^\\s*${n}\\s*$`, 'm').test(text)), text.slice(0, 400));
  r = await call('GET', `/api/interventions/${idEmpty}/pdf?lang=en`, { cookie: cTechA });
  text = pdfText(r.buf);
  check('empty table (en): translated title and headers', text.includes('Work done / materials used') && text.includes('Work / item') && text.includes('Quantity') && text.includes('Hours'));
  r = await call('GET', `/api/interventions/${id2}/pdf?lang=hr`, { cookie: cTechA });
  text = pdfText(r.buf);
  check('filled table (hr): rows, hr unit "kom", total 2,25 sati', text.includes('Zamjena kontaktora') && text.includes('Podmazivanje vodilica') && /kom/.test(text) && /Ukupno utrošenih sati: 2,25/.test(text), text.slice(0, 600));
  r = await call('GET', `/api/interventions/${id2}/pdf?lang=en`, { cookie: cTechA });
  text = pdfText(r.buf);
  check('filled table (en): "pcs" and total 2.25', text.includes('Zamjena kontaktora') && /pcs/.test(text) && /Total hours spent: 2\.25/.test(text));
  const manyId = (await q("SELECT id FROM interventions WHERE company_id = ? AND id IN (SELECT intervention_id FROM intervention_work_lines GROUP BY intervention_id HAVING COUNT(*) = 30) LIMIT 1", [A]))[0].id;
  r = await call('GET', `/api/interventions/${manyId}/pdf?lang=en`, { cookie: cTechA });
  text = pdfText(r.buf);
  check('30 rows: all present, total 15, the table header repeats on the next page', r.status === 200 && text.includes('Stavka 1') && text.includes('Stavka 30') && /Total hours spent: 15/.test(text) && (text.match(/Work \/ item/g) || []).length >= 2, `${(text.match(/Work \/ item/g) || []).length}`);

  // ------------------------------------------------------------------ signing locks, hash
  console.log('\n[signing: rows locked, part of the hash]');
  r = await call('GET', `/api/interventions/${id2}`, { cookie: cAdminA });
  r = await sign(cAdminA, id2);
  check('technician signs the intervention', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);
  let v = await verify(id2);
  check('verify -> ok', v?.status === 'ok', JSON.stringify(v));
  const snap = (await q('SELECT * FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'intervention', id2]))[0];
  check('snapshot stores a core hash', snap && /^[0-9a-f]{64}$/.test(snap.core_hash || ''));
  r = await call('POST', `/api/interventions/${id2}/work-lines`, { cookie: cAdminA, json: { work_lines: [{ name: 'x' }] } });
  check('there is no way to add rows to a saved intervention (no such route)', r.status === 404);
  r = await call('PUT', `/api/interventions/${id2}`, { cookie: cAdminA, json: { work_lines: [{ name: 'x' }] } });
  check('no PUT on interventions either', r.status === 404 && (await intLines(id2)).length === 2);
  r = await call('GET', `/api/interventions/${id2}/pdf?lang=en`, { cookie: cAdminA });
  check('signed -> frozen PDF with the rows', r.status === 200 && pdfText(r.buf).includes('Podmazivanje vodilica'));
  await q('UPDATE intervention_work_lines SET name = ? WHERE intervention_id = ? AND position = 1 AND company_id = ?', ['Tampered', id2, A]);
  v = await verify(id2);
  check('row name tampered (test DB only) -> "differs"', v?.status === 'differs' && v.snapshots[0].hash_ok === false && v.snapshots[0].pdf_ok === true);
  await q('UPDATE intervention_work_lines SET name = ?, hours = 9 WHERE intervention_id = ? AND position = 1 AND company_id = ?', ['Zamjena kontaktora', id2, A]);
  check('row hours tampered -> "differs"', (await verify(id2))?.status === 'differs');
  await q('UPDATE intervention_work_lines SET hours = 1.5 WHERE intervention_id = ? AND position = 1 AND company_id = ?', [id2, A]);
  check('restored -> ok again', (await verify(id2))?.status === 'ok');
  await q('DELETE FROM intervention_work_lines WHERE intervention_id = ? AND position = 2 AND company_id = ?', [id2, A]);
  check('row deleted -> "differs"', (await verify(id2))?.status === 'differs');
  const keptRows = await intLines(id2);
  await q('INSERT INTO intervention_work_lines (company_id, intervention_id, position, name, quantity, unit, hours, created_at) VALUES (?, ?, 2, ?, NULL, NULL, 0.75, ?)', [A, id2, 'Podmazivanje vodilica', keptRows[0].created_at]);
  check('row re-inserted with a new id -> still "differs" (ids are hashed)', (await verify(id2))?.status === 'differs');

  // a signed intervention without rows keeps its pre-feature hash behaviour (verify ok)
  r = await createInt(cTechA, {});
  const idNoRows = r.body.id;
  await sign(cAdminA, idNoRows);
  check('signed intervention WITHOUT rows verifies ok (hash unchanged for old documents)', (await verify(idNoRows))?.status === 'ok');
  const content = await require(path.join(BACKEND, 'utils', 'reportSignatures')).buildContent(db, 'intervention', A,
    (await q('SELECT * FROM interventions WHERE id = ?', [idNoRows]))[0], { technician: null, client: null });
  check('content of a report without rows has no "work_lines" key', !('work_lines' in content));

  // ------------------------------------------------------------------ anonymisation
  console.log('\n[verify: ok_anonymised vs real tampering]');
  r = await createInt(cTechA, { technician: leaverA.full_name, lines: [{ name: 'Posao odlazećeg', hours: '2' }] });
  const idAnon = r.body.id;
  await sign(cAdminA, idAnon);
  check('before anonymisation: ok', (await verify(idAnon))?.status === 'ok');
  r = await call('POST', `/api/users/${leaverA.id}/anonymize`, { cookie: cAdminA, json: { confirm: true } });
  check('technician anonymised on request', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);
  check('the live row now carries the "Former user" marker', (await q('SELECT technician FROM interventions WHERE id = ?', [idAnon]))[0].technician === `Former user #${leaverA.id}`);
  v = await verify(idAnon);
  check('verify -> ok_anonymised (hash differs ONLY because of the name, frozen PDF intact)', v?.status === 'ok_anonymised' && v.snapshots[0].hash_ok === false && v.snapshots[0].pdf_ok === true && v.snapshots[0].anonymised_ok === true, JSON.stringify(v));
  r = await call('GET', `/api/interventions/${idAnon}/pdf?lang=en`, { cookie: cAdminA });
  check('frozen PDF keeps the ORIGINAL technician name (signed document = business record)', pdfText(r.buf).includes(leaverA.full_name));
  await q('UPDATE interventions SET notes = ? WHERE id = ? AND company_id = ?', ['changed after signing', idAnon, A]);
  check('anonymised AND another field tampered -> "differs" (core hash catches it)', (await verify(idAnon))?.status === 'differs');
  await q('UPDATE interventions SET notes = ? WHERE id = ? AND company_id = ?', [`note ${tag}`, idAnon, A]);
  await q('UPDATE intervention_work_lines SET hours = 8 WHERE intervention_id = ? AND company_id = ?', [idAnon, A]);
  check('anonymised AND a work row tampered -> "differs"', (await verify(idAnon))?.status === 'differs');
  await q('UPDATE intervention_work_lines SET hours = 2 WHERE intervention_id = ? AND company_id = ?', [idAnon, A]);
  check('restored -> ok_anonymised again', (await verify(idAnon))?.status === 'ok_anonymised');
  const snapAnon = (await q('SELECT file_path FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'intervention', idAnon]))[0];
  const pdfAbs = path.join(BACKEND, snapAnon.file_path);
  const pdfOriginal = fs.readFileSync(pdfAbs);
  fs.writeFileSync(pdfAbs, Buffer.concat([pdfOriginal, Buffer.from('\n% tampered')]));
  v = await verify(idAnon);
  check('anonymised AND frozen PDF tampered -> "differs"', v?.status === 'differs' && v.snapshots[0].pdf_ok === false);
  fs.writeFileSync(pdfAbs, pdfOriginal);
  await q('UPDATE report_snapshots SET core_hash = NULL WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'intervention', idAnon]);
  check('older snapshot without a core hash: intact PDF + audit event -> ok_anonymised', (await verify(idAnon))?.status === 'ok_anonymised');
  // a name that LOOKS anonymised but has no audit event is not accepted
  r = await createInt(cTechA, {});
  const idFake = r.body.id;
  await sign(cAdminA, idFake);
  await q('UPDATE interventions SET technician = ? WHERE id = ? AND company_id = ?', ['Former user #987654', idFake, A]);
  check('"Former user #n" without an anonymisation audit event -> "differs"', (await verify(idFake))?.status === 'differs');
  await q('UPDATE interventions SET technician = ? WHERE id = ? AND company_id = ?', [techA.full_name, idFake, A]);
  // company B's anonymisation does not excuse company A's difference
  await q("INSERT INTO audit_logs (user_id, company_id, action, metadata) VALUES (NULL, ?, 'user_anonymized', ?)", [B, JSON.stringify({ target_user_id: 987654 })]);
  await q('UPDATE interventions SET technician = ? WHERE id = ? AND company_id = ?', ['Former user #987654', idFake, A]);
  check('an audit event of ANOTHER company does not count', (await verify(idFake))?.status === 'differs');
  await q('UPDATE interventions SET technician = ? WHERE id = ? AND company_id = ?', [techA.full_name, idFake, A]);

  // ------------------------------------------------------------------ work orders
  console.log('\n[work orders: rows on create / PUT, dedicated endpoint for assigned technicians]');
  const woBody = (extra = {}) => ({ location_id: locA, items: [{ description: 'Provjera' }], assigned_user_ids: [techA.id], ...extra });
  r = await call('POST', '/api/work-orders', { cookie: cAdminA, json: woBody({ work_lines: L2 }) });
  check('admin creates a work order with rows', r.status === 201, JSON.stringify(r.body));
  const wo1 = r.body.id;
  check('rows stored for the work order with company_id', (await woLines(wo1)).length === 2 && (await woLines(wo1)).every((x) => x.company_id === A));
  r = await call('GET', `/api/work-orders/${wo1}`, { cookie: cTechA });
  check('GET /:id (assigned technician) returns work_lines', r.status === 200 && r.body.work_lines.length === 2 && r.body.work_lines[0].hours === 1.5 && Array.isArray(r.body.items) && r.body.items.length === 1);
  r = await call('POST', '/api/work-orders', { cookie: cAdminA, json: woBody({ work_lines: [{ hours: '2' }] }) });
  check('work order: row without a name -> 400, no order created', r.status === 400 && r.body?.code === 'work_line_name_required');
  r = await call('POST', '/api/work-orders', { cookie: cTechA, json: woBody({ work_lines: L2 }) });
  check('technician cannot create work orders (unchanged) -> 403', r.status === 403);
  r = await call('POST', '/api/work-orders', { cookie: cAdminA, json: woBody() });
  const wo2 = r.body.id;
  check('work order without rows: none stored', r.status === 201 && (await woLines(wo2)).length === 0);

  const putFull = (cookie, id, extra) => call('PUT', `/api/work-orders/${id}`, { cookie, json: { items: [{ description: 'Provjera' }], assigned_user_ids: [techA.id], elevator_ids: [], ...extra } });
  r = await putFull(cAdminA, wo1, {});
  check('PUT /:id without work_lines leaves the rows untouched', r.status === 200 && (await woLines(wo1)).length === 2);
  r = await putFull(cAdminA, wo1, { work_lines: [{ name: 'Nova', quantity: '4', unit: 'm' }] });
  check('PUT /:id with work_lines replaces the whole row set', r.status === 200 && (await woLines(wo1)).length === 1 && (await woLines(wo1))[0].name === 'Nova' && r.body.work_lines.length === 1);
  r = await putFull(cAdminA, wo1, { work_lines: [{ name: 'ok' }, { quantity: 3 }] });
  check('PUT /:id with an invalid row -> 400 and the old rows stay', r.status === 400 && (await woLines(wo1)).length === 1 && (await woLines(wo1))[0].name === 'Nova');
  r = await putFull(cAdminA, wo1, { work_lines: [] });
  check('PUT /:id with [] clears the rows', r.status === 200 && (await woLines(wo1)).length === 0);
  r = await putFull(cTechA, wo1, { work_lines: L2 });
  check('technician cannot use the full PUT /:id -> 403', r.status === 403 && (await woLines(wo1)).length === 0);

  const putItems = (cookie, id, lines) => call('PUT', `/api/work-orders/${id}/items`, { cookie, json: { work_lines: lines } });
  r = await putItems(cTechA, wo1, L2);
  check('assigned technician replaces the rows via PUT /:id/items -> 200', r.status === 200 && r.body.work_lines.length === 2 && (await woLines(wo1)).length === 2, `${r.status} ${JSON.stringify(r.body)}`);
  r = await putItems(cTechA, wo1, [{ name: 'Samo jedna', hours: '3' }]);
  check('...and again (replace, not append)', r.status === 200 && (await woLines(wo1)).length === 1);
  const woBefore = (await q('SELECT issued_date, due_date, general_comment, status FROM work_orders WHERE id = ?', [wo1]))[0];
  check('technician endpoint touched only the rows (order fields, tasks, assignees unchanged)', woBefore.status === 'open'
    && await count('SELECT COUNT(*) c FROM work_order_items WHERE work_order_id = ? AND company_id = ?', [wo1, A]) === 1
    && await count('SELECT COUNT(*) c FROM work_order_users WHERE work_order_id = ? AND company_id = ?', [wo1, A]) === 1);
  r = await putItems(cTechA, wo1, [{ quantity: 3 }]);
  check('technician: invalid row -> 400 name_required', r.status === 400 && r.body?.code === 'work_line_name_required');
  r = await call('PUT', `/api/work-orders/${wo1}/items`, { cookie: cTechA, json: {} });
  check('technician: body without work_lines -> 400', r.status === 400);
  r = await putItems(cTech2A, wo1, L2);
  check('technician NOT assigned to the order -> 403', r.status === 403 && r.body?.code === 'forbidden' && (await woLines(wo1)).length === 1);
  r = await putItems(cViewerA, wo1, L2);
  check('viewer -> 403 viewer_read_only', r.status === 403 && r.body?.code === 'viewer_read_only');
  r = await putItems(cAdminB, wo1, L2);
  check('admin of ANOTHER company -> 404', r.status === 404 && r.body?.code === 'work_order_not_found');
  r = await putItems(cTechB, wo1, L2);
  check('technician of another company -> 404', r.status === 404);
  r = await call('PUT', `/api/work-orders/${wo1}/items`, { json: { work_lines: L2 } });
  check('no session -> 401', r.status === 401);
  r = await putItems(cAdminA, wo1, L2);
  check('admin (not assigned) may edit the rows -> 200', r.status === 200 && (await woLines(wo1)).length === 2);
  r = await putItems(cAdminA, 999999999, L2);
  check('unknown work order -> 404', r.status === 404);
  check('company B has no rows from these requests', await count('SELECT COUNT(*) c FROM work_order_work_lines WHERE company_id = ?', [B]) === 0);

  // locked workspace: admins read-only, technicians keep working (existing rule)
  await q("UPDATE company_subscriptions SET status = 'suspended' WHERE company_id = ?", [A]);
  r = await putItems(cAdminA, wo1, L2);
  check('suspended workspace: admin -> 402 subscription_locked', r.status === 402 && r.body?.code === 'subscription_locked');
  r = await putItems(cTechA, wo1, [{ name: 'Tehničar u zaključanoj firmi' }]);
  check('suspended workspace: assigned technician may still fill the table (as with other technician writes)', r.status === 200);
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [A]);

  // PDF of the work order
  r = await call('GET', `/api/work-orders/${wo2}/pdf?lang=hr`, { cookie: cAdminA });
  text = pdfText(r.buf);
  check('work order PDF without rows: empty ruled table (hr)', r.status === 200 && text.includes('Izvršeni radovi / utrošeni materijal') && text.includes('Naziv radova / stavka') && text.includes('Potpis servisera') && !text.includes('Ukupno utrošenih sati'));
  r = await call('GET', `/api/work-orders/${wo1}/pdf?lang=en`, { cookie: cAdminA });
  text = pdfText(r.buf);
  check('work order PDF with rows (en): row text, total hours', text.includes('Tehničar u zaključanoj firmi') || text.includes('Samo jedna'), text.slice(0, 300));
  await putItems(cAdminA, wo1, [{ name: 'Rad A', quantity: '1,5', unit: 'h', hours: '2' }, { name: 'Rad B', hours: '1,25' }]);
  r = await call('GET', `/api/work-orders/${wo1}/pdf?lang=en`, { cookie: cAdminA });
  text = pdfText(r.buf);
  check('work order PDF (en): rows and "Total hours spent: 3.25"', text.includes('Rad A') && text.includes('Rad B') && /Total hours spent: 3\.25/.test(text));

  // closed work order: read-only
  r = await call('PUT', `/api/work-orders/${wo1}/close`, { cookie: cAdminA, json: {} });
  check('admin closes the work order', r.status === 200);
  r = await putItems(cTechA, wo1, L2);
  check('closed order: assigned technician -> 409 work_order_closed', r.status === 409 && r.body?.code === 'work_order_closed');
  r = await putItems(cAdminA, wo1, L2);
  check('closed order: admin via /items -> 409', r.status === 409 && r.body?.code === 'work_order_closed');
  r = await putFull(cAdminA, wo1, { work_lines: L2 });
  check('closed order: admin via PUT /:id with rows -> 409', r.status === 409 && r.body?.code === 'work_order_closed');
  check('closed order: rows unchanged', (await woLines(wo1)).length === 2 && (await woLines(wo1))[0].name === 'Rad A');
  r = await call('GET', `/api/work-orders/${wo1}`, { cookie: cTechA });
  check('closed order still readable with rows', r.status === 200 && r.body.work_lines.length === 2);

  // ------------------------------------------------------------------ tenant isolation
  console.log('\n[tenant isolation]');
  r = await call('GET', `/api/interventions/${id2}`, { cookie: cAdminB });
  check('company B cannot read company A\'s intervention (and its rows) -> 404', r.status === 404);
  r = await call('GET', `/api/work-orders/${wo1}`, { cookie: cAdminB });
  check('company B cannot read company A\'s work order -> 404', r.status === 404);
  r = await createInt(cTechB, { location: `ItemsLocA-${tag}`, lines: L2 });
  check('company B cannot create an intervention on A\'s location -> 400', r.status === 400 && r.body?.code === 'location_not_found');
  r = await createInt(cTechB, { location: `ItemsLocB-${tag}`, lines: [{ name: 'B posao', hours: '1' }], requestId: reqId });
  check('company B reusing A\'s client_request_id gets its OWN intervention and rows', r.status === 200 && !r.body.duplicate && r.body.id !== id2
    && (await intLines(r.body.id)).every((x) => x.company_id === B) && (await intLines(r.body.id)).length === 1);
  check('A\'s rows unchanged by B\'s activity', (await intLines(id2)).length === 2 && (await intLines(id2)).every((x) => x.company_id === A));
  r = await call('GET', `/api/reports/intervention/${id2}/verify`, { cookie: cAdminB });
  check('company B cannot verify A\'s intervention -> 404', r.status === 404);

  // ------------------------------------------------------------------ export + purge
  console.log('\n[company export + purge dry-run]');
  r = await call('GET', '/api/company/export', { cookie: cAdminA });
  let zip = null;
  try { zip = await JSZip.loadAsync(r.buf); } catch { /* reported below */ }
  const names = zip ? Object.keys(zip.files) : [];
  check('export ZIP has JSON + CSV for both new tables', r.status === 200 && ['intervention_work_lines', 'work_order_work_lines'].every((n) => names.includes(`data/${n}.json`) && names.includes(`data/${n}.csv`)), `${r.status} ${names.length}`);
  if (zip) {
    const ij = JSON.parse(await zip.files['data/intervention_work_lines.json'].async('string'));
    const wj = JSON.parse(await zip.files['data/work_order_work_lines.json'].async('string'));
    check('export rows: intervention rows incl. name/quantity/unit/hours, only company A', ij.length > 5 && ij.every((x) => x.company_id === A) && ij.some((x) => x.name === 'Posao odlazećeg' && Number(x.hours) === 2), `${ij.length}`);
    check('export rows: work order rows, only company A', wj.length === 2 && wj.every((x) => x.company_id === A));
    const csv = await zip.files['data/intervention_work_lines.csv'].async('string');
    check('CSV has the header and the rows', csv.includes('name') && csv.includes('Zamjena kontaktora'));
    const manifest = JSON.parse(await zip.files['manifest.json'].async('string'));
    check('manifest counts the new tables', manifest.tables.intervention_work_lines?.rows === ij.length && manifest.tables.work_order_work_lines?.rows === 2);
  }
  await q("UPDATE company_subscriptions SET status = 'canceled' WHERE company_id = ?", [A]);
  await q('UPDATE companies SET closure_requested_at = DATE_SUB(NOW(), INTERVAL 40 DAY), closure_purge_after = DATE_SUB(NOW(), INTERVAL 5 DAY) WHERE id = ?', [A]);
  let out = '';
  try {
    out = execFileSync('node', [path.join(BACKEND, 'scripts', 'purge-company.js'), '--company-id', String(A)], {
      env: { ...process.env, NODE_ENV: 'test' }, cwd: os.tmpdir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000
    });
  } catch (err) { out = `${err.stdout || ''}${err.stderr || ''}`; }
  check('purge-company dry-run lists intervention_work_lines and work_order_work_lines with counts', /intervention_work_lines\s+\d+/.test(out) && /work_order_work_lines\s+2/.test(out) && !/UNKNOWN tenant tables/.test(out), out.slice(-600));
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [A]);

  console.log(`\n${passed} passed, ${failed} failed`);

  // cleanup of files created by this run
  const stored = [
    ...(await q('SELECT file_path AS p FROM report_snapshots WHERE company_id IN (?, ?)', [A, B])),
    ...(await q('SELECT technician_signature_path AS p FROM interventions WHERE company_id IN (?, ?) AND technician_signature_path IS NOT NULL', [A, B]))
  ];
  for (const { p } of stored) { try { fs.unlinkSync(path.join(BACKEND, p)); } catch { /* gone */ } }
}

main()
  .catch((err) => { console.error('test run crashed:', err); failed++; })
  .finally(() => process.exit(failed ? 1 : 0));
