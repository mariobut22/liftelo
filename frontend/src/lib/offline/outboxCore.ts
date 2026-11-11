import type { PhotoKind } from '../../types/intervention'

/*
 * Pure parts of the offline outbox (no browser APIs): types, ordering, backoff, failure classification.
 * Unit-tested in scripts/offline-check/core-test.cjs.
 */

export type OutboxKind = 'rms' | 'intervention'
/** pending = will be (re)tried automatically; needs_attention = a person must retry or discard (never dropped silently) */
export type OutboxStatus = 'pending' | 'needs_attention'
export type OutboxStep = 'create' | 'photos' | 'sign'

export type OutboxPhoto = {
  clientRequestId: string
  blob: Blob
  kind: PhotoKind
  caption: string
  takenAt: string | null
  done: boolean
}

export type OutboxItem = {
  /** the client_request_id of the record itself (UUID); also the primary key */
  id: string
  kind: OutboxKind
  /** rms: CreateRmsPayload fields; intervention: the create fields (technician, location, date, ...) */
  payload: Record<string, unknown>
  photos: OutboxPhoto[]
  /** client = null: "client not present - sign later" (technician signature only); clientSigner = name + role of the person who signed for the client */
  signatures: { technician: Blob; client: Blob | null; clientSigner?: { name: string; role: string } | null; language?: string } | null
  /** id of the record on the server once step "create" succeeded (the resume point) */
  serverId: number | null
  signed: boolean
  status: OutboxStatus
  attempts: number
  /** epoch ms; the periodic sender skips the item until then (online/visible/manual triggers ignore it) */
  nextAttemptAt: number
  lastErrorCode: string | null
  lastErrorStatus: number | null
  lastErrorStep: OutboxStep | null
  createdAt: number
  /** items are bound to the account that created them: another user/company never sends them */
  userId: number
  companyId: number | null
  /** shown in the list (location name or address) */
  label: string
}

export type Owner = { userId: number; companyId: number | null }

export const BACKOFF_BASE_MS = 5_000
export const BACKOFF_MAX_MS = 5 * 60_000
/** after this many failed tries on a transient error (5xx/network) a person is asked to look at it */
export const MAX_TRANSIENT_ATTEMPTS = 30

/** exponential backoff: 5s, 10s, 20s ... capped at 5 min, +-20% jitter so many phones do not retry in lockstep */
export function backoffDelayMs(attempts: number, random: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempts))
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (n - 1))
  const jitter = 0.8 + random() * 0.4
  return Math.min(BACKOFF_MAX_MS, Math.round(base * jitter))
}

export const belongsTo = (item: Pick<OutboxItem, 'userId' | 'companyId'>, owner: Owner | null): boolean =>
  Boolean(owner) && item.userId === owner!.userId && (item.companyId ?? null) === (owner!.companyId ?? null)

/** oldest first (the order the technician saved them); id breaks ties so the order is stable */
export function orderQueue<T extends Pick<OutboxItem, 'createdAt' | 'id'>>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export const isDue = (item: Pick<OutboxItem, 'status' | 'nextAttemptAt'>, now: number, force = false): boolean =>
  item.status === 'pending' && (force || item.nextAttemptAt <= now)

/** the items a sender run should try now, in order, for this owner */
export function sendableItems(items: OutboxItem[], owner: Owner | null, now: number, force = false): OutboxItem[] {
  return orderQueue(items.filter((item) => belongsTo(item, owner) && isDue(item, now, force)))
}

export type FailureKind = 'transient' | 'auth' | 'permanent'

/**
 * What to do with a failed request:
 *  - network failure / timeout (status 0), 408, 425, 429, 5xx -> transient: keep, retry later with backoff
 *  - 401 -> auth: stop sending until the user signs in again (items stay)
 *  - every other 4xx (validation, 402 subscription_locked / service_disabled_technician, 403, 404) -> permanent:
 *    "needs attention" with the translated reason, a person retries or discards
 */
export function classifyFailure(status: number): FailureKind {
  if (status === 401) return 'auth'
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return 'transient'
  return 'permanent'
}

/** Responses that mean "this step already happened on the server" (a retry after a lost response). */
export function stepAlreadyDone(step: OutboxStep, status: number, code: string | null | undefined): boolean {
  if (step === 'sign') return (status === 403 && code === 'report_already_signed') || (status === 400 && code === 'signature_exists')
  if (step === 'photos') return status === 403 && code === 'report_signed_locked'
  return false
}

export const needsAttentionCount = (items: Array<Pick<OutboxItem, 'status'>>): number =>
  items.filter((item) => item.status === 'needs_attention').length
