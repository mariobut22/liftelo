#!/usr/bin/env node
/*
 * PERMANENTLY deletes all data of ONE company (rows + uploaded files) after its closure period. MANUAL tool, never run by the app.
 * DRY-RUN BY DEFAULT: without --execute it only prints what would be deleted (rows per table, files).
 *
 *   node backend/scripts/purge-company.js --company-id 12                      # dry-run
 *   node backend/scripts/purge-company.js --company-id 12 --execute            # asks you to type  DELETE COMPANY 12
 *   node backend/scripts/purge-company.js --company-id 12 --execute --confirm "DELETE COMPANY 12"   # non-interactive
 *
 * Refuses unless: the superadmin requested the closure (companies.closure_requested_at), the purge date has passed
 * (closure_purge_after <= NOW) and the subscription is still canceled; refuses when NODE_ENV=production unless
 * --i-am-sure-production is given; refuses --execute while any other tenant table still holds rows of the company that this
 * script does not know about. Reads DB_* from the environment / backend/.env like the app (the target DB is printed first).
 * Take a database backup before running it anywhere real. Deleting is one transaction; files are removed after it commits.
 * Users that belong ONLY to this company are deleted; users that are members of other companies keep their account.
 * Docs: docs/infrastructure.md section 17 (company closure).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const fail = (message, code = 1) => {
  console.error(`purge-company: ${message}`);
  process.exit(code);
};

const companyId = /^[1-9]\d{0,9}$/.test(String(option('company-id') ?? '')) ? Number(option('company-id')) : null;
if (!companyId) fail('--company-id <id> is required', 2);
const execute = flag('execute');
if (process.env.NODE_ENV === 'production' && !flag('i-am-sure-production')) {
  fail('NODE_ENV=production: refusing to run without --i-am-sure-production', 2);
}

const db = require('../db');
const { listCompanyFiles, UPLOADS_ROOT } = require('../utils/companyFiles');

// children first. alias + joins + where use ONE parameter: the company id.
const PROJECT_JOINS = 'INNER JOIN projects p ON p.id = ps.project_id';
const TABLES = [
  { name: 'project_task_users', alias: 'ptu', joins: `INNER JOIN project_tasks pt ON pt.id = ptu.task_id INNER JOIN project_sections ps ON ps.id = pt.project_section_id ${PROJECT_JOINS}`, where: 'p.company_id = ?' },
  { name: 'project_task_comments', alias: 'c', joins: '', where: 'c.company_id = ?' },
  { name: 'project_tasks', alias: 'pt', joins: `INNER JOIN project_sections ps ON ps.id = pt.project_section_id ${PROJECT_JOINS}`, where: 'p.company_id = ?' },
  { name: 'project_sections', alias: 'ps', joins: PROJECT_JOINS, where: 'p.company_id = ?' },
  { name: 'project_users', alias: 'pu', joins: 'INNER JOIN projects p ON p.id = pu.project_id', where: 'p.company_id = ?' },
  { name: 'project_activity', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'project_attachments', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'projects', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'work_order_items', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'work_order_elevators', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'work_order_users', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'work_order_activity', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'work_order_attachments', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'work_orders', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'finding_events', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'findings', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'intervention_photos', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'intervention_items', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'interventions', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'rms_visit_items', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'rms_visits', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'location_monthly_services', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'elevators', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'locations', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'vehicles', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'invitations', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'email_outbox', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'legal_acceptances', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'audit_logs', alias: 't', joins: '', where: 't.company_id = ?' },
  { name: 'company_subscriptions', alias: 't', joins: '', where: 't.company_id = ?' },
];
// tables with a company_id column handled separately below (users: detached / deleted; user_companies: memberships)
const SPECIAL = new Set(['users', 'user_companies', 'companies']);

const isMissingTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

const countSql = (t) => `SELECT COUNT(*) AS c FROM ${t.name} ${t.alias} ${t.joins} WHERE ${t.where}`;
const deleteSql = (t) => `DELETE ${t.alias} FROM ${t.name} ${t.alias} ${t.joins} WHERE ${t.where}`;

const ask = (question) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (answer) => { rl.close(); resolve(answer); });
});

async function main() {
  console.log(`Target database: ${process.env.DB_NAME || '(default)'} on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}  NODE_ENV=${process.env.NODE_ENV || '(unset)'}`);
  console.log(execute ? 'MODE: EXECUTE (permanent deletion)' : 'MODE: dry-run (nothing is deleted; add --execute to delete)');

  const [[company]] = await db.query(
    'SELECT id, name, closure_requested_at, closure_purge_after, closure_status_before FROM companies WHERE id = ? LIMIT 1',
    [companyId]
  );
  if (!company) fail(`company ${companyId} does not exist`);
  console.log(`Company #${company.id}: ${company.name}`);

  if (!company.closure_requested_at) fail('REFUSED: no closure was requested for this company (superadmin action "request closure")');
  if (!company.closure_purge_after || new Date(company.closure_purge_after).getTime() > Date.now()) {
    fail(`REFUSED: the purge date has not passed yet (closure_purge_after = ${company.closure_purge_after instanceof Date ? company.closure_purge_after.toISOString() : company.closure_purge_after})`);
  }
  const [[sub]] = await db.query('SELECT status FROM company_subscriptions WHERE company_id = ? LIMIT 1', [companyId]);
  if (sub && sub.status !== 'canceled') fail(`REFUSED: the subscription is "${sub.status}", not "canceled" (the closure was probably reverted by a plan change)`);

  // what would be deleted
  const counts = [];
  for (const t of TABLES) {
    try {
      const [[row]] = await db.query(countSql(t), [companyId]);
      counts.push({ ...t, count: Number(row.c) });
    } catch (err) {
      if (!isMissingTable(err)) throw err;
    }
  }
  const [members] = await db.query(
    `SELECT u.id, u.global_role,
            (SELECT COUNT(*) FROM user_companies x WHERE x.user_id = u.id AND x.company_id <> ?) AS other_companies
     FROM user_companies uc INNER JOIN users u ON u.id = uc.user_id WHERE uc.company_id = ?`,
    [companyId, companyId]
  );
  const exclusive = members.filter((m) => m.global_role !== 'superadmin' && Number(m.other_companies) === 0).map((m) => m.id);
  const kept = members.length - exclusive.length;

  const files = await listCompanyFiles(companyId);
  const fileTargets = new Map(files.filter((f) => f.abs && f.status === 'present').map((f) => [f.abs, f.size_bytes || 0]));
  // orphans: files named "<companyId>-..." in the upload folders that no row references any more
  for (const dir of ['company-logos', 'vehicles', 'signatures', 'work-orders', 'projects', 'interventions']) {
    const full = path.join(UPLOADS_ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.startsWith(`${companyId}-`)) {
        const abs = path.join(full, name);
        if (fs.statSync(abs).isFile()) fileTargets.set(abs, fs.statSync(abs).size);
      }
    }
  }

  // tenant tables this script does not know: never delete blindly
  const [tenantTables] = await db.query(
    "SELECT DISTINCT TABLE_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'company_id'"
  );
  const known = new Set([...TABLES.map((t) => t.name), ...SPECIAL]);
  const unknown = [];
  for (const { name } of tenantTables) {
    if (known.has(name)) continue;
    const [[row]] = await db.query(`SELECT COUNT(*) AS c FROM \`${name}\` WHERE company_id = ?`, [companyId]);
    if (Number(row.c) > 0) unknown.push({ name, count: Number(row.c) });
  }

  console.log('\nRows that would be deleted:');
  for (const t of counts) console.log(`  ${t.name.padEnd(26)} ${String(t.count).padStart(8)}`);
  console.log(`  ${'user_companies'.padEnd(26)} ${String(members.length).padStart(8)}   (memberships)`);
  console.log(`  ${'users (only this company)'.padEnd(26)} ${String(exclusive.length).padStart(8)}   (+ their sign-in identities, reset tokens, notifications)`);
  console.log(`  ${'users kept (other company / superadmin)'.padEnd(26)} ${String(kept).padStart(4)}   (only detached from this company)`);
  console.log(`  ${'companies'.padEnd(26)} ${String(1).padStart(8)}`);
  const bytes = [...fileTargets.values()].reduce((a, b) => a + b, 0);
  console.log(`Files that would be deleted: ${fileTargets.size} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  if (unknown.length) {
    console.log('\nUNKNOWN tenant tables still holding rows of this company (add them to this script first):');
    unknown.forEach((u) => console.log(`  ${u.name}: ${u.count}`));
  }

  if (!execute) {
    console.log('\nDry-run only. Nothing was deleted.');
    return;
  }
  if (unknown.length) fail('REFUSED: unknown tenant tables hold data of this company (see above)');

  const expected = `DELETE COMPANY ${companyId}`;
  const typed = option('confirm') !== undefined ? option('confirm') : await ask(`\nThis is PERMANENT. Type "${expected}" to continue: `);
  if (typed !== expected) fail('REFUSED: confirmation text did not match, nothing was deleted');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const deleted = {};
    for (const t of TABLES) {
      try {
        const [res] = await conn.query(deleteSql(t), [companyId]);
        deleted[t.name] = res.affectedRows;
      } catch (err) {
        if (!isMissingTable(err)) throw err;
      }
    }
    if (exclusive.length) {
      for (const sql of [
        'DELETE FROM user_identities WHERE user_id IN (?)',
        'DELETE FROM password_resets WHERE user_id IN (?)',
        'DELETE FROM notifications WHERE user_id IN (?)',
      ]) {
        try { await conn.query(sql, [exclusive]); } catch (err) { if (!isMissingTable(err)) throw err; }
      }
    }
    await conn.query('DELETE FROM user_companies WHERE company_id = ?', [companyId]);
    await conn.query('UPDATE users SET company_id = NULL WHERE company_id = ?', [companyId]);
    try { await conn.query('UPDATE users SET last_active_company_id = NULL WHERE last_active_company_id = ?', [companyId]); } catch (err) { if (err.code !== 'ER_BAD_FIELD_ERROR') throw err; }
    if (exclusive.length) await conn.query('DELETE FROM users WHERE id IN (?)', [exclusive]);
    await conn.query('DELETE FROM companies WHERE id = ? LIMIT 1', [companyId]);
    // the purge itself stays on record (no personal data, no company reference left)
    await conn.query('INSERT INTO audit_logs (user_id, company_id, action, metadata) VALUES (NULL, NULL, ?, ?)', [
      'company_purged',
      JSON.stringify({ purged_company_id: companyId, rows: deleted, users_deleted: exclusive.length, users_kept: kept, files: fileTargets.size }),
    ]);
    await conn.commit();
    console.log('\nDatabase rows deleted (committed).');
  } catch (err) {
    await conn.rollback();
    conn.release();
    fail(`database error, NOTHING was deleted (rolled back): ${err.message}`);
  }
  conn.release();

  let removed = 0;
  for (const abs of fileTargets.keys()) {
    try { fs.unlinkSync(abs); removed += 1; } catch (err) { console.error(`could not delete file ${abs}: ${err.message}`); }
  }
  console.log(`Files deleted: ${removed} of ${fileTargets.size}.`);
  console.log('Done. Reminder: backups still contain the data until they rotate out (see retention in the DPA).');
}

main()
  .catch((err) => fail(`unexpected error: ${err.message}`))
  .finally(() => db.end().catch(() => {}));
