#!/usr/bin/env node
/*
 * Fault -> work order link test (POST /api/work-orders with finding_id), against a THROWAWAY MySQL/MariaDB (see lib/wo-test-lib.js).
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3471 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt node backend/scripts/work-order-link-test.js
 * Proves: admin creates the work order with finding_id -> link event 'work_order_created' (append-only, no state change);
 * finding detail lists the work order; work order detail lists the fault; technician/viewer cannot create (403, nothing written);
 * foreign-company finding = 404, finding of another location = 400, nothing written; finding history is only ever appended to.
 */
'use strict';
const lib = require('./lib/wo-test-lib')('wolink', 3871);
const { api, check, db } = lib;

async function main() {
  const w = await lib.world();
  const { q, A, B, cookies: c } = w;
  const loc = await w.mkLocation(A, 'LinkLoc');
  const loc2 = await w.mkLocation(A, 'LinkLoc2');
  const locB = await w.mkLocation(B, 'LinkLocB');
  const el = await w.mkElevator(A, loc, 'Lift 1');
  const mkFinding = async (company, location, elevatorId, label) => {
    const r = await q(
      `INSERT INTO findings (company_id, location_id, location_name, elevator_id, elevator_label, source_type, description, category, severity, created_by_user_id)
       VALUES (?, ?, 'x', ?, ?, 'manual', 'Door does not close', 'doors', 'out_of_service', ?)`, [company, location, elevatorId, label, w.u.adminA.id]);
    await q("INSERT INTO finding_events (finding_id, company_id, event_type, state, user_id) VALUES (?, ?, 'opened', 'open', ?)", [r.insertId, company, w.u.adminA.id]);
    return r.insertId;
  };
  const fA = await mkFinding(A, loc, el, 'Lift 1');
  const fB = await mkFinding(B, locB, null, 'Lift B');
  const body = (extra = {}) => ({
    location_id: loc, elevator_ids: [el], items: [{ description: 'Fix door' }], due_date: '2030-01-01', general_comment: 'From fault', ...extra
  });
  const woCount = async (company) => Number((await q('SELECT COUNT(*) AS c FROM work_orders WHERE company_id = ?', [company]))[0].c);
  const evCount = async (fid) => Number((await q('SELECT COUNT(*) AS c FROM finding_events WHERE finding_id = ?', [fid]))[0].c);

  console.log('-- creating');
  const before = await woCount(A);
  const evBefore = await evCount(fA);
  const ok = await api('POST', '/api/work-orders', { cookie: c.adminA, json: body({ finding_id: fA }) });
  check('admin creates linked work order (201)', ok.status === 201 && ok.body.id > 0, JSON.stringify(ok.body));
  const woId = ok.body.id;
  check('work order created', (await woCount(A)) === before + 1);
  const ev = await q("SELECT * FROM finding_events WHERE finding_id = ? AND event_type = 'work_order_created'", [fA]);
  check('one work_order_created event with work_order_id, company and user', ev.length === 1 && ev[0].work_order_id === woId && ev[0].company_id === A && ev[0].user_id === w.u.adminA.id && ev[0].state === null);
  check('history only appended (one more event)', (await evCount(fA)) === evBefore + 1);

  const f1 = await api('GET', `/api/findings/${fA}`, { cookie: c.techA });
  check('finding detail lists the work order', f1.status === 200 && f1.body.work_orders?.length === 1 && f1.body.work_orders[0].id === woId && f1.body.work_orders[0].status === 'open', JSON.stringify(f1.body.work_orders));
  check('finding state unchanged (open)', f1.body.state === 'open');
  const o1 = await api('GET', `/api/work-orders/${woId}`, { cookie: c.viewerA });
  check('work order detail lists the fault', o1.status === 200 && o1.body.findings?.length === 1 && o1.body.findings[0].id === fA, JSON.stringify(o1.body.findings));
  const f2 = await api('GET', `/api/findings/${fA}`, { cookie: c.adminB });
  check('other company cannot read the finding (404)', f2.status === 404);

  console.log('-- permissions and validation');
  const n0 = await woCount(A); const e0 = await evCount(fA);
  const t1 = await api('POST', '/api/work-orders', { cookie: c.techA, json: body({ finding_id: fA }) });
  check('technician cannot create (403)', t1.status === 403, String(t1.status));
  const v1 = await api('POST', '/api/work-orders', { cookie: c.viewerA, json: body({ finding_id: fA }) });
  check('viewer cannot create (403)', v1.status === 403, String(v1.status));
  const x1 = await api('POST', '/api/work-orders', { cookie: c.adminA, json: body({ finding_id: fB }) });
  check('finding of another company -> 404 finding_not_found', x1.status === 404 && x1.body.code === 'finding_not_found', JSON.stringify(x1.body));
  const x2 = await api('POST', '/api/work-orders', { cookie: c.adminA, json: body({ finding_id: fA, location_id: loc2, elevator_ids: [] }) });
  check('finding of another location -> 400 finding_location_mismatch', x2.status === 400 && x2.body.code === 'finding_location_mismatch', JSON.stringify(x2.body));
  const x3 = await api('POST', '/api/work-orders', { cookie: c.adminA, json: body({ finding_id: 'abc' }) });
  check('invalid finding_id -> 400', x3.status === 400);
  const x4 = await api('POST', '/api/work-orders', { cookie: c.adminA, json: body({ finding_id: 999999 }) });
  check('unknown finding -> 404', x4.status === 404);
  check('nothing written by the rejected requests', (await woCount(A)) === n0 && (await evCount(fA)) === e0);
  const crossB = await api('POST', '/api/work-orders', { cookie: c.adminB, json: { ...body({ finding_id: fA }), location_id: locB, elevator_ids: [] } });
  check('company B admin cannot link company A finding', crossB.status === 404 && (await woCount(B)) === 0, JSON.stringify(crossB.body));

  console.log('-- plain work order and second link');
  const plain = await api('POST', '/api/work-orders', { cookie: c.adminA, json: body() });
  check('work order without finding_id still works', plain.status === 201);
  const second = await api('POST', '/api/work-orders', { cookie: c.adminA, json: body({ finding_id: fA }) });
  check('a second work order can be linked to the same fault', second.status === 201);
  const f3 = await api('GET', `/api/findings/${fA}`, { cookie: c.adminA });
  check('detail lists both work orders', f3.body.work_orders?.length === 2);
  const resolve = await api('POST', `/api/findings/${fA}/events`, { cookie: c.adminA, json: { event_type: 'resolved' } });
  check('resolving the fault still works with link events in history', resolve.status === 201 || resolve.status === 200, JSON.stringify(resolve.body));
  const f4 = await api('GET', `/api/findings/${fA}`, { cookie: c.adminA });
  check('derived state resolved (link events carry no state)', f4.body.state === 'resolved');

  await lib.finish();
}
main().catch((err) => { console.error('crashed:', err); process.exit(1); });
