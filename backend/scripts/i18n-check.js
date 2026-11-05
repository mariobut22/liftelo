#!/usr/bin/env node
/*
 * Backend i18n checker (dev tool, no dependencies).
 *   node backend/scripts/i18n-check.js [--list] [--json] [--no-allowlist]
 *
 * 1) Parity: every backend/locales/en/<ns>.json has a hr twin with the same keys,
 *    same {{placeholders}}, no empty values; identical en/hr values must be justified
 *    in i18n-check-allow.json ("identical").
 * 2) Source scan: finds remaining Croatian user-visible text (diacritics or common Croatian
 *    words inside string literals) in backend source. console.* statements are ignored
 *    (developer logs may be in any language). Justified exceptions: i18n-check-allow.json ("source").
 * Exit code 1 if anything is left.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCALES = path.join(ROOT, 'locales');
const ALLOW_FILE = path.join(__dirname, 'i18n-check-allow.json');
const args = new Set(process.argv.slice(2));

const allow = args.has('--no-allowlist') || !fs.existsSync(ALLOW_FILE)
  ? { identical: [], source: [] }
  : JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8'));

/* ---------- 1) locale parity ---------- */
const flatten = (value, prefix = '', out = {}) => {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k, out));
  } else {
    out[prefix] = value;
  }
  return out;
};
const placeholders = (s) => (String(s).match(/\{\{\s*[\w.]+\s*\}\}/g) || []).map(p => p.replace(/\s/g, '')).sort().join(',');

const parityIssues = [];
const nsFiles = new Set([
  ...fs.readdirSync(path.join(LOCALES, 'en')),
  ...fs.readdirSync(path.join(LOCALES, 'hr'))
].filter(f => f.endsWith('.json')));
let keyCount = 0;
for (const file of [...nsFiles].sort()) {
  const read = (lang) => {
    const p = path.join(LOCALES, lang, file);
    if (!fs.existsSync(p)) { parityIssues.push(`${lang}/${file}: file missing`); return null; }
    try { return flatten(JSON.parse(fs.readFileSync(p, 'utf8'))); }
    catch (e) { parityIssues.push(`${lang}/${file}: invalid JSON (${e.message})`); return null; }
  };
  const en = read('en');
  const hr = read('hr');
  if (!en || !hr) continue;
  keyCount += Object.keys(en).length;
  for (const k of Object.keys(en)) {
    if (!(k in hr)) parityIssues.push(`${file}: key "${k}" missing in hr`);
  }
  for (const k of Object.keys(hr)) {
    if (!(k in en)) parityIssues.push(`${file}: key "${k}" missing in en`);
  }
  for (const k of Object.keys(en)) {
    if (!(k in hr)) continue;
    for (const [lang, map] of [['en', en], ['hr', hr]]) {
      if (typeof map[k] !== 'string' || map[k].trim() === '') parityIssues.push(`${lang}/${file}: key "${k}" is empty`);
    }
    if (placeholders(en[k]) !== placeholders(hr[k])) {
      parityIssues.push(`${file}: key "${k}" placeholders differ (en: ${placeholders(en[k]) || '-'}, hr: ${placeholders(hr[k]) || '-'})`);
    }
    if (en[k] === hr[k] && !(allow.identical || []).some(a => a.file === file && (a.key === k || a.key === '*') )) {
      parityIssues.push(`${file}: key "${k}" is identical in en and hr ("${en[k]}") - justify in i18n-check-allow.json`);
    }
  }
}

/* ---------- 2) source scan ---------- */
const SCAN_DIRS = ['routes', 'utils', 'templates'];
const SCAN_FILES = ['index.js'];
const SKIP_DIRS = new Set(['i18n']); // utils/i18n holds loaders only
const DIACRITICS = /[čćžšđČĆŽŠĐ]/;
const WORDS = /\b(gre[sš]ka|pogre[sš]k\w*|nije|nisu|nema|nemate|pozvani|korisni\w*|lozink\w*|uspje[sš]no|molimo|nalog\w*|tvrtk\w*|neispravn\w*|obavezn\w*|nepoznat\w*|serviser\w*|lokacij\w*|intervencij\w*|dizal\w*|potpis\w*|zapis\w*|pristup\w*|dodijeljen\w*|izvje[sš]\w*|datoteka|nevaljan\w*|prekora\w*|ime|datum|dodan\w*|obrisan\w*|spremljen\w*|pronađen\w*|pronaden\w*|nedostaje|nedostaju|potrebn\w*|zabranjen\w*|obavijest\w*|poruk\w*|rje[sš]en\w*)\b/i;

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name)); }
    else if (/\.(js|ejs)$/.test(entry.name)) files.push(path.join(dir, entry.name));
  }
};
SCAN_DIRS.forEach(d => fs.existsSync(path.join(ROOT, d)) && walk(path.join(ROOT, d)));
SCAN_FILES.forEach(f => files.push(path.join(ROOT, f)));

