import { ApiError, dataUrlToFile } from '../../services/api'
import useAuthStore from '../../store/authStore'
import { newClientRequestId } from '../photoUpload'
import { StorageError } from './idb'
import { backoffDelayMs, type Owner, type OutboxItem, type OutboxKind, type OutboxPhoto } from './outboxCore'
import { outboxAvailable, requestPersistentStorage, saveOutboxItem } from './outboxStore'

/** Glue between the create forms and the outbox. */

export const newRecordId = newClientRequestId

/** true when there was NO answer from the server (offline, dead signal, timeout), as opposed to an HTTP error answer */
export const isNetworkFailure = (error: unknown): boolean => error instanceof ApiError && error.status === 0

export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

export function currentOwner(): Owner | null {
  const user = useAuthStore.getState().user
  return user ? { userId: user.id, companyId: user.company_id ?? null } : null
}

/** Viewers are read-only and superadmins have no company data to enter: neither gets an outbox. */
export function canQueueOffline(): boolean {
  const { user, companies } = useAuthStore.getState()
  if (!user || !outboxAvailable()) return false
  if (user.role === 'superadmin' || user.role === 'viewer') return false
  const active = companies.find((company) => company.id === user.company_id) ?? companies[0]
  return active?.role !== 'viewer'
}

export const signatureBlob = (dataUrl: string): Blob => dataUrlToFile(dataUrl, 'signature.png')

export type NewOutboxItem = {
  id: string
  kind: OutboxKind
  payload: Record<string, unknown>
  photos?: OutboxPhoto[]
  signatures: { technician: Blob; client: Blob } | null
  serverId?: number | null
  label: string
  /** true when the send was already attempted online and failed: wait the first backoff before the periodic sender retries */
  afterFailedAttempt?: boolean
}

/**
 * Stores a record that could not be sent. Resolves only after IndexedDB confirmed the write; throws otherwise, so the form can
 * keep the data on screen instead of claiming it was saved.
 */
export async function enqueueItem(input: NewOutboxItem): Promise<OutboxItem> {
  const owner = currentOwner()
  if (!owner || !canQueueOffline()) throw new StorageError('outbox_unavailable')
  const item: OutboxItem = {
    id: input.id,
    kind: input.kind,
    payload: input.payload,
    photos: input.photos ?? [],
    signatures: input.signatures,
    serverId: input.serverId ?? null,
    signed: false,
    status: 'pending',
    attempts: input.afterFailedAttempt ? 1 : 0,
    nextAttemptAt: input.afterFailedAttempt ? Date.now() + backoffDelayMs(1) : 0,
    lastErrorCode: null,
    lastErrorStatus: null,
    lastErrorStep: null,
    createdAt: Date.now(),
    userId: owner.userId,
    companyId: owner.companyId,
    label: input.label,
  }
  await saveOutboxItem(item)
  void requestPersistentStorage()
  return item
}
