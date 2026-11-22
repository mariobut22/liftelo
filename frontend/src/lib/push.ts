import { apiFetch } from '../services/api'
import { isIos, isStandalone } from './pwa'

/*
 * Web Push (PWA) for this device. The server only offers it when the VAPID_* env variables are set (GET /api/push/config);
 * the subscription lives in the browser (PushManager) and is mirrored on the server (POST /api/push/subscribe).
 * The service worker (sw/sw.js) shows the notification and opens the link on tap.
 */

export type PushConfig = { enabled: boolean; public_key: string | null }

export type PushSupport = 'supported' | 'unsupported' | 'ios_needs_install'

export const getPushConfig = () => apiFetch<PushConfig>('/api/push/config')

export const sendTestPush = () => apiFetch<{ sent: number; removed: number; failed: number }>('/api/push/test', { method: 'POST' })

const serverSubscribe = (subscription: PushSubscription) => {
  const json = subscription.toJSON()
  return apiFetch<{ subscribed: boolean }>('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })
}

const serverUnsubscribe = (endpoint: string) =>
  apiFetch<{ removed: number }>('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) })

/** Can this device do Web Push at all? iOS only inside an installed (home screen) PWA. */
export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  if (isIos() && !isStandalone()) return 'ios_needs_install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'supported'
}

export const permissionState = (): NotificationPermission =>
  typeof Notification === 'undefined' ? 'denied' : Notification.permission

// base64url -> bytes for applicationServerKey
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

// The registered service worker (production builds only; `vite dev` has none -> push cannot work there)
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ?? null
}

/** Current browser subscription of this device, or null. Re-registers it on the server (rebinds a shared device to the current user). */
export async function getCurrentSubscription(syncWithServer = false): Promise<PushSubscription | null> {
  const registration = await getRegistration()
  const subscription = (await registration?.pushManager.getSubscription()) ?? null
  if (subscription && syncWithServer) {
    try {
      await serverSubscribe(subscription)
    } catch {
      // not fatal: the toggle still reflects the browser state
    }
  }
  return subscription
}

export class PushError extends Error {
  code: 'denied' | 'no_service_worker' | 'not_configured'
  constructor(code: PushError['code']) {
    super(code)
    this.code = code
  }
}

/** Must be called from a click (permission prompt). Throws PushError('denied') when the user refuses. */
export async function enablePush(publicKey: string | null): Promise<PushSubscription> {
  if (!publicKey) throw new PushError('not_configured')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushError('denied')
  const registration = await getRegistration()
  if (!registration) throw new PushError('no_service_worker')
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }
  try {
    await serverSubscribe(subscription)
  } catch (error) {
    // keep browser and server consistent: no half-enabled state
    await subscription.unsubscribe().catch(() => undefined)
    throw error
  }
  return subscription
}

export async function disablePush(): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe().catch(() => undefined)
  await serverUnsubscribe(endpoint).catch(() => undefined)
}
