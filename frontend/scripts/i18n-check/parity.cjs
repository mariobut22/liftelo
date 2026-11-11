#!/usr/bin/env node
/* i18n parity checker: en vs hr for ALL namespaces in src/locales.
 *   node scripts/i18n-check/parity.cjs
 * Checks: missing/extra keys (plural suffixes ignored for comparison), empty values, interpolation placeholders ({{x}}) match,
 * plural forms present (en: _one/_other, hr: _one/_few/_other), identical en/hr values (must be justified in parity-allow.json),
 * and keys used in code via t('ns:key') that do not exist in en. Exit 1 on any hard error or unjustified identical value. */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { listSourceFiles } = require('./scan.cjs')

const LOCALES = path.resolve(__dirname, '../../src/locales')
const SRC = path.resolve(__dirname, '../../src')
const LANGS = ['en', 'hr']
const REQUIRED = { en: ['one', 'other'], hr: ['one', 'few', 'other'] }
const PLURAL_RE = /_(zero|one|two|few|many|other)$/
const allow = JSON.parse(fs.readFileSync(path.join(__dirname, 'parity-allow.json'), 'utf8'))

const nsList = {}
for (const l of LANGS) nsList[l] = fs.readdirSync(path.join(LOCALES, l)).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort()
const errors = []
const warn = []
if (nsList.en.join() !== nsList.hr.join()) errors.push(`Namespace files differ: en=[${nsList.en}] hr=[${nsList.hr}]`)

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = v
  }
  return out
}
const placeholders = (s) => [...String(s).matchAll(/\{\{\s*([^,}\s]+)[^}]*\}\}/g)].map((m) => m[1]).sort()
const data = {}
const stats = {}
let identical = []
for (const ns of nsList.en) {
  data[ns] = {}
  for (const l of LANGS) {
    const f = path.join(LOCALES, l, ns + '.json')
    if (!fs.existsSync(f)) { errors.push(`${l}/${ns}.json missing`); data[ns][l] = {}; continue }
    try { data[ns][l] = flatten(JSON.parse(fs.readFileSync(f, 'utf8'))) } catch (e) { errors.push(`${l}/${ns}.json invalid JSON: ${e.message}`); data[ns][l] = {} }
  }
  // group by base key
  const groups = {}
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(data[ns][l])) {
      const m = k.match(PLURAL_RE)
      const base = m ? k.replace(PLURAL_RE, '') : k
      groups[base] = groups[base] || { en: {}, hr: {} }
      groups[base][l][m ? m[1] : '_'] = v
      if (v === '' || v === null || (Array.isArray(v) && v.some((x) => !String(x).trim()))) errors.push(`${l}/${ns}:${k} empty value`)
      if (typeof v !== 'string' && !Array.isArray(v)) errors.push(`${l}/${ns}:${k} value is not a string`)
    }
  }
  let keyCount = 0
  for (const [base, g] of Object.entries(groups)) {
    keyCount++
    const hasEn = Object.keys(g.en).length, hasHr = Object.keys(g.hr).length
    if (!hasEn) { errors.push(`EXTRA in hr (missing in en): ${ns}:${base}`); continue }
    if (!hasHr) { errors.push(`MISSING in hr: ${ns}:${base}`); continue }
    const isPlural = (l) => Object.keys(g[l]).some((x) => x !== '_')
    if (isPlural('en') !== isPlural('hr')) errors.push(`Plural mismatch (one language plural, other not): ${ns}:${base}`)
    for (const l of LANGS) {
      if (isPlural(l)) {
        if (g[l]._ !== undefined) errors.push(`${l}/${ns}:${base} has both plain and plural forms`)
        for (const form of REQUIRED[l]) if (g[l][form] === undefined) errors.push(`${l}/${ns}:${base}_${form} missing plural form`)
      }
    }
    // interpolation: union of placeholders over all forms must match between languages, and each form must carry the same set within a language
    const phSet = (l) => [...new Set(Object.values(g[l]).flatMap((v) => (Array.isArray(v) ? v.flatMap(placeholders) : placeholders(v))))].sort().join(',')
    if (phSet('en') !== phSet('hr')) errors.push(`Interpolation mismatch ${ns}:${base}: en={${phSet('en')}} hr={${phSet('hr')}}`)
    // identical values (non-plural only; for plural compare 'other')
    const enV = g.en._ ?? g.en.other, hrV = g.hr._ ?? g.hr.other
    if (JSON.stringify(enV) === JSON.stringify(hrV) && /[A-Za-zÀ-ž]{2,}/.test(JSON.stringify(enV).replace(/\{\{[^}]*\}\}/g, ''))) {
      const val = Array.isArray(enV) ? enV.join('|') : enV
      const ok = allow.identical.some((a) => (a.key ? a.key === `${ns}:${base}` : false) || (a.value !== undefined && a.value === val) || (a.match && new RegExp(a.match).test(val)))
      if (!ok) identical.push(`${ns}:${base} = ${JSON.stringify(val)}`)
    }
  }
  stats[ns] = keyCount
}

