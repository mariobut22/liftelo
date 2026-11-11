import i18n, { LANGUAGE_STORAGE_KEY, normalizeLanguage, type AppLanguage } from '../i18n'

/** sessionStorage flag (value = 'en' | 'hr'): the user explicitly picked a language BEFORE logging in, in this browser session. */
export const PRELOGIN_LANGUAGE_FLAG = 'liftelo_language_chosen_prelogin'

export const readPreloginChoice = (): AppLanguage | null => {
  try {
    const value = window.sessionStorage.getItem(PRELOGIN_LANGUAGE_FLAG)
    return value === 'en' || value === 'hr' ? value : null
  } catch {
    return null
  }
}

export const setPreloginChoice = (language: AppLanguage) => {
  try {
    window.sessionStorage.setItem(PRELOGIN_LANGUAGE_FLAG, language)
  } catch {
    // storage unavailable (private mode): the choice still applies for this page view
  }
}

export const clearPreloginChoice = () => {
  try {
    window.sessionStorage.removeItem(PRELOGIN_LANGUAGE_FLAG)
  } catch {
    // ignore
  }
}

export const persistLanguageLocally = (language: AppLanguage) => {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // ignore
  }
}

/** Applies a language to the UI right away and remembers it as this device's explicit choice. */
export const applyLanguage = (language: string | null | undefined): AppLanguage => {
  const normalized = normalizeLanguage(language)
  if (normalizeLanguage(i18n.language) !== normalized) void i18n.changeLanguage(normalized)
  persistLanguageLocally(normalized)
  return normalized
}
