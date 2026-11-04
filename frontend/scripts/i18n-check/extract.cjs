#!/usr/bin/env node
/* One-off migration helper used to move hardcoded strings into react-i18next namespaces. Kept for future bulk imports.
 *   node scripts/i18n-check/extract.cjs dump  [--files <regex>]
 *   node scripts/i18n-check/extract.cjs apply --map a.json[,b.json] [--files <regex>] [--dry]
 * Map format: { "<source text with {{placeholders}}>": ["en text or '='", "hr text", "optional ns:key"] }
 *   or "allow:<reason>" to allowlist the string. Key `file.tsx::<text>` overrides per file (suffix match on path).
 * apply replaces the string in code with t('ns:key', {args}), adds `const { t } = useTranslation()` and the import where needed,
 * and merges the strings into src/locales/{en,hr}/<ns>.json. Strings it cannot place safely are listed as MANUAL. */
const ts = require('typescript')
const fs = require('fs')
const path = require('path')
const { scanFile, listSourceFiles } = require('./scan.cjs')

const SRC = path.resolve(__dirname, '../../src')
const LOC = path.join(SRC, 'locales')
const [mode, ...rest] = process.argv.slice(2)
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined }
const filesRe = opt('--files') ? new RegExp(opt('--files')) : null
const dry = rest.includes('--dry')

const NS_MAP = [
  [/layouts\/AppLayout|CommandPalette|notifications\/|billing\/AccessDialog|App\.tsx|ProtectedRoute/, 'nav'],
  [/pages\/(Login|Register|Onboarding|SetPassword|AcceptInvite)/, 'auth'],
  [/pages\/(Profile|Sessions|Settings)|company\/(CompanyEditModal|CreateCompanyModal)/, 'settings'],
  [/pages\/Home/, 'dashboard'],
  [/pages\/(Locations|LocationDetail)|locations\/|maps\//, 'locations'],
  [/pages\/(Rms|RmsDetail|RmsOverview|Stats)\b|rms\//, 'rms'],
  [/pages\/Interventions|interventions\//, 'interventions'],
  [/pages\/WorkOrder|work-orders\//, 'workOrders'],
  [/pages\/Project|projects\//, 'projects'],
  [/pages\/Vehicles|vehicles\//, 'vehicles'],
  [/pages\/User|users\//, 'users'],
  [/pages\/Superadmin|superadmin\//, 'superadmin'],
]
const nsOf = (file) => { for (const [re, ns] of NS_MAP) if (re.test(file)) return ns; return 'common' }
const sectionOf = (file) => { const b = path.basename(file).replace(/\.tsx?$/, ''); return b.charAt(0).toLowerCase() + b.slice(1).replace(/-(\w)/g, (_, c) => c.toUpperCase()) }
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'is', 'in', 'on', 'this', 'that', 'your', 'you', 'with', 'be'])
function slug(en) {
  const words = en.replace(/\{\{\w+\}\}/g, ' ').replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  const keep = words.filter((w) => !STOP.has(w.toLowerCase()))
  const use = (keep.length >= 1 ? keep : words).slice(0, 5)
  let s = use.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('')
  if (!s) s = 'text'
  if (/^\d/.test(s)) s = 'n' + s
  return s
}

const ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'allowlist.json'), 'utf8')).entries
const isAllowed = (f) => ALLOW.some((a) => (!a.file || a.file === f.file) && (!a.kind || a.kind === f.kind) && (a.text !== undefined ? a.text === f.text : a.match ? new RegExp(a.match).test(f.text) : false))
function collect() {
  const all = []
  for (const f of listSourceFiles(SRC)) {
    if (/src\/i18n\.ts$/.test(f)) continue
    for (const x of scanFile(f, SRC)) if ((!filesRe || filesRe.test(x.file)) && !isAllowed(x)) all.push({ ...x, abs: f })
  }
  return all
}

if (mode === 'dump') {
  const all = collect()
  const byFile = {}
  for (const x of all) (byFile[x.file] = byFile[x.file] || []).push(x)
  const counts = {}
  for (const x of all) counts[x.text] = (counts[x.text] || new Set()).add(x.file)
  for (const [file, xs] of Object.entries(byFile)) {
    console.log(`\n## ${file}  [ns=${nsOf(file)}]`)
    const seen = new Set()
    for (const x of xs) {
      if (seen.has(x.text)) continue
      seen.add(x.text)
      console.log(`${x.line}\t${x.kind}${x.ctx ? ':' + String(x.ctx).slice(0, 18) : ''}\t${x.text}${counts[x.text].size > 1 ? `   (x${counts[x.text].size} files)` : ''}`)
    }
  }
  process.exit(0)
}

if (mode !== 'apply') { console.error('usage: dump|apply'); process.exit(2) }

const maps = (opt('--map') || '').split(',').filter(Boolean).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
const MAP = Object.assign({}, ...maps)
const findings = collect()
const fileCount = {}
for (const x of findings) (fileCount[x.text] = fileCount[x.text] || new Set()).add(x.file)

function lookup(x) {
  for (const k of Object.keys(MAP)) { const i = k.indexOf('::'); if (i > 0 && x.file.endsWith(k.slice(0, i)) && k.slice(i + 2) === x.text) return MAP[k] }
  return MAP[x.text]
}
const phs = (s) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',')

// ---- locale store
const store = {}
function loadNs(lang, ns) {
  const k = lang + '/' + ns
  if (!store[k]) { const f = path.join(LOC, lang, ns + '.json'); store[k] = { f, data: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {} } }
  return store[k].data
}
function getPath(obj, parts) { let c = obj; for (const p of parts) { if (c == null || typeof c !== 'object') return undefined; c = c[p] } return c }
function setPath(obj, parts, val) {
  let c = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (c[parts[i]] === undefined) c[parts[i]] = {}
    if (typeof c[parts[i]] !== 'object') throw new Error('key conflict at ' + parts.slice(0, i + 1).join('.'))
    c = c[parts[i]]
  }
  c[parts[parts.length - 1]] = val
}
function allocateKey(ns, base, en, hr) {
  const enData = loadNs('en', ns)
  const hrData = loadNs('hr', ns)
  let key = base, i = 2
  for (;;) {
    const cur = getPath(enData, key.split('.'))
    if (cur === undefined) return key
    if (cur === en && getPath(hrData, key.split('.')) === hr) return key
    key = base + i++
  }
}

const allowAdd = []
const manual = []
const untranslated = []
const editsByFile = {}
const keyFor = new Map() // cache: abs|text -> full key (same text in same file reuses key)

for (const x of findings) {
  const entry = lookup(x)
  if (entry === undefined) { untranslated.push(x); continue }
  if (typeof entry === 'string' && entry.startsWith('allow:')) { allowAdd.push({ file: x.file, kind: x.kind, text: x.text, reason: entry.slice(6).trim() }); continue }
  if (!Array.isArray(entry)) { console.error('bad map entry for', x.text); process.exit(2) }
  let [en, hr, explicit] = entry
  if (en === '=') en = x.text
  if (phs(en) !== phs(x.text) || phs(hr) !== phs(x.text)) { console.error(`PLACEHOLDER MISMATCH ${x.file}:${x.line} src=${x.text} en=${en} hr=${hr}`); process.exit(2) }
  if (x.kind === 'locale') { manual.push({ ...x, why: 'locale' }); continue }
  ;(editsByFile[x.abs] = editsByFile[x.abs] || []).push({ x, en, hr, explicit })
}

function fnName(fn) {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text
  let p = fn.parent
  while (p && (ts.isParenthesizedExpression(p) || (ts.isCallExpression(p) && /^(React\.)?(forwardRef|memo)$/.test(p.expression.getText())))) p = p.parent
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text
  if (p && ts.isExportAssignment(p)) return 'Default'
  return ''
}
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)

