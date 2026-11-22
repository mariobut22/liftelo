#!/usr/bin/env node
/*
 * Share link ("building manager" read-only page) test against a THROWAWAY MySQL/MariaDB.
 * Same setup/refusal rules as rms-overview-test.js (database "tt" / "*_test" on localhost, FRESH database, all migrations applied).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3541 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/share-link-test.js
 *
 * Proves: admin-only management (+ tenant isolation), token = 256 bit random and only its SHA-256 hash is stored, audit rows
 * without the token, public page content + headers, tenant/location binding (cross-tenant, other location of the same company),
 * allow-list of fields (denylist assertion on keys AND seeded secret values), identical 404 for unknown/malformed/injection/
 * revoked/expired/deleted-location tokens, immediate revocation, regenerate kills the old token, rows are never deleted,
 * and the per-IP rate limit.
 */
'use strict';

const crypto = require('crypto');
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

process.chdir(os.tmpdir());
const PORT = Number(process.env.TENANT_TEST_PORT || 3542);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'share-link-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
async function api(method, url, { cookie, json, raw } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  } catch {
    return { status: 0, body: 'no response (timeout)', headers: new Headers(), text: '' };
  }
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  void raw;
  return { status: res.status, body: parsed, headers: res.headers, text };
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

// every key (at any depth) of the public JSON must NOT match this
const DENY_KEY = /email|phone|price|cost|amount|company_id|location_id|(^|_)id$|notes?|comment|password|token|hash|signature|upravitelj|contact|kljuc|username|full_name|user_id|path|file/i;
const keysOf = (value, out = []) => {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { out.push(k); keysOf(v, out); });
  return out;
};

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Share A');
  const B = await mkCompany('Share B');
  const mkUser = async (label, companyId, role, fullName, phone) => {
    const email = `${label}-${tag}@share.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, fullName || label, companyId, email]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    void phone;
    return { id: r.insertId, email, username: `${label}-${tag}` };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const techA = await mkUser('techA', A, 'technician', 'Ivan Kovacevic-Secret');
  const adminB = await mkUser('adminB', B, 'admin');
  const mkLocation = async (companyId, name, extra = {}) => (await q(
    `INSERT INTO locations (name, address, company_id, notes, contact_person, contact_phone, upravitelj, kljuc_strojarnice, rms_frequency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, `${name} street 1`, companyId, extra.notes || null, extra.contact || null, extra.phone || null, extra.manager || null, extra.key || null, extra.freq || 1])).insertId;
  const SECRET_LOC_NOTES = `SECRETLOCNOTES-${tag}`;
  const SECRET_PHONE = '+385 99 7654321';
  const locA = await mkLocation(A, `ShareLocA-${tag}`, { notes: SECRET_LOC_NOTES, contact: 'SECRETCONTACT', phone: SECRET_PHONE, manager: 'SECRETMANAGER', key: 'SECRETKEY', freq: 2 });
  const locA2 = await mkLocation(A, `ShareLocA2-${tag}`);
  const locB = await mkLocation(B, `ShareLocB-${tag}`);
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }
  const OK = 'O.K.';
  const REPAIR = 'Potreban popravak - Dizalo u funkciji';
  const OUT = 'Potreban popravak - Dizalo nije u funkciji';
  for (const [company, loc, labels] of [[A, locA, ['EL-1', 'EL-2']], [A, locA2, ['OTHER-1']], [B, locB, ['B-1']]]) {
    for (const label of labels) await q('INSERT INTO elevators (location_id, label, company_id) VALUES (?, ?, ?)', [loc, label, company]);
  }
  const SECRET_COMMENT = `SECRETCOMMENT-${tag}`;
  const SECRET_NOTES = `SECRETNOTES-${tag}`;
  const mkVisit = async (company, loc, date, userId, items) => {
    const id = (await q('INSERT INTO rms_visits (location_id, user_id, visit_date, notes_general, company_id) VALUES (?, ?, ?, ?, ?)', [loc, userId, date, SECRET_NOTES, company])).insertId;
    for (const [label, status] of items) await q('INSERT INTO rms_visit_items (visit_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [id, label, status, SECRET_COMMENT, company]);
    return id;
  };
  await mkVisit(A, locA, '2026-09-10 09:00:00', techA.id, [['EL-1', OK], ['EL-2', OK]]);
  await mkVisit(A, locA, '2026-11-12 09:00:00', techA.id, [['EL-1', REPAIR], ['EL-2', OK]]);
  await mkVisit(A, locA2, '2026-11-13 09:00:00', techA.id, [['OTHER-1', OK]]);
  await mkVisit(B, locB, '2026-11-14 09:00:00', adminB.id, [['B-1', OUT]]);
  const SECRET_INT = `SECRETINTERVENTION-${tag}`;
  const mkIntervention = async (company, loc, technician, label) => {
    const id = (await q('INSERT INTO interventions (technician, location_id, date, notes, status, company_id) VALUES (?, ?, ?, ?, ?, ?)', [technician, loc, '2026-10-20', SECRET_INT, REPAIR, company])).insertId;
    await q('INSERT INTO intervention_items (intervention_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [id, label, REPAIR, SECRET_COMMENT, company]);
    return id;
  };
  await mkIntervention(A, locA, 'Marko Horvat-Secret', 'EL-1');
  await mkIntervention(A, locA2, 'OtherLocTech', 'OTHER-1');
  await mkIntervention(B, locB, 'BTech', 'B-1');
  const SECRET_FAULT = `SECRETFAULT-${tag}`;
  const mkFinding = async (company, loc, label, severity, resolved) => {
    const id = (await q('INSERT INTO findings (company_id, location_id, location_name, elevator_label, source_type, description, severity) VALUES (?, ?, ?, ?, ?, ?, ?)', [company, loc, 'x', label, 'manual', SECRET_FAULT, severity])).insertId;
    if (resolved) await q("INSERT INTO finding_events (finding_id, company_id, event_type, state) VALUES (?, ?, 'state_change', 'resolved')", [id, company]);
    return id;
  };
  await mkFinding(A, locA, 'EL-1', 'out_of_service', false);
  await mkFinding(A, locA, 'EL-2', 'recommendation', true); // resolved: must NOT be listed
  await mkFinding(A, locA2, 'OTHER-1', 'in_service', false);
  await mkFinding(B, locB, 'B-1', 'in_service', false);

  require(path.join(BACKEND, 'index.js'));
  const { _limiters } = require(path.join(BACKEND, 'routes', 'public-share.js'));
  await new Promise((r) => setTimeout(r, 1500));
  const cAdminA = await login(adminA.email, pw);
  const cTechA = await login(techA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  const resetLimits = () => { _limiters.requestLimiter.reset(); _limiters.failureLimiter.reset(); };
  const linkUrl = (loc) => `/api/locations/${loc}/share-link`;
  const pub = (token) => api('GET', `/api/public/share/${encodeURIComponent(token)}`);

  console.log('\n[management: admin only, tenant isolation]');
  check('anonymous GET -> 401', (await api('GET', linkUrl(locA))).status === 401);
  check('anonymous POST -> 401', (await api('POST', linkUrl(locA), { json: {} })).status === 401);
  check('technician GET -> 403', (await api('GET', linkUrl(locA), { cookie: cTechA })).status === 403);
  check('technician POST -> 403', (await api('POST', linkUrl(locA), { cookie: cTechA, json: {} })).status === 403);
  check('technician DELETE -> 403', (await api('DELETE', linkUrl(locA), { cookie: cTechA })).status === 403);
  check('admin of company B on A location: POST -> 404', (await api('POST', linkUrl(locA), { cookie: cAdminB, json: {} })).status === 404);
  check('admin of company B on A location: GET -> 404', (await api('GET', linkUrl(locA), { cookie: cAdminB })).status === 404);
  check('admin of company B on A location: DELETE -> 404', (await api('DELETE', linkUrl(locA), { cookie: cAdminB })).status === 404);
  check('no row was created by the failed attempts', await count('SELECT COUNT(*) c FROM location_share_links WHERE company_id IN (?, ?)', [A, B]) === 0);
  const off = await api('GET', linkUrl(locA), { cookie: cAdminA });
  check('default OFF: enabled=false', off.status === 200 && off.body.enabled === false && off.body.link === null, JSON.stringify(off.body));
  check('invalid expiry (past) -> 400 invalid_expiry', (await api('POST', linkUrl(locA), { cookie: cAdminA, json: { expires_at: '2020-01-01' } })).body?.code === 'invalid_expiry');
  check('invalid expiry (garbage) -> 400', (await api('POST', linkUrl(locA), { cookie: cAdminA, json: { expires_at: "2030-01-01'; DROP TABLE users;--" } })).status === 400);
  check('invalid expiry (5 years) -> 400', (await api('POST', linkUrl(locA), { cookie: cAdminA, json: { expires_at: '2032-01-01' } })).status === 400);
  check('invalid expiry (2030-02-31) -> 400', (await api('POST', linkUrl(locA), { cookie: cAdminA, json: { expires_at: '2027-02-31' } })).status === 400);

  console.log('\n[create: random token, only the hash is stored, audit without token]');
  const created = await api('POST', linkUrl(locA), { cookie: cAdminA, json: {} });
  check('POST -> 201 with token + path', created.status === 201 && typeof created.body.token === 'string' && created.body.path === `/s/${created.body.token}`, JSON.stringify(created.body));
  const tokenA = created.body.token;
  check('token is 43 url-safe chars (256 bit)', /^[A-Za-z0-9_-]{43}$/.test(tokenA) && Buffer.from(tokenA, 'base64url').length === 32);
  const row = (await q('SELECT * FROM location_share_links WHERE company_id = ? AND location_id = ?', [A, locA]))[0];
  check('row bound to company A + location A, created_by = admin', row && row.company_id === A && row.location_id === locA && row.created_by === adminA.id);
  check('stored value is the SHA-256 hash, not the token', row.token_hash === crypto.createHash('sha256').update(tokenA).digest('hex') && row.token_hash !== tokenA);
  check('token appears in no column of the row', !JSON.stringify(row).includes(tokenA));
  const auditRows = await q("SELECT metadata FROM audit_logs WHERE company_id = ? AND action = 'location_share_link_created'", [A]);
  check('audit row written, without the token', auditRows.length === 1 && !JSON.stringify(auditRows[0]).includes(tokenA));
  const status = await api('GET', linkUrl(locA), { cookie: cAdminA });
  check('GET state: enabled, no token in response', status.body.enabled === true && !JSON.stringify(status.body).includes(tokenA) && !('token' in status.body.link), JSON.stringify(status.body));
  check('GET response is no-store', /no-store/.test(status.headers.get('cache-control') || ''));

  console.log('\n[public page: headers + content]');
  const r = await pub(tokenA);
  check('200 without any session', r.status === 200, JSON.stringify(r.body).slice(0, 200));
  check('Cache-Control: no-store', /no-store/.test(r.headers.get('cache-control') || ''));
  check('X-Robots-Tag: noindex', /noindex/.test(r.headers.get('x-robots-tag') || ''));
  check('Referrer-Policy: no-referrer', r.headers.get('referrer-policy') === 'no-referrer');
  check('no cookie is set for the visitor', !r.headers.get('set-cookie'));
  const d = r.body;
  check('location name + address only', d.location?.name === `ShareLocA-${tag}` && d.location?.address === `ShareLocA-${tag} street 1` && Object.keys(d.location).sort().join() === 'address,name', JSON.stringify(d.location));
  check('company name shown (service company)', d.company?.name === `Share A ${tag}`);
  const el1 = d.elevators.find((e) => e.label === 'EL-1');
  const el2 = d.elevators.find((e) => e.label === 'EL-2');
  check('2 elevators of THIS location only', d.elevators.length === 2 && el1 && el2);
  check('EL-1 last RMS 2026-11-12, next month 2027-01 (every 2nd month), 1 open fault', el1?.last_rms_date === '2026-11-12' && el1?.next_rms_month === '2027-01' && el1?.open_faults === 1, JSON.stringify(el1));
  check('EL-2 resolved fault not counted', el2?.open_faults === 0, JSON.stringify(el2));
  check('2 RMS visits, newest first, technician = FIRST name only', d.rms_visits.length === 2 && d.rms_visits[0].date === '2026-11-12' && d.rms_visits[0].technician === 'Ivan', JSON.stringify(d.rms_visits));
  check('RMS outcome + per-elevator status codes', d.rms_visits[0].outcome === 'repair_in_service' && d.rms_visits[1].outcome === 'ok' && d.rms_visits[0].items.length === 2);
  check('1 intervention, technician first name only', d.interventions.length === 1 && d.interventions[0].technician === 'Marko' && d.interventions[0].date === '2026-10-20' && d.interventions[0].outcome === 'repair_in_service', JSON.stringify(d.interventions));
  check('only the OPEN fault (resolved + other location excluded), no description', d.open_faults.length === 1 && d.open_faults[0].elevator === 'EL-1' && d.open_faults[0].severity === 'out_of_service' && Object.keys(d.open_faults[0]).sort().join() === 'date,elevator,severity', JSON.stringify(d.open_faults));
  check('pdf_available is false (PDFs are not served through share links)', d.pdf_available === false);
  const textAll = r.text;
  const denyKeys = keysOf(d).filter((k) => DENY_KEY.test(k));
  check('denylist: no key like email/phone/price/company_id/notes/comment/id/token/...', denyKeys.length === 0, denyKeys.join(','));
  for (const secret of [SECRET_LOC_NOTES, SECRET_PHONE, 'SECRETCONTACT', 'SECRETMANAGER', 'SECRETKEY', SECRET_COMMENT, SECRET_NOTES, SECRET_INT, SECRET_FAULT, 'Kovacevic', 'Horvat', '@share.test', `OTHER-1`, `OtherLocTech`, `ShareLocA2`, `ShareLocB`, 'B-1', `Share B`]) {
    check(`response does not contain "${secret.slice(0, 24)}"`, !textAll.includes(secret));
  }
  check('response does not contain the token or its hash', !textAll.includes(tokenA) && !textAll.includes(row.token_hash));
  check('response does not contain the numeric company/location ids as fields', !/"(company_id|location_id|id)"/.test(textAll));

  console.log('\n[binding: client cannot choose company/location]');
  const withParams = await api('GET', `/api/public/share/${tokenA}?company_id=${B}&location_id=${locB}&id=${locB}`);
  check('query params are ignored, still location A', withParams.status === 200 && withParams.body.location.name === `ShareLocA-${tag}` && !withParams.text.includes('ShareLocB'));
  const hdr = await fetch(`${BASE}/api/public/share/${tokenA}`, { headers: { 'x-company-id': String(B), cookie: cAdminB } }).then((x) => x.json());
  check('headers/foreign session cookie are ignored (still location A of company A)', hdr.location.name === `ShareLocA-${tag}`);
  const createdB = await api('POST', linkUrl(locB), { cookie: cAdminB, json: {} });
  const tokenB = createdB.body.token;
  const rB = await pub(tokenB);
  check('company B link shows B data only', rB.status === 200 && rB.body.location.name === `ShareLocB-${tag}` && rB.body.elevators.length === 1 && rB.body.elevators[0].label === 'B-1' && !rB.text.includes('ShareLocA') && !rB.text.includes('EL-1'));
  check('B technician first name = admin B label', rB.body.rms_visits[0].technician === 'adminB');
  const locA2Create = await api('POST', linkUrl(locA2), { cookie: cAdminA, json: {} });
  const rA2 = await pub(locA2Create.body.token);
  check('second location of company A: own link shows only that location', rA2.status === 200 && rA2.body.location.name === `ShareLocA2-${tag}` && !rA2.text.includes('EL-1') && rA2.body.elevators.length === 1);
  check('creating a link for A2 did not touch the link of A', (await pub(tokenA)).status === 200);

  console.log('\n[unknown / malformed / injection tokens -> identical 404, nothing breaks]');
  resetLimits();
  const unknown = await pub(crypto.randomBytes(32).toString('base64url'));
  check('unknown well-formed token -> 404 share_not_found', unknown.status === 404 && unknown.body.code === 'share_not_found', JSON.stringify(unknown.body));
  const evil = ["' OR '1'='1", "x' UNION SELECT 1,2--", '../../etc/passwd', '%00', 'A'.repeat(43) + "'", '<script>alert(1)</script>', 'A'.repeat(2000), '', tokenA.slice(0, 42), tokenA + 'A', tokenA.replace(/.$/, tokenA.endsWith('A') ? 'B' : 'A')];
  let identical = true;
  for (const t of evil) {
    const e = await pub(t);
    if (!(e.status === 404 && e.text === unknown.text)) { identical = false; console.log('   differs:', JSON.stringify(t).slice(0, 40), e.status, e.text.slice(0, 80)); }
  }
  check('all malformed/injection tokens give the byte-identical 404 body', identical);
  const rawEvil = await fetch(`${BASE}/api/public/share/%27%20OR%201=1--`).then((x) => x.status);
  check('raw url-encoded injection -> 404', rawEvil === 404);
  check('tables intact after injection attempts', await count('SELECT COUNT(*) c FROM users WHERE company_id = ?', [A]) >= 2 && await count('SELECT COUNT(*) c FROM location_share_links', []) >= 3);
  check('another method (POST) on the public route is not served', (await api('POST', `/api/public/share/${tokenA}`, { json: {} })).status === 404);

  console.log('\n[revocation works immediately; rows are never deleted]');
  const rowsBefore = await count('SELECT COUNT(*) c FROM location_share_links WHERE company_id = ?', [A]);
  const del = await api('DELETE', linkUrl(locA), { cookie: cAdminA });
  check('DELETE -> revoked 1', del.status === 200 && del.body.revoked === 1, JSON.stringify(del.body));
  const afterRevoke = await pub(tokenA);
  check('revoked token -> same 404 body as unknown', afterRevoke.status === 404 && afterRevoke.text === unknown.text);
  check('row still there, revoked_at set (no delete)', await count('SELECT COUNT(*) c FROM location_share_links WHERE company_id = ?', [A]) === rowsBefore
    && (await q('SELECT revoked_at FROM location_share_links WHERE id = ?', [row.id]))[0].revoked_at !== null);
  check('GET state after revoke: disabled', (await api('GET', linkUrl(locA), { cookie: cAdminA })).body.enabled === false);
  check('revoking again is a harmless no-op', (await api('DELETE', linkUrl(locA), { cookie: cAdminA })).body.revoked === 0);
  check('revoke audited', await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'location_share_link_revoked'", [A]) === 1);
  check('company A revoke did not touch the link of company B', (await pub(tokenB)).status === 200);

  console.log('\n[regenerate: old token dies, new one works]');
  const g1 = (await api('POST', linkUrl(locA), { cookie: cAdminA, json: {} })).body.token;
  const g2 = (await api('POST', linkUrl(locA), { cookie: cAdminA, json: {} })).body.token;
  check('tokens differ', g1 !== g2);
  check('old token -> 404 right away', (await pub(g1)).status === 404);
  check('new token -> 200', (await pub(g2)).status === 200);
  check('only ONE active link per location', await count('SELECT COUNT(*) c FROM location_share_links WHERE company_id = ? AND location_id = ? AND revoked_at IS NULL', [A, locA]) === 1);

  console.log('\n[expiry]');
  const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const withExp = await api('POST', linkUrl(locA), { cookie: cAdminA, json: { expires_at: future } });
  check('POST with future expiry -> 201, expires_at end of day', withExp.status === 201 && withExp.body.expires_at === `${future} 23:59:59`, JSON.stringify(withExp.body));
  check('not yet expired -> 200', (await pub(withExp.body.token)).status === 200);
  await q('UPDATE location_share_links SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?', [withExp.body.id]);
  const expired = await pub(withExp.body.token);
  check('expired token -> same 404 body as unknown', expired.status === 404 && expired.text === unknown.text);
  const st = await api('GET', linkUrl(locA), { cookie: cAdminA });
  check('admin sees the link as expired (enabled=false, expired=true)', st.body.enabled === false && st.body.link?.expired === true, JSON.stringify(st.body));

  console.log('\n[deleted location -> 404]');
  const tmpLoc = await mkLocation(A, `ShareTmp-${tag}`);
  const tmpTok = (await api('POST', linkUrl(tmpLoc), { cookie: cAdminA, json: {} })).body.token;
  check('before delete 200', (await pub(tmpTok)).status === 200);
  await q('DELETE FROM locations WHERE id = ? AND company_id = ?', [tmpLoc, A]);
  check('location deleted -> 404', (await pub(tmpTok)).status === 404);

  console.log('\n[rate limit: failed lookups per IP]');
  resetLimits();
  const validNow = (await api('POST', linkUrl(locA), { cookie: cAdminA, json: {} })).body.token;
  let lastStatus = 0;
  let firstLimited = 0;
  for (let i = 1; i <= 25; i++) {
    lastStatus = (await pub(crypto.randomBytes(32).toString('base64url'))).status;
    if (lastStatus === 429 && !firstLimited) firstLimited = i;
  }
  check('after 20 failed lookups the IP gets 429 (21st request)', firstLimited === 21 && lastStatus === 429, `first 429 at ${firstLimited}`);
  const limitedBody = await pub(crypto.randomBytes(32).toString('base64url'));
  check('429 body has code rate_limited and still the privacy headers', limitedBody.body?.code === 'rate_limited' && /no-store/.test(limitedBody.headers.get('cache-control') || ''));
  check('a VALID token from the blocked IP is also refused (429)', (await pub(validNow)).status === 429);
  resetLimits();
  check('after the window (reset) a valid token works again', (await pub(validNow)).status === 200);
  for (let i = 0; i < 121; i++) lastStatus = (await pub(validNow)).status;
  check('general limit: > 120 requests / minute / IP -> 429', lastStatus === 429, `last ${lastStatus}`);
  resetLimits();

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
