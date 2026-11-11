#!/usr/bin/env node
/*
 * End-to-end test of the superadmin monitoring endpoints (phase 3: revenue, health, audit viewer, growth) against a
 * THROWAWAY MySQL/MariaDB (dev-only, no extra dependencies). Mounts the real router (routes/superadmin.js) in a tiny
 * express app with a fake session and calls it over HTTP. Refuses to run on anything but a local test DB.
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=<port> TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *     node backend/scripts/superadmin-monitoring-test.js
 *
 * Same fresh-database assumptions as superadmin-actions-test.js (companies 1 and 2, user 7 = superadmin, users.company_id
 * nullable, subscription migrations applied). Run it on a FRESH database. Exit code 0 = all checks passed.
 */
'use strict';

const cfg = {
  host: process.env.TENANT_TEST_DB_HOST || '127.0.0.1',
  port: process.env.TENANT_TEST_DB_PORT || '3306',
  user: process.env.TENANT_TEST_DB_USER || 'root',
  password: process.env.TENANT_TEST_DB_PASSWORD || '',
  name: process.env.TENANT_TEST_DB_NAME || '',
};
if (!['127.0.0.1', 'localhost'].includes(cfg.host) || !/^(tt|.*_test|.*_tmp|tenant.*)$/i.test(cfg.name) || process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: needs a local throwaway database (TENANT_TEST_DB_HOST=127.0.0.1, TENANT_TEST_DB_NAME=tt|*_test|*_tmp).');
  process.exit(2);
}
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  NODE_ENV: 'test', STRIPE_SECRET_KEY: 'sk_test_dummy_not_used',
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const db = require('../db');
const { measureUploads, sanitizeMetadata } = require('../utils/superadminMonitoring');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  ${extra}`}`);
};
const q = async (sql, params = []) => (await db.query(sql, params))[0];

