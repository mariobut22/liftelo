import { useTranslation } from 'react-i18next'

import { normalizeLanguage, type AppLanguage } from '../i18n'
import { applyLanguage, setPreloginChoice } from '../lib/language'
import { updateUserLanguage } from '../services/api'
import useAuthStore from '../store/authStore'

const OPTIONS: Array<{ code: AppLanguage; short: string; labelKey: string }> = [
  { code: 'en', short: 'EN', labelKey: 'common:languageSwitcher.english' },
  { code: 'hr', short: 'HR', labelKey: 'common:languageSwitcher.croatian' },
]

/**
 * EN/HR toggle shared by the app header and the public pages.
 * Always switches the UI immediately and remembers the choice on this device.
 * Logged in: also saves it on the account. Logged out: sets the "explicit pre-login choice" flag, which the auth store
 * reconciles with the account language after login (see docs/i18n.md, "Language selection").
 */
function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
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
      console.error('[LanguageSwitcher] update language failed', error)
    }
  }

  return (
    <div
      role="group"
      aria-label={t('common:languageSwitcher.label')}
      className={`inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5 text-xs font-semibold uppercase text-zinc-500 shadow-sm ${className}`}
    >
      {OPTIONS.map((option) => {
        const pressed = active === option.code
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => void handleChange(option.code)}
            aria-pressed={pressed}
            aria-label={t(option.labelKey)}
            lang={option.code}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 ${
              pressed ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {option.short}
          </button>
        )
      })}
    </div>
  )
}

export default LanguageSwitcher
