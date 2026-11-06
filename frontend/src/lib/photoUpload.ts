import { ApiError, apiErrorFromResponse, buildApiUrl } from '../services/api'
import type { InterventionPhoto, PhotoKind } from '../types/intervention'
import i18n from '../i18n'

/*
 * Uploads ONE already-compressed photo to an intervention. Takes a plain Blob + metadata (no React, no component state),
 * so the live upload and a future offline outbox can both call it. `clientRequestId` makes retries idempotent: the server
 * returns the stored photo instead of creating a duplicate when the first attempt actually arrived.
 */

export type PhotoUploadMeta = {
  clientRequestId: string
  kind?: PhotoKind
  caption?: string
  takenAt?: string | null
}

export type PhotoUploadOptions = {
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  /** milliseconds; a stalled mobile connection fails instead of hanging forever */
  timeoutMs?: number
  /** background sends (offline outbox): errors carry the status/code but cause no logout or payment popup */
  silent?: boolean
}

export type PhotoUploadResult = { photo: InterventionPhoto; duplicate?: boolean }

export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function uploadInterventionPhoto(
  interventionId: number,
  blob: Blob,
  meta: PhotoUploadMeta,
  options: PhotoUploadOptions = {}
): Promise<PhotoUploadResult> {
  const path = `/api/interventions/${interventionId}/photos`
  const form = new FormData()
  form.append('photo', blob, 'photo.jpg')
  form.append('client_request_id', meta.clientRequestId)
  if (meta.kind && meta.kind !== 'other') form.append('kind', meta.kind)
  if (meta.caption && meta.caption.trim()) form.append('caption', meta.caption.trim())
  if (meta.takenAt) form.append('taken_at', meta.takenAt)

  return new Promise<PhotoUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', buildApiUrl(path))
    xhr.withCredentials = true
    xhr.timeout = options.timeoutMs ?? 120_000

    const networkError = () => reject(new ApiError(i18n.t('common:apiErrors.network'), 0))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = networkError
    xhr.ontimeout = networkError
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          options.onProgress?.(100)
          resolve(JSON.parse(xhr.responseText) as PhotoUploadResult)
        } catch {
          reject(new ApiError(i18n.t('common:apiErrors.generic'), xhr.status))
        }
        return
      }
      reject(apiErrorFromResponse(xhr.status, xhr.responseText, path, { silent: options.silent }))
    }

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'))
        return
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(form)
  })
}
