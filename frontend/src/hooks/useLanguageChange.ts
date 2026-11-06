import { useTranslation } from 'react-i18next'

import { normalizeLanguage, type AppLanguage } from '../i18n'
import { applyLanguage, setPreloginChoice } from '../lib/language'
import { updateUserLanguage } from '../services/api'
import useAuthStore from '../store/authStore'

/**
 * Switches the UI language immediately and remembers it on this device; logged in: also saves it on the account,
 * logged out: sets the "explicit pre-login choice" flag (see docs/i18n.md, "Language selection").
 */
export function useLanguageChange() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const { i18n } = useTranslation()
  const active = normalizeLanguage(i18n.language)

  const handleChange = async (language: AppLanguage) => {
    if (language === active) return
    applyLanguage(language)
    if (!user) {
      setPreloginChoice(language)
      return
    }
    try {
      await updateUserLanguage(language)
      const current = useAuthStore.getState().user
      if (current) setUser({ ...current, language })
    } catch (error) {
      console.error('[useLanguageChange] update language failed', error)
    }
  }

  return { active, handleChange }
}