const stripLineComment = (line) => {
  // remove trailing // comments that are not inside a string (naive but sufficient: only when no quote follows)
  const idx = line.search(/(^|\s)\/\/(?!.*['"`])/);
  return idx >= 0 ? line.slice(0, idx) : line;
};

const hits = [];
for (const file of files.sort()) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let inBlock = false;
  let inTemplate = false;
  let consoleDepth = 0; // paren depth while inside a console.* call
  lines.forEach((raw, i) => {
    let line = raw;
    // block comments
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) return;
      line = line.slice(end + 2); inBlock = false;
    }
    line = line.replace(/\/\*.*?\*\//g, '');
    const startBlock = line.indexOf('/*');
    if (startBlock >= 0 && !/['"`]/.test(line.slice(0, startBlock).slice(-1))) { inBlock = true; line = line.slice(0, startBlock); }
    if (/^\s*(<%#|\/\/|\*)/.test(line)) return;
    line = stripLineComment(line);

    // console.* calls (may span lines)
    if (consoleDepth > 0 || /\bconsole\.\w+\s*\(/.test(line)) {
      const from = consoleDepth > 0 ? 0 : line.search(/\bconsole\.\w+\s*\(/);
      for (let c = from; c < line.length; c += 1) {
        if (line[c] === '(') consoleDepth += 1;
        else if (line[c] === ')') consoleDepth -= 1;
      }
      if (consoleDepth < 0) consoleDepth = 0;
      return;
    }

    // collect literal text on the line
    const literals = [];
    if (inTemplate) {
      const closing = line.indexOf('`');
      literals.push(closing < 0 ? line : line.slice(0, closing));
    }
    const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(line)) !== null) literals.push(m[2]);
    const ticks = (line.match(/(?<!\\)`/g) || []).length;
    if (ticks % 2 === 1) inTemplate = !inTemplate;
    if (/\.ejs$/.test(rel)) literals.push(line.replace(/<%[\s\S]*?%>/g, ' ').replace(/<[^>]+>/g, ' '));

    for (const lit of literals) {
      const text = lit.replace(/\$\{[^}]*\}/g, ' ');
      if (DIACRITICS.test(text) || WORDS.test(text)) {
        hits.push({ file: rel, line: i + 1, text: raw.trim().slice(0, 160), literal: text.trim().slice(0, 100) });
        break;
      }
    }
  });
}

const isAllowed = (hit) => (allow.source || []).some(a =>
  a.file === hit.file && (!a.contains || hit.text.includes(a.contains) || hit.literal.includes(a.contains)));
const remaining = hits.filter(h => !isAllowed(h));
const allowed = hits.length - remaining.length;

/* ---------- report ---------- */
if (args.has('--json')) {
  console.log(JSON.stringify({ keyCount, parityIssues, remaining, allowed }, null, 2));
} else {
  console.log(`Locale parity: ${nsFiles.size} namespaces, ${keyCount} keys, ${parityIssues.length} issue(s)`);
  parityIssues.forEach(p => console.log('  - ' + p));
  console.log(`Source scan: ${files.length} files, ${hits.length} Croatian-looking literal(s), ${allowed} allowlisted, ${remaining.length} remaining`);
  const byFile = {};
  remaining.forEach(h => { byFile[h.file] = (byFile[h.file] || 0) + 1; });
  Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${String(n).padStart(4)}  ${f}`));
  if (args.has('--list')) remaining.forEach(h => console.log(`${h.file}:${h.line}  ${h.text}`));
}
process.exit(parityIssues.length || remaining.length ? 1 : 0);
