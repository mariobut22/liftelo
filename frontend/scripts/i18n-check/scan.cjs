/* Shared AST scanner for the i18n detector (and the one-off extraction tooling).
 * Finds user-facing hardcoded strings in src/**.ts(x) using the TypeScript compiler API (already a devDependency).
 * Exports: scanFile(absPath) -> Finding[], listSourceFiles(srcDir). */
const ts = require('typescript')
const fs = require('fs')
const path = require('path')

const LETTER = /[A-Za-zÀ-žА-я]/
const HR_DIACRITICS = /[čćšžđČĆŠŽĐ]/
const LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/

// JSX attributes whose string value is shown to the user.
const UI_ATTRS = new Set([
  'placeholder', 'title', 'aria-label', 'aria-description', 'aria-placeholder', 'alt', 'label', 'helperText', 'description',
  'tooltip', 'emptyText', 'emptyMessage', 'subtitle', 'heading', 'header', 'text', 'message', 'confirmLabel', 'cancelLabel',
  'ariaLabel', 'tip', 'hint', 'caption', 'summary', 'loadingText', 'noResultsText', 'error', 'errorMessage', 'submitLabel',
  'actionLabel', 'emptyLabel', 'buttonLabel', 'legend', 'name_label',
])
// Object property keys whose string value is shown to the user.
const UI_KEYS = new Set([
  'label', 'title', 'description', 'placeholder', 'text', 'message', 'subtitle', 'heading', 'header', 'tooltip', 'emptyMessage',
  'helperText', 'caption', 'content', 'hint', 'cta', 'buttonLabel', 'confirmText', 'successMessage', 'errorMessage', 'error',
  'emptyText', 'summary', 'detail', 'details', 'name_label', 'shortLabel', 'longLabel',
])
// Attributes that never carry user-facing text (skip even when nested).
const NON_UI_ATTRS = new Set([
  'className', 'class', 'id', 'key', 'name', 'type', 'href', 'to', 'src', 'path', 'htmlFor', 'value', 'variant', 'size', 'side',
  'align', 'role', 'style', 'target', 'rel', 'method', 'autoComplete', 'inputMode', 'accept', 'pattern', 'min', 'max', 'step',
  'viewBox', 'd', 'fill', 'stroke', 'width', 'height', 'data-testid', 'data-slot', 'data-state', 'asChild', 'defaultValue',
  'position', 'orientation', 'color', 'lang', 'dir', 'crossOrigin', 'loading', 'sizes', 'srcSet', 'media', 'tabIndex',
])
const CLASS_FNS = new Set(['cn', 'clsx', 'twMerge', 'cva', 'classNames', 'tw'])
// Methods whose string args are never UI text.
const NON_UI_METHODS = new Set([
  'includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'split', 'join', 'replace', 'replaceAll', 'match', 'test', 'getItem',
  'setItem', 'removeItem', 'get', 'has', 'append', 'set', 'delete', 'querySelector', 'querySelectorAll', 'addEventListener',
  'removeEventListener', 'navigate', 'fetch', 'apiFetch', 'localeCompare', 'toLowerCase', 'toUpperCase', 'padStart', 'padEnd',
  'getElementById', 'closest', 'matches', 'matchMedia', 'invalidateQueries', 'setQueryData', 'getQueryData', 'cancelQueries', 'refetchQueries',
  'resetQueries', 'removeQueries', 'register', 'setValue', 'getValues', 'watch', 'trigger', 'clearErrors', 'resetField',
  'useQuery', 'useMutation', 'forEach', 'sort', 'Number', 'parseInt', 'parseFloat', 'String', 'Boolean', 'require', 'import',
  'createContext', 'useRef', 'useContext', 'getAttribute', 'setAttribute', 'removeAttribute', 'dispatchEvent', 'Date', 'URL',
  'URLSearchParams', 'FormData', 'Blob', 'Event', 'CustomEvent', 'RegExp', 'Set', 'Map', 'Object', 'keys', 'values',
  'isArray', 'assign', 'stringify', 'parse', 'open', 'postMessage', 'scrollIntoView', 'focus', 'blur', 'log', 'warn', 'debug',
  'info', 'error_', 'group', 'table', 'time', 'timeEnd', 'toISOString', 'slice', 'substring', 'charAt', 'at', 'concat', 'filter',
  'map', 'find', 'findIndex', 'some', 'every', 'reduce', 'emit', 'on', 'off', 'once', 'cookie', 'insertAdjacentHTML',
])

