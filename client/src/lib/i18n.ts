import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from '../i18n/locales/en/translation.json';

const SUPPORTED = ['en', 'hu', 'fa'] as const;
type Lang = (typeof SUPPORTED)[number];

const loaders: Record<Lang, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => Promise.resolve({ default: enTranslation as Record<string, unknown> }),
  hu: () => import('../i18n/locales/hu/translation.json'),
  fa: () => import('../i18n/locales/fa/translation.json'),
};

const loaded = new Set<Lang>(['en']);

async function ensureLanguage(lng: string) {
  const code = (SUPPORTED as readonly string[]).includes(lng) ? (lng as Lang) : 'en';
  if (loaded.has(code)) return;
  try {
    const mod = await loaders[code]();
    i18n.addResourceBundle(code, 'translation', mod.default, true, true);
    loaded.add(code);
    // Force React to re-render with the newly loaded bundle. If the user is
    // already on this language (common on initial load), changeLanguage is a
    // no-op in i18next, so we emit a store change via reloadResources instead.
    if (i18n.language === code || i18n.resolvedLanguage === code) {
      await i18n.reloadResources([code], 'translation');
      // Ping subscribers so react-i18next components pick up the new strings
      i18n.emit('languageChanged', code);
    }
  } catch {
    // ignore — fallback language remains active
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED as unknown as string[],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'cookie', 'htmlTag', 'path', 'subdomain'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
    },
  });

// Load the detected language asynchronously if it's not English.
const initial = i18n.resolvedLanguage || i18n.language || 'en';
if (initial !== 'en') {
  void ensureLanguage(initial).then(() => {
    if (i18n.language !== initial) void i18n.changeLanguage(initial);
  });
}

i18n.on('languageChanged', (lng) => {
  void ensureLanguage(lng);
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
