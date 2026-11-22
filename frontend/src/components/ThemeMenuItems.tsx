import { useTranslation } from 'react-i18next'

import { setThemePreference, useThemePreference, type ThemePreference } from '../lib/theme'
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from './ui/dropdown-menu'

const OPTIONS: Array<{ value: ThemePreference; labelKey: string }> = [
  { value: 'system', labelKey: 'common:theme.system' },
  { value: 'light', labelKey: 'common:theme.light' },
  { value: 'dark', labelKey: 'common:theme.dark' },
]

/** Theme choice (System / Light / Dark) as items of a dropdown menu (account menu in the app header). */
function ThemeMenuItems() {
  const { t } = useTranslation()
  const preference = useThemePreference()
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t('common:theme.label')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={preference} onValueChange={(value) => setThemePreference(value as ThemePreference)}>
        {OPTIONS.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value} data-theme-option={option.value}>
            {t(option.labelKey)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

export default ThemeMenuItems
