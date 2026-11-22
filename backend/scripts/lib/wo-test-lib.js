// Shared setup for work-order-link-test.js / recurring-test.js / calendar-test.js (throwaway DB only, same refusal rules as
// rms-overview-test.js). Starts the real backend/index.js in-process, creates two companies with admin/technician/viewer users.
'use strict';

const os = require('os');
const path = require('path');

module.exports = function setup(label, defaultPort) {
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
  const PORT = Number(process.env.TENANT_TEST_PORT || defaultPort);
  Object.assign(process.env, {
    DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
    SESSION_SECRET: `${label}-test-secret`, PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
    MULTI_COMPANY_ENABLED: 'false'
  });
  const BACKEND = path.join(__dirname, '..', '..');
  const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'));
  const db = require(path.join(BACKEND, 'db'));
  const BASE = `http://127.0.0.1:${PORT}`;

  let passed = 0;
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (ok) { passed += 1; console.log(`  ok    ${name}`); } else { failed += 1; console.log(`  FAIL  ${name} ${detail}`); }
  };

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

  async function world() {
    const tag = Date.now().toString(36);
    const pw = 'Test-pass-123';
    const hash = await bcrypt.hash(pw, 4);
    const q = async (sql, params = []) => (await db.query(sql, params))[0];
    const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
    const A = await mkCompany(`${label} A`);
    const B = await mkCompany(`${label} B`);
    const mkUser = async (name, companyId, role) => {
      const email = `${name}-${tag}@wo.test`;
      const r = await q(
        `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
        [`${name}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, name, companyId, email]
      );
      await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
      return { id: r.insertId, email };
    };
    const u = {
      adminA: await mkUser('adminA', A, 'admin'),
      techA: await mkUser('techA', A, 'technician'),
      tech2A: await mkUser('tech2A', A, 'technician'),
      viewerA: await mkUser('viewerA', A, 'viewer'),
      adminB: await mkUser('adminB', B, 'admin')
    };
    const mkLocation = async (companyId, name, freq = 1) => (await q(
      'INSERT INTO locations (name, address, company_id, rms_frequency) VALUES (?, ?, ?, ?)', [`${name}-${tag}`, `${name} street 1`, companyId, freq])).insertId;
    const mkElevator = async (companyId, locationId, name) => (await q(
      'INSERT INTO elevators (company_id, location_id, label) VALUES (?, ?, ?)', [companyId, locationId, name])).insertId;
    for (const companyId of [A, B]) {
      await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
               SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
    }
    require(path.join(BACKEND, 'index.js'));
    await new Promise((r) => setTimeout(r, 1500));
    const cookies = {};
    for (const [k, v] of Object.entries(u)) cookies[k] = await login(v.email, pw);
    return { tag, A, B, u, cookies, q, mkLocation, mkElevator };
  }

  const finish = async () => {
    console.log(`\n${passed} passed, ${failed} failed`);
    try { await db.end(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  };

  return { BACKEND, db, api, check, world, finish };
};
