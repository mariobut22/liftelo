import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en/common.json'
import enUsers from './locales/en/users.json'
import hrCommon from './locales/hr/common.json'

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      users: enUsers,
    },
    hr: {
      common: hrCommon,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export default i18n
