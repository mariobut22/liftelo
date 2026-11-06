import { useTranslation } from 'react-i18next'

import { type AppLanguage } from '../i18n'
import { useLanguageChange } from '../hooks/useLanguageChange'
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from './ui/dropdown-menu'

const OPTIONS: Array<{ code: AppLanguage; labelKey: string }> = [
  { code: 'hr', labelKey: 'common:languageSwitcher.croatian' },
  { code: 'en', labelKey: 'common:languageSwitcher.english' },
]

/** Language choice as items of a dropdown menu (account menu in the app header). */
function LanguageMenuItems() {
  const { t } = useTranslation()
  const { active, handleChange } = useLanguageChange()
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t('common:languageSwitcher.label')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={active} onValueChange={(value) => void handleChange(value as AppLanguage)}>
        {OPTIONS.map((option) => (
          <DropdownMenuRadioItem key={option.code} value={option.code} lang={option.code}>
            {t(option.labelKey)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

export default LanguageMenuItems
