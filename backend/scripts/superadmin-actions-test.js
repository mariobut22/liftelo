#!/usr/bin/env node
/*
 * End-to-end test of the superadmin company detail + audited actions + activate-plan rule against a THROWAWAY
 * MySQL/MariaDB (dev-only, no extra dependencies). Mounts the real routers (routes/superadmin.js, routes/billing.js)
 * in a tiny express app with a fake session and calls them over HTTP. Refuses to run on anything but a local test DB.
 *
 *   # scratch DB "tt" loaded from liftelo.sql + the subscription migrations (see docs/infrastructure.md section 15)
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=<port> TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *     node backend/scripts/superadmin-actions-test.js
 *
 * Run it on a FRESH database (it seeds users/companies and changes subscriptions). Exit code 0 = all checks passed.
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

const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require(path.join(__dirname, '../node_modules/bcrypt'));
const db = require('../db');
const { getCompanySubscription, getAccessState } = require('../utils/subscriptions');
const { resetRateLimit, MAX_FAILED_ATTEMPTS } = require('../utils/superadminActions');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  ${extra}`}`);
};

const PW = 'Sup3rSecret!pw';
const NEXT_YEAR = new Date().getFullYear() + 1;
const q = async (sql, params = []) => (await db.query(sql, params))[0];

(async () => {
  // ---- app with fake sessions: header x-uid = user id, x-company = req.companyId ----
  const app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    const uid = Number(req.headers['x-uid']) || null;
    if (uid) {
      const [row] = await q('SELECT global_role FROM users WHERE id = ?', [uid]);
      req.session = { user_id: uid, global_role: row?.global_role || 'user', user: { global_role: row?.global_role || 'user' } };
      req.companyId = Number(req.headers['x-company']) || null;
    }
    next();
  });
  app.use('/api/superadmin', require('../routes/superadmin'));
  app.use('/api/billing', require('../routes/billing'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { uid = 7, company, body } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-uid': String(uid), ...(company ? { 'x-company': String(company) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (_e) { json = null; }
    return { status: res.status, body: json };
  };
  const act = (companyId, name, fields = {}, opts = {}) =>
    call('POST', `/api/superadmin/companies/${companyId}/${name}`, { ...opts, body: { reason: 'Test reason', password: PW, ...fields } });
  const sub = async (cid) => (await q('SELECT cs.*, sp.code AS plan_code FROM company_subscriptions cs JOIN subscription_plans sp ON sp.id = cs.plan_id WHERE cs.company_id = ?', [cid]))[0];
  const access = async (cid) => getAccessState(await getCompanySubscription(cid));
  const auditCount = async (cid, action) => Number((await q('SELECT COUNT(*) AS c FROM audit_logs WHERE company_id = ? AND action = ?', [cid, action]))[0].c);
  const lastAudit = async (cid, action) => {
    const [r] = await q('SELECT * FROM audit_logs WHERE company_id = ? AND action = ? ORDER BY id DESC LIMIT 1', [cid, action]);
    if (!r) return null;
    return { ...r, metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata };
  };
  const hash = await bcrypt.hash(PW, 10);

  // ---- seed ----
  await q('UPDATE users SET password = ?, password_hash = ? WHERE id = 7', [hash, hash]);
  await q("INSERT INTO users (id, username, email, password, password_hash, role, global_role, is_active) VALUES (8, 'owner2', 'owner2@x.test', ?, ?, 'superadmin', 'superadmin', 1)", [hash, hash]);
  await q("INSERT INTO user_companies (user_id, company_id, role) VALUES (8, 1, 'viewer'), (7, 1, 'viewer')");
  await q("INSERT INTO invitations (email, company_id, role, token, expires_at, status) VALUES ('new@x.test', 1, 'technician', 'SECRET-TOKEN-XYZ', DATE_ADD(NOW(), INTERVAL 5 DAY), 'pending')");
  await q("INSERT INTO subscription_plans (code, name, billing_interval, price_cents, seats_included, trial_days, is_active) VALUES ('freebie', 'Freebie', 'monthly', 0, 1, 14, 1)");
  await q("INSERT INTO subscription_plans (code, name, billing_interval, price_cents, seats_included, trial_days, is_active, stripe_price_id) VALUES ('stripeplan', 'StripePlan', 'monthly', 5000, 1, 14, 1, 'price_x')");
  await q("INSERT INTO companies (id, name) VALUES (3, 'Third Co')");
  await q("INSERT INTO companies (id, name) VALUES (4, 'Stripe Co')");
  await q("INSERT INTO company_subscriptions (company_id, plan_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, stripe_customer_id, stripe_subscription_id) SELECT 4, id, 'active', NOW(), NULL, NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH), 'cus_secret', 'sub_secret' FROM subscription_plans WHERE code = 'pro'");
  await q("INSERT INTO users (id, username, email, password, password_hash, role, is_active) VALUES (20, 'stripeadmin', 'sa@stripe.test', ?, ?, 'admin', 1)", [hash, hash]);
  await q("INSERT INTO user_companies (user_id, company_id, role) VALUES (20, 4, 'admin')");
  await q("INSERT INTO audit_logs (user_id, company_id, action, metadata) VALUES (1, 1, 'login', '{\"ip\":\"1.2.3.4\"}')");

  // ---- 1. authorization of the router itself ----
  let r = await call('GET', '/api/superadmin/companies/1', { uid: 1 });
  check('non-superadmin GET detail -> 403 forbidden', r.status === 403 && r.body.code === 'forbidden', JSON.stringify(r));
  r = await act(1, 'suspend', {}, { uid: 1 });
  check('non-superadmin action -> 403 forbidden', r.status === 403 && r.body.code === 'forbidden');
  check('non-superadmin action changed nothing', (await sub(1)).status === 'trial');

  // ---- 2. detail ----
  r = await call('GET', '/api/superadmin/companies/1');
  check('detail 200', r.status === 200 && r.body.id === 1, JSON.stringify(r).slice(0, 200));
  const text = JSON.stringify(r.body);
  check('detail has members/invitations/audit/plans/counts/limits/usage/access', ['members', 'invitations', 'audit', 'plans', 'total_locations', 'total_elevators', 'plan_limits', 'usage', 'access', 'limits', 'subscription'].every((k) => k in r.body));
  check('detail members include roles + is_self + other_companies', r.body.members.length >= 5 && r.body.members.some((m) => m.is_self) && r.body.members.find((m) => m.id === 1).other_companies === 1);
  check('detail superadmin member flagged', r.body.members.find((m) => m.id === 8).is_superadmin === true);
  check('detail pending invitation present, no token', r.body.invitations.length === 1 && !text.includes('SECRET-TOKEN'));
  check('detail has audit login row (ip not exposed)', r.body.audit.some((a) => a.action === 'login' && a.metadata === null) && !text.includes('1.2.3.4'));
  check('detail never leaks password hashes', !text.includes('$2b$') && !text.includes('password'));
  r = await call('GET', '/api/superadmin/companies/4');
  check('detail Stripe company: stripe_managed true, no ids', r.body.subscription.stripe_managed === true && r.body.subscription.has_stripe === true && !JSON.stringify(r.body).includes('cus_secret') && !JSON.stringify(r.body).includes('sub_secret'));
  r = await call('GET', '/api/superadmin/companies/999');
  check('detail unknown company -> 404 company_not_found', r.status === 404 && r.body.code === 'company_not_found');
  r = await call('GET', '/api/superadmin/companies/abc');
  check('detail bad id -> 400', r.status === 400 && r.body.code === 'invalid_request');

  // ---- 3. re-authentication, reason, rate limit ----
  r = await act(1, 'suspend', { reason: 'abc' });
  check('short reason -> 400 reason_required', r.status === 400 && r.body.code === 'reason_required');
  r = await act(1, 'suspend', { reason: undefined });
  check('missing reason -> 400 reason_required', r.status === 400 && r.body.code === 'reason_required');
  r = await act(1, 'suspend', { password: undefined });
  check('missing password -> 400 password_required', r.status === 400 && r.body.code === 'password_required');
  r = await act(1, 'suspend', { password: 'wrong-password' });
  check('wrong password -> 403 invalid_password', r.status === 403 && r.body.code === 'invalid_password');
  check('wrong password changed nothing', (await sub(1)).status === 'trial');
  check('failed attempt written to audit_logs', (await auditCount(1, 'superadmin_auth_failed')) === 1);
  for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) await act(1, 'suspend', { password: 'nope' });
  r = await act(1, 'suspend');
  check(`after ${MAX_FAILED_ATTEMPTS} failures even the right password -> 429 too_many_attempts`, r.status === 429 && r.body.code === 'too_many_attempts', JSON.stringify(r));
  check('429 attempt did not suspend', (await sub(1)).status === 'trial');
  check('blocked attempt audited', (await auditCount(1, 'superadmin_auth_blocked')) >= 1);
  resetRateLimit();
  r = await act(1, 'unsuspend');
  check('after limit reset, correct password passes auth (then 409 not suspended)', r.status === 409 && r.body.code === 'invalid_subscription_state');
  await act(1, 'suspend', { password: 'bad' });
  r = await act(3, 'suspend', { password: 'bad' }, { uid: 8 });
  check('rate limit is per superadmin user (other user unaffected: 403 not 429)', r.status === 403 && r.body.code === 'invalid_password');
  resetRateLimit();

  // ---- 4. plan ----
  r = await act(1, 'plan', { plan_code: 'nope' });
  check('plan unknown -> 404 plan_not_found', r.status === 404 && r.body.code === 'plan_not_found');
  r = await act(1, 'plan', { plan_code: 'pro', status: 'suspended' });
  check('plan status suspended not allowed -> 400 invalid_status', r.status === 400 && r.body.code === 'invalid_status');
  r = await act(1, 'plan', { plan_code: 'pro', status: 'active', trial_ends_at: `${NEXT_YEAR}-01-01` });
  check('trial_ends_at with status active -> 400 invalid_date', r.status === 400 && r.body.code === 'invalid_date');
  r = await act(1, 'plan', { plan_code: 'pro', status: 'active', period_end: '2000-01-01' });
  check('period_end in the past -> 400 invalid_date', r.status === 400 && r.body.code === 'invalid_date');
  r = await act(1, 'plan', { plan_code: 'pro; DROP TABLE users' });
  check('malformed plan_code -> 400', r.status === 400 && r.body.code === 'invalid_request');
  r = await act(1, 'plan', { plan_code: 'pro', status: 'active' });
  let s = await sub(1);
  check('plan -> pro/active', r.status === 200 && s.plan_code === 'pro' && s.status === 'active' && s.cancel_at_period_end === 0, JSON.stringify(r));
  const days = (new Date(s.current_period_end) - Date.now()) / 86400000;
  check('plan active gets ~1 month period', days > 27 && days < 32, String(days));
  let a = await lastAudit(1, 'superadmin_change_plan');
  check('plan audit row: user, reason, before/after', a && a.user_id === 7 && a.metadata.reason === 'Test reason' && a.metadata.before.plan_code === 'starter' && a.metadata.after.plan_code === 'pro' && a.metadata.before.status === 'trial' && a.metadata.after.status === 'active');
  r = await act(1, 'plan', { plan_code: 'corporate', status: 'active', period_end: `${NEXT_YEAR}-06-30` });
  s = await sub(1);
  check('plan with explicit period_end', r.status === 200 && new Date(s.current_period_end).getFullYear() === NEXT_YEAR && s.plan_code === 'corporate');
  r = await act(1, 'plan', { plan_code: 'starter', status: 'trial' });
  s = await sub(1);
  const td = (new Date(s.trial_ends_at) - Date.now()) / 86400000;
  check('plan back to trial: trial_ends_at = plan.trial_days from now, period end equal', r.status === 200 && s.status === 'trial' && td > 13 && td < 15 && +new Date(s.trial_ends_at) === +new Date(s.current_period_end), `${td}`);
  r = await act(1, 'plan', { plan_code: 'starter', status: 'trial', trial_ends_at: `${NEXT_YEAR}-02-03` });
  s = await sub(1);
  check('plan trial with explicit trial end', r.status === 200 && new Date(s.trial_ends_at).getFullYear() === NEXT_YEAR);

  // ---- 5. trial ----
  await q("UPDATE company_subscriptions SET trial_ends_at = DATE_SUB(NOW(), INTERVAL 5 DAY), current_period_end = DATE_SUB(NOW(), INTERVAL 5 DAY) WHERE company_id = 1");
  check('precondition: expired trial is locked', (await access(1)).locked && (await access(1)).reason === 'trial_expired');
  for (const bad of [0, 91, -1, 'x', 1.5, null]) {
    r = await act(1, 'trial', { days: bad });
    check(`trial days=${JSON.stringify(bad)} -> 400`, r.status === 400, JSON.stringify(r));
  }
  r = await act(1, 'trial', { days: 5, trial_ends_at: `${NEXT_YEAR}-01-01` });
  check('trial days + date together -> 400', r.status === 400 && r.body.code === 'invalid_request');
  r = await act(1, 'trial', { trial_ends_at: '2001-01-01' });
  check('trial end in past -> 400 invalid_date', r.status === 400 && r.body.code === 'invalid_date');
  r = await act(1, 'trial', { days: 10 });
  s = await sub(1);
  const e1 = (new Date(s.trial_ends_at) - Date.now()) / 86400000;
  check('extend expired trial by 10 days counts from now (+10d), unlocks', r.status === 200 && e1 > 9 && e1 < 11 && (await access(1)).locked === false, String(e1));
  r = await act(1, 'trial', { days: 5 });
  s = await sub(1);
  const e2 = (new Date(s.trial_ends_at) - Date.now()) / 86400000;
  check('extend running trial by 5 more days (+15d total)', r.status === 200 && e2 > 14 && e2 < 16, String(e2));
  a = await lastAudit(1, 'superadmin_trial');
  check('trial audit before/after', a && a.metadata.before.trial_ends_at && a.metadata.after.trial_ends_at && a.metadata.before.trial_ends_at !== a.metadata.after.trial_ends_at);
  r = await act(1, 'trial', { trial_ends_at: `${NEXT_YEAR}-12-31` });
  check('set trial end', r.status === 200 && new Date((await sub(1)).trial_ends_at).getFullYear() === NEXT_YEAR);
  r = await act(3, 'trial', { days: 3 });
  check('trial on company without subscription row creates starter trial first', r.status === 200 && (await sub(3)).status === 'trial');

  // ---- 6. grant free period ----
  await q("UPDATE company_subscriptions SET status = 'trial', trial_ends_at = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE company_id = 1");
  check('precondition: locked again', (await access(1)).locked);
  for (const bad of [0, 13, 'a', null, 2.5]) {
    r = await act(1, 'grant-free-period', { months: bad });
    check(`grant months=${JSON.stringify(bad)} -> 400`, r.status === 400, JSON.stringify(r));
  }
  r = await act(1, 'grant-free-period', { months: 3, plan_code: 'corporate' });
  s = await sub(1);
  const gm = (new Date(s.current_period_end) - Date.now()) / 86400000;
  check('grant 3 months: active, corporate, ~3 months, unlocked', r.status === 200 && s.status === 'active' && s.plan_code === 'corporate' && gm > 85 && gm < 95 && (await access(1)).locked === false, `${gm}`);
  a = await lastAudit(1, 'superadmin_grant_free_period');
  check('grant audit has months + before(trial)/after(active)', a && a.metadata.months === 3 && a.metadata.before.status === 'trial' && a.metadata.after.status === 'active');
  r = await act(1, 'grant-free-period', { months: 1, plan_code: 'ghost' });
  check('grant with unknown plan -> 404 and nothing changed', r.status === 404 && (await sub(1)).plan_code === 'corporate');

  // ---- 7. suspend / unsuspend / cancel ----
  r = await act(1, 'suspend');
  check('suspend -> locked (getAccessState subscription_inactive)', r.status === 200 && (await sub(1)).status === 'suspended' && (await access(1)).locked && (await access(1)).reason === 'subscription_inactive');
  r = await act(1, 'suspend');
  check('suspend twice -> 409 invalid_subscription_state', r.status === 409 && r.body.code === 'invalid_subscription_state');
  r = await act(1, 'trial', { days: 3 });
  check('trial on suspended -> 409 invalid_subscription_state', r.status === 409 && r.body.code === 'invalid_subscription_state');
  r = await act(1, 'unsuspend');
  check('unsuspend -> restored to previous status (active), unlocked', r.status === 200 && (await sub(1)).status === 'active' && (await access(1)).locked === false, JSON.stringify(r));
  a = await lastAudit(1, 'superadmin_unsuspend');
  check('unsuspend audit has restored_status', a && a.metadata.restored_status === 'active' && a.metadata.before.status === 'suspended');
  r = await act(1, 'cancel');
  check('cancel -> canceled + locked', r.status === 200 && (await sub(1)).status === 'canceled' && (await access(1)).locked);
  r = await act(1, 'cancel');
  check('cancel twice -> 409', r.status === 409);
  await q("UPDATE company_subscriptions SET status = 'trial', trial_ends_at = DATE_ADD(NOW(), INTERVAL 9 DAY) WHERE company_id = 1");
  await act(1, 'suspend');
  r = await act(1, 'unsuspend');
  check('unsuspend of a suspended trial restores trial', r.status === 200 && (await sub(1)).status === 'trial');
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = 1");

  // ---- 8. Stripe-managed refusal ----
  for (const [name, body] of [['plan', { plan_code: 'starter' }], ['trial', { days: 5 }], ['grant-free-period', { months: 1 }], ['suspend', {}], ['unsuspend', {}], ['cancel', {}]]) {
    r = await act(4, name, body);
    check(`stripe-managed ${name} -> 409 stripe_managed`, r.status === 409 && r.body.code === 'stripe_managed', JSON.stringify(r));
  }
  const s4 = await sub(4);
  check('stripe-managed subscription untouched', s4.status === 'active' && s4.plan_code === 'pro');
  r = await act(4, 'limits', { admin_limit_override: 7 });
  check('limit overrides still allowed for stripe-managed', r.status === 200 && (await sub(4)).admin_limit_override === 7);

  // ---- 9. limit overrides ----
  for (const bad of [{}, { admin_limit_override: -1 }, { admin_limit_override: 'x' }, { technician_limit_override: 1001 }, { technician_limit_override: 1.5 }]) {
    r = await act(1, 'limits', bad);
    check(`limits ${JSON.stringify(bad)} -> 400`, r.status === 400 && r.body.code === 'invalid_request', JSON.stringify(r));
  }
  r = await act(1, 'limits', { admin_limit_override: 4, technician_limit_override: 6 });
  s = await sub(1);
  check('limits set', r.status === 200 && s.admin_limit_override === 4 && s.technician_limit_override === 6);
  r = await act(1, 'limits', { admin_limit_override: null });
  s = await sub(1);
  check('limit null clears only that field', s.admin_limit_override === null && s.technician_limit_override === 6);
  a = await lastAudit(1, 'superadmin_limits');
  check('limits audit before/after', a && a.metadata.before.admin_limit_override === 4 && a.metadata.after.admin_limit_override === null);
  r = await call('GET', '/api/superadmin/companies/1');
  check('detail shows effective limits + override flags', r.body.limits.technician === 6 && r.body.limits.technician_override === true && r.body.limits.admin_override === false);

  // ---- 10. user actions ----
  await q("UPDATE company_subscriptions SET admin_limit_override = NULL, technician_limit_override = NULL, plan_id = (SELECT id FROM subscription_plans WHERE code = 'starter') WHERE company_id = 1");
  // company 1 now (starter: 1 admin, 2 technicians): admins 1+3 (2 > limit), technicians 5, 6, viewers 7, 8
  r = await act(1, 'users/7/disable');
  check('self-target disable -> 400 cannot_target_self', r.status === 400 && r.body.code === 'cannot_target_self');
  r = await act(1, 'users/7/remove');
  check('self-target remove -> 400 cannot_target_self', r.status === 400 && r.body.code === 'cannot_target_self');
  r = await act(1, 'users/7/role', { role: 'admin' });
  check('self-target role -> 400 cannot_target_self', r.status === 400 && r.body.code === 'cannot_target_self');
  for (const name of ['disable', 'remove']) {
    r = await act(1, `users/8/${name}`);
    check(`other superadmin ${name} -> 403 cannot_target_superadmin`, r.status === 403 && r.body.code === 'cannot_target_superadmin');
  }
  r = await act(1, 'users/8/role', { role: 'admin' });
  check('promote/modify other superadmin role -> 403', r.status === 403 && r.body.code === 'cannot_target_superadmin');
  r = await act(1, 'users/20/disable');
  check('user of another company -> 404 user_not_found', r.status === 404 && r.body.code === 'user_not_found');
  r = await act(1, 'users/999/disable');
  check('unknown user -> 404 user_not_found', r.status === 404 && r.body.code === 'user_not_found');
  r = await act(1, 'users/abc/disable');
  check('bad user id -> 400', r.status === 400 && r.body.code === 'invalid_request');
  r = await act(999, 'users/6/disable');
  check('unknown company on user action -> 404 company_not_found', r.status === 404 && r.body.code === 'company_not_found');

  r = await act(1, 'users/6/disable');
  let [u] = await q('SELECT is_active, disabled_at FROM users WHERE id = 6');
  check('disable: is_active=0 AND disabled_at set', r.status === 200 && u.is_active === 0 && u.disabled_at !== null, JSON.stringify(u));
  a = await lastAudit(1, 'superadmin_user_disable');
  check('disable audit: target id, before/after', a && a.metadata.target_user_id === 6 && a.metadata.before.is_active === true && a.metadata.after.is_active === false);
  r = await act(1, 'users/6/disable');
  check('disable twice -> 409 invalid_user_state', r.status === 409 && r.body.code === 'invalid_user_state');
  r = await call('GET', '/api/superadmin/companies/1');
  check('disabled user no longer counted in usage', r.body.usage.technicians === 1 && r.body.members.find((m) => m.id === 6).is_active === false);
  r = await act(1, 'users/6/enable');
  [u] = await q('SELECT is_active, disabled_at FROM users WHERE id = 6');
  check('enable: is_active=1 AND disabled_at NULL', r.status === 200 && u.is_active === 1 && u.disabled_at === null);
  r = await act(1, 'users/6/enable');
  check('enable twice -> 409 invalid_user_state', r.status === 409 && r.body.code === 'invalid_user_state');
  r = await act(1, 'users/5/enable');
  [u] = await q('SELECT is_active, disabled_at FROM users WHERE id = 5');
  check('enable clears legacy disabled_at (user 5 had one)', r.status === 200 && u.disabled_at === null && u.is_active === 1);

  // role changes + plan limit
  r = await act(1, 'users/3/role', { role: 'god' });
  check('role invalid -> 400 invalid_role', r.status === 400 && r.body.code === 'invalid_role');
  r = await act(1, 'users/3/role', { role: 'superadmin' });
  check('role superadmin not accepted -> 400 invalid_role', r.status === 400 && r.body.code === 'invalid_role');
  r = await act(1, 'users/3/role', { role: 'admin' });
  check('same role -> 409 invalid_user_state', r.status === 409 && r.body.code === 'invalid_user_state');
  r = await act(1, 'users/7/role', { role: 'viewer' });
  // technicians now 2 (5, 6) + 1 pending technician invite = 3 reserved > limit 2 for starter
  r = await act(1, 'users/3/role', { role: 'technician' });
  check('admin->technician beyond plan limit -> 409 role_limit_reached', r.status === 409 && r.body.code === 'role_limit_reached' && r.body.role === 'technician' && r.body.limit === 2, JSON.stringify(r));
  check('role limit refusal changed nothing', (await q('SELECT role FROM user_companies WHERE user_id = 3 AND company_id = 1'))[0].role === 'admin');
  r = await act(1, 'users/1/role', { role: 'viewer' });
  check('role -> viewer (unlimited) ok', r.status === 200 && (await q('SELECT role FROM user_companies WHERE user_id = 1 AND company_id = 1'))[0].role === 'viewer');
  a = await lastAudit(1, 'superadmin_user_role');
  check('role audit before/after', a && a.metadata.before.role === 'admin' && a.metadata.after.role === 'viewer' && a.metadata.target_user_id === 1);
  r = await act(1, 'limits', { technician_limit_override: 4 });
  r = await act(1, 'users/3/role', { role: 'technician' });
  check('after raising the override the same role change works', r.status === 200 && (await q('SELECT role FROM user_companies WHERE user_id = 3 AND company_id = 1'))[0].role === 'technician', JSON.stringify(r));

  // remove membership
  const [{ c: usersBefore }] = await q('SELECT COUNT(*) AS c FROM users');
  r = await act(1, 'users/6/remove');
  check('remove: membership row gone, user row kept', r.status === 200 && (await q('SELECT COUNT(*) AS c FROM user_companies WHERE user_id = 6 AND company_id = 1'))[0].c === 0 && (await q('SELECT COUNT(*) AS c FROM users'))[0].c === usersBefore);
  r = await act(1, 'users/6/remove');
  check('remove again -> 404 user_not_found', r.status === 404 && r.body.code === 'user_not_found');
  check('other companies untouched by remove (user 1 still in company 2)', (await q('SELECT COUNT(*) AS c FROM user_companies WHERE user_id = 1 AND company_id = 2'))[0].c === 1);
  a = await lastAudit(1, 'superadmin_user_remove');
  check('remove audit', a && a.metadata.target_user_id === 6 && a.metadata.before.role === 'technician');
  r = await act(4, 'users/20/disable');
  check('user actions allowed on stripe-managed company', r.status === 200);

  // ---- 11. transactions: failing audit insert rolls the change back ----
  await q("UPDATE company_subscriptions SET status = 'active' WHERE company_id = 1");
  await q("CREATE TRIGGER t_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.action = 'superadmin_suspend' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'boom'; END IF; END");
  r = await act(1, 'suspend');
  await q('DROP TRIGGER t_fail_audit');
  check('audit insert failure -> 500 and the change is rolled back', r.status === 500 && (await sub(1)).status === 'active', JSON.stringify(r));
  r = await act(1, 'suspend');
  check('after restoring the table the same action works', r.status === 200 && (await sub(1)).status === 'suspended');
  await act(1, 'unsuspend');

  // ---- 12. audit hygiene ----
  const all = await q('SELECT metadata FROM audit_logs');
  check('password never stored in audit_logs', !JSON.stringify(all).includes(PW) && !JSON.stringify(all).includes('wrong-password'));
  r = await call('GET', '/api/superadmin/companies/1');
  check('detail audit rows expose superadmin_* metadata (reason/before/after) and are newest first', r.body.audit.length <= 30 && r.body.audit[0].action.startsWith('superadmin_') && r.body.audit.find((x) => x.action === 'superadmin_change_plan').metadata.reason === 'Test reason' && r.body.audit.every((x, i, arr) => i === 0 || arr[i - 1].created_at >= x.created_at));
  const fails = r.body.audit.filter((x) => x.action === 'superadmin_auth_failed');
  check('failed re-auth attempts are visible and carry no password', fails.length >= 1 && !JSON.stringify(fails).includes(PW));

  // ---- 13. create company ----
  const create = (b, uid = 7) => call('POST', '/api/superadmin/companies', { uid, body: b });
  r = await create({ name: 'New Co', admin_email: 'boss@newco.test', admin_password: 'longenough1' });
  check('create company 201', r.status === 201 && r.body.company_id && r.body.admin_user_id, JSON.stringify(r));
  const newId = r.body.company_id;
  let ns = await sub(newId);
  const nd = (new Date(ns.trial_ends_at) - Date.now()) / 86400000;
  check('new company: starter trial of plan trial_days', ns.plan_code === 'starter' && ns.status === 'trial' && nd > 13 && nd < 15, JSON.stringify(ns));
  const [nu] = await q('SELECT * FROM users WHERE id = ?', [r.body.admin_user_id]);
  check('new admin: user, global_role user, is_active, membership admin, can log in (password_hash)', nu.global_role === 'user' && nu.is_active === 1 && (await bcrypt.compare('longenough1', nu.password_hash)) && (await q('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?', [nu.id, newId]))[0].role === 'admin');
  check('create company audited', (await auditCount(newId, 'superadmin_create_company')) === 1);
  r = await create({ name: 'Pro Co', admin_email: 'boss@proco.test', admin_password: 'longenough1', plan_code: 'pro', trial_days: 30, global_role: 'superadmin', role: 'superadmin' });
  ns = await sub(r.body.company_id);
  const pd = (new Date(ns.trial_ends_at) - Date.now()) / 86400000;
  const [pu] = await q('SELECT global_role, role FROM users WHERE id = ?', [r.body.admin_user_id]);
  check('create with plan_code+trial_days; smuggled global_role/role ignored (no superadmin creation)', ns.plan_code === 'pro' && pd > 29 && pd < 31 && pu.global_role === 'user' && pu.role === 'admin', JSON.stringify({ ns, pu }));
  r = await create({ name: 'Dup', admin_email: 'boss@newco.test', admin_password: 'longenough1' });
  check('duplicate admin email -> 409 email_exists', r.status === 409 && r.body.code === 'email_exists');
  const [{ c: cBefore }] = await q('SELECT COUNT(*) AS c FROM companies');
  for (const [b, code] of [[{ name: 'x', admin_email: 'not-an-email', admin_password: 'longenough1' }, 'invalid_email'], [{ name: 'x', admin_email: 'a@b.test', admin_password: 'short' }, 'password_too_short'], [{ name: '', admin_email: 'a@b.test', admin_password: 'longenough1' }, 'missing_required_fields'], [{ name: 'x', admin_email: 'a@b.test', admin_password: 'longenough1', plan_code: 'ghost' }, 'plan_not_found'], [{ name: 'x', admin_email: 'a@b.test', admin_password: 'longenough1', trial_days: 999 }, 'invalid_request']]) {
    r = await create(b);
    check(`create validation -> ${code}`, r.body?.code === code, JSON.stringify(r));
  }
  check('failed validations created no companies', (await q('SELECT COUNT(*) AS c FROM companies'))[0].c === cBefore);
  r = await create({ name: 'x', admin_email: 'a@b.test', admin_password: 'longenough1' }, 1);
  check('non-superadmin cannot create company -> 403', r.status === 403);

  // ---- 14. activate-plan rule ----
  const activate = (planCode, uid, company) => call('POST', '/api/billing/activate-plan', { uid, company, body: { plan_code: planCode } });
  await q("UPDATE company_subscriptions SET status = 'trial', trial_ends_at = DATE_ADD(NOW(), INTERVAL 9 DAY), plan_id = (SELECT id FROM subscription_plans WHERE code = 'starter') WHERE company_id = 2");
  r = await activate('pro', 1, 2);
  check('company admin, paid plan without stripe price -> 409 payment_required', r.status === 409 && r.body.code === 'payment_required', JSON.stringify(r));
  r = await activate('starter', 1, 2);
  check('company admin, paid starter -> 409 payment_required', r.status === 409 && r.body.code === 'payment_required');
  check('subscription unchanged after refusal', (await sub(2)).plan_code === 'starter' && (await sub(2)).status === 'trial');
  r = await activate('stripeplan', 1, 2);
  check('plan with stripe price + stripe configured -> stripe_checkout_required (unchanged behaviour)', r.status === 409 && r.body.code === 'stripe_checkout_required');
  r = await activate('freebie', 1, 2);
  check('company admin, free plan (price 0) -> allowed', r.status === 200 && (await sub(2)).plan_code === 'freebie' && (await sub(2)).status === 'active', JSON.stringify(r).slice(0, 200));
  r = await activate('pro', 7, 2);
  check('superadmin, paid plan -> allowed', r.status === 200 && (await sub(2)).plan_code === 'pro', JSON.stringify(r).slice(0, 200));
  a = await lastAudit(2, 'subscription_activate_plan');
  check('activate-plan audit marks superadmin', a && a.metadata.by_superadmin === true);
  r = await activate('pro', 5, 1);
  check('non-admin member still forbidden', r.status === 403 && r.body.code === 'forbidden');

  console.log(`\n${pass} passed, ${fail} failed`);
  server.close();
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('TEST CRASHED', err);
  process.exit(2);
});
