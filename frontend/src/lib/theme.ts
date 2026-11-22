import { useSyncExternalStore } from 'react'

/** Colour theme preference. `system` (default) follows prefers-color-scheme. Stored in localStorage when available. */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'liftelo-theme'
const THEME_COLORS = { light: '#18181b', dark: '#18181b' } as const

const listeners = new Set<() => void>()
let memoryPreference: ThemePreference = 'system' // used when localStorage is unavailable

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isPreference(stored)) return stored
  } catch {
    /* storage blocked: fall back to memory */
  }
  return memoryPreference
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(preference: ThemePreference = getThemePreference()): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

/** Sets class "dark" on <html> and updates <meta name="theme-color">. Same logic as the inline script in index.html. */
export function applyTheme(): void {
  const resolved = resolveTheme()
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLORS[resolved])
}

export function setThemePreference(preference: ThemePreference): void {
  memoryPreference = preference
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* storage blocked: keep in memory for this session */
  }
  applyTheme()
  listeners.forEach((listener) => listener())
}

let started = false
/** Call once at startup: re-applies the theme when the OS scheme changes (only matters for `system`) or another tab changes it. */
export function initTheme(): void {
  applyTheme()
  if (started) return
  started = true
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      applyTheme()
      listeners.forEach((listener) => listener())
    })
  }
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme()
      listeners.forEach((listener) => listener())
    }
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, () => 'system' as ThemePreference)
}

/** The theme actually shown ('light' | 'dark'); re-renders when it changes. */
export function useResolvedTheme(): 'light' | 'dark' {
  const preference = useThemePreference()
  return useSyncExternalStore(subscribe, () => resolveTheme(preference), () => 'light' as const)
}