// keys used in code
const enFlat = {}
for (const ns of nsList.en) {
  enFlat[ns] = new Set()
  for (const k of Object.keys(data[ns].en)) enFlat[ns].add(k.replace(PLURAL_RE, ''))
}
let usedStatic = 0, usedDynamic = 0, usedLiteral = 0
const usedKeys = new Set()
for (const f of listSourceFiles(SRC)) {
  const code = fs.readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(f, code, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const rel = path.relative(path.dirname(SRC), f)
  let defaultNs = []
  let hasPrefixNs = false
  ;(function find(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useTranslation') {
      const a = n.arguments[0]
      if (!a) defaultNs.push('common')
      else if (ts.isStringLiteral(a)) defaultNs.push(a.text)
      else if (ts.isArrayLiteralExpression(a)) a.elements.forEach((e) => ts.isStringLiteral(e) && defaultNs.push(e.text))
    }
    ts.forEachChild(n, find)
  })(sf)
  ;(function visit(n) {
    if (ts.isCallExpression(n) && ((ts.isIdentifier(n.expression) && n.expression.text === 't') || (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 't' && /i18n/i.test(n.expression.expression.getText(sf))))) {
      const a = n.arguments[0]
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) {
        usedStatic++
        let key = a.text
        let nss = defaultNs.length ? defaultNs : ['common']
        const m = key.match(/^([A-Za-z]+):(.*)$/)
        if (m && nsList.en.includes(m[1])) { nss = [m[1]]; key = m[2] }
        // explicit ns option: t('k', { ns: 'x' })
        const opt = n.arguments[1]
        if (opt && ts.isObjectLiteralExpression(opt)) for (const p of opt.properties) if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'ns' && ts.isStringLiteral(p.initializer)) nss = [p.initializer.text]
        if (!nss.some((ns) => enFlat[ns] && (enFlat[ns].has(key) || [...enFlat[ns]].some((k) => k === key)))) {
          // arrays/objects returned with returnObjects: allow prefix match
          if (!nss.some((ns) => enFlat[ns] && [...enFlat[ns]].some((k) => k.startsWith(key + '.')))) errors.push(`${rel}:${line} key not found in en: t('${a.text}') [ns: ${nss.join('|')}]`)
        }
        nss.forEach((ns) => usedKeys.add(`${ns}:${key}`))
      } else if (a && ts.isTemplateExpression(a) && a.head.text) {
        // dynamic key such as t(`status.${s}`): the static prefix must match at least one key
        usedDynamic++
        let prefix = a.head.text
        let nss = defaultNs.length ? defaultNs : ['common']
        const m = prefix.match(/^([A-Za-z]+):(.*)$/)
        if (m && nsList.en.includes(m[1])) { nss = [m[1]]; prefix = m[2] }
        if (!nss.some((ns) => enFlat[ns] && [...enFlat[ns]].some((k) => k.startsWith(prefix)))) errors.push(`${rel}:${line} dynamic key prefix not found in en: t(\`${a.head.text}\${...}\`) [ns: ${nss.join('|')}]`)
      } else usedDynamic++
    }
    // string literals that look like a namespaced key ('nav:items.home') must exist (covers keys stored in constants/maps)
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !(n.parent && ts.isCallExpression(n.parent) && n.parent.arguments[0] === n && /^t$/.test(n.parent.expression.getText(sf)))) {
      const m = n.text.match(/^([A-Za-z]+):([A-Za-z0-9_.]+)$/)
      if (m && nsList.en.includes(m[1])) {
        usedLiteral++
        const base = m[2]
        if (!(enFlat[m[1]].has(base) || [...enFlat[m[1]]].some((k) => k.startsWith(base + '.')))) errors.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} key literal not found in en: '${n.text}'`)
      }
    }
    ts.forEachChild(n, visit)
  })(sf)
}

console.log('Namespaces / base keys per namespace:')
for (const ns of nsList.en) console.log(`  ${ns.padEnd(14)} ${String(stats[ns]).padStart(5)}`)
console.log(`  TOTAL          ${String(Object.values(stats).reduce((a, b) => a + b, 0)).padStart(5)}`)
console.log(`t() calls with static key: ${usedStatic}, key literals in constants: ${usedLiteral}, dynamic key (not verified): ${usedDynamic}`)
if (identical.length) {
  console.log(`\nIDENTICAL en/hr values needing review (${identical.length}) - fix translation or add to parity-allow.json with a reason:`)
  identical.forEach((x) => console.log('  ' + x))
}
if (errors.length) {
  console.log(`\nERRORS (${errors.length}):`)
  errors.forEach((x) => console.log('  ' + x))
}
console.log(`\nPARITY RESULT: errors=${errors.length}, unreviewed identical=${identical.length}`)
process.exit(errors.length || identical.length ? 1 : 0)
