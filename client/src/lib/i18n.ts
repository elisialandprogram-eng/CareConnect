import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from '../i18n/locales/en/translation.json';
import huTranslation from '../i18n/locales/hu/translation.json';
import faTranslation from '../i18n/locales/fa/translation.json';
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
import { adminCatalogTranslations } from '../i18n/admin-catalog-translations';
import { adminSweepTranslations } from '../i18n/admin-sweep';
import { reportingSweepTranslations } from '../i18n/reporting-sweep';

const SUPPORTED = ['en', 'hu', 'fa'] as const;
export type Lang = (typeof SUPPORTED)[number];

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

const BASE_TRANSLATIONS: Record<Lang, Record<string, unknown>> = {
  en: enTranslation as Record<string, unknown>,
  hu: huTranslation as Record<string, unknown>,
  fa: faTranslation as Record<string, unknown>,
};

function buildTranslation(code: Lang): Record<string, unknown> {
  let translation = BASE_TRANSLATIONS[code];
  const additions = [
    memberSweepTranslations,
    providerSweepTranslations,
    providerDashboardSweepTranslations,
    providerClinicalSweepTranslations,
    adminProviderDetailsTranslations,
    adminProviderOperationsTranslations,
    adminCatalogTranslations,
    adminSweepTranslations,
    reportingSweepTranslations,
  ];

  for (const addition of additions) {
    translation = mergeTranslationAdditions(
      translation,
      addition[code] as unknown as Record<string, unknown>,
    );
  }

  return normalizeTranslationTree(translation, code);
}

const RESOURCES = {
  en: { translation: buildTranslation('en') },
  hu: { translation: buildTranslation('hu') },
  fa: { translation: buildTranslation('fa') },
};

function languageCode(value: string | null | undefined): Lang | null {
  const code = value?.split("-")[0].toLowerCase();
  return code && (SUPPORTED as readonly string[]).includes(code) ? (code as Lang) : null;
}

export function normalizeLanguage(value: string | null | undefined): Lang {
  return languageCode(value) ?? "en";
}

let languageChangeRequest = 0;
let languageChangeQueue: Promise<void> = Promise.resolve();

export async function changeAppLanguage(value: string): Promise<Lang> {
  const code = normalizeLanguage(value);
  const request = ++languageChangeRequest;

  if (typeof window !== "undefined") {
    try {
      // Persist before the async auth/profile work runs so hydration cannot
      // restore an older profile language over an explicit user selection.
      window.localStorage.setItem("i18nextLng", code);
    } catch {
      // Continue with the in-memory language when storage is unavailable.
    }
  }

  const change = languageChangeQueue
    .catch(() => undefined)
    .then(async () => {
      // Skip stale queued clicks, but still allow the latest click to correct
      // a change that was already in progress when it was made.
      if (request !== languageChangeRequest) return;
      if (languageCode(i18n.language) !== code) {
        await i18n.changeLanguage(code);
      }
    });
  languageChangeQueue = change.catch(() => undefined);
  await change;
  return normalizeLanguage(i18n.language);
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
    resources: RESOURCES,
    postProcess: ['memberTerminology'],
    fallbackLng: 'en',
    supportedLngs: SUPPORTED as unknown as string[],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    initImmediate: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'cookie', 'navigator', 'htmlTag', 'path', 'subdomain'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
    },
  });

// Apply the detected language after initialization so the custom timezone
// fallback remains consistent with the browser detector and persisted choice.
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
  void changeAppLanguage(initial);
}

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
