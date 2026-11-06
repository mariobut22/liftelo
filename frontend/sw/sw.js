/* Liftelo service worker (hand-written, no dependencies). TEMPLATE: vite.config.ts (plugin "liftelo-sw") replaces the two
 * placeholders below at build time and emits the result as /sw.js. It is NOT registered in `vite dev`.
 *
 * What it does:
 *   - precaches the app shell (index.html, hashed JS/CSS, icons, manifest) so the app opens without signal;
 *   - navigations to SPA routes (/dashboard/*, /q/:token, /login ...): network first (3.5 s), then the cached index.html;
 *   - cache-first for precached files, everything else passes through untouched.
 * What it never does: touch /api/*, /uploads/*, non-GET requests or other origins (so no API data and no personal data is cached here;
 * the small offline read cache lives in IndexedDB, see src/lib/offline/readCache.ts).
 * Update flow: a new version installs in the background and WAITS; the page shows "update available" and, when the user taps it,
 * sends SKIP_WAITING. Nothing reloads by itself, so an open form is never lost.
 */
const VERSION = '__SW_VERSION__'
const PRECACHE = /*__SW_PRECACHE__*/ []
const CACHE_PREFIX = 'liftelo-shell-'
const CACHE = CACHE_PREFIX + VERSION
const SPA_ROUTE = /^\/(?:$|dashboard(?:\/|$)|q\/|login$|register$|activate$|accept-invite$|onboarding$|superadmin(?:\/|$))/
const NAVIGATION_TIMEOUT_MS = 3500

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data && event.data.type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION })
})

async function navigate(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('navigation_timeout')), NAVIGATION_TIMEOUT_MS)),
    ])
    // a real page (also a 404 page for unknown paths is fine); only gateway/offline-style failures fall back to the shell
    if (response && response.status < 500) return response
  } catch {
    // offline or too slow: fall through to the cached shell
  }
  return (await cache.match('/index.html', { ignoreVary: true })) || Response.error()
}

async function precachedOrNetwork(request) {
  // ignoreVary: servers answer "Vary: Origin"; the stored copy is for this very origin, so a request that differs only there still matches
  const cached = await caches.match(request, { cacheName: CACHE, ignoreVary: true })
  return cached || fetch(request)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname
  if (path.startsWith('/api/') || path.startsWith('/uploads/') || path === '/sw.js') return
  if (request.mode === 'navigate') {
    if (SPA_ROUTE.test(path)) event.respondWith(navigate(request))
    return
  }
  if (PRECACHE.includes(path)) event.respondWith(precachedOrNetwork(request))
})
