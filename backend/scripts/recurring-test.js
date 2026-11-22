#!/usr/bin/env node
/*
 * Recurring work orders test (templates, lazy idempotent generation, isolation), against a THROWAWAY MySQL/MariaDB (lib/wo-test-lib.js).
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3471 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt node backend/scripts/recurring-test.js
 * Proves: occurrence maths (clamped month end, quarterly/semiannual/yearly, end date); admin-only API; validation + tenant checks;
 * generation of a due occurrence as a NORMAL work order (item, elevator, assignee, notification); concurrent callers (direct
 * function + HTTP) create each occurrence exactly once (UNIQUE recurrence_id+due_date); paused = nothing; resumed = generated;
 * end date; deleting a template keeps generated work orders; company B is never touched.
 */
'use strict';
const lib = require('./lib/wo-test-lib')('recur', 3872);
const { api, check, db } = lib;
const rec = require('../utils/workOrderRecurrence');

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

async function main() {
  console.log('-- occurrence maths');
  check('monthly clamps 31 Jan to 28 Feb', rec.occurrenceAt('2027-01-31', 'monthly', 1) === '2027-02-28');
  check('monthly back to 31 Mar', rec.occurrenceAt('2027-01-31', 'monthly', 2) === '2027-03-31');
  check('leap year 29 Feb', rec.occurrenceAt('2028-01-31', 'monthly', 1) === '2028-02-29');
  check('quarterly', rec.occurrenceAt('2026-11-15', 'quarterly', 1) === '2027-02-15');
  check('semiannual', rec.occurrenceAt('2026-11-15', 'semiannual', 1) === '2027-05-15');
  check('yearly', rec.occurrenceAt('2026-11-15', 'yearly', 2) === '2028-11-15');
  check('occurrencesBetween honours end date', JSON.stringify(rec.occurrencesBetween({ frequency: 'monthly', start_date: '2027-01-10', end_date: '2027-03-10' }, '2027-01-01', '2027-12-31')) === '["2027-01-10","2027-02-10","2027-03-10"]');
  check('nextOccurrence null after end date', rec.nextOccurrence({ frequency: 'monthly', start_date: '2020-01-10', end_date: '2020-03-10' }, '2021-01-01') === null);

  const w = await lib.world();
  const { q, A, B, cookies: c, u } = w;
  const loc = await w.mkLocation(A, 'RecLoc');
  const locB = await w.mkLocation(B, 'RecLocB');
  const el = await w.mkElevator(A, loc, 'Lift R');
  const elB = await w.mkElevator(B, locB, 'Lift RB');
  const woCount = async (company) => Number((await q('SELECT COUNT(*) AS c FROM work_orders WHERE company_id = ?', [company]))[0].c);
  const runCount = async (rid) => Number((await q('SELECT COUNT(*) AS c FROM work_order_recurrence_runs WHERE recurrence_id = ?', [rid]))[0].c);
  const base = { location_id: loc, elevator_id: el, description: 'Quarterly safety check', general_comment: 'Bring keys', frequency: 'monthly', assigned_user_id: u.techA.id };

  console.log('-- API permissions and validation');
  const n0 = await woCount(A);
  for (const [who, st] of [['techA', 403], ['viewerA', 403]]) {
    const r = await api('POST', '/api/work-order-recurrences', { cookie: c[who], json: { ...base, start_date: plusDays(3) } });
    check(`${who} cannot create (${st})`, r.status === st, String(r.status));
    const l = await api('GET', '/api/work-order-recurrences', { cookie: c[who] });
    check(`${who} cannot list (${st})`, l.status === st);
  }
  const bad = [
    ['missing location', { ...base, location_id: undefined, start_date: plusDays(3) }, 400],
    ['missing description', { ...base, description: '  ', start_date: plusDays(3) }, 400],
    ['bad frequency', { ...base, frequency: 'weekly', start_date: plusDays(3) }, 400],
    ['bad date', { ...base, start_date: '2027-02-31' }, 400],
    ['end before start', { ...base, start_date: plusDays(3), end_date: plusDays(1) }, 400],
    ['location of company B', { ...base, location_id: locB, elevator_id: null, start_date: plusDays(3) }, 403],
    ['elevator of company B', { ...base, elevator_id: elB, start_date: plusDays(3) }, 400],
    ['assignee of company B', { ...base, assigned_user_id: u.adminB.id, start_date: plusDays(3) }, 400]
  ];
  for (const [name, json, st] of bad) {
    const r = await api('POST', '/api/work-order-recurrences', { cookie: c.adminA, json });
    check(`${name} -> ${st}`, r.status === st, `${r.status} ${JSON.stringify(r.body)}`);
  }
  check('rejected requests wrote nothing', Number((await q('SELECT COUNT(*) AS c FROM work_order_recurrences WHERE company_id = ?', [A]))[0].c) === 0 && (await woCount(A)) === n0);

  console.log('-- creation and generation');
  const notifBefore = Number((await q('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?', [u.techA.id]))[0].c);
  const startSoon = plusDays(3); // inside the 7 day lead window -> generated right away
  const created = await api('POST', '/api/work-order-recurrences', { cookie: c.adminA, json: { ...base, start_date: startSoon } });
  check('admin creates recurrence (201)', created.status === 201 && created.body.id > 0, JSON.stringify(created.body));
  const rid = created.body.id;
  check('first occurrence generated immediately (one run, one work order)', (await runCount(rid)) === 1 && (await woCount(A)) === n0 + 1);
  const [gen] = await q(
    `SELECT w.id, w.status, w.company_id, DATE_FORMAT(w.due_date, '%Y-%m-%d') AS due, w.general_comment FROM work_orders w
     INNER JOIN work_order_recurrence_runs r ON r.work_order_id = w.id WHERE r.recurrence_id = ?`, [rid]);
  check('generated work order is normal: open, due = occurrence, comment', gen && gen.status === 'open' && gen.due === startSoon && gen.company_id === A && gen.general_comment === 'Bring keys', JSON.stringify(gen));
  const detail = await api('GET', `/api/work-orders/${gen.id}`, { cookie: c.techA });
  check('visible through the normal detail endpoint with item, elevator and assignee',
    detail.status === 200 && detail.body.items[0].description === base.description && detail.body.elevators[0].id === el && detail.body.assigned_users[0].id === u.techA.id, JSON.stringify(detail.body).slice(0, 200));
  const list = await api('GET', '/api/work-orders', { cookie: c.techA });
  check('visible in the normal list', list.status === 200 && list.body.some((o) => o.id === gen.id));
  check('assignee got the usual notification', Number((await q('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?', [u.techA.id]))[0].c) === notifBefore + 1);
  const rl = await api('GET', '/api/work-order-recurrences', { cookie: c.adminA });
  const item = rl.body.items?.find((i) => i.id === rid);
  check('list shows template with generated_count 1 and next_due_date = first upcoming occurrence', item && item.generated_count === 1 && item.next_due_date === startSoon && item.is_active === true, JSON.stringify(item));
  check('company B list does not show it', (await api('GET', '/api/work-order-recurrences', { cookie: c.adminB })).body.items.length === 0);

  console.log('-- idempotency under concurrency');
  const wo1 = await woCount(A);
  const results = await Promise.all([
    ...Array.from({ length: 6 }, () => rec.ensureRecurringWorkOrders(A)),
    ...Array.from({ length: 4 }, () => api('GET', '/api/work-orders', { cookie: c.adminA })),
    ...Array.from({ length: 3 }, () => api('GET', '/api/home/summary', { cookie: c.adminA }))
  ]);
  check('13 concurrent triggers on an already generated occurrence create nothing', (await woCount(A)) === wo1 && (await runCount(rid)) === 1, `${await woCount(A)} vs ${wo1}`);
  check('all concurrent calls succeeded', results.slice(6).every((r) => r.status === 200), JSON.stringify(results.slice(6).map((r) => r.status)));

  // second template whose occurrence is due TODAY and not generated yet: race it
  await q("UPDATE work_order_recurrences SET is_active = 0 WHERE id = ?", [rid]);
  const raceStart = plusDays(0);
  const raceIns = await q(
    `INSERT INTO work_order_recurrences (company_id, location_id, elevator_id, description, frequency, start_date, assigned_user_id, is_active, created_by_user_id)
     VALUES (?, ?, ?, 'Race check', 'monthly', ?, ?, 1, ?)`, [A, loc, el, raceStart, u.techA.id, u.adminA.id]);
  const raceId = raceIns.insertId;
  const wo2 = await woCount(A);
  await Promise.all([
    ...Array.from({ length: 8 }, () => rec.ensureRecurringWorkOrders(A)),
    ...Array.from({ length: 5 }, () => api('GET', '/api/calendar?from=2020-01-01&to=2020-01-31', { cookie: c.adminA })),
    ...Array.from({ length: 5 }, () => api('GET', '/api/work-orders', { cookie: c.techA }))
  ]);
  check('18 concurrent triggers create the due occurrence exactly once', (await woCount(A)) === wo2 + 1 && (await runCount(raceId)) === 1, `${(await woCount(A)) - wo2} new orders, ${await runCount(raceId)} runs`);
  const dupRun = await q('INSERT IGNORE INTO work_order_recurrence_runs (company_id, recurrence_id, due_date) VALUES (?, ?, ?)', [A, raceId, raceStart]);
  check('UNIQUE (recurrence_id, due_date) rejects a duplicate row', dupRun.affectedRows === 0);
  const aFresh = await Promise.all(Array.from({ length: 3 }, () => rec.ensureRecurringWorkOrders(A, new Date())));
  check('repeat call creates nothing', aFresh.every((n) => n === 0));

  console.log('-- pause, resume, window, end date');
  await q('UPDATE work_order_recurrences SET is_active = 0 WHERE id = ?', [raceId]);
  const pastIns = await q(
    `INSERT INTO work_order_recurrences (company_id, location_id, description, frequency, start_date, is_active, created_by_user_id)
     VALUES (?, ?, 'Paused one', 'monthly', ?, 0, ?)`, [A, loc, plusDays(1), u.adminA.id]);
  const wo3 = await woCount(A);
  await rec.ensureRecurringWorkOrders(A);
  check('paused template generates nothing', (await woCount(A)) === wo3 && (await runCount(pastIns.insertId)) === 0);
  const resume = await api('PATCH', `/api/work-order-recurrences/${pastIns.insertId}`, { cookie: c.adminA, json: { is_active: true } });
  check('resume (200) generates the due occurrence', resume.status === 200 && (await runCount(pastIns.insertId)) === 1 && (await woCount(A)) === wo3 + 1, JSON.stringify(resume.body));
  const pause = await api('PATCH', `/api/work-order-recurrences/${pastIns.insertId}`, { cookie: c.adminA, json: { is_active: false } });
  check('pause (200)', pause.status === 200 && (await q('SELECT is_active FROM work_order_recurrences WHERE id = ?', [pastIns.insertId]))[0].is_active === 0);
  check('technician cannot pause (403)', (await api('PATCH', `/api/work-order-recurrences/${pastIns.insertId}`, { cookie: c.techA, json: { is_active: true } })).status === 403);
  check('company B admin cannot pause A template (404)', (await api('PATCH', `/api/work-order-recurrences/${pastIns.insertId}`, { cookie: c.adminB, json: { is_active: true } })).status === 404);
  check('PATCH without is_active -> 400', (await api('PATCH', `/api/work-order-recurrences/${pastIns.insertId}`, { cookie: c.adminA, json: {} })).status === 400);

  // old occurrences beyond the catch-up window are skipped, ended templates generate nothing, only recent ones are made
  const old = await q(
    `INSERT INTO work_order_recurrences (company_id, location_id, description, frequency, start_date, is_active, created_by_user_id)
     VALUES (?, ?, 'Started long ago', 'monthly', '2025-01-05', 1, ?)`, [A, loc, u.adminA.id]);
  await rec.ensureRecurringWorkOrders(A);
  const oldRuns = await q("SELECT DATE_FORMAT(due_date,'%Y-%m-%d') AS d FROM work_order_recurrence_runs WHERE recurrence_id = ?", [old.insertId]);
  const earliest = plusDays(-rec.CATCH_UP_DAYS);
  check('started long ago: no backlog, only 0-2 occurrences inside the window', oldRuns.length <= 2 && oldRuns.every((r) => r.d >= earliest && r.d <= plusDays(rec.LEAD_DAYS)), JSON.stringify(oldRuns));
  const ended = await q(
    `INSERT INTO work_order_recurrences (company_id, location_id, description, frequency, start_date, end_date, is_active, created_by_user_id)
     VALUES (?, ?, 'Ended', 'monthly', '2025-01-05', '2025-06-05', 1, ?)`, [A, loc, u.adminA.id]);
  await rec.ensureRecurringWorkOrders(A);
  check('ended template generates nothing', (await runCount(ended.insertId)) === 0);

  console.log('-- delete keeps generated work orders; isolation');
  const before = await woCount(A);
  const runsBefore = await runCount(rid);
  check('technician cannot delete (403)', (await api('DELETE', `/api/work-order-recurrences/${rid}`, { cookie: c.techA })).status === 403);
  check('company B admin cannot delete A template (404)', (await api('DELETE', `/api/work-order-recurrences/${rid}`, { cookie: c.adminB })).status === 404);
  check('template still there after the rejected deletes', Number((await q('SELECT COUNT(*) AS c FROM work_order_recurrences WHERE id = ?', [rid]))[0].c) === 1);
  const del = await api('DELETE', `/api/work-order-recurrences/${rid}`, { cookie: c.adminA });
  check('admin deletes template (200)', del.status === 200);
  check('generated work orders are untouched', (await woCount(A)) === before && Number((await q('SELECT COUNT(*) AS c FROM work_orders WHERE id = ?', [gen.id]))[0].c) === 1);
  check('run rows survive (no re-generation of the same occurrence)', (await runCount(rid)) === runsBefore);
  check('deleted template -> 404 on second delete', (await api('DELETE', `/api/work-order-recurrences/${rid}`, { cookie: c.adminA })).status === 404);
  check('company B has no work orders or runs', (await woCount(B)) === 0 && Number((await q('SELECT COUNT(*) AS c FROM work_order_recurrence_runs WHERE company_id = ?', [B]))[0].c) === 0);

  await lib.finish();
}
main().catch((err) => { console.error('crashed:', err); process.exit(1); });
