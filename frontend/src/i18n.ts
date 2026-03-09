import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en/common.json'
import enUsers from './locales/en/users.json'
import enDashboard from './locales/en/dashboard.json'
import enRms from './locales/en/rms.json'
import hrCommon from './locales/hr/common.json'
import hrUsers from './locales/hr/users.json'
import hrDashboard from './locales/hr/dashboard.json'
import hrRms from './locales/hr/rms.json'

const getInitialLanguage = () => {
  if (typeof window === 'undefined') return 'en'
  return window.localStorage.getItem('liftelo_language') ?? 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      users: enUsers,
      dashboard: enDashboard,
      rms: enRms,
    },
    hr: {
      common: hrCommon,
      users: hrUsers,
      dashboard: hrDashboard,
      rms: hrRms,
    },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  ns: ['common', 'users', 'dashboard', 'rms'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export default i18n
