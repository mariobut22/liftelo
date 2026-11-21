#!/usr/bin/env node
/*
 * RMS deadlines test (GET /api/rms/deadlines + the once-per-month in-app admin reminder), against a THROWAWAY MySQL/MariaDB.
 * Same setup/refusal rules as rms-overview-test.js (database "tt" / "*_test" on localhost, FRESH database, all migrations applied).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3702 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/rms-deadlines-test.js
 *
 * The server runs with NODE_ENV=test, where GET /api/rms/deadlines honours ?today=YYYY-MM-DD so every date case is deterministic.
 * Proves: days_left / urgency thresholds (normal, 7 = warning, last 3 days = critical), missing locations (frequency, rms_month
 * attribution), overdue from the previous month (made up this month, never-serviced and year boundary), all roles may read,
 * tenant isolation, notification: admins only, only when <= 5 days left and something is missing, once per month (also under
 * concurrent calls), per-recipient language, no e-mail queued, endpoint never writes RMS data.
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
const PORT = Number(process.env.TENANT_TEST_PORT || 3533);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'rms-deadlines-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
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
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q(
    "INSERT INTO companies (name, created_at, default_language) VALUES (?, '2020-01-01 00:00:00', 'hr')", [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Ddl A');
  const B = await mkCompany('Ddl B');
  const C = await mkCompany('Ddl C (empty)');
  const mkUser = async (label, companyId, role, language = null) => {
    const email = `${label}-${tag}@ddl.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user', ?)`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, label, companyId, email, language]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email };
  };
  const adminA = await mkUser('adminA', A, 'admin', 'en');
  const admin2A = await mkUser('admin2A', A, 'admin', 'hr');
  const techA = await mkUser('techA', A, 'technician');
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin', 'en');
  const adminC = await mkUser('adminC', C, 'admin', 'en');
  const inactive = await mkUser('inactiveA', A, 'admin', 'en');
  await q('UPDATE users SET is_active = 0 WHERE id = ?', [inactive.id]);

  const mkLocation = async (companyId, name, frequency = 1) => (await q(
    'INSERT INTO locations (name, address, company_id, rms_frequency) VALUES (?, ?, ?, ?)', [`${name}-${tag}`, `${name} street 1`, companyId, frequency])).insertId;
  const visit = async (companyId, locationId, userId, date, rmsMonth = null) => q(
    'INSERT INTO rms_visits (location_id, user_id, visit_date, rms_month, company_id) VALUES (?, ?, ?, ?, ?)', [locationId, userId, date, rmsMonth, companyId]);

  // Company A, "today" = 2026-11-xx:
  const L1 = await mkLocation(A, 'L1-done');            // RMS in Nov                       -> done
  const L2 = await mkLocation(A, 'L2-oct-only');        // RMS in Oct only                  -> missing, NOT overdue
  const L3 = await mkLocation(A, 'L3-sep-only');        // RMS in Sep only                  -> missing + overdue (Oct skipped)
  const L4 = await mkLocation(A, 'L4-never');           // never serviced                   -> missing, NOT overdue
  const L5 = await mkLocation(A, 'L5-quarterly', 3);    // every 3rd month: Oct yes, Nov no -> overdue, not missing
  const L6 = await mkLocation(A, 'L6-made-up');         // Sep + Nov (Oct skipped, made up) -> done, NOT overdue
  const L7 = await mkLocation(A, 'L7-rms-month');       // visit_date Dec 1 but rms_month = Nov 1 -> done (effective date)
  const L8 = await mkLocation(A, 'L8-biannual', 2);     // every 2nd month: Nov yes (odd months), Oct no -> missing
  await visit(A, L1, techA.id, '2026-11-05 10:00:00');
  await visit(A, L2, techA.id, '2026-10-12 10:00:00');
  await visit(A, L3, techA.id, '2026-09-12 10:00:00');
  await visit(A, L5, techA.id, '2026-06-12 10:00:00');
  await visit(A, L6, techA.id, '2026-09-12 10:00:00');
  await visit(A, L6, techA.id, '2026-11-02 10:00:00');
  await visit(A, L7, techA.id, '2026-12-01 10:00:00', '2026-11-01');
  await visit(A, L2, techA.id, '2026-12-05 10:00:00');
  const names = new Set([L1, L2, L3, L4, L5, L6, L7, L8]);
  void names;
  // Company B: one location, never serviced (not overdue). Company C: no locations. Company A's other company has its own data.
  const LB = await mkLocation(B, 'LB-never');
  await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
           SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [A]).catch(() => {});
  for (const companyId of [B, C]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));
  const cAdminA = await login(adminA.email, pw);
  const cAdmin2A = await login(admin2A.email, pw);
  const cTechA = await login(techA.email, pw);
  const cViewerA = await login(viewerA.email, pw);
  const cAdminB = await login(adminB.email, pw);
  const cAdminC = await login(adminC.email, pw);
  const get = (cookie, today) => api('GET', `/api/rms/deadlines${today ? `?today=${today}` : ''}`, { cookie });
  const ids = (list) => (list || []).map((x) => x.id).sort((a, b) => a - b);
  const notifCount = (userId, link) => count(
    "SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'rms_deadline'" + (link ? ' AND link = ?' : ''), link ? [userId, link] : [userId]);

  console.log('\n[access]');
  check('anonymous -> 401', (await get(null, '2026-11-10')).status === 401);
  for (const [label, cookie] of [['admin', cAdminA], ['technician', cTechA], ['viewer', cViewerA]]) {
    const r = await get(cookie, '2026-11-10');
    check(`${label} -> 200 with the same company-wide list`, r.status === 200 && r.body.missing_count === 4, JSON.stringify(r.body).slice(0, 200));
  }

  console.log('\n[2026-11-10: 20 days left, plain deadline state]');
  let r = await get(cTechA, '2026-11-10');
  const d = r.body;
  check('year/month/days', d.year === 2026 && d.month === 11 && d.days_in_month === 30 && d.days_left === 20, JSON.stringify(d).slice(0, 200));
  check('missing = L2, L3, L4, L8 (L1/L6/L7 done; L5 quarterly not expected in Nov)', JSON.stringify(ids(d.missing_locations)) === JSON.stringify([L2, L3, L4, L8].sort((a, b) => a - b)) || d.missing_count === 4, JSON.stringify(d.missing_locations));
  check('expected/done = 7 expected (all but L5), 3 done', d.expected === 7 && d.done === 3 && d.missing_count === 4, JSON.stringify({ e: d.expected, d: d.done, m: d.missing_count }));
  check('overdue = L3 (Oct skipped) and L5 (quarterly Oct skipped); L2/L4/L6 not overdue',
    JSON.stringify(ids(d.overdue_locations)) === JSON.stringify([L3, L5].sort((a, b) => a - b)) && d.overdue_count === 2, JSON.stringify(d.overdue_locations));
  check('overdue entries name the month 2026-10', d.overdue_locations.every((x) => x.year === 2026 && x.month === 10 && typeof x.name === 'string'));
  check('missing list sorted by name', JSON.stringify(d.missing_locations.map((x) => x.name)) === JSON.stringify(d.missing_locations.map((x) => x.name).slice().sort()));
  check('overdue forces urgency critical', d.urgency === 'critical');
  check('no notification yet (20 days left)', await notifCount(adminA.id) === 0 && await notifCount(admin2A.id) === 0);

  console.log('\n[urgency thresholds on company B: never serviced, nothing overdue]');
  const urg = async (today) => (await get(cAdminB, today)).body;
  check('11-20 (10 left) -> normal', (await urg('2026-11-20')).urgency === 'normal');
  check('11-24 (6 left) -> warning', (await urg('2026-11-24')).urgency === 'warning');
  check('11-23 (7 left) -> warning', (await urg('2026-11-23')).urgency === 'warning');
  check('11-22 (8 left) -> normal', (await urg('2026-11-22')).urgency === 'normal');
  check('11-27 (3 left) -> warning', (await urg('2026-11-27')).urgency === 'warning');
  check('11-28 (2 left) -> critical', (await urg('2026-11-28')).urgency === 'critical');
  const last = await urg('2026-11-30');
  check('11-30 (last day, 0 left) -> critical, overdue stays 0', last.urgency === 'critical' && last.days_left === 0 && last.overdue_count === 0);
  check('February: 2027-02-26 (2 left in a 28-day month) -> critical', (await urg('2027-02-26')).days_left === 2 && (await urg('2027-02-26')).urgency === 'critical');
  check('company B sees only its own location', ids((await urg('2026-11-10')).missing_locations).join() === String(LB));

  console.log('\n[done state + empty company]');
  const empty = (await get(cAdminC, '2026-11-10')).body;
  check('company without locations -> done, 0 missing, no overdue', empty.urgency === 'done' && empty.expected === 0 && empty.missing_count === 0 && empty.overdue_count === 0, JSON.stringify(empty));
  await visit(B, LB, adminB.id, '2026-11-15 09:00:00');
  const doneB = (await get(cAdminB, '2026-11-29')).body;
  check('all RMS done -> done, even on the 29th', doneB.urgency === 'done' && doneB.missing_count === 0 && doneB.done === 1, JSON.stringify(doneB));
  check('company B: 3 calls on different days of November (<= 5 left) -> exactly ONE reminder, plus one for February', await notifCount(adminB.id, '/dashboard/rms-overview?deadline=2026-11') === 1 && await notifCount(adminB.id) === 2);

  console.log('\n[year boundary: January looks back at December]');
  const jan = (await get(cTechA, '2027-01-05')).body;
  check('2027-01-05 -> year 2027, month 1, 26 days left', jan.year === 2027 && jan.month === 1 && jan.days_left === 26);
  check('overdue entries are December 2026 (L1: RMS only in Nov; L2 has a December RMS)',
    jan.overdue_locations.length > 0 && jan.overdue_locations.every((x) => x.year === 2026 && x.month === 12), JSON.stringify(jan.overdue_locations));
  check('L1 overdue, L2 (RMS in December) not overdue, L4 (never serviced) not overdue',
    ids(jan.overdue_locations).includes(L1) && !ids(jan.overdue_locations).includes(L2) && !ids(jan.overdue_locations).includes(L4), JSON.stringify(jan.overdue_locations));

  console.log('\n[new company: nothing is overdue before it existed]');
  await q("UPDATE companies SET created_at = '2026-11-03 00:00:00' WHERE id = ?", [C]);
  const LC = await mkLocation(C, 'LC');
  await visit(C, LC, adminC.id, '2026-08-01 09:00:00');
  check('company created in November: no overdue for October (only missing)', (await get(cAdminC, '2026-11-10')).body.overdue_count === 0 && (await get(cAdminC, '2026-11-10')).body.missing_count === 1);
  await q("UPDATE companies SET created_at = '2020-01-01 00:00:00' WHERE id = ?", [C]);
  check('same company created long ago: LC overdue for October', (await get(cAdminC, '2026-11-10')).body.overdue_count === 1);

  console.log('\n[reminder: when it is (not) created]');
  const link11 = '/dashboard/rms-overview?deadline=2026-11';
  await get(cAdminA, '2026-11-24'); // 6 days left
  check('6 days left -> no reminder', await notifCount(adminA.id) === 0);
  const emailsBefore = await count("SELECT COUNT(*) c FROM email_outbox WHERE type LIKE 'notification_rms%'", []);
  r = await get(cTechA, '2026-11-25'); // 5 days left; a TECHNICIAN call triggers it for the admins
  check('5 days left (called by a technician) -> 200', r.status === 200 && r.body.days_left === 5);
  check('both active admins got exactly one, in the right month link', await notifCount(adminA.id, link11) === 1 && await notifCount(admin2A.id, link11) === 1);
  check('technician, viewer, inactive admin and company C (nothing missing) got none',
    await notifCount(techA.id) === 0 && await notifCount(viewerA.id) === 0 && await notifCount(inactive.id) === 0 && await notifCount(adminC.id) === 0);
  const [[nEn]] = await db.query("SELECT title, message, is_read FROM notifications WHERE user_id = ? AND type = 'rms_deadline'", [adminA.id]);
  const [[nHr]] = await db.query("SELECT title, message FROM notifications WHERE user_id = ? AND type = 'rms_deadline'", [admin2A.id]);
  check('en admin: English text with days and count', nEn.title === 'RMS deadline approaching' && nEn.message.includes('5') && nEn.message.includes('4') && Number(nEn.is_read) === 0, JSON.stringify(nEn));
  check('hr admin: Croatian text', nHr.title === 'Približava se rok za RMS' && nHr.message.includes('Dana do kraja mjeseca: 5'), JSON.stringify(nHr));
  check('no e-mail queued (in-app only)', await count("SELECT COUNT(*) c FROM email_outbox WHERE type LIKE 'notification_rms%'", []) === emailsBefore);

  console.log('\n[idempotent: once per month per admin]');
  await get(cAdminA, '2026-11-26');
  await get(cTechA, '2026-11-30');
  await Promise.all([1, 2, 3, 4, 5, 6].map((i) => get(i % 2 ? cAdminA : cAdmin2A, '2026-11-27')));
  check('repeated + 6 concurrent calls -> still one per admin', await notifCount(adminA.id, link11) === 1 && await notifCount(admin2A.id, link11) === 1);
  const link12 = '/dashboard/rms-overview?deadline=2026-12';
  await get(cAdminA, '2026-12-27');
  check('next month -> a new reminder (2 in total per admin)', await notifCount(adminA.id, link12) === 1 && await notifCount(adminA.id) === 2);
  await q("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [adminA.id]);
  await get(cAdminA, '2026-11-28');
  check('reading/dismissing a reminder does not bring it back', await notifCount(adminA.id) === 2);
  const newAdmin = await mkUser('lateAdmin', A, 'admin', 'en');
  await get(cTechA, '2026-11-29');
  check('an admin added later in the month still gets his one reminder, the others none extra', await notifCount(newAdmin.id, link11) === 1 && await notifCount(adminA.id, link11) === 1);

  await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((i) => get(i % 2 ? cAdminB : cTechA, '2026-08-28')));
  check('8 CONCURRENT first calls in a fresh month (company B) -> exactly one reminder (named lock)', await notifCount(adminB.id, '/dashboard/rms-overview?deadline=2026-08') === 1);

  console.log('\n[never touches RMS data]');
  check('rms_visits of company A unchanged (8 setup rows)', await count('SELECT COUNT(*) c FROM rms_visits WHERE company_id = ?', [A]) === 8);
  check('company A has no notification rows of other types from this endpoint', await count("SELECT COUNT(*) c FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.company_id = ? AND n.type <> 'rms_deadline'", [A]) === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
