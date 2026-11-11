import { useSyncExternalStore } from 'react'

/*
 * Service worker registration + "update available" state + install prompt state.
 * The service worker is registered in production builds only (never in `vite dev`), so dev hot reload is unaffected.
 */

type Listener = () => void
const listeners = new Set<Listener>()
let updateReady = false
let registration: ServiceWorkerRegistration | null = null
let userAcceptedUpdate = false
let installEvent: BeforeInstallPromptEvent | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // we show our own, dismissible hint
    installEvent = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    emit()
  })

  const markUpdate = () => {
    updateReady = true
    emit()
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        registration = reg
        // a new version was already downloaded earlier and is waiting
        if (reg.waiting && navigator.serviceWorker.controller) markUpdate()
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) markUpdate()
          })
        })
        // look for a new version when the app comes back to the foreground and every hour
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined)
        })
        window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000)
      })
      .catch((error) => console.warn('[pwa] service worker registration failed', error))

    // The new version took over (only after the user accepted the update): reload once to run it
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!userAcceptedUpdate || reloading) return
      reloading = true
      window.location.reload()
    })
  })
}

/** The user tapped "Update": activate the waiting version (the page reloads when it has taken over). */
export function applyUpdate(): void {
  userAcceptedUpdate = true
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
}

export const usePwaUpdateAvailable = (): boolean => useSyncExternalStore(subscribe, () => updateReady, () => false)

/** Chromium/Android: the browser's install prompt was captured and can be shown by our button. */
export const useCanPromptInstall = (): boolean => useSyncExternalStore(subscribe, () => installEvent !== null, () => false)

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false
  const event = installEvent
  installEvent = null
  emit()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

export const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const isIos = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
