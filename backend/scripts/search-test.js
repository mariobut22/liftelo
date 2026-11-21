#!/usr/bin/env node
/*
 * Global search test (GET /api/search), against a THROWAWAY MySQL/MariaDB.
 * Same setup/refusal rules as rms-overview-test.js (database "tt" / "*_test" on localhost, FRESH database, all migrations applied).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3573 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   TENANT_TEST_PORT=3574 node backend/scripts/search-test.js
 *
 * Proves: min length 2, limit 5 per type, matching of locations (name, address), elevators (label, serial), vehicles (admin only),
 * RMS / interventions / work orders (location name, id), literal LIKE wildcards (% and _ do not act as wildcards), injection
 * strings are harmless, all roles may search, anonymous gets 401, and company B never sees company A's rows (and vice versa).
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
const PORT = Number(process.env.TENANT_TEST_PORT || 3574);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'search-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
async function api(method, url, { cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
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

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Srch A');
  const B = await mkCompany('Srch B');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@srch.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, label, companyId, email]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const techA = await mkUser('techA', A, 'technician');
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin');
  const techB = await mkUser('techB', B, 'technician');
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }

  const Z = `Zeta${tag}`; // the word both companies use, so a leak would show up
  const mkLocation = async (companyId, name, address) => (await q(
    'INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [name, address, companyId])).insertId;
  const locA = await mkLocation(A, `${Z} Tower A`, 'Ilica 1');
  const locA2 = await mkLocation(A, `Other A ${tag}`, `Harbour road ${Z}`);
  const locB = await mkLocation(B, `${Z} Tower B`, 'Ilica 2');
  const locPct = await mkLocation(A, `Promo 50%_off ${tag}`, 'Pct street');
  const locDigits = await mkLocation(A, `Digits 500 ${tag}`, 'Digit street');
  const manyA = [];
  for (let i = 0; i < 7; i++) manyA.push(await mkLocation(A, `Many${tag} ${i}`, 'Bulk street'));

  const mkElevator = async (companyId, locationId, label, serial) => (await q(
    'INSERT INTO elevators (company_id, location_id, label, serial_number) VALUES (?, ?, ?, ?)', [companyId, locationId, label, serial])).insertId;
  const elA = await mkElevator(A, locA, `EL-${Z}-A`, `SN-${Z}-A`);
  const elB = await mkElevator(B, locB, `EL-${Z}-B`, `SN-${Z}-B`);
  const mkVehicle = async (companyId, name) => (await q(
    'INSERT INTO vehicles (company_id, name, year, last_registration_date, registration_expiry_date) VALUES (?, ?, 2020, CURDATE(), CURDATE())', [companyId, name])).insertId;
  const vehA = await mkVehicle(A, `Van ZG-${Z}-AA`);
  const vehB = await mkVehicle(B, `Van ZG-${Z}-BB`);
  const mkRms = async (companyId, locationId) => (await q(
    'INSERT INTO rms_visits (company_id, location_id, visit_date) VALUES (?, ?, NOW())', [companyId, locationId])).insertId;
  const rmsA = await mkRms(A, locA);
  const rmsB = await mkRms(B, locB);
  const mkIntervention = async (companyId, locationId) => (await q(
    'INSERT INTO interventions (company_id, location_id, date, technician) VALUES (?, ?, NOW(), ?)', [companyId, locationId, 'x'])).insertId;
  const intA = await mkIntervention(A, locA);
  const intB = await mkIntervention(B, locB);
  const mkWo = async (companyId, locationId) => (await q(
    'INSERT INTO work_orders (company_id, location_id) VALUES (?, ?)', [companyId, locationId])).insertId;
  const woA = await mkWo(A, locA);
  const woB = await mkWo(B, locB);

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));
  const cAdminA = await login(adminA.email, pw);
  const cTechA = await login(techA.email, pw);
  const cViewerA = await login(viewerA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  const cTechB = await login(techB.email, pw);
  const search = (cookie, term) => api('GET', `/api/search?q=${encodeURIComponent(term)}`, { cookie });
  const ids = (list) => (list || []).map((x) => x.id);

  console.log('\n[validation]');
  check('anonymous -> 401', (await search(undefined, Z)).status === 401);
  const none = await search(cAdminA, '');
  check('no q -> 200 with empty groups', none.status === 200 && Object.values(none.body).filter(Array.isArray).every((l) => l.length === 0), JSON.stringify(none));
  const one = await search(cAdminA, 'Z');
  check('1 character -> empty (min length 2)', one.status === 200 && ids(one.body.locations).length === 0 && ids(one.body.elevators).length === 0, JSON.stringify(one.body));
  const ws = await search(cAdminA, '   ');
  check('whitespace only -> empty', ws.status === 200 && ids(ws.body.locations).length === 0);
  const long = await api('GET', `/api/search?q=${'a'.repeat(5000)}`, { cookie: cAdminA });
  check('very long q -> 200 (truncated, no error)', long.status === 200);
  const arr = await api('GET', '/api/search?q=aa&q=bb', { cookie: cAdminA });
  check('q given twice (array) -> 200 empty, no crash', arr.status === 200 && ids(arr.body.locations).length === 0, JSON.stringify(arr));

  console.log('\n[company A finds its own data by every field]');
  const r = await search(cAdminA, Z);
  check('200', r.status === 200, JSON.stringify(r));
  check('locations: by name AND by address (2 of A)', JSON.stringify(ids(r.body.locations).sort()) === JSON.stringify([locA, locA2].sort()), JSON.stringify(r.body.locations));
  check('location fields: id, name, address', r.body.locations.every((l) => l.id && l.name && l.address));
  check('elevators: label/serial match, location name present', JSON.stringify(ids(r.body.elevators)) === JSON.stringify([elA]) && r.body.elevators[0].location_id === locA && r.body.elevators[0].location_name === `${Z} Tower A`, JSON.stringify(r.body.elevators));
  check('vehicles (admin): own vehicle', JSON.stringify(ids(r.body.vehicles)) === JSON.stringify([vehA]), JSON.stringify(r.body.vehicles));
  check('rms/interventions/work orders matched through the location name', ids(r.body.rms).includes(rmsA) && ids(r.body.interventions).includes(intA) && ids(r.body.work_orders).includes(woA));
  const bySerial = await search(cAdminA, `SN-${Z}`);
  check('elevator found by serial number only', ids(bySerial.body.elevators).includes(elA) && ids(bySerial.body.locations).length === 0);
  const byAddr = await search(cAdminA, 'Harbour road');
  check('location found by address only', JSON.stringify(ids(byAddr.body.locations)) === JSON.stringify([locA2]));
  const byLower = await search(cAdminA, Z.toLowerCase());
  check('case-insensitive', ids(byLower.body.locations).includes(locA));
  const byId = await search(cAdminA, `#${rmsA}`);
  check('"#<id>" finds the RMS by number', ids(byId.body.rms).includes(rmsA), JSON.stringify(byId.body.rms));
  const byIdWo = await search(cAdminA, String(woA).padStart(2, '0'));
  check('numeric input does not crash (padded id)', byIdWo.status === 200);

  console.log('\n[limit 5 per type]');
  const many = await search(cAdminA, `Many${tag}`);
  check('7 matching locations -> 5 returned', many.status === 200 && many.body.locations.length === 5, JSON.stringify(ids(many.body.locations)));

  console.log('\n[LIKE wildcards are literal]');
  const pct = await search(cAdminA, '50%_off');
  check('"50%_off" finds the location that really contains it', JSON.stringify(ids(pct.body.locations)) === JSON.stringify([locPct]), JSON.stringify(pct.body.locations));
  const wild = await search(cAdminA, '5_0');
  check('"5_0" does NOT match "500" (underscore is not a wildcard)', !ids(wild.body.locations).includes(locDigits), JSON.stringify(wild.body.locations));
  const wild2 = await search(cAdminA, '5%0');
  check('"5%0" does NOT match "500" (percent is not a wildcard)', !ids(wild2.body.locations).includes(locDigits));
  const plain = await search(cAdminA, `Digits 500 ${tag}`);
  check('control: the real name "Digits 500" matches', ids(plain.body.locations).includes(locDigits));
  const allPct = await search(cAdminA, '%%');
  check('"%%" matches nothing (not "everything")', allPct.status === 200 && ids(allPct.body.locations).length === 0, JSON.stringify(allPct.body.locations));
  const bang = await search(cAdminA, '!!');
  check('"!!" (the escape character) is handled', bang.status === 200 && ids(bang.body.locations).length === 0);

  console.log('\n[injection strings are plain text]');
  for (const evil of ["' OR '1'='1", "'; DROP TABLE locations; --", '\\', "\\' OR 1=1 -- "]) {
    const e = await search(cAdminA, evil);
    check(`${JSON.stringify(evil)} -> 200, nothing returned`, e.status === 200 && ids(e.body.locations).length === 0 && ids(e.body.elevators).length === 0 && ids(e.body.rms).length === 0, JSON.stringify(e));
  }
  check('locations table still intact after the attempts', Number((await q('SELECT COUNT(*) c FROM locations WHERE company_id = ?', [A]))[0].c) === 11);

  console.log('\n[roles]');
  const tech = await search(cTechA, Z);
  check('technician: 200, same locations/elevators/rms/interventions/work orders', tech.status === 200 && ids(tech.body.locations).length === 2 && ids(tech.body.elevators).length === 1
    && ids(tech.body.rms).includes(rmsA) && ids(tech.body.interventions).includes(intA) && ids(tech.body.work_orders).includes(woA));
  check('technician: NO vehicles (vehicles page is admin-only)', Array.isArray(tech.body.vehicles) && tech.body.vehicles.length === 0, JSON.stringify(tech.body.vehicles));
  const viewer = await search(cViewerA, Z);
  check('viewer: 200 with locations, NO vehicles', viewer.status === 200 && ids(viewer.body.locations).length === 2 && viewer.body.vehicles.length === 0);

  console.log('\n[tenant isolation]');
  const rb = await search(cAdminB, Z);
  check('B finds only its own location', JSON.stringify(ids(rb.body.locations)) === JSON.stringify([locB]), JSON.stringify(rb.body.locations));
  check('B finds only its own elevator', JSON.stringify(ids(rb.body.elevators)) === JSON.stringify([elB]), JSON.stringify(rb.body.elevators));
  check('B finds only its own vehicle', JSON.stringify(ids(rb.body.vehicles)) === JSON.stringify([vehB]), JSON.stringify(rb.body.vehicles));
  check('B sees only its own RMS / intervention / work order', JSON.stringify(ids(rb.body.rms)) === JSON.stringify([rmsB]) && JSON.stringify(ids(rb.body.interventions)) === JSON.stringify([intB])
    && JSON.stringify(ids(rb.body.work_orders)) === JSON.stringify([woB]), JSON.stringify(rb.body));
  const bText = JSON.stringify(rb.body);
  check('no A data anywhere in B\'s response (names, ids)', !bText.includes('Tower A') && !bText.includes('Ilica 1') && !bText.includes(`EL-${Z}-A`) && !bText.includes(`-AA`) && !bText.includes('Harbour'));
  const aText = JSON.stringify(r.body);
  check('no B data anywhere in A\'s response', !aText.includes('Tower B') && !aText.includes('Ilica 2') && !aText.includes(`EL-${Z}-B`) && !aText.includes('-BB'));
  const bById = await search(cAdminB, `#${rmsA}`);
  check('B searching the NUMBER of A\'s RMS finds nothing of A', !ids(bById.body.rms).includes(rmsA), JSON.stringify(bById.body.rms));
  const bIntId = await search(cAdminB, `#${intA}`);
  check('B searching the number of A\'s intervention / work order finds nothing of A', !ids(bIntId.body.interventions).includes(intA) && !ids(bIntId.body.work_orders).includes(woA));
  const bTech = await search(cTechB, `Many${tag}`);
  check('B technician cannot find A\'s locations', bTech.status === 200 && bTech.body.locations.length === 0);
  const bAddr = await search(cAdminB, 'Harbour road');
  check('B cannot find A\'s location by address', bAddr.body.locations.length === 0);
  // an elevator row of A attached to a location of B (bad data) must not surface through either company
  const crossEl = await mkElevator(A, locB, `Cross${tag}`, null);
  const crossA = await search(cAdminA, `Cross${tag}`);
  const crossB = await search(cAdminB, `Cross${tag}`);
  check('an elevator whose location belongs to another company is returned to NEITHER (join also checks company_id)', !ids(crossA.body.elevators).includes(crossEl) && !ids(crossB.body.elevators).includes(crossEl),
    JSON.stringify([crossA.body.elevators, crossB.body.elevators]));

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
