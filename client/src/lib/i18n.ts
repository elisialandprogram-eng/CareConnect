import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from '../i18n/locales/en/translation.json';
import huTranslation from '../i18n/locales/hu/translation.json';
import faTranslation from '../i18n/locales/fa/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      hu: { translation: huTranslation },
      fa: { translation: faTranslation },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'cookie', 'htmlTag', 'path', 'subdomain'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
    },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.dir = lng === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;

    if (lng === 'fa') {
      document.body.style.fontFamily = "'Vazirmatn', 'Inter', sans-serif";
    } else {
      document.body.style.fontFamily = "'Inter', sans-serif";
    }
  }
});

if (typeof document !== 'undefined') {
  const current = i18n.language || 'en';
  document.dir = current === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.lang = current;
  if (current === 'fa') {
    document.body.style.fontFamily = "'Vazirmatn', 'Inter', sans-serif";
  }
}

export default i18n;