let applied = 0
const touched = []
for (const [abs, edits] of Object.entries(editsByFile)) {
  const code = fs.readFileSync(abs, 'utf8')
  const sf = ts.createSourceFile(abs, code, ts.ScriptTarget.Latest, true, abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const rel = path.relative(path.dirname(SRC), abs)
  const reps = []
  const hookNeeded = new Map() // component fn -> { bodyStart }
  const nodeAt = (start, end) => {
    let found
    ;(function v(n) { if (n.getStart(sf) <= start && n.end >= end) { found = n; ts.forEachChild(n, v) } })(sf)
    return found
  }
  for (const e of edits) {
    const { x } = e
    const node = nodeAt(x.start, x.end)
    // nearest component/hook ancestor
    let comp = null
    for (let p = node; p; p = p.parent) if (isFn(p)) { const nm = fnName(p); if (/^[A-Z]/.test(nm) || /^use[A-Z]/.test(nm)) { comp = p; break } }
    if (!comp) { manual.push({ ...x, why: 'not inside a component/hook' }); continue }
    if (!ts.isBlock(comp.body)) { manual.push({ ...x, why: 'component has expression body' }); continue }
    // `t` shadowing
    let shadow = false
    ;(function v(n) {
      if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && n.name.text === 't') {
        const isHook = ts.isBindingElement(n) && n.parent.parent && ts.isVariableDeclaration(n.parent.parent) && n.parent.parent.initializer && /useTranslation/.test(n.parent.parent.initializer.getText())
        if (!isHook) shadow = true
      }
      ts.forEachChild(n, v)
    })(comp)
    if (shadow) { manual.push({ ...x, why: 't is shadowed in component' }); continue }
    // key
    const ns = nsOf(x.file)
    let fullKey = e.explicit
    const ck = abs + '|' + x.text
    if (!fullKey) {
      if (fileCount[x.text].size >= 3 && x.text.length <= 32 && x.kind !== 'jsx-attr-other') {
        fullKey = 'common:' + allocateKey('common', 'shared.' + slug(e.en), e.en, e.hr)
      } else if (keyFor.has(ck)) fullKey = keyFor.get(ck)
      else fullKey = ns + ':' + allocateKey(ns, sectionOf(x.file) + '.' + slug(e.en), e.en, e.hr)
    }
    keyFor.set(ck, fullKey)
    const [kns, kpath] = fullKey.includes(':') ? fullKey.split(':') : [ns, fullKey]
    const parts = kpath.split('.')
    for (const [lang, val] of [['en', e.en], ['hr', e.hr]]) {
      const data = loadNs(lang, kns)
      const cur = getPath(data, parts)
      if (cur !== undefined && cur !== val) { console.error(`KEY COLLISION ${kns}:${kpath} (${lang}) existing=${JSON.stringify(cur)} new=${JSON.stringify(val)}`); process.exit(2) }
      if (!dry || true) setPath(data, parts, val)
    }
    const argText = x.args && x.args.length ? ', { ' + x.args.map((a) => (a.name === a.code ? a.name : `${a.name}: ${a.code}`)).join(', ') + ' }' : ''
    const call = `t('${kns}:${kpath}'${argText})`
    const wrap = x.kind === 'jsx-text' || x.inAttrString
    reps.push({ start: x.start, end: x.end, text: wrap ? `{${call}}` : call })
    hookNeeded.set(comp, true)
    applied++
  }
  // drop overlapping edits (keep outermost / first)
  reps.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept = []
  for (const r of reps) { const last = kept[kept.length - 1]; if (last && r.start < last.end) { manual.push({ file: rel, line: 0, text: code.slice(r.start, r.end), why: 'overlaps a larger replacement (rerun detect)', kind: 'overlap' }); continue } kept.push(r) }
  // hooks
  for (const comp of hookNeeded.keys()) {
    const body = comp.body
    let has = false, patch = null
    for (const st of body.statements) {
      if (!ts.isVariableStatement(st)) continue
      for (const d of st.declarationList.declarations) {
        if (d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText() === 'useTranslation') {
          if (ts.isObjectBindingPattern(d.name)) {
            if (d.name.elements.some((el) => el.name.getText() === 't' && !el.propertyName)) has = true
            else patch = { start: d.name.elements[0] ? d.name.elements[0].getStart(sf) : d.name.getStart(sf) + 1, text: 't, ' }
          }
        }
      }
    }
    if (has) continue
    if (patch) kept.push({ start: patch.start, end: patch.start, text: patch.text })
    else { const indent = '  '.repeat(1); kept.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: `\n${indent}const { t } = useTranslation()\n` }) }
  }
  // import
  const hasImport = sf.statements.some((s) => ts.isImportDeclaration(s) && s.moduleSpecifier.getText().includes('react-i18next') && /useTranslation/.test(s.getText()))
  if (!hasImport) {
    const imports = sf.statements.filter(ts.isImportDeclaration)
    const at = imports.length ? imports[imports.length - 1].end : 0
    kept.push({ start: at, end: at, text: `\nimport { useTranslation } from 'react-i18next'` })
  }
  kept.sort((a, b) => b.start - a.start || b.end - a.end)
  let out = code
  for (const r of kept) out = out.slice(0, r.start) + r.text + out.slice(r.end)
  if (!dry) fs.writeFileSync(abs, out)
  touched.push(rel)
}

if (!dry) {
  for (const { f, data } of Object.values(store)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n') }
  if (allowAdd.length) {
    const af = path.join(__dirname, 'allowlist.json')
    const al = JSON.parse(fs.readFileSync(af, 'utf8'))
    for (const a of allowAdd) if (!al.entries.some((e) => e.file === a.file && e.text === a.text && e.kind === a.kind)) al.entries.push(a)
    fs.writeFileSync(af, JSON.stringify(al, null, 2) + '\n')
  }
}
console.log(`applied=${applied} files=${touched.length} allowlisted=${allowAdd.length} untranslated=${untranslated.length} manual=${manual.length}${dry ? ' (dry run)' : ''}`)
if (manual.length) { console.log('\nMANUAL:'); for (const m of manual) console.log(`  ${m.file}:${m.line} [${m.kind}] ${JSON.stringify(m.text)}  -- ${m.why}`) }
if (untranslated.length) { console.log('\nUNTRANSLATED (no map entry):'); for (const m of untranslated) console.log(`  ${m.file}:${m.line} [${m.kind}] ${JSON.stringify(m.text)}`) }
