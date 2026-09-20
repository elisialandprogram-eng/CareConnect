import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import huTranslation from './locales/hu/translation.json';
import faTranslation from './locales/fa/translation.json';
import {
  memberTerminologyPostProcessor,
  normalizeTranslationTree,
} from './member-terminology';

i18n
  .use(memberTerminologyPostProcessor)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: normalizeTranslationTree(enTranslation, "en")
      },
      hu: {
        translation: normalizeTranslationTree(huTranslation, "hu")
      },
      fa: {
        translation: normalizeTranslationTree(faTranslation, "fa")
      }
    },
    postProcess: ["memberTerminology"],
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'cookie', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage', 'cookie'],
    }
  });

// Handle RTL for Persian
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.dir = lng === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
    
    // Update font based on language
    if (lng === 'fa') {
      document.body.style.fontFamily = "'Vazirmatn', 'Inter', sans-serif";
    } else {
      document.body.style.fontFamily = "'Inter', sans-serif";
    }
  }
});

export default i18n;
