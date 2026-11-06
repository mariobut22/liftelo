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
