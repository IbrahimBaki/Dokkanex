import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './ar.json'
import en from './en.json'

const savedLang = localStorage.getItem('lang') || 'ar'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: savedLang,
    fallbackLng: 'ar',
    interpolation: { escapeValue: false },
  })

function applyDirection(lang) {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}

applyDirection(savedLang)

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('lang', lng)
  applyDirection(lng)
})

export default i18n
