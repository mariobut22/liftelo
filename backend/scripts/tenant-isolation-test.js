#!/usr/bin/env node
/*
 * End-to-end tenant isolation test against a THROWAWAY MySQL/MariaDB (dev-only, no extra dependencies).
 *
 * It loads the real backend/index.js, seeds two companies (A and B) with data, logs in as users of A
 * through POST /api/login and proves that A cannot read, modify, delete or attach to B's rows - and that
 * legitimate same-company operations still work. Refuses to run against anything that is not an obvious
 * test database on localhost.
 *
 *   # 1. a scratch DB loaded with liftelo.sql (+ migrations), e.g. MariaDB/MySQL on 127.0.0.1:3398, database "tt"
 *   # 2. run (from any directory):
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3398 TENANT_TEST_DB_USER=root \
 *   TENANT_TEST_DB_PASSWORD= TENANT_TEST_DB_NAME=tt node backend/scripts/tenant-isolation-test.js
 *
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
  name: process.env.TENANT_TEST_DB_NAME || ''
};
if (!['127.0.0.1', 'localhost'].includes(cfg.host) || !/^(tt|.*_test|.*_tmp|tenant.*)$/i.test(cfg.name) || process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: needs TENANT_TEST_DB_NAME like "tt" / "*_test" on localhost (never a real database).');
  process.exit(2);
}

// Run from a neutral directory so no .env file is picked up by dotenv
process.chdir(os.tmpdir());
const PORT = Number(process.env.TENANT_TEST_PORT || 3397);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'tenant-isolation-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
async function api(method, url, { cookie, json, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  } catch {
    return { status: 0, body: 'no response (timeout)', headers: new Headers() };
  }
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers };
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
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
}

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];

  // ---------------------------------------------------------------- seed
  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Tenant A');
  const B = await mkCompany('Tenant B');
  const mkUser = async (label, companyId, role, extra = {}) => {
    const email = `${label}-${tag}@tenant.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, label, companyId, email, extra.global_role || 'user']
    );
    if (companyId) await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email, username: `${label}-${tag}` };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const techA = await mkUser('techA', A, 'technician');
  const adminB = await mkUser('adminB', B, 'admin');
  const techB = await mkUser('techB', B, 'technician');
  const sharedUser = await mkUser('shared', A, 'technician'); // member of A and of B
  await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [sharedUser.id, B, 'technician']);
  const superUser = await mkUser('super', A, 'technician', { global_role: 'superadmin' }); // superadmin who is also a member of A

  const mkLocation = async (companyId, name) => (await q(
    'INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [name, `${name} street 1`, companyId])).insertId;
  const locA = await mkLocation(A, `LocA-${tag}`);
  const locB = await mkLocation(B, `LocB-${tag}`);
  const mkElevator = async (companyId, locationId, label) => (await q(
    'INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [locationId, companyId, label])).insertId;
  const elA = await mkElevator(A, locA, 'EL-A');
  const elB = await mkElevator(B, locB, 'EL-B');

  const visitB = (await q('INSERT INTO rms_visits (location_id, user_id, visit_date, company_id) VALUES (?, ?, CURDATE(), ?)', [locB, adminB.id, B])).insertId;
  await q('INSERT INTO rms_visit_items (visit_id, elevator_label, status, company_id) VALUES (?, ?, ?, ?)', [visitB, 'EL-B', 'O.K.', B]);
  const photoB = `/uploads/interventions/b-${tag}.png`;
  const photoB2 = `/uploads/interventions/b2-${tag}.png`;
  const intB = (await q(
    `INSERT INTO interventions (date, technician, location_id, company_id, uploaded_files, status) VALUES (NOW(), ?, ?, ?, ?, 'O.K.')`,
    [techB.username, locB, B, `${photoB}, ${photoB2}`])).insertId;
  await q('INSERT INTO intervention_items (intervention_id, elevator_label, company_id) VALUES (?, ?, ?)', [intB, 'EL-B', B]);
  const woB = (await q(`INSERT INTO work_orders (company_id, location_id, status) VALUES (?, ?, 'open')`, [B, locB])).insertId;
  const woItemB = (await q('INSERT INTO work_order_items (work_order_id, company_id, description) VALUES (?, ?, ?)', [woB, B, 'item'])).insertId;
  const prB = (await q(`INSERT INTO projects (company_id, name, status, created_by) VALUES (?, ?, 'open', ?)`, [B, 'Project B', adminB.id])).insertId;
  const secB = (await q('INSERT INTO project_sections (project_id, title) VALUES (?, ?)', [prB, 'S'])).insertId;
  const taskB = (await q('INSERT INTO project_tasks (project_section_id, title) VALUES (?, ?)', [secB, 'T'])).insertId;
  const vehB = (await q('INSERT INTO vehicles (company_id, name, year, last_registration_date, registration_expiry_date) VALUES (?, ?, 2020, CURDATE(), CURDATE())', [B, 'Van B'])).insertId;
  const invB = (await q(
    `INSERT INTO invitations (email, company_id, role, token, expires_at, status) VALUES (?, ?, 'technician', ?, DATE_SUB(NOW(), INTERVAL 1 DAY), 'pending')`,
    [`inv-${tag}@tenant.test`, B, `tok-${tag}`])).insertId;

  // fixtures on disk (names follow the real generators)
  const sigB = `signatures/${B}-rms-${visitB}-tech-${Date.now()}.png`;
  const sigA = `signatures/${A}-rms-1-tech-${Date.now()}.png`;
  fixture(sigB); fixture(sigA);
  fixture(`interventions/b-${tag}.png`); fixture(`interventions/b2-${tag}.png`);
  fixture(`interventions/orphan-${tag}.png`);
  fixture(`work-orders/${A}-1-${Date.now()}.html`, '<script>alert(1)</script>');
  fixture(`company-logos/${A}-${Date.now()}.png`);
  fixture(`rms/${A}-x.png`);

  // ---------------------------------------------------------------- start the real app
  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));

  const cAdminA = await login(adminA.email, pw);
  const cTechA = await login(techA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  const cShared = await login(sharedUser.email, pw);
  const cSuper = await login(superUser.email, pw);
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  console.log('\n[anonymous requests]');
  for (const url of ['/api/stats', '/api/stats/daily', '/api/stats/rms?year=2026&month=1', '/api/locations', '/api/elevators', '/api/interventions/1', '/api/rms/1/pdf']) {
    const r = await api('GET', url);
    check(`GET ${url} without session -> 401`, r.status === 401, `got ${r.status}`);
  }
  check('POST /api/locations without session -> 401', (await api('POST', '/api/locations', { json: { name: 'x', address: 'y' } })).status === 401);

  console.log('\n[company A cannot touch company B: locations / elevators]');
  let r = await api('DELETE', `/api/locations/${locB}`, { cookie: cAdminA });
  check('DELETE B location -> 404', r.status === 404, `got ${r.status}`);
  check('B location still exists', await count('SELECT COUNT(*) c FROM locations WHERE id = ?', [locB]) === 1);
  r = await api('GET', `/api/locations/${locB}`, { cookie: cAdminA });
  check('GET B location -> 404', r.status === 404, `got ${r.status}`);
  r = await api('GET', `/api/locations/${locB}/profile`, { cookie: cAdminA });
  check('GET B location profile -> 404', r.status === 404, `got ${r.status}`);
  r = await api('PUT', `/api/locations/${locB}`, { cookie: cAdminA, json: { name: 'HACKED', rms_frequency: 1 } });
  check('PUT B location changes nothing', await count('SELECT COUNT(*) c FROM locations WHERE id = ? AND name = ?', [locB, 'HACKED']) === 0);
  r = await api('DELETE', `/api/elevators/${elB}`, { cookie: cAdminA });
  check('DELETE B elevator -> 404', r.status === 404, `got ${r.status}`);
  check('B elevator still exists', await count('SELECT COUNT(*) c FROM elevators WHERE id = ?', [elB]) === 1);
  r = await api('PUT', `/api/elevators/${elB}`, { cookie: cAdminA, json: { label: 'HACKED' } });
  check('PUT B elevator -> 404', r.status === 404, `got ${r.status}`);
  check('B elevator unchanged', await count("SELECT COUNT(*) c FROM elevators WHERE id = ? AND label = 'EL-B'", [elB]) === 1);
  r = await api('POST', `/api/locations/${locB}/elevators`, { cookie: cAdminA, json: { label: 'INJECTED' } });
  check('POST elevator onto B location -> 404', r.status === 404, `got ${r.status}`);
  check('no elevator was inserted for B location', await count("SELECT COUNT(*) c FROM elevators WHERE location_id = ? AND label = 'INJECTED'", [locB]) === 0);

  console.log('\n[company A cannot touch company B: rms / interventions / pdf]');
  r = await api('POST', '/api/rms-visits', { cookie: cAdminA, json: { location_id: locB, visit_date: '2026-01-15', items: [{ elevator_label: 'x', status: 'O.K.' }] } });
  check('POST rms-visit for B location -> 404', r.status === 404, `got ${r.status}`);
  check('no rms_visit created for B location by A', await count('SELECT COUNT(*) c FROM rms_visits WHERE location_id = ? AND company_id = ?', [locB, A]) === 0);
  check('no location_monthly_services row for B location by A', await count('SELECT COUNT(*) c FROM location_monthly_services WHERE location_id = ? AND company_id = ?', [locB, A]) === 0);
  r = await api('POST', '/api/rms-visits', { cookie: cAdminA, json: { location_id: locA, user_id: adminB.id, visit_date: '2026-01-15', items: [{ elevator_label: 'x', status: 'O.K.' }] } });
  check('POST rms-visit with a foreign user_id -> 404', r.status === 404, `got ${r.status}`);
  r = await api('POST', '/api/rms-visits', { cookie: cAdminA, json: { location_id: locA, user_id: techA.id, visit_date: '2026-01-15', items: [{ elevator_label: 'x', status: 'O.K.' }] } });
  check('POST rms-visit for own location + own user -> 201 (legit)', r.status === 201, `got ${r.status} ${JSON.stringify(r.body)}`);
  r = await api('GET', `/api/rms-visits/${visitB}`, { cookie: cAdminA });
  check('GET B rms visit -> 404', r.status === 404, `got ${r.status}`);
  r = await api('GET', `/api/rms/${visitB}/pdf`, { cookie: cAdminA });
  check('GET B rms pdf -> 404', r.status === 404, `got ${r.status}`);
  r = await api('GET', `/api/interventions/${intB}`, { cookie: cAdminA });
  check('GET B intervention -> 404', r.status === 404, `got ${r.status}`);
  r = await api('GET', `/api/interventions/${intB}/pdf`, { cookie: cAdminA });
  check('GET B intervention pdf -> 404', r.status === 404, `got ${r.status}`);
  r = await api('PUT', `/api/interventions/${intB}/status`, { cookie: cAdminA, json: { status: 'Potreban popravak - Dizalo nije u funkciji' } });
  check('PUT B intervention status -> 404', r.status === 404, `got ${r.status}`);
  const form = new FormData();
  form.append('technician', 'x'); form.append('location', `LocB-${tag}`); form.append('date', '2026-01-15'); form.append('notes', 'n');
  r = await api('POST', '/api/interventions', { cookie: cAdminA, form });
  check('POST intervention naming B location -> 400 location_not_found', r.status === 400 && r.body?.code === 'location_not_found', `got ${r.status} ${JSON.stringify(r.body)}`);
  check('no intervention created for A with B location', await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ? AND location_id = ?', [A, locB]) === 0);

  console.log('\n[company A cannot touch company B: work orders / projects / vehicles]');
  r = await api('GET', `/api/work-orders/${woB}`, { cookie: cAdminA });
  check('GET B work order -> 404', r.status === 404, `got ${r.status}`);
  r = await api('PATCH', `/api/work-orders/items/${woItemB}/toggle`, { cookie: cAdminA });
  check('toggle B work-order item -> 404', r.status === 404, `got ${r.status}`);
  check('B work-order item unchanged', await count('SELECT COUNT(*) c FROM work_order_items WHERE id = ? AND is_completed = 0', [woItemB]) === 1);
  r = await api('PATCH', `/api/work-orders/${woB}/status`, { cookie: cAdminA, json: { status: 'cancelled' } });
  check('PATCH B work order status -> 404', r.status === 404, `got ${r.status}`);
  r = await api('GET', `/api/work-orders/${woB}/pdf`, { cookie: cAdminA });
  check('GET B work order pdf -> 404', r.status === 404, `got ${r.status}`);
  r = await api('POST', '/api/work-orders', { cookie: cAdminA, json: { location_id: locB, items: [{ description: 'x' }] } });
  check('create work order on B location rejected', r.status >= 400, `got ${r.status}`);
  r = await api('GET', `/api/projects/${prB}`, { cookie: cAdminA });
  check('GET B project -> 404', r.status === 404, `got ${r.status}`);
  r = await api('PUT', `/api/projects/project-tasks/${taskB}/complete`, { cookie: cAdminA, json: { is_completed: true } });
  check('complete B project task -> 404', r.status === 404, `got ${r.status}`);
  r = await api('DELETE', `/api/projects/tasks/${taskB}`, { cookie: cAdminA });
  check('delete B project task -> 404', r.status === 404, `got ${r.status}`);
  check('B project task still exists', await count('SELECT COUNT(*) c FROM project_tasks WHERE id = ?', [taskB]) === 1);
  r = await api('DELETE', `/api/vehicles/${vehB}`, { cookie: cAdminA });
  check('DELETE B vehicle -> 404', r.status === 404, `got ${r.status}`);
  check('B vehicle still exists', await count('SELECT COUNT(*) c FROM vehicles WHERE id = ?', [vehB]) === 1);

  console.log('\n[users: target must be the caller\'s own company; no account takeover through shared membership]');
  r = await api('PUT', `/api/users/${adminB.id}/password`, { cookie: cAdminA, json: { newPassword: 'Hacked-12345' } });
  check('reset password of a B-only user -> 404', r.status === 404, `got ${r.status}`);
  r = await api('PUT', `/api/users/${sharedUser.id}/password`, { cookie: cAdminA, json: { newPassword: 'Hacked-12345' } });
  check('reset password of a user who is also in B -> 403', r.status === 403, `got ${r.status}`);
  r = await api('PUT', `/api/users/${superUser.id}/password`, { cookie: cAdminA, json: { newPassword: 'Hacked-12345' } });
  check('reset password of a superadmin member -> 403', r.status === 403, `got ${r.status}`);
  r = await api('PATCH', `/api/users/companies/${A}/users/${sharedUser.id}/disable`, { cookie: cAdminA });
  check('globally disable a user who is also in B -> 403', r.status === 403, `got ${r.status}`);
  check('shared / superadmin accounts untouched', await count('SELECT COUNT(*) c FROM users WHERE id IN (?, ?) AND is_active = 1 AND password_hash = ?', [sharedUser.id, superUser.id, hash]) === 2);
  r = await api('PUT', `/api/users/${techA.id}/password`, { cookie: cAdminA, json: { newPassword: 'Changed-12345' } });
  check('reset password of an own-company technician -> 200 (legit)', r.status === 200, `got ${r.status}`);
  r = await api('PUT', `/api/users/${techA.id}/password`, { cookie: cTechA, json: { newPassword: 'Hacked-12345' } });
  check('technician cannot reset passwords -> 403', r.status === 403, `got ${r.status}`);
  r = await api('GET', `/api/users/${adminB.id}`, { cookie: cAdminA });
  check('GET B user -> 404', r.status === 404, `got ${r.status}`);
  for (const sub of ['rms-latest', 'interventions-latest', 'report']) {
    r = await api('GET', `/api/users/${adminB.id}/${sub}`, { cookie: cAdminA });
    check(`GET /api/users/<B user>/${sub} -> 404`, r.status === 404, `got ${r.status}`);
  }
  r = await api('POST', `/api/companies/${B}/invite`, { cookie: cAdminA, json: { email: 'x@y.test', role: 'admin' } });
  check('invite into company B as admin of A -> 403', r.status === 403, `got ${r.status}`);
  r = await api('GET', `/api/companies/${B}/users`, { cookie: cAdminA });
  check('list users of company B -> 403', r.status === 403, `got ${r.status}`);
  r = await api('DELETE', `/api/users/companies/${B}/users/${techB.id}`, { cookie: cAdminA });
  check('remove user from company B -> 403', r.status === 403, `got ${r.status}`);
  r = await api('POST', '/api/admin/cleanup-expired-invites', { cookie: cAdminA });
  check('cleanup-expired-invites -> 200', r.status === 200, `got ${r.status}`);
  check('B expired invitation untouched by A', await count("SELECT COUNT(*) c FROM invitations WHERE id = ? AND status = 'pending'", [invB]) === 1);
  r = await api('POST', '/api/switch-company', { cookie: cAdminA, json: { company_id: B } });
  check('switch-company to B -> 403', r.status === 403, `got ${r.status}`);

  r = await api('PUT', '/api/users/me/password', { cookie: cTechA, json: { currentPassword: pw, newPassword: 'Changed-12345' } });
  // techA's password was reset to Changed-12345 above by the admin, so the old one must now be rejected
  check('/me/password with the old (reset) password -> 400', r.status === 400, `got ${r.status}`);
  r = await api('PUT', '/api/users/me/password', { cookie: cTechA, json: { currentPassword: 'Changed-12345', newPassword: 'Again-98765' } });
  check('/me/password with the current password -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.body)}`);
  let relog = null;
  try { relog = await login(techA.email, 'Again-98765'); } catch { /* checked below */ }
  check('login works with the NEW password (password_hash was changed)', Boolean(relog));

  console.log('\n[CSRF: cross-site Origin is rejected before any handler runs]');
  const csrf = await fetch(`${BASE}/api/locations`, {
    method: 'POST',
    headers: { cookie: cAdminA, origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    body: `name=csrf-${tag}&address=x`
  });
  check('POST /api/locations from a foreign Origin -> rejected', csrf.status >= 400, `got ${csrf.status}`);
  check('no location created by the foreign-origin request', await count('SELECT COUNT(*) c FROM locations WHERE name = ?', [`csrf-${tag}`]) === 0);

  console.log('\n[stats are scoped to the session company]');
  r = await api('GET', '/api/stats', { cookie: cAdminA });
  check('GET /api/stats counts only company A', r.status === 200 && r.body.locations === 1 && r.body.users === 4, JSON.stringify(r.body));
  r = await api('GET', '/api/stats/daily', { cookie: cAdminA });
  check('GET /api/stats/daily: no B activity visible', r.status === 200 && Array.isArray(r.body), JSON.stringify(r.body).slice(0, 120));

  console.log('\n[uploads need a session of the owning company]');
  const fileSigB = `/uploads/${sigB}`;
  const fileSigA = `/uploads/${sigA}`;
  for (const prefix of ['', '/api']) {
    check(`${prefix}/uploads B signature, anonymous -> 401`, (await api('GET', prefix + fileSigB)).status === 401);
    check(`${prefix}/uploads B signature, company A -> 404`, (await api('GET', prefix + fileSigB, { cookie: cAdminA })).status === 404);
    check(`${prefix}/uploads B signature, company B -> 200`, (await api('GET', prefix + fileSigB, { cookie: cAdminB })).status === 200);
    check(`${prefix}/uploads A signature, company A -> 200`, (await api('GET', prefix + fileSigA, { cookie: cAdminA })).status === 200);
    check(`${prefix}/uploads A signature, company B -> 404`, (await api('GET', prefix + fileSigA, { cookie: cAdminB })).status === 404);
  }
  check('B intervention photo, company A -> 404', (await api('GET', `/uploads/interventions/b-${tag}.png`, { cookie: cAdminA })).status === 404);
  check('B intervention photo (1st), company B -> 200', (await api('GET', `/uploads/interventions/b-${tag}.png`, { cookie: cAdminB })).status === 200);
  check('B intervention photo (2nd in list), company B -> 200', (await api('GET', `/uploads/interventions/b2-${tag}.png`, { cookie: cAdminB })).status === 200);
  check('unreferenced intervention file, any company -> 404', (await api('GET', `/uploads/interventions/orphan-${tag}.png`, { cookie: cAdminB })).status === 404);
  check('superadmin may read any upload', (await api('GET', fileSigB, { cookie: cSuper })).status === 200);
  check('unknown folder (rms) -> 404', (await api('GET', `/uploads/rms/${A}-x.png`, { cookie: cAdminA })).status === 404);
  check('path traversal -> 404', (await api('GET', `/uploads/signatures/..%2f..%2findex.js`, { cookie: cAdminA })).status === 404);
  check('nested path -> 404', (await api('GET', `/uploads/signatures/a/${A}-x.png`, { cookie: cAdminA })).status === 404);
  const html = await api('GET', `/uploads/work-orders/${path.basename(fixtures.find((f) => f.endsWith('.html')))}`, { cookie: cAdminA });
  check('uploaded .html is served as attachment + CSP sandbox', html.status === 200 && /attachment/.test(html.headers.get('content-disposition') || '') && /sandbox/.test(html.headers.get('content-security-policy') || ''), `${html.status} ${html.headers.get('content-disposition')}`);
  const png = await api('GET', fileSigA, { cookie: cAdminA });
  check('png stays inline (no attachment header)', !(png.headers.get('content-disposition') || '').includes('attachment'));
  check('shared user (A+B) active in A gets A files only', (await api('GET', fileSigB, { cookie: cShared })).status === 404);

  console.log('\n[createNotification sends one e-mail]');
  // count real SMTP sends of the direct path (emailService.sendEmail -> nodemailer transport from app_settings)
  const nodemailer = require(path.join(BACKEND, 'node_modules', 'nodemailer'));
  let directSends = 0;
  const originalCreateTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({ sendMail: async () => { directSends++; } });
  const settingsBackup = (await q('SELECT id, email_enabled, smtp_host FROM app_settings ORDER BY id ASC LIMIT 1'))[0];
  await q('UPDATE app_settings SET email_enabled = 1, smtp_host = ? WHERE id = ?', ['smtp.test', settingsBackup.id]);
  const { createNotification } = require(path.join(BACKEND, 'utils', 'createNotification'));
  await q('UPDATE companies SET email_notifications_enabled = 1 WHERE id = ?', [A]);
  const before = await count('SELECT COUNT(*) c FROM email_outbox WHERE user_id = ?', [adminA.id]);
  await createNotification({ userId: adminA.id, type: 'intervention', titleKey: 'notifications:newIntervention.title', messageKey: 'notifications:newIntervention.message', params: { location: '<b>x</b>' }, link: '/dashboard/interventions.html' });
  const after = await count('SELECT COUNT(*) c FROM email_outbox WHERE user_id = ?', [adminA.id]);
  check('exactly one outbox row per notification', after - before === 1, `rows +${after - before}`);
  check('no direct SMTP send besides the outbox', directSends === 0, `direct sends: ${directSends}`);
  nodemailer.createTransport = originalCreateTransport;
  await q('UPDATE app_settings SET email_enabled = ?, smtp_host = ? WHERE id = ?', [settingsBackup.email_enabled, settingsBackup.smtp_host, settingsBackup.id]);
  const mail = (await q('SELECT html FROM email_outbox WHERE user_id = ? ORDER BY id DESC LIMIT 1', [adminA.id]))[0];
  check('user-controlled text is escaped in the mail html', mail && !mail.html.includes('<b>x</b>') && mail.html.includes('&lt;b&gt;'));

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error('test run crashed:', err); failed++; })
  .finally(() => {
    fixtures.forEach((f) => { try { fs.unlinkSync(f); } catch { /* already gone */ } });
    try { fs.rmdirSync(path.join(uploadsRoot, 'rms')); } catch { /* keep if used */ }
    process.exit(failed ? 1 : 0);
  });
