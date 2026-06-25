import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import ur from '@/locales/ur.json'

const savedLang = localStorage.getItem('lang') ?? 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ur: { translation: ur },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

// Restore RTL state from saved language preference
if (savedLang === 'ur') {
  document.documentElement.dir = 'rtl'
  document.documentElement.lang = 'ur'
}

export default i18n
