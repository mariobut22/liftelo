import { ApiError, buildApiUrl, buildInterventionFormData, type CreateInterventionPayload } from '../../services/api'
import { uploadInterventionPhoto } from '../photoUpload'
import {
  MAX_TRANSIENT_ATTEMPTS,
  backoffDelayMs,
  classifyFailure,
  sendableItems,
  stepAlreadyDone,
  type OutboxItem,
  type OutboxStep,
  type Owner,
} from './outboxCore'
import { deleteOutboxItem, listOutbox, saveOutboxItem } from './outboxStore'

/*
 * Sends waiting items. Runs in the page (no Background Sync: iOS has none): on app start, on `online`, when the tab becomes
 * visible again, periodically while items exist, and on "retry now". One item at a time, oldest first, each item resumable:
 *   1. create   POST /api/rms-visits | /api/interventions        (client_request_id = item.id -> a retry returns the stored record)
 *   2. photos   POST /api/interventions/:id/photos, one by one   (each has its own client_request_id)
 *   3. sign     POST /api/reports/:type/:id/sign                 (both signatures; "already signed" counts as done)
 * Progress (serverId, photo.done, signed) is saved after every step, so a crash or lost connection resumes where it stopped.
 */

export type SenderState = 'idle' | 'sending' | 'auth_required'
type StateListener = (state: SenderState) => void
type SentListener = (item: OutboxItem) => void

let state: SenderState = 'idle'
const stateListeners = new Set<StateListener>()
const sentListeners = new Set<SentListener>()
let running: Promise<void> | null = null

const setState = (next: SenderState) => {
  if (state === next) return
  state = next
  stateListeners.forEach((listener) => listener(state))
}
export const getSenderState = () => state
export function subscribeSenderState(listener: StateListener): () => void {
  stateListeners.add(listener)
  return () => {
    stateListeners.delete(listener)
  }
}
export function onItemSent(listener: SentListener): () => void {
  sentListeners.add(listener)
  return () => {
    sentListeners.delete(listener)
  }
}

/** A failed step: HTTP status (0 = network failure/timeout) and the backend's stable error code. */
class StepFailure extends Error {
  status: number
  code: string | null
  step: OutboxStep
  constructor(step: OutboxStep, status: number, code: string | null) {
    super(`${step} failed (${status}${code ? ` ${code}` : ''})`)
    this.step = step
    this.status = status
    this.code = code
  }
}

const REQUEST_TIMEOUT_MS = 60_000

async function request<T>(step: OutboxStep, path: string, init: { method: string; body: BodyInit; json?: boolean }): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(buildApiUrl(path), {
      method: init.method,
      body: init.body,
      headers: init.json ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      signal: controller.signal,
    })
  } catch {
    throw new StepFailure(step, 0, null) // offline, DNS, reset, timeout: the server may or may not have stored it (idempotent retry)
  } finally {
    clearTimeout(timer)
  }
  if (response.ok) {
    try {
      return (await response.json()) as T
    } catch {
      throw new StepFailure(step, 0, null) // 2xx without a readable body: treat like a lost response and retry
    }
  }
  let code: string | null = null
  try {
    const body = (await response.json()) as { code?: unknown }
    code = typeof body?.code === 'string' ? body.code : null
  } catch {
    code = null
  }
  throw new StepFailure(step, response.status, code)
}

async function stepCreate(item: OutboxItem): Promise<number> {
  if (item.kind === 'rms') {
    const result = await request<{ id?: number }>('create', '/api/rms-visits', {
      method: 'POST',
      json: true,
      body: JSON.stringify({ ...item.payload, client_request_id: item.id }),
    })
    if (!result?.id) throw new StepFailure('create', 0, null)
    return result.id
  }
  const payload = { ...(item.payload as unknown as CreateInterventionPayload), client_request_id: item.id }
  const result = await request<{ id?: number }>('create', '/api/interventions', { method: 'POST', body: buildInterventionFormData(payload) })
  if (!result?.id) throw new StepFailure('create', 0, null)
  return result.id
}

async function stepPhotos(item: OutboxItem, persist: (next: OutboxItem) => Promise<void>): Promise<OutboxItem> {
  let current = item
  for (let index = 0; index < current.photos.length; index += 1) {
    const photo = current.photos[index]
    if (photo.done) continue
    try {
      await uploadInterventionPhoto(
        current.serverId as number,
        photo.blob,
        { clientRequestId: photo.clientRequestId, kind: photo.kind, caption: photo.caption, takenAt: photo.takenAt },
        { silent: true }
      )
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0
      const code = error instanceof ApiError ? error.code ?? null : null
      if (!stepAlreadyDone('photos', status, code)) throw new StepFailure('photos', status, code)
    }
    current = { ...current, photos: current.photos.map((p, i) => (i === index ? { ...p, done: true } : p)) }
    await persist(current)
  }
  return current
}

