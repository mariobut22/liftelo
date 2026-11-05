#!/usr/bin/env node
/*
 * Liftelo tenant-isolation checker (dev-only, no dependencies).
 *
 * Scans backend/index.js, backend/routes/*.js and backend/utils/*.js for SQL strings that touch a
 * tenant table (a table that has a company_id column) without mentioning company_id anywhere in
 * the statement. It is a heuristic safety net, not a proof: it cannot see data flow, so a statement
 * that is protected by an ownership pre-check must be listed in tenant-check-allow.json with a reason.
 *
 *   node backend/scripts/tenant-check.js            # exit 1 when there are un-allowlisted findings
 *   node backend/scripts/tenant-check.js --verbose  # also list allowlisted statements with their reason
 *   node backend/scripts/tenant-check.js --json     # machine readable
 *
 * Run it before pushing backend changes (see CLAUDE.md, docs/infrastructure.md).
 *
 * Tenant tables are discovered from liftelo.sql and backend/migrations/*.sql (CREATE TABLE with a
 * company_id column, or ALTER TABLE ... ADD COLUMN company_id).
 *
 * Allowlist (tenant-check-allow.json): { "entries": [ { "file", "match", "reason" } ] }
 *   file   = path relative to backend/ ("routes/auth.js"); "*" = any file
 *   match  = case-insensitive substring of the whitespace-normalised SQL ("" = every flagged statement in the file)
 *   reason = mandatory, why the statement is safe without company_id
 *
 * Second rule: request-supplied company ids (req.body/query company_id, req.params.companyId) are listed
 * as "request-company-id" so each use is reviewed (and allowlisted with a reason once membership is checked).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const ROOT = path.join(BACKEND, '..');
const args = new Set(process.argv.slice(2));

// ---------------------------------------------------------------- tenant tables
function discoverTenantTables() {
  const files = [path.join(ROOT, 'liftelo.sql')];
  const migDir = path.join(BACKEND, 'migrations');
  if (fs.existsSync(migDir)) {
    fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).forEach((f) => files.push(path.join(migDir, f)));
  }
  const tables = new Set();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8');
    const create = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;)/gi;
    let m;
    while ((m = create.exec(sql))) {
      if (/\bcompany_id\b/i.test(m[2])) tables.add(m[1].toLowerCase());
    }
    const alter = /ALTER TABLE\s+`?(\w+)`?\s+ADD\s+COLUMN\s+(?:IF NOT EXISTS\s+)?`?company_id`?/gi;
    while ((m = alter.exec(sql))) tables.add(m[1].toLowerCase());
  }
  return tables;
}

// ---------------------------------------------------------------- string literal extraction
// Minimal JS scanner: returns every string / template literal with its start line.
// Template expressions (${...}) are kept verbatim inside the literal text.
function extractLiterals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  let lastSig = '';

  function skipLineComment() { while (i < n && src[i] !== '\n') i++; }
  function skipBlockComment() {
    i += 2;
    while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
    i += 2;
  }
  function readQuoted(q) {
    const startLine = line;
    let text = '';
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { text += src[i] + (src[i + 1] || ''); i += 2; continue; }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++;
    out.push({ text, line: startLine });
  }
  function readTemplate() {
    const startLine = line;
    let text = '';
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { text += src[i] + (src[i + 1] || ''); i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        let depth = 1;
        text += '${';
        i += 2;
        while (i < n && depth > 0) {
          const c = src[i];
          if (c === '{') { depth++; text += c; i++; }
          else if (c === '}') { depth--; text += c; i++; }
          else if (c === '\'' || c === '"') {
            const s = i; readQuoted(c); text += src.slice(s, i);
          } else if (c === '`') {
            const s = i; readTemplate(); text += src.slice(s, i);
          } else { if (c === '\n') line++; text += c; i++; }
        }
        continue;
      }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++;
    out.push({ text, line: startLine });
  }
  function skipRegex() {
    i++;
    let inClass = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { i++; break; }
      else if (c === '\n') break;
      i++;
    }
    while (i < n && /[a-z]/i.test(src[i])) i++;
  }

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { skipLineComment(); continue; }
    if (c === '/' && src[i + 1] === '*') { skipBlockComment(); continue; }
    if (c === '\'' || c === '"') { readQuoted(c); lastSig = 'x'; continue; }
    if (c === '`') { readTemplate(); lastSig = 'x'; continue; }
    if (c === '/') {
      if (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig)) { skipRegex(); lastSig = 'x'; continue; }
    }
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------- analysis
const SQL_RE = /\bSELECT\b[\s\S]*?\bFROM\b|\bINSERT\s+(?:IGNORE\s+)?INTO\b|\bUPDATE\s+`?\w+`?\s+SET\b|\bDELETE\s+FROM\b/i;
const TABLE_REF_RE = /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:IGNORE\s+)?`?(\$\{[^}]*\}|\w+)`?/gi;

function analyseStatement(text, tenantTables) {
  const sql = text.replace(/\s+/g, ' ').trim();
  if (!SQL_RE.test(sql)) return null;
  const touched = new Set();
  let m;
  TABLE_REF_RE.lastIndex = 0;
  while ((m = TABLE_REF_RE.exec(sql))) {
    const name = m[1];
    if (name.startsWith('${')) touched.add('(dynamic table)');
    else if (tenantTables.has(name.toLowerCase())) touched.add(name.toLowerCase());
  }
  if (touched.size === 0) return null;
  const scoped = /\bcompany_id\b/i.test(sql);
  return { sql, tables: [...touched], scoped };
}

function loadAllowlist() {
  const file = path.join(__dirname, 'tenant-check-allow.json');
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = data.entries || [];
  entries.forEach((e, idx) => {
    if (!e.file || !e.reason) throw new Error(`tenant-check-allow.json entry #${idx} needs "file" and "reason"`);
  });
  return entries;
}

function findAllow(entries, rel, sql) {
  const lower = sql.toLowerCase();
  return entries.find((e) =>
    (e.file === '*' || e.file === rel) &&
    (!e.match || lower.includes(String(e.match).toLowerCase()))
  );
}

function listSourceFiles() {
  const files = [path.join(BACKEND, 'index.js')];
  for (const dir of ['routes', 'utils']) {
    const full = path.join(BACKEND, dir);
    fs.readdirSync(full).filter((f) => f.endsWith('.js')).forEach((f) => files.push(path.join(full, f)));
  }
  return files;
}

function run() {
  const tenantTables = discoverTenantTables();
  const allow = loadAllowlist();
  const findings = [];
  const allowed = [];
  const usedEntries = new Set();
  let statements = 0;
  let files = 0;
  const REQ_COMPANY_RE = /req\.(?:body|query)\??\.company_id|req\.params\??\.companyId|req\.params\??\.company_id/g;

  for (const file of listSourceFiles()) {
    const rel = path.relative(BACKEND, file).split(path.sep).join('/');
    const src = fs.readFileSync(file, 'utf8');
    files++;
    for (const lit of extractLiterals(src)) {
      const res = analyseStatement(lit.text, tenantTables);
      if (!res) continue;
      statements++;
      if (res.scoped) continue;
      const entry = findAllow(allow, rel, res.sql);
      const record = { rule: 'sql-without-company-id', file: rel, line: lit.line, tables: res.tables, sql: res.sql.slice(0, 160) };
      if (entry) { usedEntries.add(entry); allowed.push({ ...record, reason: entry.reason }); } else findings.push(record);
    }
    // rule 2: company id taken from the request
    src.split('\n').forEach((text, idx) => {
      if (/^\s*(\/\/|\*)/.test(text)) return;
      if (!REQ_COMPANY_RE.test(text)) { REQ_COMPANY_RE.lastIndex = 0; return; }
      REQ_COMPANY_RE.lastIndex = 0;
      const sql = `request-company-id ${text.trim()}`;
      const entry = findAllow(allow, rel, sql);
      const record = { rule: 'request-company-id', file: rel, line: idx + 1, tables: [], sql: text.trim().slice(0, 160) };
      if (entry) { usedEntries.add(entry); allowed.push({ ...record, reason: entry.reason }); } else findings.push(record);
    });
  }

  const unused = allow.filter((e) => !usedEntries.has(e));
  const summary = {
    files,
    tenantTables: [...tenantTables].sort(),
    tenantSqlStatements: statements,
    findings: findings.length,
    allowlisted: allowed.length,
    unusedAllowEntries: unused.length
  };

  if (args.has('--json')) {
    console.log(JSON.stringify({ summary, findings, allowed, unused }, null, 2));
  } else {
    console.log(`tenant-check: ${files} files, ${tenantTables.size} tenant tables, ${statements} SQL statements touching them`);
    if (args.has('--verbose')) {
      allowed.forEach((a) => console.log(`  allowed  ${a.file}:${a.line} [${a.rule}] ${a.sql}\n           reason: ${a.reason}`));
    }
    findings.forEach((f) => console.log(`  FINDING  ${f.file}:${f.line} [${f.rule}] ${f.tables.join(',')} :: ${f.sql}`));
    if (unused.length) {
      console.log(`  note: ${unused.length} allowlist entr${unused.length === 1 ? 'y' : 'ies'} matched nothing (stale?):`);
      unused.forEach((e) => console.log(`        ${e.file} :: ${e.match || '(file)'}`));
    }
    console.log(`result: ${findings.length} finding(s), ${allowed.length} allowlisted`);
  }
  process.exit(findings.length ? 1 : 0);
}

run();
