#!/usr/bin/env node
/*
 * Idempotent create test for offline-tolerant entry (client_request_id), against a THROWAWAY MySQL/MariaDB.
 * Same setup/refusal rules as tenant-isolation-test.js (database name "tt" / "*_test" on localhost, all migrations applied,
 * incl. 20261111_offline_client_request_id.sql).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3441 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/offline-idempotency-test.js
 *
 * Proves: the same (company, client_request_id) twice -> ONE row (also under concurrency); a retry returns the stored id
 * with 200 + duplicate:true; company B re-using A's id gets its OWN row and cannot read A's; ids without/invalid -> old behaviour;
 * signing twice answers report_already_signed (the outbox treats that as "already done"); duplicate photo retries return the stored photo.
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

process.chdir(os.tmpdir());
const PORT = Number(process.env.TENANT_TEST_PORT || 3442);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'offline-idempotency-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
    res = await fetch(BASE + url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  } catch {
    return { status: 0, body: 'no response (timeout)' };
  }
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

// 1x1 PNG (valid magic bytes + IHDR)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Idem A');
  const B = await mkCompany('Idem B');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@idem.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
      [`${label}-${tag}`, hash, hash, role, label, companyId, email]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email, username: `${label}-${tag}` };
  };
  const techA = await mkUser('techA', A, 'technician');
  const techB = await mkUser('techB', B, 'technician');
  const mkLocation = async (companyId, name) => (await q(
    'INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [name, `${name} street 1`, companyId])).insertId;
  const locA = await mkLocation(A, `IdemLocA-${tag}`);
  const locB = await mkLocation(B, `IdemLocB-${tag}`);
  await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [locA, A, 'EL-A-1']);
  await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [locB, B, 'EL-B-1']);
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));
  const cTechA = await login(techA.email, pw);
  const cTechB = await login(techB.email, pw);
  const uuid = () => require('crypto').randomUUID();

  console.log('\n[offline read cache: GET /api/locations/all-elevators]');
  const allA = await api('GET', '/api/locations/all-elevators', { cookie: cTechA });
  const allB = await api('GET', '/api/locations/all-elevators', { cookie: cTechB });
  check('A gets its elevators only', allA.status === 200 && allA.body.length === 1 && allA.body[0].label === 'EL-A-1' && allA.body[0].location_id === locA, JSON.stringify(allA.body));
  check('B gets its elevators only', allB.status === 200 && allB.body.length === 1 && allB.body[0].label === 'EL-B-1', JSON.stringify(allB.body));
  check('anonymous -> 401', (await api('GET', '/api/locations/all-elevators')).status === 401);

  console.log('\n[RMS visit: same client_request_id -> one row]');
  const rid = uuid();
  const rmsBody = (loc, id) => ({ location_id: loc, visit_date: '2026-11-06', client_request_id: id, items: [{ elevator_label: 'EL-1', status: 'O.K.' }] });
  let r1 = await api('POST', '/api/rms-visits', { cookie: cTechA, json: rmsBody(locA, rid) });
  check('first POST -> 201 with id', r1.status === 201 && r1.body?.id > 0, JSON.stringify(r1));
  let r2 = await api('POST', '/api/rms-visits', { cookie: cTechA, json: rmsBody(locA, rid) });
  check('retry -> 200 duplicate with the SAME id', r2.status === 200 && r2.body?.id === r1.body?.id && r2.body?.duplicate === true, JSON.stringify(r2));
  check('exactly one rms_visits row', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ? AND client_request_id = ?', [A, rid]) === 1);
  check('exactly one set of items (retry did not add items)', await count('SELECT COUNT(*) c FROM rms_visit_items WHERE visit_id = ? AND company_id = ?', [r1.body.id, A]) === 1);
  check('visit belongs to the logged-in technician (user_id defaulted)', await count('SELECT COUNT(*) c FROM rms_visits WHERE id = ? AND company_id = ? AND user_id = ?', [r1.body.id, A, techA.id]) === 1);

  console.log('\n[RMS visit: concurrent retries -> still one row]');
  const rid2 = uuid();
  const burst = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/api/rms-visits', { cookie: cTechA, json: rmsBody(locA, rid2) })));
  const ids = new Set(burst.map((r) => r.body?.id));
  check('6 parallel POSTs: all succeeded', burst.every((r) => r.status === 200 || r.status === 201), JSON.stringify(burst.map((r) => r.status)));
  check('6 parallel POSTs: all returned the same id', ids.size === 1, JSON.stringify([...ids]));
  check('6 parallel POSTs: one row', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ? AND client_request_id = ?', [A, rid2]) === 1);

  console.log('\n[RMS visit: tenant isolation of the id]');
  const rB = await api('POST', '/api/rms-visits', { cookie: cTechB, json: rmsBody(locB, rid) });
  check('company B using A\'s id -> 201, its OWN new row', rB.status === 201 && rB.body?.id && rB.body.id !== r1.body.id, JSON.stringify(rB));
  check('B row has company B', await count('SELECT COUNT(*) c FROM rms_visits WHERE id = ? AND company_id = ?', [rB.body.id, B]) === 1);
  check('A row untouched (still 1 row for A)', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ? AND client_request_id = ?', [A, rid]) === 1);
  let g = await api('GET', `/api/rms-visits/${r1.body.id}`, { cookie: cTechB });
  check('B cannot read A\'s visit -> 404', g.status === 404, `got ${g.status}`);
  const rBlocA = await api('POST', '/api/rms-visits', { cookie: cTechB, json: rmsBody(locA, uuid()) });
  check('B cannot create a visit on A\'s location -> 404', rBlocA.status === 404, `got ${rBlocA.status}`);
  const rBlocAdup = await api('POST', '/api/rms-visits', { cookie: cTechB, json: rmsBody(locA, rid) });
  check('B posting A\'s id on A\'s location never returns A\'s record -> 404', rBlocAdup.status === 404 && rBlocAdup.body?.id !== r1.body.id, JSON.stringify(rBlocAdup));

  console.log('\n[RMS visit: old clients / bad ids keep working]');
  const n1 = await api('POST', '/api/rms-visits', { cookie: cTechA, json: { ...rmsBody(locA, undefined), client_request_id: undefined } });
  const n2 = await api('POST', '/api/rms-visits', { cookie: cTechA, json: { ...rmsBody(locA, undefined), client_request_id: undefined } });
  check('without id: two POSTs -> two different rows', n1.status === 201 && n2.status === 201 && n1.body.id !== n2.body.id);
  const bad1 = await api('POST', '/api/rms-visits', { cookie: cTechA, json: rmsBody(locA, 'x') });
  const bad2 = await api('POST', '/api/rms-visits', { cookie: cTechA, json: rmsBody(locA, 'x') });
  check('invalid id (too short) is ignored: two rows', bad1.status === 201 && bad2.status === 201 && bad1.body.id !== bad2.body.id);
  check('invalid id was not stored', await count("SELECT COUNT(*) c FROM rms_visits WHERE company_id = ? AND client_request_id = 'x'", [A]) === 0);

  console.log('\n[signing is retry-safe]');
  const signForm = () => {
    const f = new FormData();
    f.append('technician_signature', new Blob([PNG], { type: 'image/png' }), 'technician.png');
    f.append('client_signature', new Blob([PNG], { type: 'image/png' }), 'client.png');
    f.append('client_signer_name', 'Ivo Ivic');
    f.append('client_signer_role', 'Building manager');
    return f;
  };
  const s1 = await api('POST', `/api/reports/rms/${r1.body.id}/sign`, { cookie: cTechA, form: signForm() });
  check('technician signs own RMS -> 200', s1.status === 200, JSON.stringify(s1));
  const s2 = await api('POST', `/api/reports/rms/${r1.body.id}/sign`, { cookie: cTechA, form: signForm() });
  check('signing again -> 403 report_already_signed (outbox treats as done)', s2.status === 403 && s2.body?.code === 'report_already_signed', JSON.stringify(s2));

  console.log('\n[intervention: same client_request_id -> one row]');
  const iid = uuid();
  const intForm = (locationName, id) => {
    const f = new FormData();
    f.append('technician', techA.username);
    f.append('location', locationName);
    f.append('date', '2026-11-06');
    f.append('notes', 'offline test');
    f.append('status', 'O.K.');
    f.append('elevator_items', JSON.stringify([{ elevator_label: 'EL-1', status: 'O.K.', comment: '' }]));
    if (id) f.append('client_request_id', id);
    return f;
  };
  const i1 = await api('POST', '/api/interventions', { cookie: cTechA, form: intForm(`IdemLocA-${tag}`, iid) });
  check('first POST -> 200 with id', i1.status === 200 && i1.body?.id > 0, JSON.stringify(i1));
  const i2 = await api('POST', '/api/interventions', { cookie: cTechA, form: intForm(`IdemLocA-${tag}`, iid) });
  check('retry -> 200 duplicate, SAME id', i2.status === 200 && i2.body?.id === i1.body?.id && i2.body?.duplicate === true, JSON.stringify(i2));
  check('exactly one interventions row', await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ? AND client_request_id = ?', [A, iid]) === 1);
  check('exactly one intervention_items row', await count('SELECT COUNT(*) c FROM intervention_items WHERE intervention_id = ? AND company_id = ?', [i1.body.id, A]) === 1);
  const iburst = await Promise.all(Array.from({ length: 4 }, () => api('POST', '/api/interventions', { cookie: cTechA, form: intForm(`IdemLocA-${tag}`, uuid().slice(0, 36)) })));
  check('different ids create different rows', new Set(iburst.map((r) => r.body?.id)).size === 4, JSON.stringify(iburst.map((r) => r.status)));
  const sameBurstId = uuid();
  const iburst2 = await Promise.all(Array.from({ length: 4 }, () => api('POST', '/api/interventions', { cookie: cTechA, form: intForm(`IdemLocA-${tag}`, sameBurstId) })));
  check('4 parallel POSTs with one id: all 200 and same id', iburst2.every((r) => r.status === 200) && new Set(iburst2.map((r) => r.body?.id)).size === 1, JSON.stringify(iburst2));
  check('4 parallel POSTs with one id: one row', await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ? AND client_request_id = ?', [A, sameBurstId]) === 1);

  console.log('\n[intervention: tenant isolation of the id]');
  const iBform = new FormData();
  iBform.append('technician', techB.username);
  iBform.append('location', `IdemLocB-${tag}`);
  iBform.append('date', '2026-11-06');
  iBform.append('client_request_id', iid);
  const iB = await api('POST', '/api/interventions', { cookie: cTechB, form: iBform });
  check('company B using A\'s id -> its OWN new row', iB.status === 200 && iB.body?.id && iB.body.id !== i1.body.id && !iB.body.duplicate, JSON.stringify(iB));
  check('B row has company B', await count('SELECT COUNT(*) c FROM interventions WHERE id = ? AND company_id = ?', [iB.body.id, B]) === 1);
  const gi = await api('GET', `/api/interventions/${i1.body.id}`, { cookie: cTechB });
  check('B cannot read A\'s intervention -> 404', gi.status === 404, `got ${gi.status}`);
  const iBonA = await api('POST', '/api/interventions', { cookie: cTechB, form: intForm(`IdemLocA-${tag}`, iid) });
  check('B posting A\'s location + the shared id only ever gets B\'s OWN record, never A\'s', iBonA.body?.id === iB.body.id && iBonA.body?.id !== i1.body.id, JSON.stringify(iBonA));
  const iBonA2 = await api('POST', '/api/interventions', { cookie: cTechB, form: intForm(`IdemLocA-${tag}`, uuid()) });
  check('B on A\'s location with a fresh id -> 400 location_not_found', iBonA2.status === 400 && iBonA2.body?.code === 'location_not_found', JSON.stringify(iBonA2));

  console.log('\n[intervention: photo + sign retries]');
  const photoForm = (id) => {
    const f = new FormData();
    f.append('photo', new Blob([PNG], { type: 'image/png' }), 'photo.png');
    f.append('client_request_id', id);
    return f;
  };
  const pid = uuid();
  const p1 = await api('POST', `/api/interventions/${i1.body.id}/photos`, { cookie: cTechA, form: photoForm(pid) });
  const p2 = await api('POST', `/api/interventions/${i1.body.id}/photos`, { cookie: cTechA, form: photoForm(pid) });
  check('photo first -> 201, retry -> 200 duplicate same photo', p1.status === 201 && p2.status === 200 && p2.body?.duplicate === true && p2.body.photo?.id === p1.body.photo?.id, JSON.stringify([p1.status, p2.status]));
  check('one photo row', await count('SELECT COUNT(*) c FROM intervention_photos WHERE company_id = ? AND client_request_id = ?', [A, pid]) === 1);
  const is1 = await api('POST', `/api/reports/intervention/${i1.body.id}/sign`, { cookie: cTechA, form: signForm() });
  const is2 = await api('POST', `/api/reports/intervention/${i1.body.id}/sign`, { cookie: cTechA, form: signForm() });
  check('intervention sign -> 200, again -> 403 report_already_signed', is1.status === 200 && is2.status === 403 && is2.body?.code === 'report_already_signed', JSON.stringify([is1.status, is2.status, is2.body]));

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
