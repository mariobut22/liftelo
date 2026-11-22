#!/usr/bin/env node
/*
 * End-to-end test of the FIELD-ENTRY FLOW additions against a THROWAWAY MySQL/MariaDB (dev-only, no extra dependencies):
 *   - GET /api/rms-visits/prefill/location/:id          ("Prefill from last RMS")
 *   - GET /api/interventions/prefill/elevator           ("Prefill from last intervention of this elevator")
 *   - POST /api/rms-visits  finding_updates             ("fixed in this visit" per open fault, admin resolves / technician comments)
 * Same setup/refusal rules as findings-test.js (database "tt" / "*_test" on localhost, FRESH database with liftelo.sql +
 * ALL migrations).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3471 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/entry-flow-test.js
 *
 * Exit code 0 = all checks passed.
 */
'use strict';

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
const PORT = Number(process.env.TENANT_TEST_PORT || 3473);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'entry-flow-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OOS = 'Potreban popravak - Dizalo nije u funkciji';
const INS = 'Potreban popravak - Dizalo u funkciji';

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Flow A');
  const B = await mkCompany('Flow B');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@flow.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user', 'en')`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, label, companyId, email]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email, username: `${label}-${tag}` };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const techA = await mkUser('techA', A, 'technician');
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin');
  const mkLocation = async (companyId, name) => (await q(
    'INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [name, `${name} street 1`, companyId])).insertId;
  const locA = await mkLocation(A, `FlowLocA-${tag}`);
  const locA2 = await mkLocation(A, `FlowLocA2-${tag}`);
  const locEmpty = await mkLocation(A, `FlowLocEmpty-${tag}`);
  const locB = await mkLocation(B, `FlowLocB-${tag}`);
  const mkElevator = async (loc, companyId, label) => (await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [loc, companyId, label])).insertId;
  await mkElevator(locA, A, 'EL-1');
  await mkElevator(locA, A, 'EL-2');
  await mkElevator(locA2, A, 'EL-9');
  await mkElevator(locB, B, 'EL-B');
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }

  require(path.join(BACKEND, 'index.js'));
  await sleep(1500);
  const c = {
    adminA: await login(adminA.email, pw), techA: await login(techA.email, pw), viewerA: await login(viewerA.email, pw),
    adminB: await login(adminB.email, pw)
  };
  const uuid = () => require('crypto').randomUUID();
  const rmsBody = (loc, id, items, extra = {}) => ({ location_id: loc, visit_date: '2026-11-06', client_request_id: id, items, ...extra });

  console.log('\n[RMS prefill endpoint]');
  let r = await api('GET', `/api/rms-visits/prefill/location/${locEmpty}`, { cookie: c.techA });
  check('location without visits -> found false', r.status === 200 && r.body?.found === false, JSON.stringify(r));
  r = await api('GET', '/api/rms-visits/prefill/location/abc', { cookie: c.techA });
  check('invalid id -> 400', r.status === 400);
  r = await api('GET', `/api/rms-visits/prefill/location/${locA}`);
  check('not signed in -> 401', r.status === 401, String(r.status));

  // visit 1: both elevators; visit 2 (later): only EL-1 with a new comment and a general note
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [
    { elevator_label: 'EL-1', status: 'O.K.', comment: 'old comment 1' },
    { elevator_label: 'EL-2', status: INS, comment: 'EL-2 comment from visit 1' }
  ], { notes_general: 'first note' }) });
  check('seed RMS visit 1 -> 201', r.status === 201, JSON.stringify(r));
  const visit1 = r.body.id;
  await sleep(1100); // created_at has one-second resolution
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [
    { elevator_label: 'EL-1', status: 'O.K.', comment: 'new comment 1' }
  ], { notes_general: 'second note' }) });
  check('seed RMS visit 2 -> 201', r.status === 201, JSON.stringify(r));
  const visit2 = r.body.id;
  r = await api('POST', '/api/rms-visits', { cookie: c.adminB, json: rmsBody(locB, uuid(), [{ elevator_label: 'EL-B', status: 'O.K.', comment: 'SECRET-B' }], { notes_general: 'SECRET-B note' }) });
  check('seed RMS visit of company B -> 201', r.status === 201);

  r = await api('GET', `/api/rms-visits/prefill/location/${locA}`, { cookie: c.techA });
  const rp = r.body || {};
  check('latest visit is used for the note and the id', r.status === 200 && rp.found === true && rp.visit_id === visit2 && rp.notes_general === 'second note', JSON.stringify(r));
  const byLabel = Object.fromEntries((rp.items || []).map((i) => [i.elevator_label, i]));
  check('EL-1 comment from the latest visit', byLabel['EL-1']?.comment === 'new comment 1' && byLabel['EL-1']?.visit_id === visit2);
  check('EL-2 comment falls back to its own latest visit', byLabel['EL-2']?.comment === 'EL-2 comment from visit 1' && byLabel['EL-2']?.visit_id === visit1);
  const keys = new Set(Object.keys(rp).concat(...(rp.items || []).map((i) => Object.keys(i))));
  check('response carries no signatures / photos / findings / status fields',
    !['signature_status', 'signed_at', 'status', 'findings', 'photos', 'signature'].some((k) => keys.has(k)), [...keys].join(','));
  r = await api('GET', `/api/rms-visits/prefill/location/${locA}`, { cookie: c.viewerA });
  check('viewer may read the template (read-only)', r.status === 200 && r.body?.found === true);
  r = await api('GET', `/api/rms-visits/prefill/location/${locB}`, { cookie: c.techA });
  check("tenant isolation: company A cannot read company B's location -> found false, no leak", r.status === 200 && r.body?.found === false && !JSON.stringify(r.body).includes('SECRET-B'), JSON.stringify(r));
  check('prefill is read-only: still exactly 2 visits of company A at the location', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ? AND location_id = ?', [A, locA]) === 2);

  console.log('\n[Intervention prefill endpoint]');
  const intForm = (techUser, location, notes, items, lines, id) => {
    const f = new FormData();
    f.append('technician', techUser.username);
    f.append('location', location);
    f.append('date', '2026-11-06');
    f.append('notes', notes);
    f.append('status', 'NIJE RIJEŠENO');
    f.append('elevator_items', JSON.stringify(items));
    if (lines) f.append('work_lines', JSON.stringify(lines));
    f.append('client_request_id', id || uuid());
    return f;
  };
  r = await api('GET', `/api/interventions/prefill/elevator?location_id=${locA}&elevator_label=EL-1`, { cookie: c.techA });
  check('no intervention yet -> found false', r.status === 200 && r.body?.found === false, JSON.stringify(r));
  r = await api('POST', '/api/interventions', { cookie: c.techA, form: intForm(techA, `FlowLocA-${tag}`, 'EL-1 old desc', [{ elevator_label: 'EL-1', status: 'O.K.', comment: 'c-old' }], [{ name: 'old part', quantity: 1, unit: 'pcs', hours: 1 }]) });
  check('seed intervention 1 -> 200', r.status === 200, JSON.stringify(r));
  await sleep(1100);
  r = await api('POST', '/api/interventions', { cookie: c.techA, form: intForm(techA, `FlowLocA-${tag}`, 'EL-2 desc', [{ elevator_label: 'EL-2', status: 'O.K.', comment: 'c-el2' }], [{ name: 'belt', quantity: 2, unit: 'pcs', hours: 0.5 }]) });
  check('seed intervention 2 (EL-2 only) -> 200', r.status === 200, JSON.stringify(r));
  const int2 = r.body.id;
  r = await api('POST', '/api/interventions', { cookie: c.adminB, form: intForm(adminB, `FlowLocB-${tag}`, 'SECRET-B int', [{ elevator_label: 'EL-B', status: 'O.K.', comment: 'SECRET-B' }], [{ name: 'SECRET-B part' }]) });
  check('seed intervention of company B -> 200', r.status === 200);

  r = await api('GET', `/api/interventions/prefill/elevator?location_id=${locA}&elevator_label=EL-1`, { cookie: c.techA });
  check('per elevator: the latest intervention that has EL-1 (not the newer EL-2 one)', r.status === 200 && r.body?.found === true && r.body.notes === 'EL-1 old desc' && r.body.items?.some((i) => i.elevator_label === 'EL-1' && i.comment === 'c-old'), JSON.stringify(r.body));
  check('work lines of that intervention', r.body?.work_lines?.length === 1 && r.body.work_lines[0].name === 'old part' && r.body.work_lines[0].quantity === 1, JSON.stringify(r.body?.work_lines));
  r = await api('GET', `/api/interventions/prefill/elevator?location_id=${locA}&elevator_label=EL-2`, { cookie: c.techA });
  check('EL-2 -> intervention 2', r.body?.found === true && r.body.intervention_id === int2 && r.body.work_lines?.[0]?.name === 'belt');
  r = await api('GET', `/api/interventions/prefill/elevator?location_id=${locA}`, { cookie: c.techA });
  check('without elevator label: the latest intervention of the location', r.body?.found === true && r.body.intervention_id === int2);
  r = await api('GET', `/api/interventions/prefill/elevator?location_id=${locA}&elevator_label=EL-NOPE`, { cookie: c.techA });
  check('unknown elevator -> found false', r.status === 200 && r.body?.found === false);
  r = await api('GET', `/api/interventions/prefill/elevator?location_id=${locB}&elevator_label=EL-B`, { cookie: c.techA });
  check("tenant isolation: company A cannot read company B's interventions", r.status === 200 && r.body?.found === false && !JSON.stringify(r.body).includes('SECRET-B'));
  r = await api('GET', '/api/interventions/prefill/elevator', { cookie: c.techA });
  check('missing location_id -> 400', r.status === 400);
  r = await api('GET', `/api/interventions/prefill/elevator?location_id=${locA}`);
  check('not signed in -> 401', r.status === 401);
  check('prefill is read-only: 2 interventions of company A', await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ?', [A]) === 2);

  console.log('\n[RMS finding_updates: "fixed in this visit"]');
  // two open faults at locA (EL-1 oos, EL-2 in service) and one at locA2 + one in company B
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [
    { elevator_label: 'EL-1', status: OOS, comment: 'broken' }, { elevator_label: 'EL-2', status: INS, comment: 'noisy' }
  ], { findings: [{ elevator_label: 'EL-1', description: 'Door stuck' }, { elevator_label: 'EL-2', description: 'Noise' }] }) });
  check('seed visit with 2 faults -> 201', r.status === 201, JSON.stringify(r));
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA2, uuid(), [{ elevator_label: 'EL-9', status: INS }], { findings: [{ elevator_label: 'EL-9', description: 'Other location fault' }] }) });
  check('seed visit at the second location -> 201', r.status === 201);
  r = await api('POST', '/api/rms-visits', { cookie: c.adminB, json: rmsBody(locB, uuid(), [{ elevator_label: 'EL-B', status: INS }], { findings: [{ elevator_label: 'EL-B', description: 'B fault' }] }) });
  check('seed visit of company B with a fault -> 201', r.status === 201);
  await sleep(400);
  const fid = async (company, desc) => (await q('SELECT id FROM findings WHERE company_id = ? AND description = ?', [company, desc]))[0].id;
  const fDoor = await fid(A, 'Door stuck');
  const fNoise = await fid(A, 'Noise');
  const fOther = await fid(A, 'Other location fault');
  const fB = await fid(B, 'B fault');
  const eventsOf = (id, company = A) => q('SELECT event_type, state, note, user_id, intervention_id FROM finding_events WHERE finding_id = ? AND company_id = ? ORDER BY id ASC', [id, company]);
  const stateOf = async (id) => (await q('SELECT state FROM finding_events WHERE finding_id = ? AND state IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1', [id]))[0]?.state;
  const visitsNow = () => count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]);
  const ok = [{ elevator_label: 'EL-1', status: 'O.K.' }];

  const before = await visitsNow();
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), ok, { finding_updates: [{ finding_id: fB, action: 'fixed' }] }) });
  check("other company's finding -> 404 finding_not_found", r.status === 404 && r.body?.code === 'finding_not_found', JSON.stringify(r));
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), ok, { finding_updates: [{ finding_id: fOther, action: 'fixed' }] }) });
  check('finding of another location of the same company -> 404', r.status === 404 && r.body?.code === 'finding_not_found');
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), ok, { finding_updates: 'nope' }) });
  check('finding_updates not an array -> 400', r.status === 400 && r.body?.code === 'invalid_request');
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), ok, { finding_updates: [{ finding_id: fDoor, action: 'deleted' }] }) });
  check('unknown action -> 400', r.status === 400 && r.body?.code === 'invalid_request');
  check('rejected requests stored no visit and no event', await visitsNow() === before && (await eventsOf(fDoor)).length === 1);

  const adminNotifBefore = await count("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'finding'", [adminA.id]);
  const rid = uuid();
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, rid, ok, { finding_updates: [{ finding_id: fDoor, action: 'fixed' }, { finding_id: fNoise, action: 'still_present' }] }) });
  check('technician reports EL-1 fault fixed + EL-2 still present -> 201', r.status === 201, JSON.stringify(r));
  const techVisit = r.body.id;
  await sleep(500);
  const evDoor = await eventsOf(fDoor);
  check('technician "fixed" = COMMENT event (no state change), no intervention link, RMS visit number in the note',
    evDoor.length === 2 && evDoor[1].event_type === 'comment' && evDoor[1].state === null && evDoor[1].intervention_id === null
    && evDoor[1].user_id === techA.id && new RegExp(`RMS (visit|posjetu) #${techVisit}$`).test(evDoor[1].note), JSON.stringify(evDoor[1]));
  check('fault stays open until the admin confirms', await stateOf(fDoor) === 'open');
  check('"still present" wrote nothing', (await eventsOf(fNoise)).length === 1);
  check('admin was notified to confirm (message names the RMS visit)',
    await count("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'finding'", [adminA.id]) === adminNotifBefore + 1
    && (await q("SELECT message FROM notifications WHERE user_id = ? AND type = 'finding' ORDER BY id DESC LIMIT 1", [adminA.id]))[0].message.includes(`#${techVisit}`));

  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, rid, ok, { finding_updates: [{ finding_id: fDoor, action: 'fixed' }] }) });
  check('same client_request_id replay (offline outbox) -> 200 duplicate', r.status === 200 && r.body?.duplicate === true && r.body.id === techVisit, JSON.stringify(r));
  await sleep(300);
  check('replay added no second event and no second visit', (await eventsOf(fDoor)).length === 2 && await visitsNow() === before + 1);

  const adminBefore = await visitsNow();
  r = await api('POST', '/api/rms-visits', { cookie: c.adminA, json: rmsBody(locA, uuid(), ok, { finding_updates: [{ finding_id: fDoor, action: 'fixed' }, { finding_id: fNoise, action: 'fixed' }] }) });
  check('admin reports both faults fixed -> 201', r.status === 201, JSON.stringify(r));
  const adminVisit = r.body.id;
  await sleep(500);
  const evDoor2 = await eventsOf(fDoor);
  check('admin "fixed" = resolved event, state resolved, note names the RMS visit', evDoor2.at(-1).event_type === 'resolved' && evDoor2.at(-1).state === 'resolved' && new RegExp(`RMS (visit|posjetu) #${adminVisit}$`).test(evDoor2.at(-1).note) && evDoor2.at(-1).intervention_id === null, JSON.stringify(evDoor2.at(-1)));
  check('both faults are now resolved (state derived from the latest event)', await stateOf(fDoor) === 'resolved' && await stateOf(fNoise) === 'resolved');
  check('append-only: earlier events untouched (ids ascending, previous count kept)', evDoor2.length === 3 && evDoor2[0].event_type === 'opened' && evDoor2[1].event_type === 'comment');
  check('audit log keeps the RMS visit id', await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'finding_resolved' AND metadata LIKE ?", [A, `%"rms_visit_id":${adminVisit}%`]) === 2);
  r = await api('POST', '/api/rms-visits', { cookie: c.adminA, json: rmsBody(locA, uuid(), ok, { finding_updates: [{ finding_id: fDoor, action: 'fixed' }] }) });
  check('already resolved fault is skipped (visit still saved, no extra event)', r.status === 201 && (await eventsOf(fDoor)).length === 3);
  void adminBefore;
  r = await api('POST', '/api/rms-visits', { cookie: c.viewerA, json: rmsBody(locA, uuid(), ok, { finding_updates: [{ finding_id: fNoise, action: 'fixed' }] }) });
  check('viewer cannot create an RMS visit -> 403', r.status === 403, JSON.stringify(r));

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
