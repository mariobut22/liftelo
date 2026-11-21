#!/usr/bin/env node
/*
 * Import of locations + elevators (Excel/CSV) - backend test against a THROWAWAY MySQL/MariaDB.
 * Same setup/refusal rules as rms-overview-test.js (database "tt" / "*_test" on localhost, FRESH database, all migrations applied).
 *
 *   TENANT_TEST_DB_HOST=127.0.0.1 TENANT_TEST_DB_PORT=3541 TENANT_TEST_DB_USER=root TENANT_TEST_DB_NAME=tt \
 *   node backend/scripts/import-test.js
 *
 * Proves: xlsx and csv (BOM, ; and , delimiters, Windows-1250, Croatian characters), header aliases (hr/en, case + diacritics),
 * grouping of elevators per location, duplicates (in file / against existing, only inside the own company), per-row validation,
 * limits (size, rows), wrong content (magic bytes, never the client's mimetype/extension), atomicity (one failing insert =>
 * nothing created), idempotent replay, roles (technician/viewer 403), locked company 402, tenant isolation, audit (counts only),
 * template download (valid xlsx/csv that imports without errors).
 */
'use strict';

const os = require('os');
const path = require('path');
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
const PORT = Number(process.env.TENANT_TEST_PORT || 3542);
Object.assign(process.env, {
  DB_HOST: cfg.host, DB_PORT: cfg.port, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.name,
  SESSION_SECRET: 'import-test-secret', PORT: String(PORT), NODE_ENV: 'test', EMAIL_WORKER_ENABLED: 'false',
  MULTI_COMPANY_ENABLED: 'false'
});

const BACKEND = path.join(__dirname, '..');
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'));
const ExcelJS = require(path.join(BACKEND, 'node_modules', 'exceljs'));
const db = require(path.join(BACKEND, 'db'));
const importLib = require(path.join(BACKEND, 'utils', 'locationImport'));

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};

const BASE = `http://127.0.0.1:${PORT}`;
async function request(method, url, { cookie, body, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  let res;
  try {
    res = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual', signal: AbortSignal.timeout(60000) });
  } catch (err) {
    return { status: 0, body: `no response (${err.message})` };
  }
  if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers };
}
async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return raw.map((c) => c.split(';')[0]).join('; ');
}
// multipart upload: the client's mimetype is deliberately configurable (it must never matter)
function upload(url, cookie, { filename, buffer, mime = 'application/octet-stream', fields = {} }) {
  const form = new FormData();
  if (buffer !== undefined) form.append('file', new Blob([buffer], { type: mime }), filename);
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  return request('POST', url, { cookie, body: form });
}

