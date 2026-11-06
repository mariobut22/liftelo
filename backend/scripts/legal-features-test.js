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
  console.log('\n[3. personal data: download my data + anonymise a leaver]');
  const { getCompanyUsage } = require(path.join(BACKEND, 'utils', 'subscriptions'));
  const { anonymizeUser, PrivacyError } = require(path.join(BACKEND, 'utils', 'userPrivacy'));
  const leaver = await mkUser('leaver', A, 'technician');
  const sharedUser = await mkUser('shared', A, 'technician');
  await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [sharedUser.id, B, 'technician']);
  const cLeaver = await login(leaver.email, pw);
  const cShared = await login(sharedUser.email, pw);

  // leaver's footprint
  const leaverVisit = (await q('INSERT INTO rms_visits (location_id, user_id, visit_date, company_id, notes_general) VALUES (?, ?, ?, ?, ?)', [dataA.loc, leaver.id, '2026-11-06 00:00:00', A, 'leaver visit'])).insertId;
  await q('INSERT INTO rms_visit_items (visit_id, elevator_label, status, company_id) VALUES (?, ?, ?, ?)', [leaverVisit, 'alpha-L1', 'O.K.', A]);
  const mkInter = async (companyId, locationId, tech, second, description) => (await q(
    'INSERT INTO interventions (date, type, technician, second_technician, description, location_id, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['2026-11-03 09:00:00', 'POZIV', tech, second, description, locationId, companyId])).insertId;
  const iFirst = await mkInter(A, dataA.loc, leaver.username, null, 'leaver as first technician');
  const iSecond = await mkInter(A, dataA.loc, techA.username, leaver.full_name, 'leaver as second technician (typed full name)');
  const iOther = await mkInter(A, dataA.loc, techA.username, null, 'unrelated intervention');
  const iB = await mkInter(B, dataB.loc, leaver.username, null, 'company B row with the same name text');
  await q("INSERT INTO user_identities (user_id, provider, provider_sub, email_at_link_time) VALUES (?, 'google', ?, ?)", [leaver.id, `sub-${tag}`, leaver.email]);
  await q("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'x', 'hello', 'm')", [leaver.id]);
  await q('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))', [leaver.id, `reset-${tag}`]);
  await q("INSERT INTO invitations (email, company_id, role, token, expires_at, status) VALUES (?, ?, 'technician', ?, DATE_ADD(NOW(), INTERVAL 1 DAY), 'accepted')", [leaver.email, A, `inv-leaver-${tag}`]);
  await q("INSERT INTO email_outbox (to_email, subject, html, status, company_id, user_id) VALUES (?, 's', '<p>x</p>', 'sent', ?, ?)", [leaver.email, A, leaver.id]);
  await q("INSERT INTO audit_logs (user_id, company_id, action, metadata) VALUES (?, ?, 'login', ?)", [leaver.id, A, JSON.stringify({ ip: '203.0.113.9', email: leaver.email, keep: 'me' })]);

  // ---- (a) download my data
  r = await api('GET', '/api/users/me/export');
  check('my-data without session -> 401', r.status === 401);
  await q("UPDATE company_subscriptions SET status = 'suspended' WHERE company_id = ?", [A]);
  r = await api('GET', '/api/users/me/export', { cookie: cLeaver, raw: true });
  const mine = r.status === 200 ? JSON.parse(r.buffer.toString('utf8')) : null;
  check('my-data works for a technician of a LOCKED company (200, attachment)', r.status === 200 && /attachment; filename="liftelo-my-data-/.test(r.headers.get('content-disposition')), `got ${r.status}`);
  const mineText = r.status === 200 ? r.buffer.toString('utf8') : '';
  check('profile + membership + sign-in method + legal row shape', mine && mine.profile.email === leaver.email && mine.profile.id === leaver.id
    && mine.memberships.length === 1 && mine.memberships[0].company_id === A && mine.sign_in_methods.some((x) => x.provider === 'google') && mine.profile.created_at === mine.profile.created_at.replace('T', ' ').slice(0, 19));
  check('no password hash, token or provider id in the file', !/"password|\$2[aby]\$|reset-|sub-/i.test(mineText), mineText.match(/"password|\$2[aby]\$|reset-|sub-/i)?.[0]);
  check('activity: own visit + both interventions (name as username and as typed full name), nothing unrelated',
    mine.activity.rms_visits.length === 1 && mine.activity.rms_visits[0].id === leaverVisit
    && mine.activity.interventions.map((x) => x.id).sort().join() === [iFirst, iSecond].sort().join());
  check('nothing of company B (the intervention with the same name text) and not of other users', !mineText.includes('company B row') && !mineText.includes('unrelated intervention') && !mineText.includes(adminA.email));
  check('own audit entry is included (with the IP, it is the user\'s own data)', mine.audit_log.entries.some((e) => e.action === 'login' && e.metadata.ip === '203.0.113.9'));
  r = await api('GET', '/api/users/me/export', { cookie: cShared, raw: true });
  const sharedMine = JSON.parse(r.buffer.toString('utf8'));
  check('multi-company user: sees only own memberships\' entries, no foreign rows', r.status === 200 && sharedMine.memberships.length === 2 && sharedMine.activity.interventions.length === 0);
  check('my-data export audited', await count("SELECT COUNT(*) c FROM audit_logs WHERE user_id = ? AND action = 'personal_data_export'", [leaver.id]) === 1);
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [A]);

  // ---- (b) anonymise: permissions + tenant isolation
  const anon = (cookie, id, json = { confirm: true }) => api('POST', `/api/users/${id}/anonymize`, { cookie, json });
  r = await anon(undefined, leaver.id);
  check('anonymise without session -> 401', r.status === 401);
  r = await anon(cTechA, leaver.id);
  check('technician cannot anonymise -> 403', r.status === 403 && r.body.code === 'forbidden');
  r = await anon(cViewerA, leaver.id);
  check('viewer cannot anonymise -> 403', r.status === 403);
  r = await anon(cAdminB, leaver.id);
  check('company B admin cannot anonymise company A\'s user -> 404 (tenant isolation)', r.status === 404 && r.body.code === 'user_not_found', `got ${r.status}`);
  check('...and nothing changed', (await q('SELECT email, is_active FROM users WHERE id = ?', [leaver.id]))[0].email === leaver.email);
  r = await anon(cAdminA, adminA.id);
  check('admin cannot anonymise himself -> 400', r.status === 400 && r.body.code === 'cannot_anonymize_self');
  r = await anon(cAdminA, leaver.id, {});
  check('confirmation is required -> 400', r.status === 400 && r.body.code === 'confirmation_required');
  r = await anon(cAdminA, 'abc');
  check('invalid id -> 400', r.status === 400 && r.body.code === 'invalid_request');
  r = await anon(cAdminA, sharedUser.id);
  check('user that is also a member of another company -> 409 user_in_other_companies', r.status === 409 && r.body.code === 'user_in_other_companies');
  r = await anon(cAdminA, adminB.id);
  check('user of another company -> 404', r.status === 404);
  // last admin (route layer makes it unreachable for admins - the actor is always an active admin - so check the guard directly)
  const soloAdmin = await mkUser('solo', A, 'admin');
  await q('UPDATE users SET is_active = 0 WHERE id IN (?, ?)', [adminA.id, adminA.id]);
  let lastAdminErr = null;
  try { await anonymizeUser({ companyId: A, actorId: 999999, targetId: soloAdmin.id }); } catch (err) { lastAdminErr = err; }
  await q('UPDATE users SET is_active = 1 WHERE id = ?', [adminA.id]);
  check('the last active admin of a company cannot be anonymised (guard)', lastAdminErr instanceof PrivacyError && lastAdminErr.body.code === 'last_admin', String(lastAdminErr));

  // ---- (b) anonymise: the real thing
  const before = {
    visits: await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]),
    items: await count('SELECT COUNT(*) c FROM rms_visit_items WHERE company_id = ?', [A]),
    inter: await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ?', [A]),
    techs: (await getCompanyUsage(A)).technicians,
  };
  const interBefore = (await q('SELECT id, date, type, description, notes, status, location_id, created_at, uploaded_files FROM interventions WHERE company_id = ? ORDER BY id', [A]));
  r = await anon(cAdminA, leaver.id);
  check('admin anonymises the leaver -> 200 with counts', r.status === 200 && r.body.success === true && r.body.interventions_updated === 2 && r.body.invitations_scrubbed === 1 && r.body.audit_rows_scrubbed >= 1, JSON.stringify(r.body));
  const u = (await q('SELECT * FROM users WHERE id = ?', [leaver.id]))[0];
  check('user row keeps its id; name/e-mail/username replaced, inactive, password and hash cleared',
    u && u.username === `removed-user-${leaver.id}` && u.email === `removed-user-${leaver.id}@anonymized.invalid` && u.full_name === `Former user #${leaver.id}`
    && u.is_active === 0 && u.disabled_at && !u.password && u.password_hash === null && u.invite_token === null, JSON.stringify(u));
  check('OAuth identities, reset tokens, notifications, outbox rows of the user are gone',
    await count('SELECT COUNT(*) c FROM user_identities WHERE user_id = ?', [leaver.id]) === 0
    && await count('SELECT COUNT(*) c FROM password_resets WHERE user_id = ?', [leaver.id]) === 0
    && await count('SELECT COUNT(*) c FROM notifications WHERE user_id = ?', [leaver.id]) === 0
    && await count('SELECT COUNT(*) c FROM email_outbox WHERE user_id = ?', [leaver.id]) === 0);
  check('old e-mail no longer anywhere in invitations', await count('SELECT COUNT(*) c FROM invitations WHERE email = ?', [leaver.email]) === 0);
  const iRows = await q('SELECT id, technician, second_technician FROM interventions WHERE id IN (?, ?, ?, ?) ORDER BY id', [iFirst, iSecond, iOther, iB]);
  const byId = Object.fromEntries(iRows.map((x) => [x.id, x]));
  check('intervention name TEXT replaced in both name columns (username and typed full name)', byId[iFirst].technician === `Former user #${leaver.id}` && byId[iSecond].second_technician === `Former user #${leaver.id}`
    && byId[iSecond].technician === techA.username);
  check('unrelated intervention untouched', byId[iOther].technician === techA.username && byId[iOther].second_technician === null);
  check('company B row with the same name text untouched (tenant isolation of the UPDATE)', byId[iB].technician === leaver.username);
  const interAfter = (await q('SELECT id, date, type, description, notes, status, location_id, created_at, uploaded_files FROM interventions WHERE company_id = ? ORDER BY id', [A]));
  check('append-only: no intervention deleted, every OTHER column identical', interAfter.length === before.inter && JSON.stringify(interAfter) === JSON.stringify(interBefore));
  check('append-only: rms_visits / rms_visit_items untouched (same counts, visit still points at the user id)', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]) === before.visits
    && await count('SELECT COUNT(*) c FROM rms_visit_items WHERE company_id = ?', [A]) === before.items
    && await count('SELECT COUNT(*) c FROM rms_visits WHERE id = ? AND user_id = ?', [leaverVisit, leaver.id]) === 1);
  check('membership row kept (history), but an inactive member no longer counts toward the plan limit', await count('SELECT COUNT(*) c FROM user_companies WHERE user_id = ? AND company_id = ?', [leaver.id, A]) === 1
    && (await getCompanyUsage(A)).technicians === before.techs - 1, `techs ${before.techs} -> ${(await getCompanyUsage(A)).technicians}`);
  const auditRowsAfter = (await q("SELECT metadata FROM audit_logs WHERE user_id = ? AND action = 'login'", [leaver.id])).map((x) => (typeof x.metadata === 'string' ? JSON.parse(x.metadata) : x.metadata) || {});
  check('audit trail of the user: e-mail and IP removed from every row, other keys kept', auditRowsAfter.length >= 2 && auditRowsAfter.every((m) => !('ip' in m) && !('email' in m)) && auditRowsAfter.some((m) => m.keep === 'me'), JSON.stringify(auditRowsAfter));
  const anonAudit = (await q("SELECT metadata, user_id FROM audit_logs WHERE action = 'user_anonymized' AND company_id = ?", [A]))[0];
  check('user_anonymized audit row: ids and counts only, no old name / e-mail', anonAudit && anonAudit.user_id === adminA.id && !JSON.stringify(anonAudit.metadata).includes(leaver.email) && !JSON.stringify(anonAudit.metadata).includes(leaver.username));
  r = await api('GET', '/api/locations', { cookie: cLeaver });
  check('a live session of the anonymised user is rejected on its next request', r.status === 401 && r.body.code === 'account_disabled', `got ${r.status}`);
  let loginStatus = 0;
  for (const email of [leaver.email, `removed-user-${leaver.id}@anonymized.invalid`]) {
    const lr = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    loginStatus = lr.status === 200 ? 200 : loginStatus;
  }
  check('the anonymised account can never sign in again (old and placeholder e-mail)', loginStatus !== 200);
  r = await anon(cAdminA, leaver.id);
  check('anonymising twice -> 409 already_anonymized', r.status === 409 && r.body.code === 'already_anonymized');
  r = await api('GET', `/api/companies/${A}/users`, { cookie: cAdminA });
  check('member list shows the placeholder, not the old e-mail', r.status === 200 && !JSON.stringify(r.body).includes(leaver.email) && JSON.stringify(r.body).includes('anonymized.invalid'));


  // =====================================================================================================
  console.log('\n[4. company closure (superadmin) + purge script]');
  const { execFileSync } = require('child_process');
  const superUser = await mkUser('super', A, 'technician', { global_role: 'superadmin' });
  const cSuper = await login(superUser.email, pw);
  const C = await mkCompany('Legal C closing');
  const D = await mkCompany('Legal D other');
  const adminC = await mkUser('adminC', C, 'admin');
  const techC = await mkUser('techC', C, 'technician');
  const sharedCB = await mkUser('sharedCB', C, 'technician');
  await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [sharedCB.id, B, 'technician']);
  await q('UPDATE users SET company_id = ? WHERE id = ?', [C, sharedCB.id]);
  const adminD = await mkUser('adminD', D, 'admin');
  const dataC = await seedCompanyData(q, C, 'charlie', adminC);
  fixture(`signatures/${C}-sig-charlie.png`, 'sigC');
  fixture(`company-logos/${C}-logo-charlie.png`, 'logoC');
  fixture(`vehicles/${C}-van-charlie.png`, 'vanC');
  fixture('interventions/legacy-charlie.jpg', 'legacyC');
  fixture(`interventions/${C}-i${dataC.inter}-photo.jpg`, 'photoC');
  fixture(`work-orders/${C}-orphan.png`, 'orphanC'); // no row references it: still belongs to the company
  const sub = require(path.join(BACKEND, 'utils', 'subscriptions'));
  await sub.ensureCompanySubscription(C);
  await sub.ensureCompanySubscription(D);
  const cAdminC = await login(adminC.email, pw);
  const sa = (cookie, cid, action, json) => api('POST', `/api/superadmin/companies/${cid}/${action}`, { cookie, json });
  const good = { reason: 'customer asked to close the account', password: pw };

  r = await sa(cAdminA, C, 'request-closure', good);
  check('company admin cannot request a closure (superadmin only) -> 403', r.status === 403);
  r = await sa(cAdminC, C, 'request-closure', good);
  check('not even the admin of the company itself -> 403', r.status === 403);
  r = await sa(undefined, C, 'request-closure', good);
  check('anonymous -> 401/403', r.status === 401 || r.status === 403);
  r = await sa(cSuper, C, 'request-closure', { reason: 'customer asked to close', password: 'wrong-password' });
  check('wrong superadmin password -> 403 invalid_password', r.status === 403 && r.body.code === 'invalid_password');
  r = await sa(cSuper, C, 'request-closure', { reason: 'x', password: pw });
  check('reason is required -> 400', r.status === 400 && r.body.code === 'reason_required');
  r = await sa(cSuper, D, 'request-closure', { ...good, retention_days: 3 });
  check('retention shorter than the minimum -> 400', r.status === 400 && r.body.code === 'invalid_request');
  check('...and company D is untouched', (await q('SELECT closure_requested_at FROM companies WHERE id = ?', [D]))[0].closure_requested_at === null);
  await q("UPDATE company_subscriptions SET stripe_subscription_id = 'sub_test' WHERE company_id = ?", [D]);
  r = await sa(cSuper, D, 'request-closure', good);
  check('Stripe-managed company -> 409 stripe_managed', r.status === 409 && r.body.code === 'stripe_managed');
  await q('UPDATE company_subscriptions SET stripe_subscription_id = NULL WHERE company_id = ?', [D]);

  const statusBefore = (await q('SELECT status FROM company_subscriptions WHERE company_id = ?', [C]))[0].status;
  r = await sa(cSuper, C, 'request-closure', good);
  check('superadmin requests the closure -> 200', r.status === 200 && r.body.success === true, JSON.stringify(r.body));
  let comp = (await q('SELECT closure_requested_at, closure_purge_after, closure_status_before FROM companies WHERE id = ?', [C]))[0];
  const days = (new Date(comp.closure_purge_after) - new Date(comp.closure_requested_at)) / 86400000;
  check('closure_requested_at set, purge date = +30 days, status before remembered', comp.closure_requested_at && Math.round(days) === 30 && comp.closure_status_before === statusBefore, JSON.stringify(comp));
  check('subscription is canceled (workspace locked)', (await q('SELECT status FROM company_subscriptions WHERE company_id = ?', [C]))[0].status === 'canceled');
  check('audit row superadmin_request_closure with reason, retention and purge date (no password)', await (async () => {
    const row = (await q("SELECT metadata FROM audit_logs WHERE company_id = ? AND action = 'superadmin_request_closure'", [C]))[0];
    const m = row && (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata);
    return m && m.reason === good.reason && m.retention_days === 30 && m.closure_purge_after && !JSON.stringify(m).includes(pw);
  })());
  r = await api('POST', '/api/locations', { cookie: cAdminC, json: { name: 'x', address: 'y' } });
  check('closing company is read-only (writes -> 402)', r.status === 402);
  r = await api('GET', '/api/company/export', { cookie: cAdminC, raw: true });
  check('...but its admin can still export the data', r.status === 200);
  r = await sa(cSuper, C, 'request-closure', good);
  check('requesting twice -> 409 closure_already_requested', r.status === 409 && r.body.code === 'closure_already_requested');
  r = await api('GET', `/api/superadmin/companies/${C}`, { cookie: cSuper });
  check('company detail shows the closure (requested, purge date, not yet due)', r.status === 200 && r.body.closure && r.body.closure.requested_at && r.body.closure.purge_after && r.body.closure.purge_due === false
    && r.body.closure.status_before === statusBefore, JSON.stringify(r.body.closure));
  r = await api('GET', `/api/superadmin/companies/${D}`, { cookie: cSuper });
  check('company without closure: closure null', r.status === 200 && r.body.closure === null);

  r = await sa(cSuper, D, 'cancel-closure', good);
  check('cancel-closure without a request -> 409 closure_not_requested', r.status === 409 && r.body.code === 'closure_not_requested');
  r = await sa(cSuper, C, 'cancel-closure', good);
  comp = (await q('SELECT closure_requested_at, closure_purge_after, closure_status_before FROM companies WHERE id = ?', [C]))[0];
  check('cancel-closure restores the old status and clears the closure', r.status === 200 && comp.closure_requested_at === null && comp.closure_purge_after === null
    && (await q('SELECT status FROM company_subscriptions WHERE company_id = ?', [C]))[0].status === statusBefore, JSON.stringify(r.body));
  r = await sa(cSuper, C, 'request-closure', { ...good, retention_days: 7 });
  check('request again with custom retention 7 days', r.status === 200 && Math.round((new Date((await q('SELECT closure_purge_after FROM companies WHERE id = ?', [C]))[0].closure_purge_after) - Date.now()) / 86400000) === 7);

  // ---- purge script (against THIS throwaway database only)
  const script = path.join(__dirname.endsWith('scripts') ? __dirname : path.join(BACKEND, 'scripts'), 'purge-company.js');
  const run = (extra, env = {}) => {
    try {
      const out = execFileSync('node', [script, ...extra], { env: { ...process.env, NODE_ENV: 'test', ...env }, cwd: os.tmpdir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      return { code: 0, out };
    } catch (err) {
      return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
    }
  };
  const tableCounts = async (cid) => ({
    loc: await count('SELECT COUNT(*) c FROM locations WHERE company_id = ?', [cid]),
    visits: await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [cid]),
    inter: await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ?', [cid]),
    proj: await count('SELECT COUNT(*) c FROM projects WHERE company_id = ?', [cid]),
    members: await count('SELECT COUNT(*) c FROM user_companies WHERE company_id = ?', [cid]),
  });
  const cBefore = await tableCounts(C);
  const bBefore = await tableCounts(B);

  let p = run(['--company-id', String(C)]);
  check('purge script: closure requested but purge date in the future -> refused', p.code !== 0 && /purge date has not passed/.test(p.out), p.out.slice(0, 200));
  p = run(['--company-id', String(B), '--execute', '--confirm', `DELETE COMPANY ${B}`]);
  check('purge script: company without closure request -> refused', p.code !== 0 && /no closure was requested/.test(p.out));
  p = run(['--company-id', String(C)], { NODE_ENV: 'production' });
  check('purge script: NODE_ENV=production without --i-am-sure-production -> refused', p.code === 2 && /i-am-sure-production/.test(p.out));
  p = run([]);
  check('purge script: --company-id is required', p.code === 2);
  await q('UPDATE companies SET closure_purge_after = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [C]);
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [C]);
  p = run(['--company-id', String(C), '--execute', '--confirm', `DELETE COMPANY ${C}`]);
  check('purge script: subscription no longer canceled (closure reverted by a plan change) -> refused', p.code !== 0 && /not "canceled"/.test(p.out));
  await q("UPDATE company_subscriptions SET status = 'canceled' WHERE company_id = ?", [C]);

  p = run(['--company-id', String(C)]);
  const dry = JSON.stringify(await tableCounts(C)) === JSON.stringify(cBefore);
  check('purge script: DRY-RUN by default prints per-table counts and the file count, deletes nothing',
    p.code === 0 && /MODE: dry-run/.test(p.out) && /rms_visits\s+1\b/.test(p.out) && /Files that would be deleted: 6/.test(p.out) && /Dry-run only/.test(p.out) && dry, p.out.slice(0, 900));
  check('...and no file was removed in the dry run', fs.existsSync(path.join(uploadsRoot, `signatures/${C}-sig-charlie.png`)) && fs.existsSync(path.join(uploadsRoot, 'interventions/legacy-charlie.jpg')));
  p = run(['--company-id', String(C), '--execute', '--confirm', 'yes']);
  check('purge script: --execute with a wrong typed confirmation -> refused, nothing deleted', p.code !== 0 && /confirmation text did not match/.test(p.out) && JSON.stringify(await tableCounts(C)) === JSON.stringify(cBefore));

  p = run(['--company-id', String(C), '--execute', '--confirm', `DELETE COMPANY ${C}`]);
  check('purge script: --execute with the typed confirmation -> deleted', p.code === 0 && /Database rows deleted/.test(p.out) && /Files deleted: 6 of 6/.test(p.out), p.out.slice(-500));
  const gone = await count('SELECT COUNT(*) c FROM companies WHERE id = ?', [C]) === 0
    && (await tableCounts(C)).loc === 0 && (await tableCounts(C)).visits === 0 && (await tableCounts(C)).inter === 0 && (await tableCounts(C)).proj === 0 && (await tableCounts(C)).members === 0
    && await count('SELECT COUNT(*) c FROM rms_visit_items WHERE company_id = ?', [C]) === 0
    && await count('SELECT COUNT(*) c FROM project_sections WHERE project_id = ?', [dataC.proj]) === 0
    && await count('SELECT COUNT(*) c FROM project_tasks WHERE project_section_id IN (SELECT id FROM project_sections WHERE project_id = ?)', [dataC.proj]) === 0
    && await count('SELECT COUNT(*) c FROM audit_logs WHERE company_id = ?', [C]) === 0
    && await count('SELECT COUNT(*) c FROM company_subscriptions WHERE company_id = ?', [C]) === 0;
  check('all rows of the company are gone (rms, interventions, projects incl. sections/tasks, audit, subscription, memberships)', gone);
  check('users only in this company deleted; the user shared with B kept and detached from C',
    await count('SELECT COUNT(*) c FROM users WHERE id IN (?, ?)', [adminC.id, techC.id]) === 0
    && (await q('SELECT company_id FROM users WHERE id = ?', [sharedCB.id])).length === 1
    && (await q('SELECT company_id FROM users WHERE id = ?', [sharedCB.id]))[0].company_id === null
    && await count('SELECT COUNT(*) c FROM user_companies WHERE user_id = ? AND company_id = ?', [sharedCB.id, B]) === 1);
  check('uploaded files of the company deleted (incl. legacy and orphan), other companies\' files untouched',
    !['signatures/' + C + '-sig-charlie.png', 'company-logos/' + C + '-logo-charlie.png', 'vehicles/' + C + '-van-charlie.png', 'interventions/legacy-charlie.jpg', 'work-orders/' + C + '-orphan.png', `interventions/${C}-i${dataC.inter}-photo.jpg`]
      .some((f) => fs.existsSync(path.join(uploadsRoot, f)))
    && fs.existsSync(path.join(uploadsRoot, `signatures/${B}-sig-bravo.png`)) && fs.existsSync(path.join(uploadsRoot, 'interventions/legacy-alpha.jpg')));
  check('company B and D completely untouched', JSON.stringify(await tableCounts(B)) === JSON.stringify(bBefore) && await count('SELECT COUNT(*) c FROM companies WHERE id IN (?, ?)', [B, D]) === 2);
  check('the purge stays on record (company_purged, no company reference, counts only)', await (async () => {
    const row = (await q("SELECT company_id, metadata FROM audit_logs WHERE action = 'company_purged'"))[0];
    const m = row && (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata);
    return row && row.company_id === null && m.purged_company_id === C && m.users_deleted === 2 && m.rows.rms_visits === 1;
  })());

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
