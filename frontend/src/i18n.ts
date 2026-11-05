import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Every file in src/locales/<lang>/<namespace>.json is registered automatically (no manual list to forget).
const files = import.meta.glob<Record<string, unknown>>('./locales/*/*.json', { eager: true, import: 'default' })

export const SUPPORTED_LANGUAGES = ['en', 'hr'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const resources: Record<string, Record<string, Record<string, unknown>>> = {}
const namespaces = new Set<string>()
for (const [path, data] of Object.entries(files)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/)
  if (!match) continue
  const [, lang, ns] = match
  resources[lang] = resources[lang] ?? {}
  resources[lang][ns] = data
  namespaces.add(ns)
}

/** Maps anything ('hr-HR', 'HR', null) to a supported app language. */
export const normalizeLanguage = (value: string | null | undefined): AppLanguage => {
  const base = (value ?? '').toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base) ? (base as AppLanguage) : 'en'
}

export const LANGUAGE_STORAGE_KEY = 'liftelo_language'

/** Browser language: hr, bs and sr (Croatian/Bosnian/Serbian are mutually intelligible) -> 'hr'; everything else -> 'en'. */
export const detectBrowserLanguage = (): AppLanguage => {
  if (typeof navigator === 'undefined') return 'en'
  const preferred = (navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language])[0]
  const base = (preferred ?? '').toLowerCase().split(/[-_]/)[0]
  return ['hr', 'bs', 'sr'].includes(base) ? 'hr' : 'en'
}

/** Order: language the user explicitly chose on this device -> browser language -> 'en'. Detection is never written to storage. */
const getInitialLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'en'
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    stored = null
  }
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored.toLowerCase().split(/[-_]/)[0])) {
    return normalizeLanguage(stored)
  }
  return detectBrowserLanguage()
}

/** Locale used for dates, numbers and currency: follows the active UI language. */
export const getLocale = (language: string | null | undefined = i18n.language): string =>
  normalizeLanguage(language) === 'hr' ? 'hr-HR' : 'en-GB'

const syncHtmlLang = (language: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = normalizeLanguage(language)
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  load: 'languageOnly',
  ns: [...namespaces],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

export default i18n
