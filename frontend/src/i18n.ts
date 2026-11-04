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

const getInitialLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'en'
  return normalizeLanguage(window.localStorage.getItem('liftelo_language'))
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
