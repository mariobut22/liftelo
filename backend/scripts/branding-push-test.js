#!/usr/bin/env node
/*
 * Company branding (logo + accent colour on PDFs) and Web Push, against a THROWAWAY MySQL/MariaDB.
 * Same setup/refusal rules as signatures-test.js (database "tt" / "*_test" on localhost, FRESH database, all migrations applied,
 * incl. 20261122_company_branding.sql and 20261122_push_subscriptions.sql). NO network: web-push is replaced by a mock sender.
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3641 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   TENANT_TEST_PORT=3642 node backend/scripts/branding-push-test.js
 *
 * Proves: logo upload validation (magic bytes, size, roles), company-scoped storage + access, accent colour validation, remove logo;
 * RMS / intervention / work order PDFs generate with and without logo and use the accent colour; signed documents keep their frozen
 * snapshot and hash/verification when the branding changes; push: subscribe/unsubscribe (own user, company scoped, validation),
 * disabled without VAPID env, createNotification / findings notifications trigger a push, failures never break the request,
 * 404/410 remove the subscription. Writes a few fixture files into backend/uploads and removes them again.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

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
const PORT = Number(process.env.TENANT_TEST_PORT || 3642);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'branding-push-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
  MULTI_COMPANY_ENABLED: 'false'
});
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_SUBJECT;

const BACKEND = path.join(__dirname, '..');
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'));
const db = require(path.join(BACKEND, 'db'));

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};

const BASE = `http://127.0.0.1:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// minimal JPEG header with a valid SOF0 segment (1x1, 3 components): enough for the magic bytes + size check
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function call(method, url, { cookie, json, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  } catch (err) {
    return { status: 0, body: `no response (${err.message})`, headers: new Headers(), buf: Buffer.alloc(0) };
  }
  if (res.status === 302 && method === 'GET' && /\/pdf(\?|$)/.test(url) && res.headers.get('location')) {
    const followed = await fetch(BASE + res.headers.get('location'), { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(60000) });
    return { status: followed.status, body: null, headers: followed.headers, buf: Buffer.from(await followed.arrayBuffer()) };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  let parsed = null;
  try { parsed = JSON.parse(buf.toString('utf8')); } catch { parsed = null; }
  return { status: res.status, body: parsed, headers: res.headers, buf };
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

const logoForm = (buf, type, name = 'logo.bin') => {
  const form = new FormData();
  if (buf) form.append('logo', new Blob([buf], { type }), name);
  return form;
};
const signForm = () => {
  const form = new FormData();
  form.append('technician_signature', new Blob([PNG], { type: 'image/png' }), 't.png');
  return form;
};

// all content streams of a PDF, inflated (pdfkit compresses them)
function pdfText(buf) {
  const raw = buf.toString('latin1');
  let out = raw;
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(raw))) {
    try { out += `\n${zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')}`; } catch { /* binary image data */ }
  }
  return out;
}
const imageCount = (buf) => (buf.toString('latin1').match(/\/Subtype \/Image/g) || []).length;
// does the PDF paint something with this colour (fill "r g b rg" or stroke "r g b RG")?
function usesColor(buf, hex) {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const re = /(\d*\.?\d+) (\d*\.?\d+) (\d*\.?\d+) (?:rg|RG|scn|SCN)/g;
  const text = pdfText(buf);
  let m;
  while ((m = re.exec(text))) {
    if ([1, 2, 3].every((k) => Math.abs(Number(m[k]) - want[k - 1]) < 0.01)) return true;
  }
  return false;
}

