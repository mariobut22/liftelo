#!/usr/bin/env node
/*
 * End-to-end test of the in-app legal / GDPR features against a THROWAWAY MySQL/MariaDB (dev-only, no extra dependencies):
 *   1. Terms/Privacy acceptance logging (signup, invitation accept, in-app re-acceptance dialog endpoints)
 *   2. company data export (ZIP), 3. personal data download + user anonymisation, 4. company closure + purge script
 * It loads the real backend/index.js, seeds two companies and logs in through POST /api/login.
 * Refuses to run against anything that is not an obvious test database on localhost. Run on a FRESH database.
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=<port> TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *     node backend/scripts/legal-features-test.js
 *
 * The scratch DB needs liftelo.sql + the migrations listed in docs/infrastructure.md section 15 (+ 20261110_*, 20261111_*).
 * Exit code 0 = all checks passed. Writes small fixture files into backend/uploads/* and removes them again.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const cfg = {
  host: process.env.TENANT_TEST_DB_HOST || '127.0.0.1',
  port: process.env.TENANT_TEST_DB_PORT || '3306',
  user: process.env.TENANT_TEST_DB_USER || 'root',
  password: process.env.TENANT_TEST_DB_PASSWORD || '',
  name: process.env.TENANT_TEST_DB_NAME || '',
};
if (!['127.0.0.1', 'localhost'].includes(cfg.host) || !/^(tt|.*_test|.*_tmp|tenant.*)$/i.test(cfg.name) || process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: needs TENANT_TEST_DB_NAME like "tt" / "*_test" on localhost (never a real database).');
  process.exit(2);
}

// Run from a neutral directory so no .env file is picked up by dotenv
process.chdir(os.tmpdir());
const PORT = Number(process.env.TENANT_TEST_PORT || 3438);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'legal-features-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
  MULTI_COMPANY_ENABLED: 'false',
});

const BACKEND = path.join(__dirname, '..');
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'));
const db = require(path.join(BACKEND, 'db'));
const { LEGAL_VERSIONS } = require(path.join(BACKEND, 'utils', 'legal'));

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};

const BASE = `http://127.0.0.1:${PORT}`;
async function api(method, url, { cookie, json, raw } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch {
    return { status: 0, body: 'no response (timeout)', headers: new Headers() };
  }
  if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers };
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

const uploadsRoot = path.join(BACKEND, 'uploads');
const fixtures = [];
function fixture(rel, content = 'x') {
  const abs = path.join(uploadsRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  fixtures.push(abs);
  return abs;
}

// Seeds one company with data in every exported area + upload fixtures. `people` = users appearing in records.
async function seedCompanyData(q, companyId, label, owner) {
  const loc = (await q('INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [`${label} location`, `${label} street 1`, companyId])).insertId;
  const elev = (await q('INSERT INTO elevators (location_id, label, serial_number, company_id) VALUES (?, ?, ?, ?)', [loc, `${label}-L1`, `SN-${label}`, companyId])).insertId;
  const visit = (await q('INSERT INTO rms_visits (location_id, user_id, visit_date, company_id, technician_signature_path, notes_general) VALUES (?, ?, ?, ?, ?, ?)',
    [loc, owner.id, '2026-11-05 00:00:00', companyId, `/uploads/signatures/${companyId}-sig-${label}.png`, `${label} visit note, with comma and "quote"`])).insertId;
  await q('INSERT INTO rms_visit_items (visit_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [visit, `${label}-L1`, 'O.K.', '=HYPERLINK("http://evil")', companyId]);
  const inter = (await q('INSERT INTO interventions (date, type, technician, second_technician, description, location_id, uploaded_files, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['2026-11-04 10:00:00', 'POZIV', owner.username, null, `${label} intervention`, loc, `/uploads/interventions/legacy-${label}.jpg`, companyId])).insertId;
  await q('INSERT INTO intervention_items (intervention_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [inter, `${label}-L1`, 'O.K.', 'item', companyId]);
  await q('INSERT INTO intervention_photos (company_id, intervention_id, file_path, mime, size_bytes, kind) VALUES (?, ?, ?, ?, ?, ?)',
    [companyId, inter, `/uploads/interventions/${companyId}-i${inter}-photo.jpg`, 'image/jpeg', 5, 'before']);
  const wo = (await q("INSERT INTO work_orders (company_id, location_id, status, general_comment) VALUES (?, ?, 'open', ?)", [companyId, loc, `${label} work order`])).insertId;
  await q('INSERT INTO work_order_items (work_order_id, company_id, description) VALUES (?, ?, ?)', [wo, companyId, `${label} wo item`]);
  const proj = (await q('INSERT INTO projects (company_id, name, created_by) VALUES (?, ?, ?)', [companyId, `${label} project`, owner.id])).insertId;
  const sec = (await q('INSERT INTO project_sections (project_id, title) VALUES (?, ?)', [proj, `${label} section`])).insertId;
  await q('INSERT INTO project_tasks (project_section_id, title) VALUES (?, ?)', [sec, `${label} task`]);
  await q('INSERT INTO project_users (project_id, user_id) VALUES (?, ?)', [proj, owner.id]);
  const veh = (await q('INSERT INTO vehicles (company_id, name, year, last_registration_date, registration_expiry_date, image_path) VALUES (?, ?, 2020, ?, ?, ?)',
    [companyId, `${label} van`, '2026-01-01', '2027-01-01', `/uploads/vehicles/${companyId}-van-${label}.png`])).insertId;
  await q('UPDATE companies SET logo_path = ? WHERE id = ?', [`/uploads/company-logos/${companyId}-logo-${label}.png`, companyId]);
  return { loc, elev, visit, inter, wo, proj, veh };
}

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params = []) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Legal A');
  const B = await mkCompany('Legal B');
  const mkUser = async (label, companyId, role, extra = {}) => {
    const email = `${label}-${tag}@legal.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, `${label} Person ${tag}`, companyId, email, extra.global_role || 'user']
    );
    if (companyId) await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email, username: `${label}-${tag}`, full_name: `${label} Person ${tag}` };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const techA = await mkUser('techA', A, 'technician');
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin');

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));

  const cAdminA = await login(adminA.email, pw);
  const cTechA = await login(techA.email, pw);
  const cViewerA = await login(viewerA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  let r;

  // =====================================================================================================
  console.log('\n[1. terms / privacy acceptance]');
  const acceptances = (userId) => q('SELECT document, version, method, company_id, accepted_at FROM legal_acceptances WHERE user_id = ? ORDER BY id', [userId]);

  r = await api('GET', '/api/legal/status');
  check('status without session -> 401', r.status === 401);
  r = await api('POST', '/api/legal/accept', { json: { accept: true } });
  check('accept without session -> 401', r.status === 401);

  r = await api('GET', '/api/legal/status', { cookie: cAdminA });
  check('existing user that never accepted needs acceptance', r.status === 200 && r.body.needs_acceptance === true
    && r.body.versions.terms === LEGAL_VERSIONS.terms && r.body.accepted.terms === false, JSON.stringify(r.body));

  r = await api('POST', '/api/legal/accept', { cookie: cAdminA, json: {} });
  check('accept without accept:true -> 400 terms_required', r.status === 400 && r.body.code === 'terms_required');
  check('nothing recorded after the refused accept', (await acceptances(adminA.id)).length === 0);

  r = await api('POST', '/api/legal/accept', { cookie: cAdminA, json: { accept: true } });
  check('accept -> needs_acceptance false', r.status === 200 && r.body.needs_acceptance === false, JSON.stringify(r.body));
  let rows = await acceptances(adminA.id);
  check('one row per document with the current version and method prompt', rows.length === 2
    && rows.every((x) => x.version === LEGAL_VERSIONS[x.document] && x.method === 'prompt' && x.company_id === A), JSON.stringify(rows));
  r = await api('POST', '/api/legal/accept', { cookie: cAdminA, json: { accept: true } });
  check('accepting again records nothing new', (await acceptances(adminA.id)).length === 2);
  const stored = (await q('SELECT * FROM legal_acceptances LIMIT 1'))[0];
  check('no IP / user agent stored (data minimal)', !Object.keys(stored).some((k) => /ip|agent/i.test(k)), Object.keys(stored).join(','));

  await q("UPDATE legal_acceptances SET version = 'old-version' WHERE user_id = ? AND document = 'terms'", [adminA.id]);
  r = await api('GET', '/api/legal/status', { cookie: cAdminA });
  check('new document version -> acceptance needed again', r.body.needs_acceptance === true && r.body.accepted.terms === false && r.body.accepted.privacy === true);
  r = await api('POST', '/api/legal/accept', { cookie: cAdminA, json: { accept: true } });
  check('re-acceptance adds only the changed document', r.body.needs_acceptance === false && (await acceptances(adminA.id)).length === 3);

  await q("UPDATE company_subscriptions SET status = 'suspended' WHERE company_id = ?", [A]);
  r = await api('GET', '/api/legal/status', { cookie: cTechA });
  check('locked company: status still readable', r.status === 200 && r.body.needs_acceptance === true);
  r = await api('POST', '/api/legal/accept', { cookie: cTechA, json: { accept: true } });
  check('locked company: acceptance still possible (not blocked by subscription gate)', r.status === 200 && r.body.needs_acceptance === false);
  r = await api('POST', '/api/legal/accept', { cookie: cViewerA, json: { accept: true } });
  check('viewer can accept (not a data write)', r.status === 200);
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [A]);

  // signup
  const signupBody = (email, extra = {}) => ({ company_name: `Signup Co ${tag}`, full_name: 'New Owner', email, password: 'Signup-pass-1', ...extra });
  r = await api('POST', '/api/signup', { json: signupBody(`s1-${tag}@legal.test`) });
  check('signup without accept_terms -> 400 terms_required', r.status === 400 && r.body.code === 'terms_required');
  r = await api('POST', '/api/signup', { json: signupBody(`s1-${tag}@legal.test`, { accept_terms: 'yes' }) });
  check('signup with accept_terms not strictly true -> 400', r.status === 400 && r.body.code === 'terms_required');
  check('refused signup created no user', await count('SELECT COUNT(*) c FROM users WHERE email = ?', [`s1-${tag}@legal.test`]) === 0);
  r = await api('POST', '/api/signup', { json: signupBody(`s1-${tag}@legal.test`, { accept_terms: true }) });
  check('signup with accept_terms -> 201', r.status === 201, JSON.stringify(r.body));
  const su = (await q('SELECT id, company_id FROM users WHERE email = ?', [`s1-${tag}@legal.test`]))[0];
  rows = await acceptances(su.id);
  check('signup stored both acceptances (method signup, company id, current versions)', rows.length === 2
    && rows.every((x) => x.method === 'signup' && x.company_id === su.company_id && x.version === LEGAL_VERSIONS[x.document]), JSON.stringify(rows));

  // invitation accept (new account)
  const invite = async (email) => {
    const token = `tok-${tag}-${email.split('@')[0]}`;
    await q('INSERT INTO invitations (email, company_id, role, token, expires_at, status, invited_by) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), ?, ?)',
      [email, A, 'viewer', token, 'pending', adminA.id]);
    return token;
  };
  const tok = await invite(`inv-${tag}@legal.test`);
  r = await api('POST', '/api/invitations/accept', { json: { token: tok, password: 'Invite-pass-1' } });
  check('invitation accept (new account) without accept_terms -> 400', r.status === 400 && r.body.code === 'terms_required');
  check('refused invitation accept created no user and kept the invitation pending',
    await count('SELECT COUNT(*) c FROM users WHERE email = ?', [`inv-${tag}@legal.test`]) === 0
    && await count("SELECT COUNT(*) c FROM invitations WHERE token = ? AND status = 'pending'", [tok]) === 1);
  r = await api('POST', '/api/invitations/accept', { json: { token: tok, password: 'Invite-pass-1', accept_terms: true } });
  check('invitation accept with accept_terms -> 200', r.status === 200, JSON.stringify(r.body));
  rows = await acceptances(r.body.id);
  check('invitation accept stored acceptances (method invitation)', rows.length === 2 && rows.every((x) => x.method === 'invitation' && x.company_id === A));

  // invitation for an already existing account: no terms needed (existing accounts see the in-app dialog)
  const tok2 = await invite(techA.email);
  r = await api('POST', '/api/invitations/accept', { json: { token: tok2, password: 'whatever-123' } });
  check('invitation for an existing account does not need the checkbox', r.status === 200, JSON.stringify(r.body));

  // legacy activation flow (users created by an admin)
  const actTok = `act-${tag}`;
  const au = await q("INSERT INTO users (username, full_name, role, company_id, invite_token, invite_expires, is_active) VALUES (?, 'Act', 'technician', ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), 0)", [`act-${tag}`, A, actTok]);
  r = await api('POST', '/api/auth/set-password', { json: { token: actTok, password: 'Activate-pass-1' } });
  check('activation without accept_terms -> 400', r.status === 400 && r.body.code === 'terms_required');
  r = await api('POST', '/api/auth/set-password', { json: { token: actTok, password: 'Activate-pass-1', accept_terms: true } });
  rows = await acceptances(au.insertId);
  check('activation with accept_terms -> 200 and recorded (method activation)', r.status === 200 && rows.length === 2 && rows[0].method === 'activation', JSON.stringify(r.body));


  // =====================================================================================================
  console.log('\n[2. company data export]');
  const JSZip = require(path.join(BACKEND, 'node_modules', 'jszip'));
  const dataA = await seedCompanyData(q, A, 'alpha', adminA);
  const dataB = await seedCompanyData(q, B, 'bravo', adminB);
  fixture(`signatures/${A}-sig-alpha.png`, 'sigA');
  fixture(`company-logos/${A}-logo-alpha.png`, 'logoA');
  fixture(`vehicles/${A}-van-alpha.png`, 'vanA');
  fixture('interventions/legacy-alpha.jpg', 'legacyA');
  fixture(`interventions/${A}-i${dataA.inter}-photo.jpg`, 'photoA');
  fixture(`signatures/${B}-sig-bravo.png`, 'sigB-secret');
  fixture(`company-logos/${B}-logo-bravo.png`, 'logoB-secret');
  fixture('interventions/legacy-bravo.jpg', 'legacyB-secret');
  // company A's rows point at B's file and at path traversal: both must be refused, never packed
  await q("UPDATE interventions SET pdf_path = ? WHERE id = ?", [`/uploads/signatures/${B}-sig-bravo.png`, dataA.inter]);
  await q('INSERT INTO work_order_attachments (work_order_id, company_id, file_path, uploaded_by) VALUES (?, ?, ?, ?)', [dataA.wo, A, '/uploads/work-orders/../../.env', adminA.id]);
  await require(path.join(BACKEND, 'utils', 'subscriptions')).ensureCompanySubscription(A);
  await require(path.join(BACKEND, 'utils', 'subscriptions')).ensureCompanySubscription(B);

  const zipOf = async (cookie) => {
    const res = await api('GET', '/api/company/export', { cookie, raw: true });
    return { res, zip: res.status === 200 ? await JSZip.loadAsync(res.buffer) : null };
  };

  r = await api('GET', '/api/company/export');
  check('export without session -> 401', r.status === 401);
  for (const [label, cookie] of [['technician', cTechA], ['viewer', cViewerA]]) {
    r = await api('GET', '/api/company/export', { cookie });
    check(`${label} cannot export -> 403`, r.status === 403 && r.body.code === 'forbidden', `got ${r.status}`);
    r = await api('GET', '/api/company/export/check', { cookie });
    check(`${label} cannot call the export check -> 403`, r.status === 403);
  }
  check('forbidden attempts wrote no export audit row', await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'company_export'", [A]) === 0);

  // A is LOCKED (suspended): export must still work (read-only does not block data portability)
  await q("UPDATE company_subscriptions SET status = 'suspended' WHERE company_id = ?", [A]);
  r = await api('POST', '/api/locations', { cookie: cAdminA, json: { name: 'x', address: 'y' } });
  check('precondition: company A is locked (writes -> 402)', r.status === 402, `got ${r.status}`);
  r = await api('GET', '/api/company/export/check', { cookie: cAdminA });
  check('check: allowed, shows the files that would be packed', r.status === 200 && r.body.allowed === true && r.body.files.count === 5 && r.body.files.included === true && r.body.files.refused === 2 && r.body.files.missing === 0,
    JSON.stringify(r.body));
  const { res: exA, zip: zipA } = await zipOf(cAdminA);
  check('locked company admin gets the ZIP (200, application/zip, attachment)', exA.status === 200 && /application\/zip/.test(exA.headers.get('content-type')) && /attachment; filename="liftelo-export-company-/.test(exA.headers.get('content-disposition')),
    `got ${exA.status}`);
  const names = zipA ? Object.keys(zipA.files) : [];
  const read = async (name) => zipA.files[name].async('string');
  check('ZIP has JSON + CSV for every entity and a manifest', ['company', 'users', 'locations', 'elevators', 'rms_visits', 'rms_visit_items', 'interventions', 'work_orders', 'projects', 'vehicles']
    .every((n) => names.includes(`data/${n}.json`) && names.includes(`data/${n}.csv`)) && names.includes('manifest.json'), names.join(','));
  const manifest = JSON.parse(await read('manifest.json'));
  check('manifest: company id, row counts per table', manifest.company_id === A && manifest.tables.locations.rows === 1 && manifest.tables.rms_visits.rows === 1
    && manifest.tables.rms_visit_items.rows === 1 && manifest.tables.interventions.rows === 1 && manifest.tables.work_orders.rows === 1 && manifest.tables.projects.rows === 1
    && manifest.tables.project_tasks.rows === 1 && manifest.tables.project_users.rows === 1 && manifest.tables.vehicles.rows === 1 && manifest.tables.users.rows === 4, JSON.stringify(manifest.tables));
  const locJson = JSON.parse(await read('data/locations.json'));
  check('locations.json holds company A\'s location only', locJson.length === 1 && locJson[0].name === 'alpha location' && locJson[0].company_id === A);
  const visits = JSON.parse(await read('data/rms_visits.json'));
  check('DATE/DATETIME exported as plain strings (no timezone shift)', visits[0].visit_date === '2026-11-05 00:00:00', String(visits[0].visit_date));
  const csvVisits = await read('data/rms_visits.csv');
  check('CSV: BOM + header + quoted cell with comma and quotes', csvVisits.startsWith('﻿id,') && csvVisits.includes('"alpha visit note, with comma and ""quote"""'));
  const csvItems = await read('data/rms_visit_items.csv');
  check('CSV: formula-looking cell is neutralised with a leading apostrophe', csvItems.includes("'=HYPERLINK") && !/,=HYPERLINK/.test(csvItems));
  const usersJson = await read('data/users.json');
  check('users: no password hash / token / session columns, but e-mail and role are there', !/password|invite_token|reset|\$2[aby]\$/i.test(usersJson) && usersJson.includes(adminA.email) && usersJson.includes('"company_role": "admin"') === false && usersJson.includes('"company_role":"admin"'));
  const wholeText = (await Promise.all(names.filter((n) => n.startsWith('data/')).map((n) => read(n)))).join('\n');
  check('no data of company B anywhere in the export (names, notes, e-mails; A\'s own row merely stores a path string it was tricked into)', !/bravo (location|visit|intervention|project|van|work order)/i.test(wholeText) && !wholeText.includes(adminB.email) && !wholeText.includes('secret'));
  const fileNames = names.filter((n) => n.startsWith('files/'));
  check('company A\'s files are packed (logo, signature, vehicle image, legacy + new intervention photo)', ['files/company-logos/' + A + '-logo-alpha.png', 'files/signatures/' + A + '-sig-alpha.png',
    'files/vehicles/' + A + '-van-alpha.png', 'files/interventions/legacy-alpha.jpg', `files/interventions/${A}-i${dataA.inter}-photo.jpg`].every((n) => fileNames.includes(n)), fileNames.join(','));
  check('company B\'s files and refused paths are NOT packed', !fileNames.some((n) => /bravo|secret|\.env/.test(n)) && fileNames.length === 5);
  check('packed file content is intact', (await zipA.files[`files/signatures/${A}-sig-alpha.png`].async('string')) === 'sigA');
  check('manifest lists refused paths as not_owned and still includes the files flag', manifest.files.included_in_archive === true
    && manifest.files.entries.filter((e) => e.status === 'not_owned').length === 2 && manifest.files.entries.filter((e) => e.in_archive).length === 5);
  check('export audited (company_export + company_export_completed with row counts)',
    await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'company_export' AND user_id = ?", [A, adminA.id]) === 1);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const completed = (await q("SELECT metadata FROM audit_logs WHERE company_id = ? AND action = 'company_export_completed'", [A]))[0];
  check('completed audit row carries bytes + files + row counts and no data', completed && JSON.parse(completed.metadata).files === 5 && JSON.parse(completed.metadata).rows.locations === 1 && !/alpha/.test(completed.metadata));

  r = await api('GET', '/api/company/export', { cookie: cAdminA });
  check('second export within 10 minutes -> 429 export_rate_limited (+ Retry-After)', r.status === 429 && r.body.code === 'export_rate_limited' && r.body.retry_after_seconds > 0 && Number(r.headers.get('retry-after')) > 0, `got ${r.status}`);
  r = await api('GET', '/api/company/export/check', { cookie: cAdminA });
  check('check reports the cooldown without counting as an export', r.status === 200 && r.body.allowed === false && r.body.retry_after_seconds > 0
    && await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'company_export'", [A]) === 1);
  await q("UPDATE audit_logs SET created_at = DATE_SUB(NOW(), INTERVAL 11 MINUTE) WHERE company_id = ? AND action = 'company_export'", [A]);
  r = await api('GET', '/api/company/export/check', { cookie: cAdminA });
  check('after the cooldown the export is allowed again', r.status === 200 && r.body.allowed === true);

  // tenant isolation: B's admin exports B only; the cooldown of A does not apply to B
  const { res: exB, zip: zipB } = await zipOf(cAdminB);
  const textB = zipB ? (await Promise.all(Object.keys(zipB.files).filter((n) => n.startsWith('data/')).map((n) => zipB.files[n].async('string')))).join('\n') : '';
  check('company B admin exports company B (own cooldown), nothing of company A', exB.status === 200 && /bravo/.test(textB) && !/alpha/i.test(textB) && !textB.includes(adminA.email),
    `got ${exB.status}`);
  check('company B zip has only B\'s files', zipB && Object.keys(zipB.files).filter((n) => n.startsWith('files/')).every((n) => /bravo/.test(n) || n.includes(`/${B}-`) || n.includes('legacy-bravo')));
  // paging: more rows than one page (PAGE_SIZE 1000) must come out complete, ordered and without duplicates
  const bulk = Array.from({ length: 2300 }, (_, i) => [dataA.visit, `bulk-${i}`, 'O.K.', A]);
  await q('INSERT INTO rms_visit_items (visit_id, elevator_label, status, company_id) VALUES ?', [bulk]);
  await q("UPDATE audit_logs SET created_at = DATE_SUB(NOW(), INTERVAL 11 MINUTE) WHERE company_id = ? AND action = 'company_export'", [A]);
  const { zip: zipBig } = await zipOf(cAdminA);
  const bigItems = zipBig ? JSON.parse(await zipBig.files['data/rms_visit_items.json'].async('string')) : [];
  const bigIds = bigItems.map((x) => x.id);
  check('export pages through >1000 rows completely, ordered, no duplicates', bigItems.length === 2301 && new Set(bigIds).size === 2301 && bigIds.every((id, i) => i === 0 || id > bigIds[i - 1]), `got ${bigItems.length}`);
  const bigCsv = zipBig ? await zipBig.files['data/rms_visit_items.csv'].async('string') : '';
  check('CSV has the same number of lines (header + rows)', bigCsv.split('\r\n').filter(Boolean).length === 2302);
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [A]);

  // =====================================================================================================
  // (sections 2-4 are appended below by later steps)

  void cAdminB; void cTechA; void cViewerA; void fixture;
  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error('test run crashed:', err); failed++; })
  .finally(() => {
    fixtures.forEach((f) => { try { fs.unlinkSync(f); } catch { /* already gone */ } });
    process.exit(failed ? 1 : 0);
  });
