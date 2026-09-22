import type { TFunction } from "i18next";

const CATEGORY_KEYS: Record<string, string> = {
  physician: "physician",
  medical_doctors_specialists: "physician",
  mental_health: "mental_health",
  mental_health_behavioral_professionals: "mental_health",
  nutrition: "nutrition",
  nutrition_dietetics_metabolic_wellness: "nutrition",
  rehabilitation: "rehabilitation",
  physical_therapy_rehabilitation: "rehabilitation",
  dental: "dental",
  dental_care_professionals: "dental",
  alternative_medicine: "alternative_medicine",
  alternative_holistic_integrative_medicine: "alternative_medicine",
  nursing: "nursing",
  maternal_nursing_allied_health_support: "nursing",
};

const SERVICE_KEYS = new Set([
  "cardiovascular_pulmonary",
  "clinical_electrophysiology",
  "geriatric_physiotherapy",
  "neurological_rehabilitation",
  "oncology_rehabilitation",
  "orthopedic_physiotherapy",
  "pediatric_physiotherapy",
  "sports_physical_therapy",
  "womens_health",
  "wound_management",
  "amputee_rehabilitation",
  "hand_therapy",
  "vestibular_rehabilitation",
  "aquatic_therapy",
  "critical_care_pt",
  "osteoporosis_management",
  "family_medicine",
  "internal_medicine",
  "pediatrics",
  "cardiology",
  "gastroenterology",
  "pulmonology",
  "endocrinology",
  "nephrology",
  "rheumatology",
  "infectious_disease",
  "medical_oncology",
  "general_surgery",
  "orthopedic_surgery",
  "neurosurgery",
  "plastic_reconstructive_surgery",
  "cardiothoracic_surgery",
  "urology",
  "obstetrics_gynecology",
  "dermatology",
  "neurology",
  "psychiatry",
  "ophthalmology",
  "otolaryngology_ent",
  "emergency_medicine",
  "radiology",
  "family_nurse_practitioner",
  "psychiatric_mental_health_np",
  "certified_nurse_midwife",
  "nurse_anesthetist_crna",
  "critical_care_icu_nursing",
  "emergency_trauma_nursing",
  "surgical_perioperative_nursing",
  "pediatric_nursing",
  "neonatal_intensive_care_nicu",
  "geriatric_nursing",
  "oncology_nursing",
  "dialysis_nephrology_nursing",
  "wound_ostomy_nursing",
  "hospice_palliative_care",
  "home_health_nursing",
  "rehabilitation_nursing",
  "school_nursing",
  "occupational_health_nursing",
]);

const SERVICE_ALIASES: Record<string, string> = {
  women_s_health: "womens_health",
  plastic_and_reconstructive_surgery: "plastic_reconstructive_surgery",
};

const PROFESSION_KEYS = new Set([
  "physiotherapist",
  "physical_therapist",
  "physiotherapy",
  "physical_therapy",
  "occupational_therapist",
  "occupational_therapy",
  "psychologist",
  "psychiatrist",
  "counselor",
  "counsellor",
  "therapist",
  "mental_health_therapist",
  "nutritionist",
  "dietitian",
  "dentist",
  "dental_hygienist",
  "nurse",
  "midwife",
  "physician",
  "doctor",
  "surgeon",
  "speech_therapist",
  "chiropractor",
  "acupuncturist",
]);

function normalizeMedicalLabel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function localizeMedicalTerm(value: unknown, t: TFunction): string {
  const fallback = String(value ?? "").trim();
  if (!fallback) return fallback;

  const normalized = normalizeMedicalLabel(fallback);
  const categoryKey = CATEGORY_KEYS[normalized];
  if (categoryKey) {
    return t(`medical_catalog.categories.${categoryKey}`, { defaultValue: fallback });
  }
  const serviceKey = SERVICE_ALIASES[normalized] ?? normalized;
  if (SERVICE_KEYS.has(serviceKey)) {
    return t(`medical_catalog.services.${serviceKey}`, { defaultValue: fallback });
  }
  if (PROFESSION_KEYS.has(normalized)) {
    return t(`medical_catalog.professions.${normalized}`, { defaultValue: fallback });
  }
  return fallback;
}