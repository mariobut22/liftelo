#!/usr/bin/env node
/*
 * GET /api/calendar test, against a THROWAWAY MySQL/MariaDB (lib/wo-test-lib.js).
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3471 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt node backend/scripts/calendar-test.js
 * Proves: range validation (400, max 100 days), roles (admin/viewer see all work orders, technician only his own, everybody sees
 * RMS deadlines), company isolation, RMS deadline counts per month end (frequency, effective date rms_month), future recurring
 * occurrences (technician: only his own template; generated ones are NOT duplicated as "recurrences"), lazy generation on the call.
 */
'use strict';
const lib = require('./lib/wo-test-lib')('cal', 3873);
const { api, check } = lib;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

async function main() {
  const w = await lib.world();
  const { q, A, B, cookies: c, u } = w;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const monthStart = `${y}-${pad(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${pad(m)}-${pad(lastDay)}`;
  const rangeFrom = plusDays(-40);
  const rangeTo = plusDays(60);
  const qs = (from, to) => `/api/calendar?from=${from}&to=${to}`;

  const l1 = await w.mkLocation(A, 'CalLoc1', 1); // monthly RMS
  const l2 = await w.mkLocation(A, 'CalLoc2', 2); // every 2nd month (Jan, Mar, ...)
  const lB = await w.mkLocation(B, 'CalLocB', 1);
  const wo = async (company, loc, due, desc, assignee) => {
    const r = await q("INSERT INTO work_orders (company_id, location_id, status, issued_date, due_date) VALUES (?, ?, 'open', CURDATE(), ?)", [company, loc, due]);
    await q('INSERT INTO work_order_items (work_order_id, company_id, description, sort_order) VALUES (?, ?, ?, 1)', [r.insertId, company, desc]);
    if (assignee) await q('INSERT INTO work_order_users (work_order_id, company_id, user_id) VALUES (?, ?, ?)', [r.insertId, company, assignee]);
    return r.insertId;
  };
  const dueA = plusDays(5);
  const woTech = await wo(A, l1, dueA, 'Tech job', u.techA.id);
  const woOther = await wo(A, l1, dueA, 'Other tech job', u.tech2A.id);
  const woNobody = await wo(A, l1, plusDays(6), 'Unassigned job', null);
  const woOut = await wo(A, l1, plusDays(200), 'Out of range', u.techA.id);
  const woNoDue = (await q("INSERT INTO work_orders (company_id, location_id, status, issued_date) VALUES (?, ?, 'open', CURDATE())", [A, l1])).insertId;
  const woB = await wo(B, lB, dueA, 'Company B secret job', null);

  console.log('-- validation');
  check('missing params -> 400', (await api('GET', '/api/calendar', { cookie: c.adminA })).status === 400);
  check('bad date -> 400', (await api('GET', qs('2026-02-31', '2026-03-05'), { cookie: c.adminA })).status === 400);
  check('to before from -> 400', (await api('GET', qs('2026-03-05', '2026-03-01'), { cookie: c.adminA })).status === 400);
  const tooLong = await api('GET', qs('2026-01-01', '2026-12-31'), { cookie: c.adminA });
  check('range over 100 days -> 400 date_range_too_long', tooLong.status === 400 && tooLong.body.code === 'date_range_too_long');
  check('anonymous -> 401', (await api('GET', qs(rangeFrom, rangeTo))).status === 401);
  check('exactly 100 days is allowed', (await api('GET', qs('2026-01-01', '2026-04-11'), { cookie: c.adminA })).status === 200);

  console.log('-- roles and isolation');
  const idsOf = (r) => r.body.work_orders.map((o) => o.id);
  const admin = await api('GET', qs(rangeFrom, rangeTo), { cookie: c.adminA });
  check('admin sees all own-company work orders in range', admin.status === 200 && [woTech, woOther, woNobody].every((id) => idsOf(admin).includes(id)), JSON.stringify(idsOf(admin)));
  check('out-of-range and no-due-date work orders are not returned', !idsOf(admin).includes(woOut) && !idsOf(admin).includes(woNoDue));
  check('company B work order never leaks', !idsOf(admin).includes(woB) && !JSON.stringify(admin.body).includes('secret'));
  const item = admin.body.work_orders.find((o) => o.id === woTech);
  check('work order item shape (date, title, location, status, assignees)', item && item.date === dueA && item.title === 'Tech job' && item.location_name.startsWith('CalLoc1') && item.status === 'open' && item.assignees === 'techA', JSON.stringify(item));
  const viewer = await api('GET', qs(rangeFrom, rangeTo), { cookie: c.viewerA });
  check('viewer sees all company work orders', viewer.status === 200 && [woTech, woOther, woNobody].every((id) => idsOf(viewer).includes(id)));
  const tech = await api('GET', qs(rangeFrom, rangeTo), { cookie: c.techA });
  check('technician sees only his own work orders', tech.status === 200 && idsOf(tech).join() === String(woTech), JSON.stringify(idsOf(tech)));
  check('technician still gets RMS deadlines', tech.body.rms_deadlines.length > 0 && tech.body.role === 'technician');
  const adminB = await api('GET', qs(rangeFrom, rangeTo), { cookie: c.adminB });
  check('company B sees only its work order', idsOf(adminB).join() === String(woB) && !JSON.stringify(adminB.body).includes('CalLoc1'));

  console.log('-- RMS deadlines');
  const cur = (r) => r.body.rms_deadlines.find((d) => d.month === `${y}-${pad(m)}`);
  const d0 = cur(await api('GET', qs(monthStart, monthEnd), { cookie: c.adminA }));
  const expectedCount = 1 + (((m - 1) % 2) === 0 ? 1 : 0);
  check('month end deadline item: date, expected, missing', d0 && d0.date === monthEnd && d0.expected === expectedCount && d0.missing === expectedCount && d0.done === 0, JSON.stringify(d0));
  check('company B deadline counts only its location', cur(await api('GET', qs(monthStart, monthEnd), { cookie: c.adminB })).expected === 1);
  await q("INSERT INTO rms_visits (company_id, location_id, user_id, visit_date) VALUES (?, ?, ?, ?)", [A, l1, u.techA.id, `${y}-${pad(m)}-02 10:00:00`]);
  const d1 = cur(await api('GET', qs(monthStart, monthEnd), { cookie: c.adminA }));
  check('RMS visit in the month marks the location done', d1.done === 1 && d1.missing === expectedCount - 1, JSON.stringify(d1));
  const otherMonth = m === 1 ? 12 : m - 1;
  const otherYear = m === 1 ? y - 1 : y;
  await q("INSERT INTO rms_visits (company_id, location_id, user_id, visit_date, rms_month) VALUES (?, ?, ?, NOW(), ?)", [A, l1, u.techA.id, `${otherYear}-${pad(otherMonth)}-01`]);
  const prevEnd = `${otherYear}-${pad(otherMonth)}-${pad(new Date(otherYear, otherMonth, 0).getDate())}`;
  const dPrev = (await api('GET', qs(`${otherYear}-${pad(otherMonth)}-01`, prevEnd), { cookie: c.adminA })).body.rms_deadlines.find((d) => d.month === `${otherYear}-${pad(otherMonth)}`);
  check('rms_month (not visit_date) decides the month', dPrev && dPrev.done >= 1, JSON.stringify(dPrev));
  const none = await api('GET', qs(monthStart, `${y}-${pad(m)}-01`), { cookie: c.adminA });
  check('range without a month end has no deadline items', none.body.rms_deadlines.length === 0 || lastDay === 1);
  check('missing_locations lists names of company A only', (cur(await api('GET', qs(monthStart, monthEnd), { cookie: c.adminA })).missing_locations || []).every((l) => l.name.includes('CalLoc')));

  console.log('-- recurring occurrences');
  const farStart = plusDays(20);
  const mine = await api('POST', '/api/work-order-recurrences', { cookie: c.adminA, json: { location_id: l1, description: 'Mine monthly', frequency: 'monthly', start_date: farStart, assigned_user_id: u.techA.id } });
  const theirs = await api('POST', '/api/work-order-recurrences', { cookie: c.adminA, json: { location_id: l1, description: 'Their monthly', frequency: 'monthly', start_date: farStart, assigned_user_id: u.tech2A.id } });
  const dueNow = await api('POST', '/api/work-order-recurrences', { cookie: c.adminA, json: { location_id: l1, description: 'Due today', frequency: 'yearly', start_date: plusDays(0), assigned_user_id: u.techA.id } });
  check('recurrences created', [mine, theirs, dueNow].every((r) => r.status === 201));
  const cal = await api('GET', qs(rangeFrom, rangeTo), { cookie: c.adminA });
  const titles = cal.body.recurrences.map((r) => `${r.title}@${r.date}`);
  check('admin sees future occurrences of both templates', titles.includes(`Mine monthly@${farStart}`) && titles.includes(`Their monthly@${farStart}`), titles.join());
  check('occurrence due today was generated (work order in the calendar), not shown as upcoming', cal.body.work_orders.some((o) => o.title === 'Due today') && !titles.some((t) => t.startsWith('Due today')));
  const calTech = await api('GET', qs(rangeFrom, rangeTo), { cookie: c.techA });
  const techTitles = calTech.body.recurrences.map((r) => r.title);
  check('technician sees only recurrences assigned to him', techTitles.includes('Mine monthly') && !techTitles.includes('Their monthly'), techTitles.join());
  check('technician sees the generated "Due today" order', calTech.body.work_orders.some((o) => o.title === 'Due today'));
  check('company B sees no recurrences', (await api('GET', qs(rangeFrom, rangeTo), { cookie: c.adminB })).body.recurrences.length === 0);
  const pausedId = mine.body.id;
  await api('PATCH', `/api/work-order-recurrences/${pausedId}`, { cookie: c.adminA, json: { is_active: false } });
  check('paused template disappears from upcoming', !(await api('GET', qs(rangeFrom, rangeTo), { cookie: c.adminA })).body.recurrences.some((r) => r.recurrence_id === pausedId));

  await lib.finish();
}
main().catch((err) => { console.error('crashed:', err); process.exit(1); });
