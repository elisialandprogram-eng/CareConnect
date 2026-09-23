type Translator = (key: string, options?: any) => string;
import { localizeMedicalTerm } from "@/lib/medical-localization";

const CATEGORY_KEYS: Record<string, string> = {
  physician: "medical_doctors",
  "medical doctors & specialists": "medical_doctors",
  mental_health: "mental_health",
  "mental health & behavioral professionals": "mental_health",
  nutrition: "nutrition",
  "nutrition, dietetics & metabolic wellness": "nutrition",
  rehabilitation: "rehabilitation",
  "physical therapy & rehabilitation": "rehabilitation",
  dental: "dental",
  "dental care professionals": "dental",
  alternative_medicine: "alternative_medicine",
  "alternative, holistic & integrative medicine": "alternative_medicine",
  nursing: "nursing",
  "maternal, nursing & allied health support": "nursing",
};

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function catalogCategoryKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return CATEGORY_KEYS[value.trim().toLowerCase()] ?? CATEGORY_KEYS[normalized(value)] ?? null;
}

export function localizeCatalogCategory(
  t: Translator,
  value: string | null | undefined,
  fallback = "—",
): string {
  if (!value) return fallback;
  const key = catalogCategoryKey(value);
  return key
    ? String(t(`admin.catalog_extra.provider_categories.${key}`, { defaultValue: value }))
    : value;
}

export function catalogGroupKey(value: string | null | undefined): string {
  return normalized(value || "");
}

export function localizeCatalogGroup(t: Translator, value: string | null | undefined): string {
  if (!value) return "—";
  return String(t(`admin_catalog_data.groups.${catalogGroupKey(value)}`, { defaultValue: value }));
}

export function localizeCatalogName(
  t: Translator,
  item: { name?: string | null; nameEn?: string | null; nameHu?: string | null; nameFa?: string | null },
  language?: string,
): string {
  const activeLanguage = (language || (
    typeof navigator !== "undefined"
      ? (document.documentElement.lang || window.localStorage.getItem("i18nextLng") || "en")
      : "en"
  )).split("-")[0];
  const localized = activeLanguage === "hu" ? item.nameHu : activeLanguage === "fa" ? item.nameFa : item.nameEn;
  if (localized?.trim()) return localized.trim();

  const rawName = item.name?.trim();
  if (!rawName) return "—";

  // Seeded catalogue rows predate the localized name columns. Reuse the
  // canonical medical catalogue translations before showing their English
  // seed value. Arbitrary admin-created names still fall back unchanged.
  const medicalName = localizeMedicalTerm(rawName, t as any);
  return medicalName.trim() || rawName;
}