// Safe "return to" target after login/onboarding (see ProtectedRoute, Login, Onboarding).
// Only internal app paths are accepted (starts with a single '/', no backslash, not an auth page) to avoid open redirects.
const AUTH_PAGES = ['/login', '/register', '/activate', '/accept-invite']

export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  if ([...value].some((ch) => ch.charCodeAt(0) < 32)) return null
  const path = value.split(/[?#]/)[0]
  if (AUTH_PAGES.includes(path) || path.startsWith('/onboarding')) return null
  return value
}

export function readReturnTo(state: unknown): string | null {
  if (state && typeof state === 'object' && 'from' in state) return safeReturnTo((state as { from?: unknown }).from)
  return null
}