const ENTITIES = { nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rarr: '\u2192', larr: '\u2190', middot: '\u00b7', bull: '\u2022', hellip: '\u2026', ndash: '\u2013', mdash: '\u2014', copy: '\u00a9', times: '\u00d7' }
const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  return ENTITIES[e] !== undefined ? ENTITIES[e] : m
})

/** Readable placeholder name for an interpolated expression; unique within `used`. */
function placeholderName(expr, used) {
  let base = 'value'
  let e = expr
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = e.expression
  if (ts.isIdentifier(e)) base = e.text
  else if (ts.isPropertyAccessExpression(e)) base = e.name.text
  else if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.arguments.length === 0) base = ts.isIdentifier(e.expression.expression) ? e.expression.expression.text : e.expression.name.text
  else if (ts.isElementAccessExpression(e)) base = ts.isIdentifier(e.expression) ? e.expression.text : 'value'
  else if (ts.isNumericLiteral(e)) base = 'number'
  if (base === 'length') base = 'count'
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) base = 'value'
  let name = base, i = 2
  while (used.has(name)) name = base + i++
  used.add(name)
  return name
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

function calleeName(call) {
  const e = call.expression
  if (ts.isIdentifier(e)) return { full: e.text, last: e.text }
  if (ts.isPropertyAccessExpression(e)) {
    const parts = []
    let cur = e
    while (ts.isPropertyAccessExpression(cur)) { parts.unshift(cur.name.text); cur = cur.expression }
    parts.unshift(ts.isIdentifier(cur) ? cur.text : '?')
    return { full: parts.join('.'), last: parts[parts.length - 1] }
  }
  return { full: '?', last: '?' }
}

function keyName(prop) {
  const n = prop.name
  if (!n) return ''
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text
  return ''
}