async function makeXlsx(rows, { sheetName = 'Data' } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const csvOf = (rows, delimiter = ';') => rows.map((r) => r.map((c) => (/[";,\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(delimiter)).join('\r\n') + '\r\n';
const withBom = (text) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);

async function main() {
  const tag = Date.now().toString(36);
  const pw = 'Test-pass-123';
  const hash = await bcrypt.hash(pw, 4);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];
  const count = async (sql, params) => Number((await q(sql, params))[0].c);

  const mkCompany = async (name) => (await q('INSERT INTO companies (name) VALUES (?)', [`${name} ${tag}`])).insertId;
  const A = await mkCompany('Imp A');
  const B = await mkCompany('Imp B');
  const L = await mkCompany('Imp Locked');
  const mkUser = async (label, companyId, role) => {
    const email = `${label}-${tag}@imp.test`;
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
  const adminL = await mkUser('adminL', L, 'admin');
  for (const companyId of [A, B]) {
    await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
             SELECT ?, id, 'active', NULL, DATE_ADD(NOW(), INTERVAL 30 DAY) FROM subscription_plans WHERE code = 'corporate' LIMIT 1`, [companyId]).catch(() => {});
  }
  await q(`INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
           SELECT ?, id, 'canceled', NULL, DATE_SUB(NOW(), INTERVAL 1 DAY) FROM subscription_plans WHERE code = 'starter' LIMIT 1`, [L]).catch(() => {});

  require(path.join(BACKEND, 'index.js'));
  await new Promise((r) => setTimeout(r, 1500));
  const cA = await login(adminA.email, pw);
  const cTech = await login(techA.email, pw);
  const cViewer = await login(viewerA.email, pw);
  const cB = await login(adminB.email, pw);
  const cL = await login(adminL.email, pw);
  const uuid = () => crypto.randomUUID();
  const PREVIEW = '/api/import/locations/preview';
  const APPLY = '/api/import/locations/apply';
  const locCount = (company) => count('SELECT COUNT(*) c FROM locations WHERE company_id = ?', [company]);
  const elCount = (company) => count('SELECT COUNT(*) c FROM elevators WHERE company_id = ?', [company]);
  const auditCount = (company) => count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'locations_import'", [company]);
  const msgCodes = (row) => (row.messages || []).map((m) => m.code);

  const HR_HEAD = ['Naziv', 'Adresa', 'Kontakt osoba', 'Telefon', 'Upravitelj', 'Ključ strojarnice', 'Napomena', 'Učestalost RMS', 'Dizalo', 'Serijski broj', 'Vrsta upravljanja', 'Vrata kabine', 'Vrsta brave', 'Ključ strojarnice (dizalo)', 'Komentar'];

  console.log('\n[template download]');
  for (const lang of ['hr', 'en']) {
    const r = await request('GET', `/api/import/template.xlsx?lang=${lang}`, { cookie: cA, raw: true });
    check(`xlsx ${lang}: 200, xlsx content type, attachment`, r.status === 200
      && /spreadsheetml\.sheet/.test(r.headers.get('content-type')) && /attachment; filename=".*\.xlsx"/.test(r.headers.get('content-disposition')), `${r.status} ${r.headers?.get('content-type')}`);
    check(`xlsx ${lang}: zip signature`, r.buffer[0] === 0x50 && r.buffer[1] === 0x4b);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer);
    const ws = wb.worksheets[0];
    check(`xlsx ${lang}: opens, 2 sheets (data + instructions), 15 headers, one example row`, wb.worksheets.length === 2 && ws.getRow(1).values.filter(Boolean).length === 15 && ws.rowCount === 2 && wb.worksheets[1].rowCount >= 9);
    check(`xlsx ${lang}: header language matches`, lang === 'hr' ? ws.getRow(1).getCell(1).value === 'Naziv' && ws.getRow(1).getCell(8).value === 'Učestalost RMS' : ws.getRow(1).getCell(1).value === 'Name');
    const prev = await upload(PREVIEW, cA, { filename: 'template.xlsx', buffer: r.buffer });
    check(`xlsx ${lang}: the template itself imports (preview: 1 row, ok, no errors)`, prev.status === 200 && prev.body.summary.rows === 1 && prev.body.summary.ok === 1 && prev.body.summary.error === 0, JSON.stringify(prev.body?.summary));
    const csv = await request('GET', `/api/import/template.csv?lang=${lang}`, { cookie: cA, raw: true });
    check(`csv ${lang}: 200, UTF-8 BOM, ";" delimiter`, csv.status === 200 && csv.buffer[0] === 0xef && csv.buffer.toString('utf8').split('\r\n')[0].split(';').length === 15, `${csv.status}`);
    const prevCsv = await upload(PREVIEW, cA, { filename: 'template.csv', buffer: csv.buffer });
    check(`csv ${lang}: the template itself imports (1 row ok)`, prevCsv.status === 200 && prevCsv.body.summary.ok === 1 && prevCsv.body.summary.error === 0, JSON.stringify(prevCsv.body?.summary));
  }
  check('template: technician 403', (await request('GET', '/api/import/template.xlsx', { cookie: cTech })).status === 403);
  check('template: viewer 403', (await request('GET', '/api/import/template.csv', { cookie: cViewer })).status === 403);
  check('template: anonymous 401', (await request('GET', '/api/import/template.xlsx')).status === 401);
  check('template: unknown lang falls back to hr', (await request('GET', '/api/import/template.csv?lang=xx', { cookie: cA, raw: true })).buffer.toString('utf8').includes('Naziv'));

  console.log('\n[xlsx happy path + grouping + aliases (preview writes nothing)]');
  const locBefore = await locCount(A);
  const elBefore = await elCount(A);
  const happy = await makeXlsx([
    ['NAZIV', 'adresa', 'Kontakt osoba', 'telefon', 'Upravitelj', 'Ključ strojarnice', 'napomena', 'Učestalost RMS', 'DIZALO', 'Serijski broj', 'Vrsta upravljanja', 'Vrata kabine', 'Vrsta brave', 'Komentar'],
    ['Šćitara 22', 'Drage Šćitara 22, Rijeka', 'Ivo Ivić', '099 111 222', 'Upravitelj d.o.o.', 'Ormarić', 'Zvoniti', 2, 'D1', 'SN-1', 'MLC', 'Automatska', 'ELBAK', 'prvi'],
    ['Žrtava fašizma 9', 'Ul. Žrtava fašizma 9h, Umag', '', '', '', '', '', '', 'D1', '', '', '', '', ''],
    ['  šćitara  22 ', 'drage šćitara 22,  RIJEKA', '', '', '', '', '', '', 'D2 (neparni)', 'SN-2', '', '', '', ''],
    ['Đurđevac 5', 'Trg Đ 5, Zagreb', 'Ana', '', '', '', '', '', '', '', '', '', '', ''],
    ['Žrtava fašizma 9', 'Ul. Žrtava fašizma 9h, Umag', '', '', '', '', '', '', 'D2', '', '', '', '', '']
  ]);
  const pv = await upload(PREVIEW, cA, { filename: 'buildings.xlsx', buffer: happy, mime: 'text/plain' });
  check('preview 200 (the client mimetype is irrelevant)', pv.status === 200, JSON.stringify(pv.body));
  check('preview: 5 rows, all ok, plan = 3 locations + 4 elevators, nothing skipped', pv.body.summary.rows === 5 && pv.body.summary.ok === 5 && pv.body.summary.will_create.locations === 3 && pv.body.summary.will_create.elevators === 4 && pv.body.summary.will_create.skipped === 0, JSON.stringify(pv.body.summary));
  check('preview: Croatian/English header aliases mapped (14 detected, none unknown)', pv.body.columns.length === 14 && pv.body.columns.every((c) => c.field), JSON.stringify(pv.body.columns.filter((c) => !c.field)));
  check('preview: row numbers are sheet rows (2..6)', JSON.stringify(pv.body.rows.map((r) => r.row)) === '[2,3,4,5,6]');
  check('preview wrote nothing', await locCount(A) === locBefore && await elCount(A) === elBefore && await auditCount(A) === 0);
  const crid = uuid();
  const ap = await upload(APPLY, cA, { filename: 'buildings.xlsx', buffer: happy, fields: { client_request_id: crid } });
  check('apply 201 {locations_created:3, elevators_created:4, skipped:0}', ap.status === 201 && ap.body.locations_created === 3 && ap.body.elevators_created === 4 && ap.body.skipped === 0, JSON.stringify(ap));
  check('3 locations + 4 elevators exist for company A', await locCount(A) === locBefore + 3 && await elCount(A) === elBefore + 4);
  const sc = (await q('SELECT * FROM locations WHERE company_id = ? AND name = ?', [A, 'Šćitara 22']))[0];
  check('location stored with Croatian characters, contact fields, rms_frequency 2, NO coordinates', sc && sc.address === 'Drage Šćitara 22, Rijeka' && sc.contact_person === 'Ivo Ivić' && sc.contact_phone === '099 111 222'
    && sc.upravitelj === 'Upravitelj d.o.o.' && sc.kljuc_strojarnice === 'Ormarić' && sc.notes === 'Zvoniti' && sc.rms_frequency === 2 && sc.latitude === null && sc.longitude === null, JSON.stringify(sc));
  const scEl = await q('SELECT label, serial_number, control_group_type, cabin_door_type, lock_type, comment, company_id FROM elevators WHERE location_id = ? ORDER BY id', [sc?.id]);
  check('rows with the same name+address (case/space-insensitive, not adjacent) = ONE location with 2 elevators', scEl.length === 2 && scEl[0].label === 'D1' && scEl[1].label === 'D2 (neparni)'
    && scEl[0].serial_number === 'SN-1' && scEl[0].control_group_type === 'MLC' && scEl[0].cabin_door_type === 'Automatska' && scEl[0].lock_type === 'ELBAK' && scEl[0].comment === 'prvi' && scEl.every((e) => e.company_id === A), JSON.stringify(scEl));
  const du = (await q('SELECT id, rms_frequency FROM locations WHERE company_id = ? AND name = ?', [A, 'Đurđevac 5']))[0];
  check('row with a location and no elevator creates only the location (default rms_frequency 1)', du && du.rms_frequency === 1 && await count('SELECT COUNT(*) c FROM elevators WHERE location_id = ?', [du.id]) === 0);
  const zf = (await q('SELECT id FROM locations WHERE company_id = ? AND name = ?', [A, 'Žrtava fašizma 9']))[0];
  check('non-adjacent rows of one building are grouped (2 elevators)', zf && await count('SELECT COUNT(*) c FROM elevators WHERE location_id = ?', [zf.id]) === 2);
  const au = await q("SELECT user_id, metadata FROM audit_logs WHERE company_id = ? AND action = 'locations_import'", [A]);
  const meta = typeof au[0]?.metadata === 'string' ? JSON.parse(au[0].metadata) : au[0]?.metadata;
  check('audit: exactly one row, counts only (no names/addresses/content)', au.length === 1 && au[0].user_id === adminA.id && meta.locations_created === 3 && meta.elevators_created === 4 && meta.skipped === 0
    && meta.client_request_id === crid && !JSON.stringify(meta).match(/ćitara|Umag|Ivić|SN-/), JSON.stringify(meta));

  console.log('\n[idempotent replay]');
  const locNow = await locCount(A);
  const elNow = await elCount(A);
  const rep = await upload(APPLY, cA, { filename: 'buildings.xlsx', buffer: happy, fields: { client_request_id: crid } });
  check('replay: 200, same counts, duplicate:true', rep.status === 200 && rep.body.duplicate === true && rep.body.locations_created === 3 && rep.body.elevators_created === 4, JSON.stringify(rep));
  check('replay created nothing, no second audit row', await locCount(A) === locNow && await elCount(A) === elNow && await auditCount(A) === 1);
  const repOther = await upload(APPLY, cA, { filename: 'buildings.xlsx', buffer: happy, fields: { client_request_id: uuid() } });
  check('same file with a NEW request id: everything already exists -> nothing created twice', repOther.status === 201 && repOther.body.locations_created === 0 && repOther.body.elevators_created === 0 && repOther.body.skipped === 5, JSON.stringify(repOther));
  check('still 3 new locations', await locCount(A) === locNow);
  const raceFile = await makeXlsx([['Naziv', 'Adresa', 'Dizalo'], ['Race 1', 'Race street 1', 'R1'], ['Race 1', 'Race street 1', 'R2']]);
  const raceId = uuid();
  const [r1, r2] = await Promise.all([
    upload(APPLY, cA, { filename: 'race.xlsx', buffer: raceFile, fields: { client_request_id: raceId } }),
    upload(APPLY, cA, { filename: 'race.xlsx', buffer: raceFile, fields: { client_request_id: raceId } })
  ]);
  const statuses = [r1.status, r2.status].sort();
  check('two parallel applies with one request id: exactly one creates (201 + 200 duplicate)', statuses[0] === 200 && statuses[1] === 201, JSON.stringify([r1, r2]));
  check('race: exactly 1 location + 2 elevators', await count('SELECT COUNT(*) c FROM locations WHERE company_id = ? AND name = ?', [A, 'Race 1']) === 1 && await count("SELECT COUNT(*) c FROM elevators e JOIN locations l ON l.id = e.location_id WHERE e.company_id = ? AND l.name = 'Race 1'", [A]) === 2);

  console.log('\n[csv: BOM + semicolon + Croatian, comma + English + quotes, Windows-1250, tab]');
  const csvBom = withBom(csvOf([['Naziv', 'Adresa', 'Dizalo', 'Napomena'], ['Čakovec ŠĐ 1', 'Ul. kralja Tomislava 1, Čakovec', 'L1', 'Linija 1, "glavna"\nDruga linija'], ['Čakovec ŠĐ 1', 'Ul. kralja Tomislava 1, Čakovec', 'L2', '']]));
  const csvPv = await upload(PREVIEW, cA, { filename: 'a.csv', buffer: csvBom, mime: 'application/vnd.ms-excel' });
  check('csv (BOM, ;) preview: 2 rows ok, 1 location + 2 elevators', csvPv.status === 200 && csvPv.body.file.type === 'csv' && csvPv.body.summary.ok === 2 && csvPv.body.summary.will_create.locations === 1 && csvPv.body.summary.will_create.elevators === 2, JSON.stringify(csvPv.body));
  const csvAp = await upload(APPLY, cA, { filename: 'a.csv', buffer: csvBom, fields: { client_request_id: uuid() } });
  const ck = (await q('SELECT notes, address FROM locations WHERE company_id = ? AND name = ?', [A, 'Čakovec ŠĐ 1']))[0];
  check('csv apply 201; Croatian characters + comma + quote + line break preserved', csvAp.status === 201 && ck?.address === 'Ul. kralja Tomislava 1, Čakovec' && ck?.notes === 'Linija 1, "glavna"\nDruga linija', JSON.stringify(ck));
  const csvComma = Buffer.from(csvOf([['Name', 'Address', 'Elevator', 'Serial number', 'RMS frequency'], ['Comma Tower', 'High st 1, Town', 'E1', 'S9', 'quarterly']], ','), 'utf8');
  const cc = await upload(PREVIEW, cA, { filename: 'b.csv', buffer: csvComma });
  check('csv with "," delimiter, English headers, "quarterly" -> ok', cc.status === 200 && cc.body.summary.ok === 1 && cc.body.columns.every((c) => c.field), JSON.stringify(cc.body));
  const win1250 = Buffer.from([...Buffer.from('Naziv;Adresa;Dizalo\r\n', 'latin1'), ...[0x8a, 0xe8, 0xe6, 0x20, 0x31], 0x3b, ...Buffer.from('Ul. ', 'latin1'), 0x9e, 0x75, 0x70, 0x61, 0x6e, 0x3b, ...Buffer.from('D1\r\n', 'latin1')]);
  const w = await upload(PREVIEW, cA, { filename: 'w.csv', buffer: win1250 });
  check('csv in Windows-1250 is decoded (Ščć 1 / Ul. župan)', w.status === 200 && w.body.rows[0]?.name === 'Ščć 1' && w.body.rows[0]?.address === 'Ul. župan', JSON.stringify(w.body.rows));
  const tab = await upload(PREVIEW, cA, { filename: 't.csv', buffer: Buffer.from('Naziv\tAdresa\tDizalo\nTab 1\tTab street\tD1\n') });
  check('csv with tab delimiter', tab.status === 200 && tab.body.summary.ok === 1, JSON.stringify(tab.body));
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Naziv\tAdresa\r\nU16 Čaj\tU16 ulica\r\n', 'utf16le')]);
  const u16 = await upload(PREVIEW, cA, { filename: 'u16.csv', buffer: utf16 });
  check('UTF-16LE text export (Excel "Unicode text") is read', u16.status === 200 && u16.body.rows[0]?.name === 'U16 Čaj', JSON.stringify(u16.body));
  const parsedUnit = importLib.parseCsv('a;"b;c";"d""e"\r\n1;2;3', ';');
  check('unit: csv parser keeps quoted delimiters/quotes', JSON.stringify(parsedUnit) === JSON.stringify([['a', 'b;c', 'd"e'], ['1', '2', '3']]));

  console.log('\n[duplicates: in file, against existing locations]');
  const dupFile = await makeXlsx([
    ['Naziv', 'Adresa', 'Dizalo'],
    ['Dup New', 'Dup street 1', 'X1'],
    ['Dup New', 'Dup street 1', 'x1'],
    ['Dup New', 'Dup street 1', 'X2'],
    ['ŠĆITARA 22', 'drage šćitara 22, rijeka', 'D9'],
    ['Šćitara 22', 'Drage Šćitara 22, Rijeka', 'D10']
  ]);
  const dp = await upload(PREVIEW, cA, { filename: 'dup.xlsx', buffer: dupFile });
  const rowsBy = (n) => dp.body.rows.find((r) => r.row === n);
  check('same elevator label twice in one location (case-insensitive) -> warning duplicate_elevator_in_file', rowsBy(3).status === 'warning' && msgCodes(rowsBy(3)).includes('duplicate_elevator_in_file') && rowsBy(2).status === 'ok' && rowsBy(4).status === 'ok', JSON.stringify(dp.body.rows));
  check('location that already exists (name+address, case-insensitive) -> warning location_exists on its rows', rowsBy(5).status === 'warning' && msgCodes(rowsBy(5)).includes('location_exists') && msgCodes(rowsBy(6)).includes('location_exists'));
  check('summary: 2 ok, 3 warning; default plan 1 location + 2 elevators, 3 skipped', dp.body.summary.ok === 2 && dp.body.summary.warning === 3
    && dp.body.summary.will_create.locations === 1 && dp.body.summary.will_create.elevators === 2 && dp.body.summary.will_create.skipped === 3, JSON.stringify(dp.body.summary));
  const dpA = await upload(APPLY, cA, { filename: 'dup.xlsx', buffer: dupFile, fields: { client_request_id: uuid() } });
  check('apply (default): warnings skipped -> 1 location, 2 elevators, skipped 3', dpA.status === 201 && dpA.body.locations_created === 1 && dpA.body.elevators_created === 2 && dpA.body.skipped === 3, JSON.stringify(dpA));
  check('the existing "Šćitara 22" was not duplicated', await count('SELECT COUNT(*) c FROM locations WHERE company_id = ? AND name = ?', [A, 'Šćitara 22']) === 1);
  const dpWarn = await upload(APPLY, cA, { filename: 'dup.xlsx', buffer: dupFile, fields: { client_request_id: uuid(), include_warnings: 'true' } });
  check('include_warnings=true imports warning rows too (existing Dup New is a duplicate location now: user choice)', dpWarn.status === 201 && dpWarn.body.skipped === 0 && dpWarn.body.locations_created === 2, JSON.stringify(dpWarn));

  console.log('\n[per-row validation]');
  const longName = 'N'.repeat(256);
  const bad = await makeXlsx([
    ['Naziv', 'Adresa', 'Telefon', 'Učestalost RMS', 'Dizalo', 'Serijski broj'],
    ['', 'No name street', '', '', 'A1', ''],
    ['No address', '', '', '', 'A1', ''],
    [longName, 'Long street', '', '', '', ''],
    ['Bad freq', 'Freq street', '', 5, 'A1', ''],
    ['Bad freq 2', 'Freq street', '', 'often', 'A1', ''],
    ['Serial no label', 'Serial street', '', '', '', 'SN-ONLY'],
    ['Phone long', 'Phone street', '1'.repeat(51), '', 'A1', ''],
    ['Serial long', 'Serial long street', '', '', 'A1', 'S'.repeat(101)],
    ['Good one', 'Good street 1', '', 3, 'A1', 'SN'],
    ['', '', '', '', '', ''],
    ['Good two', 'Good street 2', '', 'tromjesečno', '', '']
  ]);
  const bp = await upload(PREVIEW, cA, { filename: 'bad.xlsx', buffer: bad });
  const br = (n) => bp.body.rows.find((r) => r.row === n);
  check('missing name -> error name_required', br(2).status === 'error' && msgCodes(br(2)).includes('name_required'));
  check('missing address -> error address_required', br(3).status === 'error' && msgCodes(br(3)).includes('address_required'));
  check('name > 255 -> error field_too_long {field:name, max:255}', br(4).status === 'error' && br(4).messages.some((m) => m.code === 'field_too_long' && m.params.field === 'name' && m.params.max === 255));
  check('rms frequency 5 / "often" -> error invalid_rms_frequency', br(5).status === 'error' && msgCodes(br(5)).includes('invalid_rms_frequency') && br(6).status === 'error' && msgCodes(br(6)).includes('invalid_rms_frequency'));
  check('elevator data without an elevator label -> error elevator_label_required', br(7).status === 'error' && msgCodes(br(7)).includes('elevator_label_required'));
  check('phone > 50 / serial > 100 -> field_too_long', br(8).messages.some((m) => m.params?.field === 'contact_phone' && m.params.max === 50) && br(9).messages.some((m) => m.params?.field === 'serial_number' && m.params.max === 100));
  check('valid rows ok (frequency 3 and "tromjesečno" -> 3); fully empty row ignored (not counted)', br(10).status === 'ok' && br(12).status === 'ok' && !br(11) && bp.body.summary.rows === 10, JSON.stringify(bp.body.summary));
  check('summary: 2 ok, 8 error', bp.body.summary.ok === 2 && bp.body.summary.error === 8);
  const bpA = await upload(APPLY, cA, { filename: 'bad.xlsx', buffer: bad, fields: { client_request_id: uuid() } });
  const goodTwo = (await q('SELECT rms_frequency FROM locations WHERE company_id = ? AND name = ?', [A, 'Good two']))[0];
  check('apply: only the 2 valid rows are imported (2 locations, 1 elevator), 8 skipped, no error row created', bpA.status === 201 && bpA.body.locations_created === 2 && bpA.body.elevators_created === 1 && bpA.body.skipped === 8 && goodTwo?.rms_frequency === 3
    && await count("SELECT COUNT(*) c FROM locations WHERE company_id = ? AND name IN ('No address','Bad freq','Serial no label','Phone long')", [A]) === 0, JSON.stringify(bpA));
  const conflict = await makeXlsx([['Naziv', 'Adresa', 'Telefon', 'Dizalo'], ['Conf', 'Conf st', '111', 'A'], ['Conf', 'Conf st', '222', 'B']]);
  const cf = await upload(PREVIEW, cA, { filename: 'c.xlsx', buffer: conflict });
  check('different location values in repeated rows: first wins, info message (status stays ok)', cf.body.rows[1].status === 'ok' && cf.body.rows[1].messages.some((m) => m.code === 'location_value_differs' && m.level === 'info'));

  console.log('\n[limits and file-level errors]');
  const big = await upload(PREVIEW, cA, { filename: 'big.csv', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 0x61) });
  check('file > 2 MB -> 413 import_file_too_large', big.status === 413 && big.body.code === 'import_file_too_large', JSON.stringify(big));
  const bigApply = await upload(APPLY, cA, { filename: 'big.csv', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 0x61) });
  check('same limit on apply', bigApply.status === 413 && bigApply.body.code === 'import_file_too_large');
  const rows500 = [['Naziv', 'Adresa', 'Dizalo']];
  for (let i = 1; i <= 500; i++) rows500.push([`Bulk ${i}`, `Bulk street ${i}`, 'B1']);
  const ok500 = await upload(PREVIEW, cA, { filename: 'r500.csv', buffer: Buffer.from(csvOf(rows500)) });
  check('exactly 500 data rows is accepted', ok500.status === 200 && ok500.body.summary.rows === 500 && ok500.body.summary.ok === 500, JSON.stringify(ok500.body?.summary || ok500.body));
  rows500.push(['Bulk 501', 'Bulk street 501', 'B1']);
  const over = await upload(PREVIEW, cA, { filename: 'r501.csv', buffer: Buffer.from(csvOf(rows500)) });
  check('501 data rows -> 400 import_too_many_rows', over.status === 400 && over.body.code === 'import_too_many_rows', JSON.stringify(over));
  const overX = await upload(PREVIEW, cA, { filename: 'r501.xlsx', buffer: await makeXlsx(rows500) });
  check('501 data rows in xlsx -> 400 import_too_many_rows', overX.status === 400 && overX.body.code === 'import_too_many_rows', JSON.stringify(overX));
  const bulkApply = await upload(APPLY, cA, { filename: 'r500.csv', buffer: Buffer.from(csvOf(rows500.slice(0, 501))), fields: { client_request_id: uuid() } });
  check('apply of 500 rows: 500 locations + 500 elevators in one go', bulkApply.status === 201 && bulkApply.body.locations_created === 500 && bulkApply.body.elevators_created === 500, JSON.stringify(bulkApply));
  const empty = await upload(PREVIEW, cA, { filename: 'e.csv', buffer: Buffer.alloc(0) });
  check('empty file -> 400 import_file_empty', empty.status === 400 && empty.body.code === 'import_file_empty', JSON.stringify(empty));
  const onlyHeader = await upload(PREVIEW, cA, { filename: 'h.csv', buffer: Buffer.from('Naziv;Adresa\r\n') });
  check('header only -> 400 import_file_empty', onlyHeader.status === 400 && onlyHeader.body.code === 'import_file_empty', JSON.stringify(onlyHeader));
  const blankLines = await upload(PREVIEW, cA, { filename: 'b.csv', buffer: Buffer.from('\r\n\r\n;;\r\n') });
  check('only blank lines -> 400 import_file_empty', blankLines.status === 400 && blankLines.body.code === 'import_file_empty');
  const noCols = await upload(PREVIEW, cA, { filename: 'n.csv', buffer: Buffer.from('Foo;Bar\r\n1;2\r\n') });
  check('no name/address columns -> 400 import_missing_columns', noCols.status === 400 && noCols.body.code === 'import_missing_columns', JSON.stringify(noCols));
  const onlyName = await upload(PREVIEW, cA, { filename: 'n.csv', buffer: Buffer.from('Naziv;Dizalo\r\nA;B\r\n') });
  check('only a name column (no address) -> 400 import_missing_columns', onlyName.status === 400 && onlyName.body.code === 'import_missing_columns');
  const noFile = await request('POST', PREVIEW, { cookie: cA, body: new FormData() });
  check('no file -> 400 import_file_required', noFile.status === 400 && noFile.body.code === 'import_file_required', JSON.stringify(noFile));
  const json = await request('POST', PREVIEW, { cookie: cA, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [{ name: 'x' }] }) });
  check('JSON body (client-parsed rows) is not accepted: 400 import_file_required', json.status === 400 && json.body.code === 'import_file_required');
  const twoFiles = new FormData();
  twoFiles.append('file', new Blob(['Naziv;Adresa\r\nA;B\r\n']), 'a.csv');
  twoFiles.append('other', new Blob(['x']), 'o.csv');
  const tf = await request('POST', PREVIEW, { cookie: cA, body: twoFiles });
  check('unexpected extra file field -> 400 upload_failed', tf.status === 400 && tf.body.code === 'upload_failed', JSON.stringify(tf));

  console.log('\n[content is checked, never the extension/mimetype]');
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0), Buffer.from('This program cannot be run in DOS mode')]);
  const exeX = await upload(PREVIEW, cA, { filename: 'virus.xlsx', buffer: exe, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  check('.exe renamed .xlsx (mimetype lies) -> 415 import_invalid_file', exeX.status === 415 && exeX.body.code === 'import_invalid_file', JSON.stringify(exeX));
  const exeC = await upload(PREVIEW, cA, { filename: 'virus.csv', buffer: exe, mime: 'text/csv' });
  check('.exe renamed .csv -> 415', exeC.status === 415 && exeC.body.code === 'import_invalid_file');
  const textAsX = await upload(PREVIEW, cA, { filename: 'text.xlsx', buffer: Buffer.from('Naziv;Adresa\r\nA;B\r\n'), mime: 'text/csv' });
  check('plain text named .xlsx -> 415 (no zip signature)', textAsX.status === 415 && textAsX.body.code === 'import_invalid_file');
  const xlsxAsCsv = await upload(PREVIEW, cA, { filename: 'real.csv', buffer: happy, mime: 'text/csv' });
  check('a real xlsx named .csv -> 415', xlsxAsCsv.status === 415 && xlsxAsCsv.body.code === 'import_invalid_file');
  const pdfC = await upload(PREVIEW, cA, { filename: 'doc.csv', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'), mime: 'text/csv' });
  check('pdf named .csv -> 415', pdfC.status === 415 && pdfC.body.code === 'import_invalid_file');
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600, 0)]);
  check('old .xls (OLE) named .csv / .xlsx -> 415', (await upload(PREVIEW, cA, { filename: 'old.csv', buffer: ole })).status === 415 && (await upload(PREVIEW, cA, { filename: 'old.xlsx', buffer: ole })).status === 415);
  const xls = await upload(PREVIEW, cA, { filename: 'old.xls', buffer: happy });
  const txt = await upload(PREVIEW, cA, { filename: 'old.txt', buffer: Buffer.from('Naziv;Adresa\r\nA;B\r\n') });
  const noext = await upload(PREVIEW, cA, { filename: 'noext', buffer: Buffer.from('Naziv;Adresa\r\nA;B\r\n') });
  check('other extensions (.xls, .txt, none) -> 415', xls.status === 415 && txt.status === 415 && noext.status === 415);
  const fakeZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), crypto.randomBytes(500)]);
  const fz = await upload(PREVIEW, cA, { filename: 'fake.xlsx', buffer: fakeZip });
  check('zip signature + garbage -> 400 import_file_unreadable (no crash)', fz.status === 400 && fz.body.code === 'import_file_unreadable', JSON.stringify(fz));
  const noCrash = await request('GET', '/api/import/template.xlsx', { cookie: cA, raw: true });
  check('server still alive after the bad files', noCrash.status === 200);
  const gz = await upload(PREVIEW, cA, { filename: 'a.csv', buffer: Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0, 3, 1, 2, 3]) });
  check('gzip named .csv -> 415', gz.status === 415);
  const ctl = await upload(PREVIEW, cA, { filename: 'ctl.csv', buffer: Buffer.from(Array.from({ length: 300 }, (_v, i) => (i % 3 === 0 ? 0x01 : 0x41))) });
  check('binary-looking bytes named .csv -> 415', ctl.status === 415);

  console.log('\n[atomicity: one failing insert => nothing created]');
  const atom = await makeXlsx([['Naziv', 'Adresa', 'Dizalo'], ['Atom 1', 'Atom street 1', 'A1'], ['Atom 2', 'Atom street 2', 'BOOM'], ['Atom 3', 'Atom street 3', 'A3']]);
  const atomPv = await upload(PREVIEW, cA, { filename: 'atom.xlsx', buffer: atom });
  check('the file validates fine (the failure is injected in the database)', atomPv.status === 200 && atomPv.body.summary.ok === 3);
  const locPre = await locCount(A);
  const elPre = await elCount(A);
  const auditPre = await auditCount(A);
  await q('DROP TRIGGER IF EXISTS import_test_boom');
  await q("CREATE TRIGGER import_test_boom BEFORE INSERT ON elevators FOR EACH ROW BEGIN IF NEW.label = 'BOOM' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'boom'; END IF; END");
  const atomId = uuid();
  let boom;
  try {
    boom = await upload(APPLY, cA, { filename: 'atom.xlsx', buffer: atom, fields: { client_request_id: atomId } });
  } finally {
    await q('DROP TRIGGER IF EXISTS import_test_boom');
  }
  check('apply -> 500 and the error body has no database text', boom.status === 500 && !JSON.stringify(boom.body).match(/boom|SQL|trigger/i), JSON.stringify(boom));
  check('NOTHING was created (no location, no elevator, no audit row), also not the rows before the failing one', await locCount(A) === locPre && await elCount(A) === elPre && await auditCount(A) === auditPre);
  const retry = await upload(APPLY, cA, { filename: 'atom.xlsx', buffer: atom, fields: { client_request_id: atomId } });
  check('retry with the same request id after the failure works and imports everything', retry.status === 201 && retry.body.locations_created === 3 && retry.body.elevators_created === 3, JSON.stringify(retry));

  console.log('\n[roles, locked company]');
  const f = await makeXlsx([['Naziv', 'Adresa'], ['Role test', 'Role street 1']]);
  const locR = await locCount(A);
  for (const [who, cookie, status, code] of [['technician', cTech, 403, 'forbidden'], ['viewer', cViewer, 403, 'viewer_read_only']]) {
    const p = await upload(PREVIEW, cookie, { filename: 'r.xlsx', buffer: f });
    const a = await upload(APPLY, cookie, { filename: 'r.xlsx', buffer: f, fields: { client_request_id: uuid() } });
    check(`${who}: preview ${status} ${code}, apply ${status} ${code}`, p.status === status && p.body.code === code && a.status === status && a.body.code === code, `${p.status} ${JSON.stringify(p.body)} / ${a.status}`);
  }
  check('anonymous -> 401', (await upload(PREVIEW, undefined, { filename: 'r.xlsx', buffer: f })).status === 401 && (await upload(APPLY, undefined, { filename: 'r.xlsx', buffer: f })).status === 401);
  check('nothing created by forbidden callers', await locCount(A) === locR);
  const lockedP = await upload(PREVIEW, cL, { filename: 'r.xlsx', buffer: f });
  const lockedA = await upload(APPLY, cL, { filename: 'r.xlsx', buffer: f, fields: { client_request_id: uuid() } });
  check('locked company (canceled): preview and apply -> 402 subscription_locked', lockedP.status === 402 && lockedP.body.code === 'subscription_locked' && lockedA.status === 402 && lockedA.body.code === 'subscription_locked', `${lockedP.status} ${lockedA.status}`);
  check('locked company: nothing created', await locCount(L) === 0 && await auditCount(L) === 0);

  console.log('\n[tenant isolation]');
  const shared = await makeXlsx([['Naziv', 'Adresa', 'Dizalo'], ['Šćitara 22', 'Drage Šćitara 22, Rijeka', 'D1'], ['B only', 'B street 1', 'B1']]);
  const bBefore = await locCount(B);
  const aScitaraBefore = await count('SELECT COUNT(*) c FROM locations WHERE company_id = ? AND name = ?', [A, 'Šćitara 22']);
  const bp2 = await upload(PREVIEW, cB, { filename: 's.xlsx', buffer: shared });
  check('company B: A\'s location "Šćitara 22" is NOT reported as existing (duplicates are checked only inside the own company)', bp2.status === 200 && bp2.body.summary.ok === 2 && bp2.body.summary.warning === 0, JSON.stringify(bp2.body.summary));
  const ba = await upload(APPLY, cB, { filename: 's.xlsx', buffer: shared, fields: { client_request_id: uuid() } });
  check('company B apply: 2 locations + 2 elevators for B only', ba.status === 201 && ba.body.locations_created === 2 && await locCount(B) === bBefore + 2 && await elCount(B) === 2);
  check('A\'s data untouched by B\'s import; B rows carry company_id B', await count('SELECT COUNT(*) c FROM locations WHERE company_id = ? AND name = ?', [A, 'B only']) === 0
    && await count('SELECT COUNT(*) c FROM locations WHERE company_id = ? AND name = ?', [B, 'Šćitara 22']) === 1 && await count('SELECT COUNT(*) c FROM locations WHERE company_id = ? AND name = ?', [A, 'Šćitara 22']) === aScitaraBefore);
  const sameIdOtherCompany = await upload(APPLY, cB, { filename: 'race.xlsx', buffer: raceFile, fields: { client_request_id: raceId } });
  check('a client_request_id used by company A does not replay for company B (B creates its own)', sameIdOtherCompany.status === 201 && sameIdOtherCompany.body.locations_created === 1 && sameIdOtherCompany.body.duplicate !== true, JSON.stringify(sameIdOtherCompany));
  check('audit rows are per company', await auditCount(B) === 2 && await count("SELECT COUNT(*) c FROM audit_logs WHERE company_id = ? AND action = 'locations_import'", [L]) === 0);
  const aList = await request('GET', '/api/locations', { cookie: cA });
  check('GET /api/locations of A shows the imported buildings and none of B\'s', Array.isArray(aList.body) && aList.body.some((l) => l.name === 'Čakovec ŠĐ 1') && !aList.body.some((l) => l.name === 'B only'));

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    try { await db.end?.(); } catch { /* ignore */ }
    process.exit(failed ? 1 : 0);
  });
