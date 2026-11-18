#!/usr/bin/env node
/*
 * Annual RMS overview test (automatic recording + visits behind a cell + backfill), against a THROWAWAY MySQL/MariaDB.
 * Same setup/refusal rules as offline-idempotency-test.js (database "tt" / "*_test" on localhost, FRESH database, all migrations applied).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3531 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/rms-overview-test.js
 *
 * Proves: a new RMS creates/updates its overview row in the SAME transaction (a failing sync rolls the RMS back); several RMS in
 * one month -> the LATEST effective date; rms_month beats visit_date; invoice status is never touched by the sync; a replayed
 * client_request_id changes nothing; GET /api/rms-overview/visits (content, order, roles, tenant isolation, validation);
 * the backfill migration is re-runnable, fills only missing months and never overwrites an existing/manual row.
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
const PORT = Number(process.env.TENANT_TEST_PORT || 3532);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'rms-overview-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
async function api(method, url, { cookie, json } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
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

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const cell = async (company, loc, year, month) => (await q(
    `SELECT DATE_FORMAT(service_date, '%Y-%m-%d') AS d, invoice_status FROM location_monthly_services
     WHERE company_id = ? AND location_id = ? AND year = ? AND month = ?`, [company, loc, year, month]))[0] || null;
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Ovw A');
  const B = await mkCompany('Ovw B');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@ovw.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
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
  const locA = await mkLocation(A, `OvwLocA-${tag}`);
  const locA2 = await mkLocation(A, `OvwLocA2-${tag}`);
  const locB = await mkLocation(B, `OvwLocB-${tag}`);
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));
  const cAdminA = await login(adminA.email, pw);
  const cTechA = await login(techA.email, pw);
  const cViewerA = await login(viewerA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  const uuid = () => require('crypto').randomUUID();
  const OK = 'O.K.';
  const REPAIR = 'Potreban popravak - Dizalo u funkciji';
  const post = (cookie, body) => api('POST', '/api/rms-visits', { cookie, json: body });
  const visitsUrl = (loc, y, m) => `/api/rms-overview/visits?location_id=${loc}&year=${y}&month=${m}`;

  console.log('\n[new RMS -> overview row (same transaction)]');
  const rid = uuid();
  const v1 = await post(cTechA, { location_id: locA, visit_date: '2026-11-05', client_request_id: rid, items: [{ elevator_label: 'EL-1', status: OK }, { elevator_label: 'EL-2', status: REPAIR }] });
  check('POST -> 201', v1.status === 201 && v1.body?.id > 0, JSON.stringify(v1));
  let c = await cell(A, locA, 2026, 11);
  check('overview row exists, date 2026-11-05, not_invoiced', c?.d === '2026-11-05' && c?.invoice_status === 'not_invoiced', JSON.stringify(c));
  check('exactly one overview row for the month', await count('SELECT COUNT(*) c FROM location_monthly_services WHERE company_id = ? AND location_id = ? AND year = 2026 AND month = 11', [A, locA]) === 1);

  console.log('\n[replay of the same client_request_id changes nothing]');
  await api('PUT', '/api/rms-overview', { cookie: cAdminA, json: { location_id: locA, year: 2026, month: 11, service_date: '2026-11-03' } });
  await api('PATCH', '/api/rms-overview/invoice', { cookie: cAdminA, json: { location_id: locA, year: 2026, month: 11, invoice_status: 'invoiced' } });
  const rep = await post(cTechA, { location_id: locA, visit_date: '2026-11-05', client_request_id: rid, items: [{ elevator_label: 'EL-1', status: OK }] });
  check('replay -> 200 duplicate, same id', rep.status === 200 && rep.body?.duplicate === true && rep.body?.id === v1.body.id, JSON.stringify(rep));
  c = await cell(A, locA, 2026, 11);
  check('replay left the (manually edited) row untouched', c?.d === '2026-11-03' && c?.invoice_status === 'invoiced', JSON.stringify(c));
  check('replay created no second visit / row', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ? AND client_request_id = ?', [A, rid]) === 1
    && await count('SELECT COUNT(*) c FROM location_monthly_services WHERE company_id = ? AND location_id = ?', [A, locA]) === 1);

  console.log('\n[several RMS in one month -> LATEST effective date; invoice status untouched]');
  const v2 = await post(cTechA, { location_id: locA, visit_date: '2026-11-20', items: [{ elevator_label: 'EL-1', status: OK }] });
  c = await cell(A, locA, 2026, 11);
  check('later RMS (20th) -> shows 2026-11-20', v2.status === 201 && c?.d === '2026-11-20', JSON.stringify(c));
  check('invoice status of the month kept (invoiced)', c?.invoice_status === 'invoiced');
  const v3 = await post(cTechA, { location_id: locA, visit_date: '2026-11-10', items: [{ elevator_label: 'EL-1', status: OK }] });
  c = await cell(A, locA, 2026, 11);
  check('RMS created later but dated EARLIER (10th) does not lower the date', v3.status === 201 && c?.d === '2026-11-20', JSON.stringify(c));

  console.log('\n[rms_month beats visit_date]');
  const v4 = await post(cTechA, { location_id: locA, visit_date: '2026-11-06', rms_month: '2026-10-01', items: [{ elevator_label: 'EL-1', status: OK }] });
  check('POST with rms_month -> 201', v4.status === 201, JSON.stringify(v4));
  c = await cell(A, locA, 2026, 10);
  check('row goes to October with the rms_month date', c?.d === '2026-10-01' && c?.invoice_status === 'not_invoiced', JSON.stringify(c));
  c = await cell(A, locA, 2026, 11);
  check('November row unchanged (still 2026-11-20)', c?.d === '2026-11-20', JSON.stringify(c));
  const v5 = await post(cTechA, { location_id: locA2, visit_date: '2026-12-31T23:30:00', items: [{ elevator_label: 'EL-1', status: OK }] });
  check('other location gets its own row (no time zone drift at month end)', v5.status === 201 && (await cell(A, locA2, 2026, 12))?.d === '2026-12-31', JSON.stringify(await cell(A, locA2, 2026, 12)));

  console.log('\n[atomicity: failing overview sync rolls the RMS back]');
  const visitsBefore = await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]);
  const itemsBefore = await count('SELECT COUNT(*) c FROM rms_visit_items WHERE company_id = ?', [A]);
  await q('RENAME TABLE location_monthly_services TO lms_hidden_for_test');
  let broken;
  try {
    broken = await post(cTechA, { location_id: locA, visit_date: '2026-09-09', client_request_id: uuid(), items: [{ elevator_label: 'EL-1', status: OK }] });
  } finally {
    await q('RENAME TABLE lms_hidden_for_test TO location_monthly_services');
  }
  check('POST fails with 500 when the overview cannot be written', broken.status === 500, JSON.stringify(broken));
  check('no visit and no items were left behind (rolled back)', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]) === visitsBefore
    && await count('SELECT COUNT(*) c FROM rms_visit_items WHERE company_id = ?', [A]) === itemsBefore);
  const retry = await post(cTechA, { location_id: locA, visit_date: '2026-09-09', items: [{ elevator_label: 'EL-1', status: OK }] });
  check('the same RMS works once the table is back, with its overview row', retry.status === 201 && (await cell(A, locA, 2026, 9))?.d === '2026-09-09');

  console.log('\n[GET /api/rms-overview/visits]');
  const list = await api('GET', visitsUrl(locA, 2026, 11), { cookie: cAdminA });
  check('admin 200, 3 visits of November (the rms_month one is October)', list.status === 200 && list.body.length === 3, JSON.stringify(list.body));
  const ids = (list.body || []).map((x) => x.id);
  check('newest effective date first (20th, 10th, 5th)', JSON.stringify(ids) === JSON.stringify([v2.body.id, v3.body.id, v1.body.id]), JSON.stringify(ids));
  const first = list.body?.[0] || {};
  check('fields: id, visit_date, rms_month, effective_date, technician_name, counts, signature_state', first.id === v2.body.id && first.visit_date === '2026-11-20' && first.rms_month === null
    && first.effective_date === '2026-11-20' && first.technician_name === techA.username && first.item_count === 1 && first.repair_count === 0 && first.signature_state === 'unsigned', JSON.stringify(first));
  const last = list.body?.[2] || {};
  check('repair count = elevators with a repair status (1 of 2)', last.id === v1.body.id && last.item_count === 2 && last.repair_count === 1, JSON.stringify(last));
  const oct = await api('GET', visitsUrl(locA, 2026, 10), { cookie: cAdminA });
  check('rms_month visit is listed under October (effective date), with its real visit_date', oct.status === 200 && oct.body.length === 1 && oct.body[0].id === v4.body.id
    && oct.body[0].effective_date === '2026-10-01' && oct.body[0].visit_date === '2026-11-06' && oct.body[0].rms_month === '2026-10-01', JSON.stringify(oct.body));
  const empty = await api('GET', visitsUrl(locA, 2026, 3), { cookie: cAdminA });
  check('month without RMS -> 200 []', empty.status === 200 && Array.isArray(empty.body) && empty.body.length === 0);
  check('technician may read', (await api('GET', visitsUrl(locA, 2026, 11), { cookie: cTechA })).status === 200);
  const viewerList = await api('GET', visitsUrl(locA, 2026, 11), { cookie: cViewerA });
  check('viewer may read (3 visits)', viewerList.status === 200 && viewerList.body.length === 3, `got ${viewerList.status}`);
  check('anonymous -> 401', (await api('GET', visitsUrl(locA, 2026, 11))).status === 401);
  const crossLoc = await api('GET', visitsUrl(locA, 2026, 11), { cookie: cAdminB });
  check('company B cannot read A\'s visits (location of another company) -> 404, no data', crossLoc.status === 404 && !Array.isArray(crossLoc.body), JSON.stringify(crossLoc));
  const ownB = await api('GET', visitsUrl(locB, 2026, 11), { cookie: cAdminB });
  check('company B own location -> 200 []', ownB.status === 200 && ownB.body.length === 0, JSON.stringify(ownB));
  const bv = await post(cAdminB, { location_id: locB, visit_date: '2026-11-15', items: [{ elevator_label: 'EL-B', status: OK }] });
  const ownB2 = await api('GET', visitsUrl(locB, 2026, 11), { cookie: cAdminB });
  check('B sees only its own visit', bv.status === 201 && ownB2.body.length === 1 && ownB2.body[0].id === bv.body.id);
  check('A cannot read B\'s location -> 404', (await api('GET', visitsUrl(locB, 2026, 11), { cookie: cAdminA })).status === 404);
  check('unknown location -> 404', (await api('GET', visitsUrl(999999999, 2026, 11), { cookie: cAdminA })).status === 404);
  check('month 13 -> 400', (await api('GET', visitsUrl(locA, 2026, 13), { cookie: cAdminA })).status === 400);
  check('missing location_id -> 400', (await api('GET', '/api/rms-overview/visits?year=2026&month=11', { cookie: cAdminA })).status === 400);
  check('SQL-ish month -> 400', (await api('GET', `/api/rms-overview/visits?location_id=${locA}&year=2026&month=1%20OR%201=1`, { cookie: cAdminA })).status === 400);
  const ovA = await api('GET', '/api/rms-overview?year=2026', { cookie: cViewerA });
  const rowA = ovA.body.find((r) => r.location_id === locA);
  check('overview grid (viewer) still lists the cells', ovA.status === 200 && rowA?.months?.['11']?.service_date?.startsWith('2026-11-20') && rowA?.months?.['10']?.service_date?.startsWith('2026-10-01'), JSON.stringify(rowA?.months?.['11']));
  check('overview grid of B does not contain A\'s locations', !(await api('GET', '/api/rms-overview?year=2026', { cookie: cAdminB })).body.some((r) => r.location_id === locA));

  console.log('\n[backfill migration]');
  const sqlFile = fs.readdirSync(path.join(BACKEND, 'migrations')).find((f) => /_backfill_rms_overview\.sql$/.test(f));
  check('migration file exists and is dated >= 20261119', Boolean(sqlFile) && Number(sqlFile.slice(0, 8)) >= 20261119, String(sqlFile));
  const migrationSql = fs.readFileSync(path.join(BACKEND, 'migrations', sqlFile), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
  const mkVisit = async (companyId, loc, visitDate, rmsMonth = null) => (await q(
    'INSERT INTO rms_visits (location_id, user_id, visit_date, rms_month, company_id) VALUES (?, ?, ?, ?, ?)', [loc, techA.id, visitDate, rmsMonth, companyId])).insertId;
  // old RMS that never reached the overview: two in Jan 2025 (latest 2025-01-22), one in Feb 2025 via rms_month, one in a month with a manual row
  await mkVisit(A, locA, '2025-01-08 09:00:00');
  await mkVisit(A, locA, '2025-01-22 14:00:00');
  await mkVisit(A, locA, '2025-03-30 10:00:00', '2025-02-15');
  await mkVisit(A, locA, '2025-04-02 10:00:00');
  await q('INSERT INTO location_monthly_services (company_id, location_id, year, month, service_date, invoice_status) VALUES (?, ?, 2025, 4, ?, ?)', [A, locA, '2025-04-28', 'invoiced']);
  await mkVisit(B, locB, '2025-01-12 09:00:00');
  const [orphan] = await db.query('INSERT INTO rms_visits (location_id, user_id, visit_date, company_id) VALUES (?, ?, ?, ?)', [987654, techA.id, '2025-05-05 09:00:00', A]);
  const totalBefore = await count('SELECT COUNT(*) c FROM location_monthly_services', []);
  const run1 = (await db.query(migrationSql))[0];
  check('run 1 inserted 3 rows (A Jan, A Feb, B Jan)', run1.affectedRows === 3, `affected ${run1.affectedRows}`);
  c = await cell(A, locA, 2025, 1);
  check('Jan 2025: latest effective date, not_invoiced', c?.d === '2025-01-22' && c?.invoice_status === 'not_invoiced', JSON.stringify(c));
  c = await cell(A, locA, 2025, 2);
  check('Feb 2025: rms_month date (visit_date was in March)', c?.d === '2025-02-15', JSON.stringify(c));
  check('March 2025 got no row (visit was attributed to February)', (await cell(A, locA, 2025, 3)) === null);
  c = await cell(A, locA, 2025, 4);
  check('existing/manual April row NOT overwritten (28th, invoiced)', c?.d === '2025-04-28' && c?.invoice_status === 'invoiced', JSON.stringify(c));
  check('company B visit went to company B only', (await cell(B, locB, 2025, 1))?.d === '2025-01-12' && (await cell(A, locB, 2025, 1)) === null);
  check('visit of a deleted/unknown location skipped', await count('SELECT COUNT(*) c FROM location_monthly_services WHERE location_id = 987654', []) === 0);
  check('rows from the earlier tests untouched', (await cell(A, locA, 2026, 11))?.d === '2026-11-20' && (await cell(A, locA, 2026, 11))?.invoice_status === 'invoiced');
  const run2 = (await db.query(migrationSql))[0];
  check('run 2 (re-run) inserts nothing', run2.affectedRows === 0, `affected ${run2.affectedRows}`);
  check('row count = before + 3', await count('SELECT COUNT(*) c FROM location_monthly_services', []) === totalBefore + 3);
  // an admin removes the Jan date by hand; the backfill would bring it back only because the row is gone - document the behaviour
  await api('DELETE', '/api/rms-overview', { cookie: cAdminA, json: { location_id: locA, year: 2025, month: 1 } });
  await db.query(migrationSql);
  check('(documented) a manually removed month is re-created by a later backfill run', (await cell(A, locA, 2025, 1))?.d === '2025-01-22');
  void orphan;

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