(async () => {
  const app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    const uid = Number(req.headers['x-uid']) || null;
    if (uid) {
      const [row] = await q('SELECT global_role FROM users WHERE id = ?', [uid]);
      req.session = { user_id: uid, global_role: row?.global_role || 'user', user: { global_role: row?.global_role || 'user' } };
    }
    next();
  });
  app.use('/api/superadmin', require('../routes/superadmin'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (url, uid = 7) => {
    const res = await fetch(base + url, { headers: uid ? { 'x-uid': String(uid) } : {} });
    let body = null;
    try { body = await res.json(); } catch (_e) { body = null; }
    return { status: res.status, body };
  };

  const price = async (code) => Number((await q('SELECT price_cents FROM subscription_plans WHERE code = ?', [code]))[0].price_cents);
  const pro = await price('pro');
  const starter = await price('starter');
  const corporate = await price('corporate');
  const planId = async (code) => Number((await q('SELECT id FROM subscription_plans WHERE code = ?', [code]))[0].id);
  const setSub = async (companyId, code, status, { trialEnd = null, trialStart = null, periodStart = 'NOW()', stripe = null, updated = 'NOW()' } = {}) => {
    await q('DELETE FROM company_subscriptions WHERE company_id = ?', [companyId]);
    await q(
      `INSERT INTO company_subscriptions (company_id, plan_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, stripe_subscription_id, updated_at)
       VALUES (?, ?, ?, ${trialStart || 'NULL'}, ${trialEnd || 'NULL'}, ${periodStart}, DATE_ADD(NOW(), INTERVAL 1 MONTH), ?, ${updated})`,
      [companyId, await planId(code), status, stripe]
    );
  };

  // ---- seed ----
  for (const id of [3, 4, 5, 6, 7 + 100, 8 + 100]) await q('INSERT INTO companies (id, name) VALUES (?, ?)', [id, `Co ${id}`]);
  // 1: paying pro (manual), 2: trial ending in 3 days (starter), 3: Stripe paying corporate, 4: free granted pro,
  // 5: canceled 5 days ago, 6: trial expired 10 days ago (never paid), 107: past_due, 108: trial ended 20 days ago -> paid (converted)
  await setSub(1, 'pro', 'active');
  await setSub(2, 'starter', 'trial', { trialStart: 'DATE_SUB(NOW(), INTERVAL 11 DAY)', trialEnd: 'DATE_ADD(NOW(), INTERVAL 3 DAY)' });
  await setSub(3, 'corporate', 'active', { stripe: 'sub_SECRET_123' });
  await setSub(4, 'pro', 'active');
  await q("INSERT INTO audit_logs (user_id, company_id, action, metadata) VALUES (7, 4, 'superadmin_grant_free_period', '{\"reason\":\"gift\"}')");
  await setSub(5, 'starter', 'canceled', { updated: 'DATE_SUB(NOW(), INTERVAL 5 DAY)' });
  await setSub(6, 'starter', 'trial', { trialStart: 'DATE_SUB(NOW(), INTERVAL 24 DAY)', trialEnd: 'DATE_SUB(NOW(), INTERVAL 10 DAY)' });
  await setSub(107, 'pro', 'past_due');
  await setSub(108, 'starter', 'active', { trialStart: 'DATE_SUB(NOW(), INTERVAL 34 DAY)', trialEnd: 'DATE_SUB(NOW(), INTERVAL 20 DAY)', stripe: 'sub_SECRET_456' });

  // ---- 1. authorization ----
  for (const url of ['/api/superadmin/revenue', '/api/superadmin/health', '/api/superadmin/audit', '/api/superadmin/growth']) {
    const anon = await get(url, null);
    check(`${url} anonymous -> 403`, anon.status === 403 && anon.body.code === 'forbidden');
    const plain = await get(url, 1);
    check(`${url} non-superadmin -> 403`, plain.status === 403 && plain.body.code === 'forbidden');
  }

  // ---- 2. revenue ----
  let r = await get('/api/superadmin/revenue');
  check('revenue 200', r.status === 200, JSON.stringify(r).slice(0, 200));
  const rev = r.body;
  const expectedMrr = pro + corporate + starter; // companies 1 (manual pro), 3 (Stripe corporate), 108 (Stripe starter)
  check('MRR counts only active paid, non-free (pro + corporate + starter)', rev.summary.mrr_cents === expectedMrr, `${rev.summary.mrr_cents} vs ${expectedMrr}`);
  check('ARR = 12 x MRR', rev.summary.arr_cents === expectedMrr * 12);
  check('MRR split stripe vs manual', rev.summary.mrr_stripe_cents === corporate + starter && rev.summary.mrr_manual_cents === pro);
  check('paying companies = 3, free granted = 1', rev.summary.paying_companies === 3 && rev.summary.free_granted === 1);
  check('trial active = 1 (company 2), trial expired = 1, past_due = 1, canceled = 1',
    rev.summary.trial_active === 1 && rev.summary.trial_expired === 1 && rev.summary.past_due === 1 && rev.summary.canceled === 1, JSON.stringify(rev.summary));
  check('upcoming trial expiries: only company 2', rev.upcoming_trials.length === 1 && rev.upcoming_trials[0].company_id === 2);
  check('churn: 1 canceled in last 30 days', rev.churn.canceled_last_30_days === 1);
  check('conversion cohort = 2 ended trials (6 and 108), 1 converted, rate 50', rev.conversion.cohort_trials_ended_90d === 2 && rev.conversion.converted_to_paid === 1 && rev.conversion.rate === 50, JSON.stringify(rev.conversion));
  const proPlan = rev.by_plan.find((p) => p.plan_code === 'pro');
  check('by_plan pro: total 3, paying 1, free 1, mrr = pro', proPlan && proPlan.total === 3 && proPlan.paying === 1 && proPlan.free_granted === 1 && proPlan.mrr_cents === pro, JSON.stringify(proPlan));
  const revText = JSON.stringify(rev);
  check('revenue leaks no Stripe ids', !revText.includes('SECRET') && !revText.includes('stripe_subscription'));
  await q('UPDATE company_subscriptions SET status = ? WHERE company_id = 1', ['suspended']);
  r = await get('/api/superadmin/revenue');
  check('suspended company leaves MRR', r.body.summary.mrr_cents === expectedMrr - pro && r.body.summary.suspended === 1);
  await q('UPDATE company_subscriptions SET status = ? WHERE company_id = 1', ['active']);

  // ---- 3. health ----
  await q("INSERT INTO email_outbox (to_email, subject, html, status, attempts, type, company_id, created_at) VALUES ('victim@secret.test', 'SECRET SUBJECT', '<p>SECRET BODY</p>', 'failed', 3, 'invite', 1, NOW())");
  await q("INSERT INTO email_outbox (to_email, subject, html, status, attempts, type, company_id, created_at) VALUES ('p@x.test', 's', 'h', 'pending', 0, 'invite', 1, NOW())");
  await q("INSERT INTO email_outbox (to_email, subject, html, status, attempts, type, company_id, sent_at, created_at) VALUES ('s@x.test', 's', 'h', 'sent', 1, 'invite', 1, NOW(), NOW())");
  const hasErr = (await q("SHOW COLUMNS FROM email_outbox LIKE 'last_error'")).length > 0;
  if (hasErr) await q("UPDATE email_outbox SET last_error = 'SMTP rejected victim@secret.test with key sk_live_ABCDEF123456789' WHERE status = 'failed'");
  await q("INSERT INTO billing_events (provider, provider_event_id, event_type, status, payload_json, error_message) VALUES ('stripe', 'evt_1', 'invoice.paid', 'processed', '{\"secret\":\"PAYLOAD_SECRET\"}', NULL)");
  await q("INSERT INTO billing_events (provider, provider_event_id, event_type, status, payload_json, error_message) VALUES ('stripe', 'evt_2', 'customer.subscription.updated', 'failed', '{\"secret\":\"PAYLOAD_SECRET\"}', 'No subscription found')");
  r = await get('/api/superadmin/health');
  check('health 200', r.status === 200, JSON.stringify(r).slice(0, 200));
  const h = r.body;
  check('health: database ok with ping', h.database.ok === true && typeof h.database.ping_ms === 'number');
  check('health: outbox counts', h.outbox.available && h.outbox.pending === 1 && h.outbox.failed === 1 && h.outbox.sent === 1 && h.outbox.sent_last_24h === 1 && h.outbox.failed_last_24h === 1, JSON.stringify(h.outbox));
  check('health: last failed outbox row has type/attempts, no recipient/subject/body', h.outbox.last_failed.length === 1 && h.outbox.last_failed[0].type === 'invite' && h.outbox.last_failed[0].attempts === 3);
  if (hasErr) check('health: outbox error truncated and scrubbed (no e-mail, no key)', h.outbox.last_failed[0].error.includes('[email]') && !h.outbox.last_failed[0].error.includes('sk_live') && !h.outbox.last_failed[0].error.includes('victim'));
  else check('health: outbox error is null when the column does not exist', h.outbox.last_failed[0].error === null);
  check('health: billing counts and last event', h.billing.available && h.billing.last_7_days.processed === 1 && h.billing.last_7_days.failed === 1 && !!h.billing.last_event_at);
  check('health: billing failure listed with error, no payload', h.billing.last_failed.length === 1 && h.billing.last_failed[0].error === 'No subscription found');
  const hText = JSON.stringify(h);
  check('health leaks no recipient, subject, body or payload', !/victim|SECRET SUBJECT|SECRET BODY|PAYLOAD_SECRET|p@x\.test/.test(hText));
  check('health: uploads, app info', h.uploads && typeof h.uploads.bytes === 'number' && typeof h.app.node === 'string' && h.app.uptime_seconds >= 0);

  // uploads walk: counts files/bytes, skips symlinks, depth/entry bounds
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-test-'));
  fs.mkdirSync(path.join(tmp, 'a/b'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'x.bin'), Buffer.alloc(1000));
  fs.writeFileSync(path.join(tmp, 'a/b/y.bin'), Buffer.alloc(500));
  fs.symlinkSync(path.join(tmp, 'x.bin'), path.join(tmp, 'link.bin'));
  const m = await measureUploads(tmp);
  check('measureUploads: 2 files, 1500 bytes, symlink ignored', m.files === 2 && m.bytes === 1500 && m.truncated === false, JSON.stringify(m));
  check('measureUploads: missing folder is reported, not thrown', (await measureUploads(path.join(tmp, 'nope'))).files === 0);
  fs.rmSync(tmp, { recursive: true, force: true });

  // ---- 4. audit viewer ----
  await q('DELETE FROM audit_logs');
  for (let i = 0; i < 130; i += 1) await q("INSERT INTO audit_logs (user_id, company_id, action, metadata, created_at) VALUES (1, 1, 'login', '{\"ip\":\"9.9.9.9\"}', DATE_SUB(NOW(), INTERVAL ? MINUTE))", [i]);
  await q("INSERT INTO audit_logs (user_id, company_id, action, metadata, created_at) VALUES (7, 2, 'superadmin_suspend', ?, DATE_SUB(NOW(), INTERVAL 3 DAY))",
    [JSON.stringify({ reason: 'Because', password: 'hunter2', token: 'TOK123', nested: { api_key: 'K1', ok: 'visible' }, long: 'x'.repeat(1000) })]);
  await q("INSERT INTO audit_logs (user_id, company_id, action, metadata, created_at) VALUES (7, 1, 'superadmin_change_plan', NULL, DATE_SUB(NOW(), INTERVAL 10 DAY))");
  r = await get('/api/superadmin/audit');
  check('audit default: 25 rows, has_more, newest first, actions list', r.status === 200 && r.body.rows.length === 25 && r.body.has_more === true && r.body.limit === 25 && r.body.actions.includes('login'));
  check('audit ordering by created_at desc', r.body.rows.every((row, i, a) => i === 0 || a[i - 1].created_at >= row.created_at));
  r = await get('/api/superadmin/audit?limit=100000');
  check('audit limit capped at 100', r.status === 200 && r.body.rows.length === 100 && r.body.limit === 100);
  r = await get('/api/superadmin/audit?limit=100&offset=100');
  check('audit offset pagination: remaining 32 rows, no more', r.status === 200 && r.body.rows.length === 32 && r.body.has_more === false && r.body.actions === undefined, JSON.stringify(r.body).slice(0, 200));
  r = await get('/api/superadmin/audit?scope=superadmin');
  check('audit scope=superadmin: only superadmin_* actions', r.body.rows.length === 2 && r.body.rows.every((row) => row.action.startsWith('superadmin_')));
  const susp = r.body.rows.find((row) => row.action === 'superadmin_suspend');
  const metaText = JSON.stringify(susp.metadata);
  check('audit metadata: password/token/api_key redacted, reason + nested ok visible', susp.metadata.password === '[redacted]' && susp.metadata.token === '[redacted]' && susp.metadata.nested.api_key === '[redacted]' && susp.metadata.nested.ok === 'visible' && susp.metadata.reason === 'Because');
  check('audit metadata: secrets absent from payload, long text cut', !/hunter2|TOK123|"K1"/.test(metaText) && susp.metadata.long.length <= 301);
  check('audit row carries company name and user e-mail', susp.company_name === 'Technique d.o.o.' || typeof susp.company_name === 'string');
  r = await get('/api/superadmin/audit?company_id=2');
  check('audit filter company_id', r.body.rows.length === 1 && r.body.rows[0].company_id === 2);
  r = await get('/api/superadmin/audit?user_id=7');
  check('audit filter user_id', r.body.rows.length === 2 && r.body.rows.every((row) => row.user_id === 7));
  r = await get('/api/superadmin/audit?action=superadmin_change_plan');
  check('audit filter action', r.body.rows.length === 1 && r.body.rows[0].action === 'superadmin_change_plan');
  const day = (offsetDays) => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
  r = await get(`/api/superadmin/audit?scope=superadmin&from=${day(5)}&to=${day(1)}`);
  check('audit date range (from/to inclusive)', r.body.rows.length === 1 && r.body.rows[0].action === 'superadmin_suspend', JSON.stringify(r.body.rows.map((x) => x.action)));
  for (const bad of ['company_id=abc', 'user_id=-1', 'from=2026-13-40', 'to=yesterday', 'action=a%20b%3B%20DROP', 'limit=0', 'offset=-5', "action='%20OR%201=1"]) {
    r = await get(`/api/superadmin/audit?${bad}`);
    check(`audit invalid filter (${bad}) -> 400 invalid_request`, r.status === 400 && r.body.code === 'invalid_request', JSON.stringify(r));
  }
  r = await get('/api/superadmin/audit?company_id=1&action=login&limit=5');
  check('audit combined filters', r.body.rows.length === 5 && r.body.rows.every((row) => row.company_id === 1 && row.action === 'login'));
  check('sanitizeMetadata: depth and arrays bounded', JSON.stringify(sanitizeMetadata({ a: { b: { c: { d: { e: 1 } } } }, list: Array.from({ length: 100 }, (_, i) => i) })).length < 400);

  // ---- 5. growth ----
  await q('UPDATE companies SET created_at = DATE_SUB(NOW(), INTERVAL 15 DAY) WHERE id = 3');
  await q("INSERT INTO audit_logs (user_id, company_id, action) VALUES (1, 3, 'login')");
  r = await get('/api/superadmin/growth');
  check('growth 200, 12 weeks, Mondays, ascending', r.status === 200 && r.body.weeks.length === 12
    && r.body.weeks.every((w, i, a) => new Date(`${w.week_start}T00:00:00Z`).getUTCDay() === 1 && (i === 0 || w.week_start > a[i - 1].week_start)), JSON.stringify(r.body.weeks.map((w) => w.week_start)));
  const last = r.body.weeks[11];
  const totalCompanies = Number((await q('SELECT COUNT(*) AS c FROM companies WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 77) DAY)'))[0].c);
  check('growth: new companies total matches the table', r.body.totals.new_companies === totalCompanies && r.body.weeks.reduce((s, w) => s + w.new_companies, 0) === totalCompanies);
  check('growth: current week has active companies from audit (1 and 3) and no superadmin_* counting', last.active_companies === 2, JSON.stringify(last));
  check('growth: company created 15 days ago lands in an earlier week', r.body.weeks.slice(0, 10).reduce((s, w) => s + w.new_companies, 0) >= 1);
  check('growth: new users excludes superadmin', r.body.totals.new_users === Number((await q("SELECT COUNT(*) AS c FROM users WHERE COALESCE(global_role,'user') <> 'superadmin' AND created_at >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 77) DAY)"))[0].c));

  console.log(`\n${pass} passed, ${fail} failed`);
  server.close();
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('TEST CRASHED', err);
  process.exit(2);
});
