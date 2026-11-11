/* Unit test of the pure outbox logic (src/lib/offline/outboxCore.ts): ordering, backoff, ownership, failure classification.
 *   cd frontend && node scripts/offline-check/core-test.cjs
 */
const assert = require('assert')
const path = require('path')
const esbuild = require('esbuild')

const src = path.join(__dirname, '..', '..', 'src', 'lib', 'offline', 'outboxCore.ts')
const code = esbuild.buildSync({ entryPoints: [src], bundle: true, format: 'cjs', write: false, platform: 'node' }).outputFiles[0].text
const mod = { exports: {} }
new Function('module', 'exports', code)(mod, mod.exports)
const c = mod.exports

let passed = 0
const t = (name, fn) => { fn(); passed += 1; console.log('  ok    ' + name) }
const item = (o) => ({ id: 'a', createdAt: 1, status: 'pending', nextAttemptAt: 0, userId: 1, companyId: 1, ...o })

t('backoff doubles from 5 s and is capped at 5 min', () => {
  const mid = () => 0.5 // jitter factor 1.0
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 20].map((n) => c.backoffDelayMs(n, mid)), [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000, 300000])
})
t('backoff jitter stays within +-20% and never above the cap', () => {
  assert.strictEqual(c.backoffDelayMs(1, () => 0), 4000)
  assert.strictEqual(c.backoffDelayMs(1, () => 1), 6000)
  assert.strictEqual(c.backoffDelayMs(50, () => 1), 300000)
})
t('queue is oldest first, id breaks ties', () => {
  const q = c.orderQueue([item({ id: 'c', createdAt: 3 }), item({ id: 'b', createdAt: 1 }), item({ id: 'a', createdAt: 1 })])
  assert.deepStrictEqual(q.map((i) => i.id), ['a', 'b', 'c'])
})
t('only the owner\'s pending items that are due are sendable', () => {
  const owner = { userId: 1, companyId: 1 }
  const items = [
    item({ id: '1', createdAt: 5 }),
    item({ id: '2', createdAt: 4, nextAttemptAt: 1000 }),
    item({ id: '3', createdAt: 3, status: 'needs_attention' }),
    item({ id: '4', createdAt: 2, userId: 2 }),
    item({ id: '5', createdAt: 1, companyId: 2 }),
  ]
  assert.deepStrictEqual(c.sendableItems(items, owner, 500).map((i) => i.id), ['1'])
  assert.deepStrictEqual(c.sendableItems(items, owner, 500, true).map((i) => i.id), ['2', '1'])
  assert.deepStrictEqual(c.sendableItems(items, owner, 5000).map((i) => i.id), ['2', '1'])
  assert.deepStrictEqual(c.sendableItems(items, null, 5000), [])
})
t('failure classes: network/5xx/429 transient, 401 auth, other 4xx permanent (402, 403, 400, 404)', () => {
  assert.deepStrictEqual([0, 408, 429, 500, 502, 503].map(c.classifyFailure), Array(6).fill('transient'))
  assert.strictEqual(c.classifyFailure(401), 'auth')
  assert.deepStrictEqual([400, 402, 403, 404, 409, 413, 415].map(c.classifyFailure), Array(7).fill('permanent'))
})
t('"already done" answers for retried steps', () => {
  assert.ok(c.stepAlreadyDone('sign', 403, 'report_already_signed'))
  assert.ok(c.stepAlreadyDone('sign', 400, 'signature_exists'))
  assert.ok(!c.stepAlreadyDone('sign', 403, 'forbidden'))
  assert.ok(c.stepAlreadyDone('photos', 403, 'report_signed_locked'))
  assert.ok(!c.stepAlreadyDone('create', 403, 'report_already_signed'))
})
console.log(`\n${passed} passed`)