function looksLikeUiGeneric(text) {
  if (!LETTER.test(text)) return false
  const t = text.trim()
  if (/^(https?:|\/|\.|#|@|mailto:|tel:|data:)/.test(t)) return false
  if (/^[a-z0-9_.\-:/[\]%()#,!@$]+$/.test(t) && !HR_DIACRITICS.test(t)) return false // identifier / path / css token
  if (HR_DIACRITICS.test(t)) return true
  const hasSpace = /\s/.test(t)
  if (hasSpace) return /^[A-Z0-9"“('¿¡⚠✓📊📥]/.test(t)
  return /^[A-Z][a-z]{2,}[.!?…:]?$/.test(t) || /^[A-Z][a-z]+(-[A-Za-z]+)+$/.test(t) === false && /^[A-Z][a-z]{2,}\.\.\.$/.test(t)
}

/** Decide the UI context of a literal. Returns { kind, ctx } or null when it is not user-facing. */
function classify(node) {
  let cur = node
  let p = node.parent
  while (p) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isEnumDeclaration(p)) return null
    if (ts.isJsxAttribute(p)) {
      const name = p.name.getText()
      if (NON_UI_ATTRS.has(name)) return null
      if (UI_ATTRS.has(name)) return { kind: 'jsx-attr', ctx: name, guaranteed: true }
      return { kind: 'jsx-attr-other', ctx: name, guaranteed: false }
    }
    if (ts.isJsxExpression(p)) {
      const gp = p.parent
      if (ts.isJsxElement(gp) || ts.isJsxFragment(gp)) return { kind: 'jsx-expr', ctx: ts.isJsxElement(gp) ? gp.openingElement.tagName.getText() : 'fragment', guaranteed: true }
      // inside attribute expression: keep climbing to the attribute
    }
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind
      if (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.InKeyword) return null
      if (op === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(p.left) && cur === p.right) {
        const prop = p.left.name.text
        if (prop === 'displayName') return null
        if (UI_KEYS.has(prop) || prop === 'innerText' || prop === 'textContent' || prop === 'title') return { kind: 'assign', ctx: prop, guaranteed: true }
      }
      // && || ?? + : keep climbing
    }
    if (ts.isCaseClause(p) || ts.isElementAccessExpression(p) && p.argumentExpression === cur) return null
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      if (p.expression === cur) return null
      const callee = ts.isCallExpression(p) ? calleeName(p) : { full: p.expression.getText(), last: p.expression.getText() }
      if (ts.isNewExpression(p)) {
        if (/^(Error|TypeError|RangeError)$/.test(callee.last)) return { kind: 'error', ctx: 'new ' + callee.last, guaranteed: true }
        return null
      }
      if (callee.full === 't' || callee.last === 't' || callee.last === 'tr' || /(^|\.)i18n\.t$/.test(callee.full)) return null
      if (/^console\./.test(callee.full)) return null
      if (CLASS_FNS.has(callee.last)) return null
      if (/^toast(\.|$)/.test(callee.full)) return { kind: 'toast', ctx: callee.full, guaranteed: true }
      if (/^(window\.)?(alert|confirm|prompt)$/.test(callee.full)) return { kind: 'dialog', ctx: callee.full, guaranteed: true }
      if (/^set\w*(Error|Message|Notice|Success|Toast|Title|Label|Text|Feedback|Warning)$/.test(callee.last)) return { kind: 'state-message', ctx: callee.last, guaranteed: true }
      if (/^(toLocale\w*String|toLocale\w*|format|DateTimeFormat|NumberFormat|RelativeTimeFormat|ListFormat|Collator|PluralRules)$/.test(callee.last)) return null // handled by locale check
      if (NON_UI_METHODS.has(callee.last)) return null
      // unknown call: keep generic (arrow callbacks etc.)
      return { kind: 'call-arg', ctx: callee.full, guaranteed: false }
    }
    if (ts.isPropertyAssignment(p) && p.initializer === cur) {
      const k = keyName(p)
      if (k === 'className' || k === 'class') return null
      if (UI_KEYS.has(k)) return { kind: 'prop', ctx: k, guaranteed: true }
      if (/(label|title|message|text|placeholder|description|heading|tooltip|caption)$/i.test(k) && k !== 'queryKey') return { kind: 'prop', ctx: k, guaranteed: true }
      if (k === 'queryKey' || k === 'method' || k === 'type' || k === 'id' || k === 'key' || k === 'headers' || k === 'credentials' || k === 'mode' || k === 'cache') return null
      return { kind: 'prop-other', ctx: k, guaranteed: false }
    }
    if (ts.isShorthandPropertyAssignment(p)) return null
    if (ts.isVariableDeclaration(p) && p.initializer === cur) {
      return { kind: 'var', ctx: p.name.getText(), guaranteed: false }
    }
    if (ts.isReturnStatement(p)) return { kind: 'return', ctx: '', guaranteed: false }
    if (ts.isArrowFunction(p) && p.body === cur) return { kind: 'return', ctx: '', guaranteed: false }
    if (ts.isSwitchStatement(p) || ts.isThrowStatement(p) && false) return null
    if (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) return null
    if (ts.isExpressionStatement(p) || ts.isBlock(p) || ts.isSourceFile(p)) return { kind: 'stmt', ctx: '', guaranteed: false }
    cur = p
    p = p.parent
  }
  return null
}

function literalText(node, sf) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    // placeholders as {{expr}}-free marker: use "…" so heuristics see the static text only
    let s = node.head.text
    for (const span of node.templateSpans) s += '\u0000' + span.literal.text
    return s.replace(/\u0000/g, ' ')
  }
  return ''
}

