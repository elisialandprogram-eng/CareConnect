import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from '../i18n/locales/en/translation.json';
import {
  memberTerminologyPostProcessor,
  normalizeTranslationTree,
} from '../i18n/member-terminology';
import { memberSweepTranslations } from '../i18n/member-sweep';
import { providerSweepTranslations } from '../i18n/provider-sweep';
import { providerDashboardSweepTranslations } from '../i18n/provider-dashboard-sweep';
import { providerClinicalSweepTranslations } from '../i18n/provider-clinical-sweep';
import { adminProviderDetailsTranslations } from '../i18n/admin-provider-details';
import { adminProviderOperationsTranslations } from '../i18n/admin-provider-operations';
import { adminSweepTranslations } from '../i18n/admin-sweep';
import { reportingSweepTranslations } from '../i18n/reporting-sweep';

const SUPPORTED = ['en', 'hu', 'fa'] as const;
export type Lang = (typeof SUPPORTED)[number];

const loaders: Record<Lang, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => Promise.resolve({ default: enTranslation as Record<string, unknown> }),
  hu: () => import('../i18n/locales/hu/translation.json'),
  fa: () => import('../i18n/locales/fa/translation.json'),
};

const loaded = new Set<Lang>(['en']);

function mergeTranslationAdditions(
  base: Record<string, unknown>,
  additions: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(additions)) {
    const current = output[key];
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      output[key] = mergeTranslationAdditions(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      output[key] = value;
    }
  }
  return output;
}

export async function ensureLanguageResources(lng: string) {
  const code = (SUPPORTED as readonly string[]).includes(lng) ? (lng as Lang) : 'en';
  if (loaded.has(code)) return;
  try {
    const mod = await loaders[code]();
    let translation = mergeTranslationAdditions(
      mergeTranslationAdditions(
        mod.default,
        memberSweepTranslations[code] as unknown as Record<string, unknown>,
      ),
      providerSweepTranslations[code] as unknown as Record<string, unknown>,
    );
    translation = mergeTranslationAdditions(
      translation,
      providerDashboardSweepTranslations[code] as unknown as Record<string, unknown>,
    );
    translation = mergeTranslationAdditions(
      translation,
      providerClinicalSweepTranslations[code] as unknown as Record<string, unknown>,
    );
    translation = mergeTranslationAdditions(
      translation,
      adminProviderDetailsTranslations[code] as unknown as Record<string, unknown>,
    );
    translation = mergeTranslationAdditions(
      translation,
      adminProviderOperationsTranslations[code] as unknown as Record<string, unknown>,
    );
      translation = mergeTranslationAdditions(
        translation,
        adminSweepTranslations[code] as unknown as Record<string, unknown>,
      );
      translation = mergeTranslationAdditions(
        translation,
        reportingSweepTranslations[code] as unknown as Record<string, unknown>,
      );
    i18n.addResourceBundle(
      code,
      'translation',
      normalizeTranslationTree(translation, code),
      true,
      true,
    );
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

function languageCode(value: string | null | undefined): Lang | null {
  const code = value?.split("-")[0].toLowerCase();
  return code && (SUPPORTED as readonly string[]).includes(code) ? (code as Lang) : null;
}

export function getPersistedLanguage(): Lang | null {
  if (typeof window === "undefined") return null;
  try {
    const local = languageCode(window.localStorage.getItem("i18nextLng"));
    if (local) return local;

    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("i18next="));
    return languageCode(cookie?.split("=")[1]);
  } catch {
    return null;
  }
}

function detectAutomaticLanguage(): Lang {
  if (typeof window === "undefined") return "en";

  // Prefer a supported browser language when one is available.
  const browserLanguages = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];
  for (const language of browserLanguages) {
    const code = languageCode(language);
    if (code === "hu" || code === "fa") return code;
  }

  // If the browser language is unsupported or generic English, use the
  // timezone as a regional fallback for the locales the app supports.
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone === "Europe/Budapest") return "hu";
    if (timezone === "Asia/Tehran" || timezone === "Asia/Iran") return "fa";
  } catch {
    // English remains the final fallback.
  }
  return "en";
}

i18n
  .use(memberTerminologyPostProcessor)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: normalizeTranslationTree(
          mergeTranslationAdditions(
            mergeTranslationAdditions(
              mergeTranslationAdditions(
                mergeTranslationAdditions(
                  enTranslation as Record<string, unknown>,
                  memberSweepTranslations.en as unknown as Record<string, unknown>,
                ),
                providerSweepTranslations.en as unknown as Record<string, unknown>,
              ),
              providerDashboardSweepTranslations.en as unknown as Record<string, unknown>,
            ),
            mergeTranslationAdditions(
              providerClinicalSweepTranslations.en as unknown as Record<string, unknown>,
              mergeTranslationAdditions(
                adminProviderDetailsTranslations.en as unknown as Record<string, unknown>,
                mergeTranslationAdditions(
                  adminSweepTranslations.en as unknown as Record<string, unknown>,
                  reportingSweepTranslations.en as unknown as Record<string, unknown>,
                ),
              ),
            ),
          ),
          'en',
        ),
      },
    },
    postProcess: ['memberTerminology'],
    fallbackLng: 'en',
    supportedLngs: SUPPORTED as unknown as string[],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'cookie', 'navigator', 'htmlTag', 'path', 'subdomain'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
    },
  });

// Load the detected language asynchronously if it's not English. Use
// `language`, not `resolvedLanguage`: before a lazy locale bundle is loaded,
// i18next can report English as the resolved resource language even though the
// detector correctly found the user's saved locale.
const initial = getPersistedLanguage() ?? detectAutomaticLanguage();
if (!getPersistedLanguage() && initial !== "en" && typeof window !== "undefined") {
  try {
    // Persist the automatic choice so auth hydration cannot replace it with
    // the profile's default English value before the lazy bundle finishes.
    window.localStorage.setItem("i18nextLng", initial);
  } catch {
    // Continue with the in-memory automatic choice.
  }
}
if (initial !== 'en') {
  void ensureLanguageResources(initial).then(() => {
    if (languageCode(i18n.language) !== initial) void i18n.changeLanguage(initial);
  });
}

i18n.on('languageChanged', (lng) => {
  void ensureLanguageResources(lng);
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