const uploadsRoot = path.join(BACKEND, 'uploads');

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params) => Number((await q(sql, params))[0].c);
  const created = [];

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Brand A');
  const B = await mkCompany('Brand B');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@brand.test`;
    const r = await q(
      `INSERT INTO users (username, password, password_hash, role, full_name, company_id, email, is_active, is_verified, global_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'user')`,
      [`${label}-${tag}`, hash, hash, role === 'viewer' ? 'technician' : role, `Full ${label}`, companyId, email]
    );
    await q('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)', [r.insertId, companyId, role]);
    return { id: r.insertId, email, username: `${label}-${tag}`, full_name: `Full ${label}` };
  };
  const adminA = await mkUser('adminA', A, 'admin');
  const techA = await mkUser('techA', A, 'technician');
  const viewerA = await mkUser('viewerA', A, 'viewer');
  const adminB = await mkUser('adminB', B, 'admin');
  const locA = (await q('INSERT INTO locations (name, address, company_id) VALUES (?, ?, ?)', [`LocA-${tag}`, 'A street 1', A])).insertId;
  await q('INSERT INTO elevators (location_id, company_id, label) VALUES (?, ?, ?)', [locA, A, 'EL-A']);
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
  const logoOf = async (id) => (await q('SELECT logo_path, brand_accent_color FROM companies WHERE id = ?', [id]))[0];
  const abs = (p) => path.join(BACKEND, p);

  // ============================================================== PART 1: branding
  console.log('\n[logo upload: validation]');
  let r = await call('POST', '/api/company/logo', { cookie: cTechA, form: logoForm(PNG, 'image/png') });
  check('technician cannot upload a logo -> 403', r.status === 403, `got ${r.status}`);
  r = await call('POST', '/api/company/logo', { cookie: cViewerA, form: logoForm(PNG, 'image/png') });
  check('viewer cannot upload a logo -> 403', r.status === 403, `got ${r.status}`);
  r = await call('POST', '/api/company/logo', { cookie: undefined, form: logoForm(PNG, 'image/png') });
  check('anonymous -> 401', r.status === 401, `got ${r.status}`);
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(null) });
  check('no file -> 400 logo_required', r.status === 400 && r.body?.code === 'logo_required', JSON.stringify(r.body));
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(Buffer.from('<html><script>alert(1)</script></html> padding padding'), 'image/png', 'logo.png') });
  check('HTML sent as image/png -> 415 invalid_file_type (magic bytes, not mimetype)', r.status === 415 && r.body?.code === 'invalid_file_type', `got ${r.status} ${JSON.stringify(r.body)}`);
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40)]), 'image/png', 'logo.png') });
  check('GIF disguised as PNG -> 415', r.status === 415);
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(Buffer.concat([PNG.subarray(0, 8), Buffer.from('not really')]), 'image/png') });
  check('PNG signature without a readable header -> 415', r.status === 415, `got ${r.status}`);
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(Buffer.concat([PNG, Buffer.alloc(1.2 * 1024 * 1024)]), 'image/png') });
  check('over 1 MB -> 400 logo_too_large', r.status === 400 && r.body?.code === 'logo_too_large', `got ${r.status} ${JSON.stringify(r.body)}`);
  check('rejected uploads left no logo and no file', (await logoOf(A)).logo_path === null
    && !fs.readdirSync(path.join(uploadsRoot, 'company-logos')).some((f) => f.startsWith(`${A}-`)));

  console.log('\n[logo upload: store, replace, access, remove]');
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(PNG, 'application/octet-stream', 'evil.html') });
  const first = r.body?.path;
  created.push(first);
  check('valid PNG (even with a wrong mimetype/name) -> 200, path in company-logos with the company prefix',
    r.status === 200 && new RegExp(`^/uploads/company-logos/${A}-.+\\.png$`).test(first || ''), JSON.stringify(r.body));
  check('stored file exists in uploads/ (outside the deploy-synced code) and DB points to it', fs.existsSync(abs(first)) && (await logoOf(A)).logo_path === first);
  check('extension comes from the content, never from the client name (.html ignored)', !String(first).includes('html'));
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(JPG, 'image/jpeg') });
  const second = r.body?.path;
  created.push(second);
  check('JPEG accepted -> .jpg', r.status === 200 && /\.jpg$/.test(second || ''), JSON.stringify(r.body));
  check('previous logo file removed after the new one was saved', !fs.existsSync(abs(first)) && fs.existsSync(abs(second)));
  r = await call('GET', `/api${second}`, { cookie: cAdminA });
  check('own company can read the logo via /api/uploads', r.status === 200);
  r = await call('GET', `/api${second}`, { cookie: cAdminB });
  check('other company cannot read the logo -> 404', r.status === 404, `got ${r.status}`);
  r = await call('GET', `/api${second}`, {});
  check('anonymous cannot read the logo -> 401', r.status === 401, `got ${r.status}`);
  check('company B has no logo (isolation)', (await logoOf(B)).logo_path === null);
  r = await call('GET', '/api/company', { cookie: cAdminA });
  check('GET /api/company returns logo_path and brand_accent_color', r.status === 200 && r.body?.logo_path === second && 'brand_accent_color' in r.body, JSON.stringify(r.body));

  console.log('\n[accent colour]');
  r = await call('PUT', '/api/company/branding', { cookie: cTechA, json: { accent_color: '#1D4ED8' } });
  check('technician cannot set the colour -> 403', r.status === 403);
  for (const bad of ['red', '#12345', '#GGGGGG', '1D4ED8', 'javascript:alert(1)', '#1D4ED8;color:red', 123, { a: 1 }, '#1D4ED8FF']) {
    r = await call('PUT', '/api/company/branding', { cookie: cAdminA, json: { accent_color: bad } });
    check(`invalid colour ${JSON.stringify(bad)} -> 400 invalid_accent_color`, r.status === 400 && r.body?.code === 'invalid_accent_color', `got ${r.status}`);
  }
  check('invalid colours changed nothing', (await logoOf(A)).brand_accent_color === null);
  r = await call('PUT', '/api/company/branding', { cookie: cAdminA, json: { accent_color: ' #1d4ed8 ' } });
  check('valid colour (trimmed, upper-cased) -> 200 #1D4ED8', r.status === 200 && r.body?.brand_accent_color === '#1D4ED8' && (await logoOf(A)).brand_accent_color === '#1D4ED8', JSON.stringify(r.body));
  check('company B colour untouched', (await logoOf(B)).brand_accent_color === null);

  console.log('\n[PDFs: with and without branding]');
  const { generatePdfForRms } = require(path.join(BACKEND, 'utils', 'rms-pdf'));
  const { generateInterventionPdfById } = require(path.join(BACKEND, 'utils', 'intervention-pdf'));
  const { generatePdfForWorkOrder } = require(path.join(BACKEND, 'utils', 'work-order-pdf'));
  const { loadBranding } = require(path.join(BACKEND, 'utils', 'pdfBranding'));
  const rmsId = (await q('INSERT INTO rms_visits (location_id, user_id, visit_date, notes_general, company_id) VALUES (?, ?, CURDATE(), ?, ?)', [locA, techA.id, 'note', A])).insertId;
  await q('INSERT INTO rms_visit_items (visit_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [rmsId, 'EL-A', 'O.K.', 'fine', A]);
  const intId = (await q(`INSERT INTO interventions (date, technician, location_id, company_id, uploaded_files, status, notes, created_by_user_id)
    VALUES (NOW(), ?, ?, ?, '', 'O.K.', 'int note', ?)`, [techA.username, locA, A, techA.id])).insertId;
  await q('INSERT INTO intervention_items (intervention_id, elevator_label, status, comment, company_id) VALUES (?, ?, ?, ?, ?)', [intId, 'EL-A', 'O.K.', 'item', A]);
  const woId = (await q('INSERT INTO work_orders (company_id, location_id, status, created_by_user_id) VALUES (?, ?, ?, ?)', [A, locA, 'open', adminA.id])).insertId;
  const tmp = (n) => path.join(os.tmpdir(), `brand-${tag}-${n}.pdf`);
  const gen = {
    rms: async (n) => { await generatePdfForRms(rmsId, A, { language: 'en', outputPath: tmp(n) }); return fs.readFileSync(tmp(n)); },
    int: async (n) => { await generateInterventionPdfById(intId, A, tmp(n), { language: 'en' }); return fs.readFileSync(tmp(n)); },
    wo: async () => { const out = await generatePdfForWorkOrder(woId, A, { language: 'en' }); created.push(out.filePath); return fs.readFileSync(out.filePath); }
  };
  const branded = { rms: await gen.rms('r1'), int: await gen.int('i1'), wo: await gen.wo() };
  // without branding: company B has neither logo nor colour; the same documents for A, then with A's branding removed
  await q('UPDATE companies SET logo_path = NULL, brand_accent_color = NULL WHERE id = ?', [A]);
  const plain = { rms: await gen.rms('r0'), int: await gen.int('i0'), wo: await gen.wo() };
  for (const kind of ['rms', 'int', 'wo']) {
    check(`${kind}: a valid PDF is generated with and without branding`, branded[kind].subarray(0, 5).toString() === '%PDF-' && plain[kind].subarray(0, 5).toString() === '%PDF-');
    check(`${kind}: the company logo is embedded only with a logo (more images)`, imageCount(branded[kind]) > imageCount(plain[kind]), `${imageCount(branded[kind])} vs ${imageCount(plain[kind])}`);
    check(`${kind}: accent colour used with branding, not without`, usesColor(branded[kind], '#1D4ED8') && !usesColor(plain[kind], '#1D4ED8'));
  }
  // light accents are darkened to stay readable on white paper
  await q('UPDATE companies SET brand_accent_color = ? WHERE id = ?', ['#FFFF00', A]);
  const b = await loadBranding(A);
  check('very light accent (#FFFF00) is darkened for text, raw accent kept', b.accent === '#FFFF00' && b.heading && b.heading !== '#FFFF00');
  // logo_path pointing at another company's file / odd paths never reaches the PDF
  const foreignName = `${B}-${Date.now()}-x.png`;
  fs.mkdirSync(path.join(uploadsRoot, 'company-logos'), { recursive: true });
  fs.writeFileSync(path.join(uploadsRoot, 'company-logos', foreignName), PNG);
  created.push(`/uploads/company-logos/${foreignName}`);
  for (const bad of [`/uploads/company-logos/${foreignName}`, '/uploads/company-logos/../index.js', '/etc/passwd', '/uploads/company-logos/1-x.png.html']) {
    await q('UPDATE companies SET logo_path = ? WHERE id = ?', [bad, A]);
    const bb = await loadBranding(A);
    check(`logo_path ${bad} is ignored (no logo)`, bb.logo === null);
  }
  await q('UPDATE companies SET logo_path = ? WHERE id = ?', [`/uploads/company-logos/${A}-missing-file.png`, A]);
  check('missing logo file is ignored and the PDF still generates', (await loadBranding(A)).logo === null && (await gen.rms('r2')).subarray(0, 5).toString() === '%PDF-');
  const brokenName = `${A}-${Date.now()}-broken.png`;
  fs.writeFileSync(path.join(uploadsRoot, 'company-logos', brokenName), Buffer.concat([PNG.subarray(0, 8), Buffer.from('garbage garbage')]));
  created.push(`/uploads/company-logos/${brokenName}`);
  await q('UPDATE companies SET logo_path = ? WHERE id = ?', [`/uploads/company-logos/${brokenName}`, A]);
  check('a PNG with a corrupt body never breaks PDF generation', (await gen.rms('r3')).subarray(0, 5).toString() === '%PDF-');

  console.log('\n[signed documents: frozen look, hash unaffected]');
  r = await call('POST', '/api/company/logo', { cookie: cAdminA, form: logoForm(PNG, 'image/png') });
  const signedLogo = r.body?.path;
  created.push(signedLogo);
  await q('UPDATE companies SET brand_accent_color = ? WHERE id = ?', ['#1D4ED8', A]);
  r = await call('POST', `/api/reports/rms/${rmsId}/sign`, { cookie: cTechA, form: signForm() });
  check('technician signs the RMS -> 200 with the snapshot', r.status === 200 && r.body?.snapshot_ok === true, JSON.stringify(r.body));
  const snap = (await q('SELECT * FROM report_snapshots WHERE company_id = ? AND report_type = ? AND report_id = ?', [A, 'rms', rmsId]))[0];
  const row0 = (await q('SELECT document_hash FROM rms_visits WHERE id = ?', [rmsId]))[0];
  created.push(snap.file_path);
  const snapBefore = fs.readFileSync(abs(snap.file_path));
  check('frozen snapshot carries the branding of the signing moment (logo + accent)', imageCount(snapBefore) >= 1 && usesColor(snapBefore, '#1D4ED8'));
  // change the branding completely after signing
  await call('DELETE', '/api/company/logo', { cookie: cAdminA });
  await call('PUT', '/api/company/branding', { cookie: cAdminA, json: { accent_color: '#B91C1C' } });
  let ver = await call('GET', `/api/reports/rms/${rmsId}/verify`, { cookie: cAdminA });
  check('verification still ok after the branding changed (hash_ok + pdf_ok)', ver.body?.status === 'ok' && ver.body.snapshots.every((s) => s.hash_ok && s.pdf_ok), JSON.stringify(ver.body));
  const row1 = (await q('SELECT document_hash FROM rms_visits WHERE id = ?', [rmsId]))[0];
  const snap1 = (await q('SELECT document_hash, pdf_sha256 FROM report_snapshots WHERE id = ?', [snap.id]))[0];
  check('content hash unchanged (row + snapshot)', row0.document_hash === row1.document_hash && snap.document_hash === snap1.document_hash && snap.pdf_sha256 === snap1.pdf_sha256);
  const dl = await call('GET', `/api/rms/${rmsId}/pdf`, { cookie: cAdminA });
  check('the signed document is served from the FROZEN snapshot (byte-identical, old look)', dl.status === 200 && dl.buf.equals(snapBefore) && usesColor(dl.buf, '#1D4ED8') && !usesColor(dl.buf, '#B91C1C'));
  const live = await call('GET', `/api/rms/${rmsId}/pdf?live=1&lang=en`, { cookie: cAdminA });
  check('?live=1 regenerates with the CURRENT branding (documented behaviour); no logo now', live.status === 200 && usesColor(live.buf, '#B91C1C') && imageCount(live.buf) < imageCount(snapBefore));
  ver = await call('GET', `/api/reports/rms/${rmsId}/verify`, { cookie: cAdminA });
  check('a live regeneration changes neither the snapshot nor the verification', ver.body?.status === 'ok' && sha(fs.readFileSync(abs(snap.file_path))) === snap.pdf_sha256);
  r = await call('GET', `/api/company`, { cookie: cAdminA });
  check('remove logo -> logo_path null in the API, file deleted', r.body?.logo_path === null && !fs.existsSync(abs(signedLogo)));
  r = await call('DELETE', '/api/company/logo', { cookie: cTechA });
  check('technician cannot remove the logo -> 403', r.status === 403);
  r = await call('DELETE', '/api/company/logo', { cookie: cAdminA });
  check('removing when there is no logo is fine (200)', r.status === 200);
  r = await call('PUT', '/api/company/branding', { cookie: cAdminA, json: { accent_color: null } });
  check('clearing the colour -> 200 null (default look)', r.status === 200 && r.body?.brand_accent_color === null && (await logoOf(A)).brand_accent_color === null);

  // ============================================================== PART 2: push
  console.log('\n[push: disabled without VAPID env]');
  const push = require(path.join(BACKEND, 'utils', 'push'));
  const sent = [];
  let failWith = null;
  push.setSender(async (sub, payload, options) => {
    if (failWith) { const e = new Error('mock failure'); e.statusCode = failWith; throw e; }
    sent.push({ sub, payload: JSON.parse(payload), options });
    return { statusCode: 201 };
  });
  r = await call('GET', '/api/push/config', { cookie: cTechA });
  check('config: enabled false, no key', r.status === 200 && r.body?.enabled === false && r.body?.public_key === null, JSON.stringify(r.body));
  const epA = 'https://push.example.test/send/AAAA-' + tag;
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
  r = await call('POST', '/api/push/subscribe', { cookie: cTechA, json: { endpoint: epA, keys } });
  check('subscribe while push is not configured -> 409 push_not_configured', r.status === 409 && r.body?.code === 'push_not_configured', JSON.stringify(r.body));
  const { createNotification } = require(path.join(BACKEND, 'utils', 'createNotification'));
  await createNotification({ userId: techA.id, type: 'x', title: 'no push expected', message: 'm' });
  await new Promise((res) => setTimeout(res, 200));
  check('no push is sent while disabled, notification still saved', sent.length === 0 && await count('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND title = ?', [techA.id, 'no push expected']) === 1);

  console.log('\n[push: subscribe / unsubscribe]');
  process.env.VAPID_PUBLIC_KEY = 'BPublicKeyForTestsOnly';
  process.env.VAPID_PRIVATE_KEY = 'private-key-for-tests-only';
  process.env.VAPID_SUBJECT = 'mailto:test@example.test';
  r = await call('GET', '/api/push/config', { cookie: cTechA });
  check('config: enabled true with the PUBLIC key only', r.body?.enabled === true && r.body?.public_key === 'BPublicKeyForTestsOnly' && !JSON.stringify(r.body).includes('private'), JSON.stringify(r.body));
  check('config requires a session', (await call('GET', '/api/push/config', {})).status === 401);
  check('subscribe requires a session', (await call('POST', '/api/push/subscribe', { json: { endpoint: epA, keys } })).status === 401);
  for (const [label, body] of [
    ['no endpoint', { keys }], ['http endpoint', { endpoint: 'http://push.example.test/x', keys }], ['not a url', { endpoint: 'nope', keys }],
    ['missing keys', { endpoint: epA }], ['bad key chars', { endpoint: epA, keys: { p256dh: '<script>', auth: keys.auth } }],
    ['giant endpoint', { endpoint: 'https://push.example.test/' + 'a'.repeat(2100), keys }]
  ]) {
    r = await call('POST', '/api/push/subscribe', { cookie: cTechA, json: body });
    check(`subscribe validation: ${label} -> 400 invalid_subscription`, r.status === 400 && r.body?.code === 'invalid_subscription', `got ${r.status}`);
  }
  r = await call('POST', '/api/push/subscribe', { cookie: cTechA, json: { endpoint: epA, keys } });
  check('subscribe -> 201', r.status === 201 && r.body?.subscribed === true, JSON.stringify(r));
  let rows = await q('SELECT * FROM push_subscriptions WHERE user_id = ?', [techA.id]);
  check('row stored for the session user + company, endpoint hash = sha256', rows.length === 1 && rows[0].company_id === A && rows[0].endpoint_hash === sha(epA));
  r = await call('POST', '/api/push/subscribe', { cookie: cTechA, json: { endpoint: epA, keys } });
  check('subscribing again is idempotent (still one row)', r.status === 201 && await count('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?', [techA.id]) === 1);
  r = await call('POST', '/api/push/subscribe', { cookie: cViewerA, json: { endpoint: 'https://push.example.test/send/VIEWER-' + tag, keys } });
  check('viewer may subscribe too (own notifications)', r.status === 201);
  r = await call('POST', '/api/push/unsubscribe', { cookie: cAdminB, json: { endpoint: epA } });
  check('another user (other company) cannot remove my subscription (removed 0)', r.status === 200 && r.body?.removed === 0 && await count('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?', [techA.id]) === 1);
  r = await call('POST', '/api/push/unsubscribe', { cookie: cViewerA, json: { endpoint: epA } });
  check('a colleague of the same company cannot remove it either', r.body?.removed === 0 && await count('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?', [techA.id]) === 1);
  r = await call('POST', '/api/push/unsubscribe', { cookie: cTechA, json: { endpoint: 'nope' } });
  check('unsubscribe validation -> 400', r.status === 400);

  console.log('\n[push: hook into notifications]');
  sent.length = 0;
  await createNotification({ userId: techA.id, type: 'work_order', titleKey: 'notifications:workOrderAssigned.title', messageKey: 'notifications:workOrderAssigned.message', params: { id: 7 }, link: '/dashboard/work-orders/7' });
  await new Promise((res) => setTimeout(res, 300));
  check('createNotification pushes to the user\'s device', sent.length === 1 && sent[0].sub.endpoint === epA && sent[0].sub.keys.auth === keys.auth, JSON.stringify(sent));
  check('payload: translated title/body, app link, tag; small', sent[0]?.payload.title && sent[0].payload.body.includes('7') && sent[0].payload.url === '/dashboard/work-orders/7' && sent[0].payload.tag === 'work_order');
  check('only the recipient\'s own subscription was used (viewer got nothing)', sent.every((s) => s.sub.endpoint === epA));
  sent.length = 0;
  await createNotification({ userId: techA.id, type: 'x', title: 'evil link', message: 'm', link: '//evil.example/x' });
  await new Promise((res) => setTimeout(res, 300));
  check('a link that is not an app path is replaced by /dashboard', sent[0]?.payload.url === '/dashboard');
  // findings (urgent fault) -> technicians + admins
  const findings = require(path.join(BACKEND, 'utils', 'findings'));
  sent.length = 0;
  await findings.notifyNewFindings({ companyId: A, actorUserId: adminA.id, findings: [{ id: 1, severity: 'out_of_service', elevator_label: 'EL-A', location_id: locA, location_name: 'LocA', description: 'stuck', title: 'stuck', source_type: 'manual', source_id: null }] }).catch((e) => console.log('   (findings notify:', e.message, ')'));
  await new Promise((res) => setTimeout(res, 300));
  check('urgent fault notification (findings path) also pushes to the technician', sent.some((s) => s.sub.endpoint === epA && /./.test(s.payload.title)), `sent=${sent.length}`);

  console.log('\n[push: failures never break the request; expired subscriptions are removed]');
  failWith = 500;
  let threw = false;
  try { await createNotification({ userId: techA.id, type: 'x', title: 'push fails', message: 'm' }); } catch { threw = true; }
  await new Promise((res) => setTimeout(res, 300));
  check('push send error (500) does not break createNotification; subscription kept', !threw && await count('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?', [techA.id]) === 1
    && await count('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND title = ?', [techA.id, 'push fails']) === 1);
  failWith = 410;
  await createNotification({ userId: techA.id, type: 'x', title: 'push gone', message: 'm' });
  await new Promise((res) => setTimeout(res, 400));
  check('410 Gone removes the subscription row', await count('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [techA.id, sha(epA)]) === 0);
  failWith = null;
  const res0 = await push.pushToUsers([techA.id], { title: 't', body: 'b', link: '/dashboard' });
  check('pushToUsers with no subscription resolves with zero counts and never rejects', res0.sent === 0);
  await q('RENAME TABLE push_subscriptions TO push_subscriptions_hidden');
  let tableThrew = false;
  try { await createNotification({ userId: techA.id, type: 'x', title: 'no table', message: 'm' }); } catch { tableThrew = true; }
  await new Promise((res) => setTimeout(res, 300));
  const subNoTable = await call('POST', '/api/push/subscribe', { cookie: cTechA, json: { endpoint: epA, keys } });
  await q('RENAME TABLE push_subscriptions_hidden TO push_subscriptions');
  check('table not migrated: notifications still work, subscribe -> 409 push_not_available', !tableThrew && subNoTable.status === 409 && subNoTable.body?.code === 'push_not_available', JSON.stringify(subNoTable.body));

  console.log('\n[push: unsubscribe + test push + shared device]');
  await call('POST', '/api/push/subscribe', { cookie: cTechA, json: { endpoint: epA, keys } });
  sent.length = 0;
  r = await call('POST', '/api/push/test', { cookie: cTechA });
  check('test push goes to my own device', r.status === 200 && r.body?.sent === 1 && sent.length === 1 && sent[0].sub.endpoint === epA, JSON.stringify(r.body));
  r = await call('POST', '/api/push/test', { cookie: cAdminB });
  check('test push for a user without a device sends nothing (never to others)', r.status === 200 && r.body?.sent === 0 && sent.length === 1);
  r = await call('POST', '/api/push/subscribe', { cookie: cAdminB, json: { endpoint: epA, keys } });
  rows = await q('SELECT user_id, company_id FROM push_subscriptions WHERE endpoint_hash = ?', [sha(epA)]);
  check('same device subscribing as another user re-assigns the row (one row, new owner)', r.status === 201 && rows.length === 1 && rows[0].user_id === adminB.id && rows[0].company_id === B);
  r = await call('POST', '/api/push/unsubscribe', { cookie: cAdminB, json: { endpoint: epA } });
  check('owner unsubscribes -> removed 1', r.body?.removed === 1 && await count('SELECT COUNT(*) c FROM push_subscriptions WHERE endpoint_hash = ?', [sha(epA)]) === 0);
  push.setSender(null);

  console.log(`\n${passed} passed, ${failed} failed`);

  // ------------------------------------------------------------------ cleanup of files created by this run
  for (const f of [...created, snap.file_path].filter(Boolean)) { try { fs.unlinkSync(abs(f.startsWith('/') ? f : `/${f}`)); } catch { /* gone */ } }
  for (const f of fs.readdirSync(path.join(uploadsRoot, 'company-logos'))) {
    if (f.startsWith(`${A}-`) || f.startsWith(`${B}-`)) { try { fs.unlinkSync(path.join(uploadsRoot, 'company-logos', f)); } catch { /* gone */ } }
  }
  for (const n of ['r0', 'r1', 'r2', 'r3', 'i0', 'i1']) { try { fs.unlinkSync(tmp(n)); } catch { /* gone */ } }
  const sigFiles = await q('SELECT technician_signature_path AS p FROM rms_visits WHERE company_id = ? AND technician_signature_path IS NOT NULL', [A]);
  for (const { p } of sigFiles) { try { fs.unlinkSync(abs(p)); } catch { /* gone */ } }
}

main()
  .catch((err) => { console.error('test run crashed:', err); failed++; })
  .finally(() => process.exit(failed ? 1 : 0));