function scanFile(abs, srcRoot) {
  const code = fs.readFileSync(abs, 'utf8')
  const sf = ts.createSourceFile(abs, code, ts.ScriptTarget.Latest, true, abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const rel = path.relative(path.dirname(srcRoot), abs).split(path.sep).join('/')
  const out = []
  const push = (node, kind, text, ctx, extra = {}) => out.push({ file: rel, line: lineOf(sf, node), kind, ctx, text, ...extra })

  // pairs of JSX children runs are processed per element
  const handledText = new Set()
  function processChildren(el, children) {
    let run = []
    const flush = () => {
      if (!run.length) return
      const hasText = run.some((n) => (ts.isJsxText(n) ? LETTER.test(n.text) : ts.isJsxExpression(n) && n.expression && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression)) && LETTER.test(n.expression.text)))
      if (hasText) {
        const parts = []
        const args = []
        const used = new Set()
        for (const n of run) {
          if (ts.isJsxText(n)) { parts.push(decodeEntities(n.text).replace(/\s+/g, ' ')); handledText.add(n) }
          else if (n.expression && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression))) { parts.push(n.expression.text); handledText.add(n.expression) }
          else if (n.expression) { const nm = placeholderName(n.expression, used); args.push({ name: nm, code: n.expression.getText(sf) }); parts.push('{{' + nm + '}}') }
        }
        const text = parts.join('').replace(/\s+/g, ' ').trim()
        if (LETTER.test(text.replace(/\{\{\w+\}\}/g, ''))) {
          const first = run.find((n) => !(ts.isJsxText(n) && !n.text.trim()))
          const lastN = [...run].reverse().find((n) => !(ts.isJsxText(n) && !n.text.trim()))
          const startOf = (n) => (ts.isJsxText(n) ? n.pos + (n.text.length - n.text.trimStart().length) : n.getStart(sf))
          const start = startOf(first)
          const end = lastN.end - (ts.isJsxText(lastN) ? lastN.text.length - lastN.text.trimEnd().length : 0)
          out.push({ file: rel, line: sf.getLineAndCharacterOfPosition(start).line + 1, kind: 'jsx-text', ctx: el, text, args, start, end, raw: code.slice(start, end) })
        }
      }
      run = []
    }
    for (const c of children) {
      if (ts.isJsxText(c)) { run.push(c); continue }
      if (ts.isJsxExpression(c)) {
        const e = c.expression
        if (!e) continue // {/* comment */}
        // conditional / logical / call expressions are processed by the literal visitor, not merged into the text run
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isNumericLiteral(e) || (ts.isCallExpression(e) && e.arguments.length === 0 && ts.isPropertyAccessExpression(e.expression)) || ts.isElementAccessExpression(e)) { run.push(c); continue }
        flush(); continue
      }
      flush() // nested element / fragment
    }
    flush()
  }

  function visit(node) {
    if ((ts.isJsxElement(node) || ts.isJsxFragment(node))) processChildren(node.parent && ts.isJsxElement(node) ? node.openingElement.tagName.getText(sf) : 'fragment', node.children)

    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && !handledText.has(node)) {
      const text = literalText(node, sf)
      if (LOCALE_RE.test(text) && !(node.parent && ts.isCaseClause(node.parent))) {
        push(node, 'locale', text, 'hardcoded locale')
      } else if (!ts.isJsxAttribute(node.parent) || true) {
        const c = classify(node)
        if (c) {
          const ok = LETTER.test(text) && (c.guaranteed ? true : looksLikeUiGeneric(text))
          // guaranteed contexts still skip pure identifiers like 'ok'/'id' only when they carry no spaces and are lowercase code tokens
          if (ok) {
            const codeToken = c.guaranteed && c.kind !== 'jsx-expr' && /^[a-z][a-z0-9_]*$/.test(text) && (c.kind === 'prop' || c.kind === 'state-message') && false
            if (!codeToken) {
              let msg = text, args = []
              if (ts.isTemplateExpression(node)) {
                const used = new Set()
                msg = node.head.text
                for (const span of node.templateSpans) { const nm = placeholderName(span.expression, used); args.push({ name: nm, code: span.expression.getText(sf) }); msg += '{{' + nm + '}}' + span.literal.text }
              }
              push(node, c.kind, msg, c.ctx, { template: ts.isTemplateExpression(node), args, start: node.getStart(sf), end: node.end, inAttrString: ts.isJsxAttribute(node.parent) && node.parent.initializer === node })
            }
          }
        }
      }
    }
    // toLocale*() without an explicit locale uses the browser locale, not the app language
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^toLocale(Date|Time)?String$/.test(node.expression.name.text) && node.arguments.length === 0) {
      push(node, 'locale', node.expression.name.text + '()', 'missing locale argument')
    }
    if (ts.isNewExpression(node) && /^Intl\./.test(node.expression.getText(sf)) && node.arguments && node.arguments.length === 0) {
      push(node, 'locale', node.expression.getText(sf) + '()', 'missing locale argument')
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function listSourceFiles(srcDir) {
  const res = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name === 'locales' || e.name === 'types' || e.name === '__tests__') continue; walk(p) } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec|d)\.tsx?$/.test(e.name)) res.push(p)
    }
  }
  walk(srcDir)
  return res.sort()
}

module.exports = { scanFile, listSourceFiles }