async function stepSign(item: OutboxItem): Promise<void> {
  if (!item.signatures) return
  const form = new FormData()
  form.append('technician_signature', item.signatures.technician, 'technician.png')
  form.append('client_signature', item.signatures.client, 'client.png')
  try {
    await request('sign', `/api/reports/${item.kind}/${item.serverId}/sign`, { method: 'POST', body: form })
  } catch (error) {
    if (error instanceof StepFailure && stepAlreadyDone('sign', error.status, error.code)) return
    throw error
  }
}

/** Runs every step that is not done yet. Throws StepFailure; on success the item is complete. */
async function processItem(start: OutboxItem): Promise<void> {
  let item = start
  const persist = async (next: OutboxItem) => {
    item = next
    await saveOutboxItem(next)
  }
  if (item.serverId == null) {
    const serverId = await stepCreate(item)
    await persist({ ...item, serverId })
  }
  if (item.kind === 'intervention' && item.photos.some((photo) => !photo.done)) {
    item = await stepPhotos(item, persist)
  }
  if (!item.signed && item.signatures) {
    await stepSign(item)
    await persist({ ...item, signed: true })
  }
}

export type RunOptions = {
  /** ignore the backoff timer (online event, app start, tab visible, "retry now") */
  force?: boolean
}

async function runOnce(owner: Owner | null, options: RunOptions): Promise<void> {
  if (!owner) return
  const queue = sendableItems(await listOutbox(), owner, Date.now(), options.force === true)
  if (queue.length === 0) {
    if (state === 'sending') setState('idle')
    return
  }
  setState('sending')
  for (const queued of queue) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) break
    // re-read: a person may have discarded or retried it meanwhile
    const item = (await listOutbox()).find((candidate) => candidate.id === queued.id)
    if (!item || item.status !== 'pending') continue
    try {
      await processItem(item)
      await deleteOutboxItem(item.id)
      sentListeners.forEach((listener) => listener(item))
    } catch (error) {
      const failure = error instanceof StepFailure ? error : new StepFailure(item.serverId == null ? 'create' : 'photos', 0, null)
      const kind = classifyFailure(failure.status)
      const latest = (await listOutbox()).find((candidate) => candidate.id === item.id) ?? item
      const attempts = latest.attempts + 1
      if (kind === 'auth') {
        // session expired: keep everything, stop until the user signs in again
        setState('auth_required')
        await saveOutboxItem({ ...latest, lastErrorCode: failure.code ?? 'not_authenticated', lastErrorStatus: 401, lastErrorStep: failure.step })
        return
      }
      if (kind === 'permanent' || attempts >= MAX_TRANSIENT_ATTEMPTS) {
        await saveOutboxItem({
          ...latest,
          status: 'needs_attention',
          attempts,
          lastErrorCode: failure.code,
          lastErrorStatus: failure.status,
          lastErrorStep: failure.step,
        })
        continue // the next item is independent
      }
      await saveOutboxItem({
        ...latest,
        attempts,
        nextAttemptAt: Date.now() + backoffDelayMs(attempts),
        lastErrorCode: failure.code,
        lastErrorStatus: failure.status,
        lastErrorStep: failure.step,
      })
      break // network/server trouble: the rest would fail the same way, wait for the next trigger
    }
  }
  setState('idle')
}

/**
 * Sends what is due for `owner`. Only one run at a time per tab (a trigger that arrives meanwhile queues exactly one more run);
 * across tabs a Web Lock (when available) keeps a single sender, and idempotent ids make a rare double send harmless anyway.
 */
let rerun: { owner: Owner | null; options: RunOptions } | null = null

export function runOutbox(owner: Owner | null, options: RunOptions = {}): Promise<void> {
  if (running) {
    rerun = { owner, options: { force: Boolean(rerun?.options.force || options.force) } }
    return running
  }
  const work = async () => {
    let next: { owner: Owner | null; options: RunOptions } | null = { owner, options }
    while (next) {
      const current: { owner: Owner | null; options: RunOptions } = next
      rerun = null
      try {
        if (state === 'auth_required') setState('idle')
        const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
        if (locks?.request) {
          await locks.request('liftelo-outbox-sender', { ifAvailable: true }, async (lock) => {
            if (lock) await runOnce(current.owner, current.options)
          })
        } else {
          await runOnce(current.owner, current.options)
        }
      } catch (error) {
        console.error('[outbox] run failed', error)
        setState('idle')
      }
      next = rerun
    }
    running = null
  }
  running = work()
  return running
}

/** "Retry" on a needs-attention item: back to pending, backoff cleared, attempts reset, sent immediately. */
export async function resetOutboxItem(item: OutboxItem): Promise<void> {
  await saveOutboxItem({ ...item, status: 'pending', attempts: 0, nextAttemptAt: 0 })
}

export async function retryOutboxItem(item: OutboxItem, owner: Owner | null): Promise<void> {
  await resetOutboxItem(item)
  await runOutbox(owner, { force: true })
}
