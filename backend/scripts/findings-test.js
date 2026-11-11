#!/usr/bin/env node
/*
 * End-to-end test of the FINDINGS module (tracked defects per elevator) against a THROWAWAY MySQL/MariaDB (dev-only,
 * no extra dependencies). Loads the real backend/index.js, seeds two companies and logs in through POST /api/login.
 * Same setup/refusal rules as tenant-isolation-test.js (database "tt" / "*_test" on localhost, FRESH database with
 * liftelo.sql + ALL migrations, incl. 20261111_* and 20261113_findings.sql).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3461 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/findings-test.js
 *
 * Covers: creation inside RMS / intervention requests (one transaction), idempotent replays (also concurrent), derived
 * state + lifecycle + invalid transitions, append-only, tenant isolation, role rules (viewer / technician / admin),
 * notification recipients (counts, actor excluded, language), severity vs needs_part independence, subscription lock.
 * Exit code 0 = all checks passed.
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
const PORT = Number(process.env.TENANT_TEST_PORT || 3463);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'findings-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
  const A = await mkCompany('Find A');
  const B = await mkCompany('Find B');
  const mkUser = async (label, companyId, role, extra = {}) => {
    const email = `${label}-${tag}@find.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'user', ?)`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, label, companyId, email, extra.inactive ? 0 : 1, extra.language || null]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email, username: `${label}-${tag}` };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const admin2A = await mkUser('admin2A', A, 'admin', { language: 'en' });
  const techA = await mkUser('techA', A, 'technician');
  const tech2A = await mkUser('tech2A', A, 'technician');
  const techOffA = await mkUser('techOffA', A, 'technician', { inactive: true });
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin');
  const techB = await mkUser('techB', B, 'technician');
  const mkLocation = async (companyId, name) => (await q(
    'INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [name, `${name} street 1`, companyId])).insertId;
  const locA = await mkLocation(A, `FindLocA-${tag}`);
  const locA2 = await mkLocation(A, `FindLocA2-${tag}`);
  const locB = await mkLocation(B, `FindLocB-${tag}`);
  const mkElevator = async (loc, companyId, label) => (await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [loc, companyId, label])).insertId;
  const el1 = await mkElevator(locA, A, 'EL-1');
  const el2 = await mkElevator(locA, A, 'EL-2');
  const el3 = await mkElevator(locA, A, 'EL-3');
  const el4 = await mkElevator(locA2, A, 'EL-4');
  const elB = await mkElevator(locB, B, 'EL-B-1');
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }

  require(path.join(BACKEND, 'index.js'));
  await sleep(1500);
  const c = {
    adminA: await login(adminA.email, pw), admin2A: await login(admin2A.email, pw), techA: await login(techA.email, pw),
    tech2A: await login(tech2A.email, pw), viewerA: await login(viewerA.email, pw),
    adminB: await login(adminB.email, pw), techB: await login(techB.email, pw)
  };
  const uuid = () => require('crypto').randomUUID();
  const notifCount = (userId) => count("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'finding'", [userId]);
  const notifsOf = (userId) => q("SELECT title, message, link FROM notifications WHERE user_id = ? AND type = 'finding' ORDER BY id ASC", [userId]);

  console.log('\n[RMS visit with findings: one transaction, severity derived from the status]');
  const rid = uuid();
  const rmsBody = (loc, id, findings, items) => ({
    location_id: loc, visit_date: '2026-11-06', client_request_id: id,
    items: items || [
      { elevator_label: 'EL-1', status: OOS, comment: 'x' },
      { elevator_label: 'EL-2', status: INS },
      { elevator_label: 'EL-3', status: 'O.K.' }
    ],
    findings
  });
  const f1 = { elevator_label: 'EL-1', description: 'Cabin door does not close', category: 'doors', needs_part: true, part_note: 'door roller set' };
  const f2 = { elevator_label: 'EL-2', description: 'Noisy drive', category: 'drive_machine', needs_part: true, part_note: 'bearing' };
  const r1 = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, rid, [f1, f2]) });
  check('RMS with 2 findings -> 201', r1.status === 201 && r1.body?.id > 0, JSON.stringify(r1));
  await sleep(700);
  const rows = await q('SELECT * FROM findings WHERE company_id = ? ORDER BY id ASC', [A]);
  check('2 findings stored', rows.length === 2, String(rows.length));
  const byLabel = Object.fromEntries(rows.map((r) => [r.elevator_label, r]));
  check('EL-1 out_of_service, EL-2 in_service (derived from the repair status)', byLabel['EL-1']?.severity === 'out_of_service' && byLabel['EL-2']?.severity === 'in_service');
  check('elevator_id resolved from the label', byLabel['EL-1']?.elevator_id === el1 && byLabel['EL-2']?.elevator_id === el2);
  check('source = rms_visit_item with the item id', byLabel['EL-1']?.source_type === 'rms_visit_item'
    && (await count('SELECT COUNT(*) c FROM rms_visit_items WHERE id = ? AND company_id = ? AND visit_id = ?', [byLabel['EL-1'].source_id, A, r1.body.id])) === 1);
  check('needs_part + part_note stored, creator = acting technician, location snapshot',
    byLabel['EL-1'].needs_part === 1 && byLabel['EL-1'].part_note === 'door roller set' && byLabel['EL-1'].created_by_user_id === techA.id && byLabel['EL-1'].location_name === `FindLocA-${tag}`);
  check('one "opened" event per finding', await count("SELECT COUNT(*) c FROM finding_events WHERE company_id = ? AND event_type = 'opened' AND state = 'open'", [A]) === 2);
  const fOos = byLabel['EL-1'].id;
  const fIns = byLabel['EL-2'].id;

  console.log('\n[idempotent replay: same client_request_id -> still one visit and one set of findings]');
  const r2 = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, rid, [f1, f2]) });
  check('replay -> 200 duplicate, same visit id', r2.status === 200 && r2.body?.duplicate === true && r2.body?.id === r1.body.id, JSON.stringify(r2));
  await sleep(300);
  check('still exactly 2 findings and 2 events', await count('SELECT COUNT(*) c FROM findings WHERE company_id = ?', [A]) === 2
    && await count('SELECT COUNT(*) c FROM finding_events WHERE company_id = ?', [A]) === 2);
  const rid2 = uuid();
  const burst = await Promise.all(Array.from({ length: 5 }, () => api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, rid2, [f1], [{ elevator_label: 'EL-1', status: OOS }]) })));
  check('concurrent replays: all succeed, one id', burst.every((r) => [200, 201].includes(r.status)) && new Set(burst.map((r) => r.body?.id)).size === 1, JSON.stringify(burst.map((r) => r.status)));
  await sleep(500);
  check('concurrent replays created exactly one visit and one finding',
    await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ? AND client_request_id = ?', [A, rid2]) === 1
    && await count("SELECT COUNT(*) c FROM findings WHERE company_id = ? AND source_id IN (SELECT id FROM rms_visit_items WHERE visit_id = ? AND company_id = ?)", [A, burst.find((r) => r.body?.id).body.id, A]) === 1);

  console.log('\n[validation: nothing is stored on a bad request]');
  const visitsBefore = await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]);
  const findingsBefore = await count('SELECT COUNT(*) c FROM findings WHERE company_id = ?', [A]);
  let r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [{ elevator_label: 'EL-3', description: 'ok item cannot have one' }]) });
  check('finding for an O.K. item -> 400 finding_requires_repair_status', r.status === 400 && r.body?.code === 'finding_requires_repair_status', JSON.stringify(r));
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [{ elevator_label: 'EL-1', description: '   ' }]) });
  check('empty description -> 400 finding_description_required', r.status === 400 && r.body?.code === 'finding_description_required', JSON.stringify(r));
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [{ elevator_label: 'EL-1', description: 'x', category: 'nope' }]) });
  check('unknown category -> 400', r.status === 400 && r.body?.code === 'invalid_request');
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [{ elevator_label: 'EL-1', description: 'a' }, { elevator_label: 'EL-1', description: 'b' }]) });
  check('two findings for the same elevator in one request -> 400', r.status === 400);
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), 'not-an-array') });
  check('findings not an array -> 400', r.status === 400);
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locB, uuid(), [f1]) });
  check("company B's location in A's request -> 404 location_not_found", r.status === 404 && r.body?.code === 'location_not_found');
  check('no visit and no finding was stored by the bad requests',
    await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]) === visitsBefore && await count('SELECT COUNT(*) c FROM findings WHERE company_id = ?', [A]) === findingsBefore);
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), undefined, [{ elevator_label: 'EL-3', status: 'O.K.' }]) });
  check('RMS without findings still works (201)', r.status === 201);

  console.log('\n[notifications: recipients per rule, actor excluded, recipient language]');
  // r1: EL-1 out_of_service -> admins + technicians; EL-2 in_service -> admins only; actor techA excluded.
  // The concurrent-burst visit (rid2) added one more out_of_service finding.
  const nAdminA = await notifsOf(adminA.id);
  const nAdmin2 = await notifsOf(admin2A.id);
  check('adminA and admin2A: 3 notifications each (2 findings of the first visit + 1 of the burst visit)', nAdminA.length === 3 && nAdmin2.length === 3, `${nAdminA.length}/${nAdmin2.length}`);
  check('tech2A: only the out_of_service findings (2)', await notifCount(tech2A.id) === 2, String(await notifCount(tech2A.id)));
  check('in_service finding did NOT notify technicians (tech2A has no notification linking to it)',
    !(await notifsOf(tech2A.id)).some((n) => n.link === `/dashboard/findings?id=${fIns}`));
  check('actor techA got none', await notifCount(techA.id) === 0);
  check('viewer, inactive technician and company B users got none',
    await notifCount(viewerA.id) === 0 && await notifCount(techOffA.id) === 0 && await notifCount(adminB.id) === 0 && await notifCount(techB.id) === 0);
  check('link opens the finding', nAdminA.some((n) => n.link === `/dashboard/findings?id=${fOos}`) && nAdminA.some((n) => n.link === `/dashboard/findings?id=${fIns}`));
  check('admin2A (en) gets English text, adminA (no language, company default hr) Croatian text',
    nAdmin2.some((n) => /out of service/i.test(n.title)) && nAdminA.some((n) => /nije u funkciji/i.test(n.title)), JSON.stringify([nAdmin2[0], nAdminA[0]]));
  check('no e-mail was queued for findings', await count("SELECT COUNT(*) c FROM email_outbox WHERE company_id = ? AND type LIKE 'notification_finding%'", [A]) === 0);

  console.log('\n[severity and needs_part are independent: in_service + needs_part]');
  r = await api('GET', '/api/findings?state=open&needs_part=1', { cookie: c.adminA });
  const toOrderIds = (r.body?.items || []).map((i) => i.id);
  check('in_service + needs_part is in the "to order" list', toOrderIds.includes(fIns) && toOrderIds.includes(fOos), JSON.stringify(toOrderIds));
  let sm = await api('GET', '/api/findings/summary', { cookie: c.adminA });
  check('summary counts: open 3, out_of_service 2, in_service 1, needs_part 3, to_order 3 (urgent is NOT inflated)',
    sm.body.open === 3 && sm.body.out_of_service === 2 && sm.body.in_service === 1 && sm.body.needs_part === 3 && sm.body.to_order === 3 && sm.body.waiting_part === 0, JSON.stringify(sm.body));
  const m1 = await api('POST', '/api/findings', { cookie: c.techA, json: { location_id: locA, elevator_id: el3, description: 'Worn guide shoes, lift runs', severity: 'in_service', category: 'car', needs_part: true, part_note: 'guide shoes', client_request_id: uuid() } });
  check('manual in_service finding with needs_part -> 201', m1.status === 201, JSON.stringify(m1));
  await sleep(500);
  check('manual in_service finding notified admins only (adminA 4, admin2A 4, tech2A unchanged at 2)', await notifCount(adminA.id) === 4 && await notifCount(admin2A.id) === 4 && await notifCount(tech2A.id) === 2, `${await notifCount(adminA.id)}/${await notifCount(tech2A.id)}`);
  const m2 = await api('POST', '/api/findings', { cookie: c.adminA, json: { location_id: locA2, elevator_id: el4, description: 'Cosmetic: scratched panel', severity: 'recommendation', client_request_id: uuid() } });
  await sleep(500);
  check('manual recommendation by admin -> 201; only the OTHER admin is notified (actor excluded, no technicians)', m2.status === 201 && await notifCount(adminA.id) === 4 && await notifCount(admin2A.id) === 5 && await notifCount(tech2A.id) === 2, `${await notifCount(adminA.id)}/${await notifCount(admin2A.id)}/${await notifCount(tech2A.id)}`);
  sm = await api('GET', '/api/findings/summary', { cookie: c.adminA });
  check('summary after manual adds: open 5, out_of_service 2, in_service 2, recommendation 1, needs_part 4',
    sm.body.open === 5 && sm.body.out_of_service === 2 && sm.body.in_service === 2 && sm.body.recommendation === 1 && sm.body.needs_part === 4, JSON.stringify(sm.body));
  check('summary has oldest_days (number)', typeof sm.body.oldest_days === 'number');

  console.log('\n[intervention with findings (multipart), idempotent]');
  const iid = uuid();
  const intForm = (id, items, findings) => {
    const f = new FormData();
    f.append('technician', techA.username);
    f.append('location', `FindLocA2-${tag}`);
    f.append('date', '2026-11-06');
    f.append('notes', 'finding test');
    f.append('status', 'NIJE RIJEŠENO');
    f.append('elevator_items', JSON.stringify(items));
    if (findings !== undefined) f.append('findings', typeof findings === 'string' ? findings : JSON.stringify(findings));
    if (id) f.append('client_request_id', id);
    return f;
  };
  const items4 = [{ elevator_label: 'EL-4', status: OOS, comment: '' }];
  const i1 = await api('POST', '/api/interventions', { cookie: c.techA, form: intForm(iid, items4, [{ elevator_label: 'EL-4', description: 'Stuck between floors', category: 'safety_devices' }]) });
  check('intervention with finding -> 200', i1.status === 200 && i1.body?.id > 0, JSON.stringify(i1));
  const i2 = await api('POST', '/api/interventions', { cookie: c.techA, form: intForm(iid, items4, [{ elevator_label: 'EL-4', description: 'Stuck between floors', category: 'safety_devices' }]) });
  check('replay -> 200 duplicate', i2.status === 200 && i2.body?.duplicate === true && i2.body?.id === i1.body.id);
  await sleep(500);
  const intFindings = await q("SELECT * FROM findings WHERE company_id = ? AND source_type = 'intervention'", [A]);
  check('exactly one intervention finding (source_id = intervention, severity out_of_service, elevator resolved)',
    intFindings.length === 1 && intFindings[0].source_id === i1.body.id && intFindings[0].severity === 'out_of_service' && intFindings[0].elevator_id === el4 && intFindings[0].location_name === `FindLocA2-${tag}`);
  const visitsInt = await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ?', [A]);
  r = await api('POST', '/api/interventions', { cookie: c.techA, form: intForm(uuid(), [{ elevator_label: 'EL-4', status: 'O.K.' }], [{ elevator_label: 'EL-4', description: 'x' }]) });
  check('intervention finding without repair item -> 400, no intervention stored', r.status === 400 && r.body?.code === 'finding_requires_repair_status' && await count('SELECT COUNT(*) c FROM interventions WHERE company_id = ?', [A]) === visitsInt, JSON.stringify(r));

  console.log('\n[manual POST /api/findings: roles, validation, idempotency]');
  const mid = uuid();
  const manual = { location_id: locA, elevator_id: el1, description: 'Manual note', severity: 'in_service', client_request_id: mid };
  r = await api('POST', '/api/findings', { cookie: c.viewerA, json: manual });
  check('viewer -> 403 viewer_read_only', r.status === 403 && r.body?.code === 'viewer_read_only');
  r = await api('POST', '/api/findings', { cookie: c.techA, json: manual });
  const first = r;
  r = await api('POST', '/api/findings', { cookie: c.techA, json: manual });
  check('technician: 201, replay -> 200 duplicate same id', first.status === 201 && r.status === 200 && r.body?.duplicate === true && r.body?.id === first.body?.id, JSON.stringify([first.status, r.status]));
  check('one finding for that client_request_id', await count('SELECT COUNT(*) c FROM findings WHERE company_id = ? AND client_request_id = ?', [A, mid]) === 1);
  r = await api('POST', '/api/findings', { cookie: c.techA, json: { ...manual, client_request_id: uuid(), description: '' } });
  check('missing description -> 400 finding_description_required', r.status === 400 && r.body?.code === 'finding_description_required');
  r = await api('POST', '/api/findings', { cookie: c.techA, json: { ...manual, client_request_id: uuid(), severity: 'catastrophic' } });
  check('invalid severity -> 400', r.status === 400);
  r = await api('POST', '/api/findings', { cookie: c.techA, json: { ...manual, client_request_id: uuid(), location_id: locB } });
  check("other company's location -> 404 location_not_found", r.status === 404 && r.body?.code === 'location_not_found');
  r = await api('POST', '/api/findings', { cookie: c.techA, json: { ...manual, client_request_id: uuid(), elevator_id: elB } });
  check("other company's elevator -> 404 elevator_not_found", r.status === 404 && r.body?.code === 'elevator_not_found');
  r = await api('POST', '/api/findings', { cookie: c.techA, json: { ...manual, client_request_id: uuid(), location_id: locA2, elevator_id: el1 } });
  check('elevator of a different location of the same company -> 404', r.status === 404);
  r = await api('POST', '/api/findings', { json: manual });
  check('anonymous -> 401', r.status === 401);

  console.log('\n[list / filters / detail]');
  r = await api('GET', '/api/findings', { cookie: c.techA });
  const list = r.body?.items || [];
  check('list works for technician; total matches', r.status === 200 && r.body.total === list.length && list.length >= 6, JSON.stringify(r.body).slice(0, 200));
  const ranks = list.map((i) => ({ out_of_service: 0, in_service: 1, recommendation: 2 }[i.severity]));
  check('sorted by severity (out_of_service first)', ranks.every((v, i) => i === 0 || ranks[i - 1] <= v), JSON.stringify(ranks));
  const oosSorted = list.filter((i) => i.severity === 'out_of_service').map((i) => i.id);
  check('same severity: oldest first', oosSorted.every((v, i) => i === 0 || oosSorted[i - 1] < v));
  check('items carry derived state, days_open, location name, elevator label', list.every((i) => i.state === 'open' && typeof i.days_open === 'number' && i.location_name && i.elevator_label));
  r = await api('GET', '/api/findings?severity=out_of_service', { cookie: c.viewerA });
  check('severity filter (viewer may read)', r.status === 200 && r.body.items.length === 3 && r.body.items.every((i) => i.severity === 'out_of_service'));
  r = await api('GET', `/api/findings?location_id=${locA2}`, { cookie: c.adminA });
  check('location filter', r.body.items.length === 2 && r.body.items.every((i) => i.location_id === locA2));
  r = await api('GET', `/api/findings?elevator_id=${el1}`, { cookie: c.adminA });
  check('elevator filter', r.body.items.length >= 2 && r.body.items.every((i) => i.elevator_id === el1));
  r = await api('GET', '/api/findings?limit=2&offset=1', { cookie: c.adminA });
  check('limit/offset', r.body.items.length === 2 && r.body.limit === 2 && r.body.offset === 1);
  r = await api('GET', '/api/findings?state=bogus', { cookie: c.adminA });
  check('invalid state filter -> 400', r.status === 400);
  r = await api('GET', `/api/findings/${fOos}`, { cookie: c.techA });
  check('detail has events history (opened), creator name', r.status === 200 && r.body.events.length === 1 && r.body.events[0].event_type === 'opened' && r.body.created_by_name === 'techA', JSON.stringify(r.body).slice(0, 300));
  check('detail events carry nullable intervention_id / work_order_id (step 2 ready)', 'intervention_id' in r.body.events[0] && 'work_order_id' in r.body.events[0]);

  console.log('\n[lifecycle: derived state, role rules, invalid transitions, notifications]');
  const ev = (cookie, id, body) => api('POST', `/api/findings/${id}/events`, { cookie, json: body });
  const stateOf = async (id) => (await api('GET', `/api/findings/${id}`, { cookie: c.adminA })).body.state;
  r = await ev(c.techA, fOos, { event_type: 'status_changed', state: 'in_progress' });
  check('technician cannot change state -> 403 findings_admin_only', r.status === 403 && r.body?.code === 'findings_admin_only');
  r = await ev(c.techA, fOos, { event_type: 'resolved' });
  check('technician cannot resolve -> 403', r.status === 403);
  r = await ev(c.techA, fOos, { event_type: 'parts_ordered' });
  check('technician cannot mark parts ordered -> 403', r.status === 403);
  r = await ev(c.viewerA, fOos, { event_type: 'comment', note: 'hi' });
  check('viewer cannot comment -> 403 viewer_read_only', r.status === 403 && r.body?.code === 'viewer_read_only');
  r = await ev(c.techA, fOos, { event_type: 'comment', note: 'Parts photographed' });
  check('technician comment -> 201, state unchanged', r.status === 201 && await stateOf(fOos) === 'open');
  r = await ev(c.techA, fOos, { event_type: 'comment', note: '  ' });
  check('comment without text -> 400 finding_note_required', r.status === 400 && r.body?.code === 'finding_note_required');
  r = await ev(c.adminA, fOos, { event_type: 'bogus' });
  check('unknown event type -> 400', r.status === 400);

  r = await ev(c.adminA, fOos, { event_type: 'status_changed', state: 'in_progress', note: 'tech on the way' });
  check('admin: open -> in_progress', r.status === 201 && await stateOf(fOos) === 'in_progress');
  r = await ev(c.adminA, fOos, { event_type: 'status_changed', state: 'in_progress' });
  check('same state again -> 409 invalid_finding_transition', r.status === 409 && r.body?.code === 'invalid_finding_transition');
  r = await ev(c.adminA, fOos, { event_type: 'status_changed', state: 'resolved' });
  check('status_changed cannot set resolved (use the resolved event) -> 409', r.status === 409);
  r = await ev(c.adminA, fOos, { event_type: 'reopened' });
  check('reopen a not-resolved finding -> 409', r.status === 409);
  const notifBefore = { tech2A: await notifCount(tech2A.id), techA: await notifCount(techA.id), adminA: await notifCount(adminA.id), admin2A: await notifCount(admin2A.id) };
  r = await ev(c.adminA, fOos, { event_type: 'parts_ordered', note: 'ordered at supplier X' });
  check('admin: parts_ordered -> state waiting_part', r.status === 201 && await stateOf(fOos) === 'waiting_part');
  await sleep(500);
  check('parts_ordered notified creator (techA) + other admin, NOT the actor, not other technicians',
    await notifCount(techA.id) === notifBefore.techA + 1 && await notifCount(admin2A.id) === notifBefore.admin2A + 1
    && await notifCount(adminA.id) === notifBefore.adminA && await notifCount(tech2A.id) === notifBefore.tech2A);
  r = await ev(c.adminA, fOos, { event_type: 'parts_ordered' });
  check('parts_ordered twice in a row -> 409 parts_already_ordered', r.status === 409 && r.body?.code === 'parts_already_ordered');
  let one = (await api('GET', `/api/findings/${fOos}`, { cookie: c.adminA })).body;
  check('detail: parts_ordered flag + timestamp', one.parts_ordered === true && Boolean(one.parts_ordered_at));
  sm = await api('GET', '/api/findings/summary', { cookie: c.adminA });
  check('summary: waiting_part 1, to_order down by one (needs_part unchanged), out_of_service still 3 (not resolved)', sm.body.waiting_part === 1 && sm.body.to_order === 3 && sm.body.needs_part === 4 && sm.body.out_of_service === 3, JSON.stringify(sm.body));
  r = await api('GET', '/api/findings?needs_part=1&parts_ordered=0', { cookie: c.adminA });
  check('to-order list (needs_part, not ordered) no longer has it', !r.body.items.some((i) => i.id === fOos));

  const nBeforeRes = { tech2A: await notifCount(tech2A.id), techA: await notifCount(techA.id), adminA: await notifCount(adminA.id), admin2A: await notifCount(admin2A.id) };
  r = await ev(c.admin2A, fOos, { event_type: 'resolved', note: 'door roller replaced' });
  check('admin2A: resolved', r.status === 201 && await stateOf(fOos) === 'resolved');
  await sleep(500);
  check('resolved notified creator (techA) + other admin (adminA), NOT the actor (admin2A)',
    await notifCount(techA.id) === nBeforeRes.techA + 1 && await notifCount(adminA.id) === nBeforeRes.adminA + 1
    && await notifCount(admin2A.id) === nBeforeRes.admin2A && await notifCount(tech2A.id) === nBeforeRes.tech2A);
  one = (await api('GET', `/api/findings/${fOos}`, { cookie: c.adminA })).body;
  check('resolved finding: resolved_at set, state resolved', one.state === 'resolved' && Boolean(one.resolved_at));
  r = await ev(c.adminA, fOos, { event_type: 'resolved' });
  check('resolve twice -> 409', r.status === 409);
  r = await ev(c.adminA, fOos, { event_type: 'status_changed', state: 'open' });
  check('status_changed from resolved -> 409', r.status === 409);
  r = await ev(c.adminA, fOos, { event_type: 'parts_ordered' });
  check('parts_ordered on resolved -> 409', r.status === 409);
  r = await ev(c.techA, fOos, { event_type: 'comment', note: 'Verified on site' });
  check('technician can still comment on a resolved finding', r.status === 201 && await stateOf(fOos) === 'resolved');
  r = await api('GET', '/api/findings', { cookie: c.adminA });
  check('resolved finding leaves the default (open) list', !r.body.items.some((i) => i.id === fOos));
  r = await api('GET', '/api/findings?state=all', { cookie: c.adminA });
  const allItems = r.body.items;
  check('state=all contains it, resolved sorted last', allItems.some((i) => i.id === fOos) && allItems[allItems.length - 1].state === 'resolved');
  r = await api('GET', '/api/findings?state=resolved', { cookie: c.adminA });
  check('state=resolved filter', r.body.items.length === 1 && r.body.items[0].id === fOos);
  sm = await api('GET', '/api/findings/summary', { cookie: c.adminA });
  check('summary: resolved no longer counted (out_of_service 2, open 6)', sm.body.out_of_service === 2 && sm.body.open === 6 && sm.body.waiting_part === 0, JSON.stringify(sm.body));
  r = await ev(c.adminA, fOos, { event_type: 'reopened', note: 'broke again' });
  check('admin reopens a resolved finding -> open', r.status === 201 && await stateOf(fOos) === 'open');
  one = (await api('GET', `/api/findings/${fOos}`, { cookie: c.adminA })).body;
  check('history is complete and ordered (opened, comment, status_changed, parts_ordered, resolved, comment, reopened)',
    one.events.map((e) => e.event_type).join(',') === 'opened,comment,status_changed,parts_ordered,resolved,comment,reopened', one.events.map((e) => e.event_type).join(','));
  check('events record the acting user', one.events.find((e) => e.event_type === 'resolved').user_id === admin2A.id);
  check('admin state changes are audit-logged (status_changed, parts_ordered, resolved, reopened); comments are not',
    await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action IN ('finding_status_changed','finding_parts_ordered','finding_resolved','finding_reopened')", [A]) >= 4
    && await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'finding_comment'", [A]) === 0);
  // concurrency: two admins resolve at the same time -> exactly one wins
  const race = await Promise.all([ev(c.adminA, fIns, { event_type: 'resolved' }), ev(c.admin2A, fIns, { event_type: 'resolved' })]);
  check('two simultaneous resolves: one 201, one 409', race.map((x) => x.status).sort().join() === '201,409', JSON.stringify(race.map((x) => x.status)));

  console.log('\n[append-only]');
  const src = ['routes/findings.js', 'utils/findings.js', 'routes/rms-visits.js', 'routes/interventions.js']
    .map((f) => fs.readFileSync(path.join(BACKEND, f), 'utf8')).join('\n');
  check('no UPDATE / DELETE of findings or finding_events anywhere in the code', !/UPDATE\s+findings|UPDATE\s+finding_events|DELETE\s+FROM\s+findings|DELETE\s+FROM\s+finding_events/i.test(src));
  r = await api('PUT', `/api/findings/${fOos}`, { cookie: c.adminA, json: { description: 'edited' } });
  const r404 = await api('DELETE', `/api/findings/${fOos}`, { cookie: c.adminA });
  check('PUT / DELETE routes do not exist', [404, 405].includes(r.status) && [404, 405].includes(r404.status), `${r.status}/${r404.status}`);
  const row0 = (await q('SELECT description, severity, needs_part FROM findings WHERE id = ?', [fOos]))[0];
  check('finding row unchanged by the whole lifecycle', row0.description === 'Cabin door does not close' && row0.severity === 'out_of_service' && row0.needs_part === 1);
  check('the findings table has no state column (state is derived)', await count("SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'findings' AND COLUMN_NAME IN ('state','status')", []) === 0);

  console.log('\n[tenant isolation]');
  r = await api('GET', '/api/findings?state=all', { cookie: c.adminB });
  check('company B sees none of As findings', r.status === 200 && r.body.items.length === 0 && r.body.total === 0);
  sm = await api('GET', '/api/findings/summary', { cookie: c.adminB });
  check('company B summary is empty', sm.body.open === 0 && sm.body.oldest_days === null);
  r = await api('GET', `/api/findings/${fOos}`, { cookie: c.adminB });
  check("company B cannot read A's finding -> 404", r.status === 404 && r.body?.code === 'finding_not_found');
  const eventsBefore = await count('SELECT COUNT(*) c FROM finding_events WHERE company_id = ?', [A]);
  for (const type of ['resolved', 'comment', 'parts_ordered', 'reopened']) {
    r = await ev(c.adminB, fOos, { event_type: type, note: 'x' });
    check(`company B admin cannot add "${type}" to A's finding -> 404`, r.status === 404 && r.body?.code === 'finding_not_found');
  }
  r = await ev(c.techB, fOos, { event_type: 'comment', note: 'x' });
  check("company B technician cannot comment on A's finding -> 404", r.status === 404);
  check('nothing was inserted by company B', await count('SELECT COUNT(*) c FROM finding_events WHERE company_id = ?', [A]) === eventsBefore && await count('SELECT COUNT(*) c FROM finding_events WHERE company_id = ?', [B]) === 0);
  r = await api('GET', `/api/findings?elevator_id=${el1}&location_id=${locA}`, { cookie: c.adminB });
  check("filtering by A's elevator/location id as B returns nothing", r.body.items.length === 0);
  r = await api('POST', '/api/findings', { cookie: c.adminB, json: { location_id: locA, elevator_id: el1, description: 'x' } });
  check("B cannot create a finding on A's location -> 404", r.status === 404);
  r = await api('POST', '/api/findings', { cookie: c.adminB, json: { location_id: locB, elevator_id: elB, description: 'B own finding', severity: 'in_service', client_request_id: mid } });
  check('B re-using the client_request_id of A gets its OWN finding', r.status === 201 && r.body.id !== first.body.id, JSON.stringify(r));
  check('company B findings stored under company B only', await count('SELECT COUNT(*) c FROM findings WHERE company_id = ?', [B]) === 1);
  const mem = await api('POST', '/api/rms-visits', { cookie: c.techB, json: { location_id: locB, visit_date: '2026-11-06', items: [{ elevator_label: 'EL-B-1', status: INS }], findings: [{ elevator_label: 'EL-B-1', description: 'B rms finding' }] } });
  check('B RMS with finding works and lands in B', mem.status === 201 && await count('SELECT COUNT(*) c FROM findings WHERE company_id = ?', [B]) === 2);

  console.log('\n[subscription lock]');
  await q("UPDATE company_subscriptions SET status = 'past_due' WHERE company_id = ?", [A]);
  r = await api('GET', '/api/findings', { cookie: c.adminA });
  check('locked: admin can still read', r.status === 200);
  r = await ev(c.adminA, fIns, { event_type: 'reopened' });
  check('locked: admin write -> 402 subscription_locked', r.status === 402 && r.body?.code === 'subscription_locked', JSON.stringify(r));
  r = await api('POST', '/api/findings', { cookie: c.adminA, json: { location_id: locA, elevator_id: el1, description: 'x' } });
  check('locked: admin manual add -> 402', r.status === 402);
  r = await api('POST', '/api/rms-visits', { cookie: c.techA, json: rmsBody(locA, uuid(), [f1]) });
  check('locked: technician RMS (with findings) -> 402 service_disabled_technician', r.status === 402 && r.body?.code === 'service_disabled_technician');
  r = await ev(c.techA, fOos, { event_type: 'comment', note: 'comment while locked' });
  check('locked: technician comment still allowed (rules unchanged: only RMS/intervention creation is disabled)', r.status === 201);
  r = await ev(c.viewerA, fOos, { event_type: 'comment', note: 'x' });
  check('locked: viewer still 403', r.status === 403);
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = ?", [A]);
  r = await ev(c.adminA, fIns, { event_type: 'reopened' });
  check('unlocked again: admin write works', r.status === 201);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
