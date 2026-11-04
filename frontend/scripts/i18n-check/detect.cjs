#!/usr/bin/env node
/* Hardcoded user-facing string detector.
 *   node scripts/i18n-check/detect.cjs [--json] [--by-file] [--no-allowlist]
 * Lists every JSX text node, UI attribute string, toast/alert/confirm argument, error message, label-like object value,
 * UI-looking string literal and hardcoded locale ('hr-HR') under src/ that is not translated. Exit code 1 when anything remains.
 * Justified exceptions live in allowlist.json (each entry needs a reason). */
const fs = require('fs')
const path = require('path')
const { scanFile, listSourceFiles } = require('./scan.cjs')

const args = process.argv.slice(2)
const srcDir = path.resolve(__dirname, '../../src')
const allowlist = args.includes('--no-allowlist') ? [] : JSON.parse(fs.readFileSync(path.join(__dirname, 'allowlist.json'), 'utf8')).entries

function allowed(f) {
  return allowlist.some((a) => {
    if (a.file && a.file !== f.file) return false
    if (a.kind && a.kind !== f.kind) return false
    if (a.text !== undefined) return a.text === f.text
    if (a.match) return new RegExp(a.match).test(f.text)
    return false
  })
}

const SKIP_FILES = [/^src\/i18n\.ts$/, /^src\/vite-env\.d\.ts$/]
let findings = []
for (const f of listSourceFiles(srcDir)) {
  for (const x of scanFile(f, srcDir)) {
    if (SKIP_FILES.some((r) => r.test(x.file))) continue
    findings.push(x)
  }
}
const total = findings.length
const remaining = findings.filter((f) => !allowed(f))
const allowedCount = total - remaining.length

if (args.includes('--json')) {
  console.log(JSON.stringify(remaining, null, 1))
  process.exit(remaining.length ? 1 : 0)
}
const byFile = {}
for (const f of remaining) byFile[f.file] = (byFile[f.file] || 0) + 1
if (!args.includes('--by-file')) for (const f of remaining) console.log(`${f.file}:${f.line}: [${f.kind}${f.ctx ? ' ' + f.ctx : ''}] ${JSON.stringify(f.text)}`)
console.log('\nPer file:')
for (const [k, v] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
const kinds = {}
for (const f of remaining) kinds[f.kind] = (kinds[f.kind] || 0) + 1
console.log('\nBy kind:', JSON.stringify(kinds))
console.log(`\nREMAINING hardcoded strings: ${remaining.length}  (allowlisted: ${allowedCount}, total detected: ${total})`)
process.exit(remaining.length ? 1 : 0)
