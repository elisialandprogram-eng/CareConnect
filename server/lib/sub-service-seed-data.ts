/**
 * Canonical sub-service catalogue across all 7 provider categories.
 * Used by runStartupMigrations() to populate sub_services on first boot.
 * Each entry: name, category, durationMinutes, subGroup
 * Insertion uses ON CONFLICT (name, category) DO UPDATE SET sub_group = EXCLUDED.sub_group
 * — fully idempotent and backfills sub_group on existing rows.
 */

export type SeedEntry = { name: string; category: string; duration: number; subGroup: string };

function rows(category: string, subGroup: string, names: string[], duration = 60): SeedEntry[] {
  return names.map((name) => ({ name, category, duration, subGroup }));
}

// ── 1. Medical Doctors & Specialists ────────────────────────────────────────
const physician: SeedEntry[] = [
  ...rows("physician", "Primary Care & General Medicine", [
    "General Medical Consultation",
    "Acute Illness Consultation",
    "Annual Wellness Examination",
    "Preventive Health Screening",
    "Chronic Disease Management",
    "Prescription Refill Consultation",
    "Laboratory Results Review",
    "Diagnostic Report Interpretation",
    "Travel Medicine Consultation",
    "Vaccination & Immunization Consultation",
    "Lifestyle Risk Assessment",
    "Executive Health Assessment",
    "Occupational Health Assessment",
    "Medical Second Opinion",
  ]),
  ...rows("physician", "Internal Medicine", [
    "Hypertension Management",
    "Diabetes Management",
    "Metabolic Syndrome Management",
    "Thyroid Disorder Management",
    "Autoimmune Disease Follow-Up",
    "Chronic Fatigue Evaluation",
    "Weight-Related Medical Assessment",
    "Complex Chronic Disease Review",
  ]),
  ...rows("physician", "Cardiology", [
    "Cardiovascular Risk Assessment",
    "Hypertension Follow-Up",
    "Heart Failure Follow-Up",
    "Cholesterol Management",
    "Cardiac Test Interpretation",
  ]),
  ...rows("physician", "Endocrinology", [
    "Diabetes & Insulin Management",
    "Thyroid Disorder Consultation",
    "PCOS Medical Management",
    "Hormonal Disorder Assessment",
    "Obesity Medicine Consultation",
  ]),
  ...rows("physician", "Gastroenterology", [
    "IBS Consultation",
    "Acid Reflux Management",
    "Chronic Digestive Health Review",
    "Liver Health Consultation",
    "Inflammatory Bowel Disease Follow-Up",
  ]),
  ...rows("physician", "Neurology", [
    "Migraine Management",
    "Headache Assessment",
    "Neurological Symptom Review",
    "Memory & Cognitive Assessment",
    "Neuropathy Consultation",
  ]),
  ...rows("physician", "Pulmonology", [
    "Asthma Management",
    "COPD Follow-Up",
    "Sleep Apnea Consultation",
    "Respiratory Disease Management",
  ]),
  ...rows("physician", "Rheumatology", [
    "Arthritis Management",
    "Joint Pain Consultation",
    "Rheumatology Follow-Up",
  ]),
  ...rows("physician", "Dermatology", [
    "Acne Management",
    "Rosacea Management",
    "Eczema Consultation",
    "Psoriasis Management",
    "Skin Infection Consultation",
    "Hair Loss Assessment",
    "Scalp Disorder Consultation",
    "Hyperpigmentation Treatment Planning",
    "Skin Cancer Screening Review",
    "Mole & Lesion Evaluation",
    "Cosmetic Dermatology Consultation",
    "Anti-Aging Consultation",
  ]),
  ...rows("physician", "Pediatrics", [
    "Newborn Assessment",
    "Infant Wellness Check",
    "Child Development Assessment",
    "Pediatric Acute Consultation",
    "Childhood Allergy Management",
    "Pediatric Asthma Follow-Up",
    "Adolescent Health Consultation",
    "School Readiness Assessment",
    "Behavioral & Developmental Evaluation",
  ]),
  ...rows("physician", "Women's Health", [
    "Contraception Counseling",
    "Family Planning Consultation",
    "Fertility Assessment",
    "Pre-Conception Consultation",
    "Prenatal Consultation",
    "Pregnancy Follow-Up",
    "Postpartum Review",
    "Menopause Consultation",
    "Hormonal Health Assessment",
    "Menstrual Health Consultation",
    "PCOS Consultation",
    "Women's Preventive Health Screening",
  ]),
  ...rows("physician", "Men's Health", [
    "Testosterone & Hormonal Assessment",
    "Sexual Health Consultation",
    "Erectile Dysfunction Consultation",
    "Male Fertility Consultation",
    "Prostate Health Review",
    "Preventive Men's Health Screening",
  ]),
];

// ── 2. Mental Health & Behavioral Professionals ──────────────────────────────
const mental_health: SeedEntry[] = [
  ...rows("mental_health", "Psychiatry", [
    "Psychiatric Diagnostic Evaluation",
    "Medication Management",
    "ADHD Assessment",
    "Anxiety Disorder Management",
    "Depression Management",
    "Bipolar Disorder Management",
    "Sleep Disorder Consultation",
    "Trauma & PTSD Assessment",
  ]),
  ...rows("mental_health", "Psychology & Therapy", [
    "Initial Psychological Assessment",
    "Individual Therapy",
    "Couples Therapy",
    "Marriage Counseling",
    "Family Therapy",
    "Cognitive Behavioral Therapy (CBT)",
    "Dialectical Behavior Therapy (DBT)",
    "Trauma Therapy",
    "EMDR Therapy",
    "Grief Counseling",
    "Anger Management",
    "Stress Management Therapy",
    "Burnout Recovery Therapy",
    "Self-Esteem Counseling",
  ]),
  ...rows("mental_health", "Addiction & Recovery", [
    "Addiction Assessment",
    "Substance Use Counseling",
    "Recovery Coaching",
    "Relapse Prevention Planning",
    "Behavioral Addiction Counseling",
  ]),
  ...rows("mental_health", "Coaching & Support", [
    "Life Coaching",
    "Executive Coaching",
    "Career Counseling",
    "Goal Achievement Coaching",
    "Crisis Support Session",
  ]),
];

// ── 3. Nutrition, Dietetics & Metabolic Wellness ─────────────────────────────
const nutrition: SeedEntry[] = [
  ...rows("nutrition", "Clinical Nutrition", [
    "Initial Nutrition Assessment",
    "Medical Nutrition Therapy (MNT)",
    "Diabetes Nutrition Counseling",
    "Renal Nutrition Counseling",
    "Cardiac Nutrition Counseling",
    "Oncology Nutrition Support",
    "Gastrointestinal Nutrition Support",
    "Pediatric Nutrition Counseling",
    "Geriatric Nutrition Counseling",
  ]),
  ...rows("nutrition", "Weight Management", [
    "Weight Loss Program",
    "Weight Maintenance Program",
    "Hormonal Weight Management",
    "PCOS Nutrition Coaching",
    "Obesity Nutrition Management",
    "Bariatric Surgery Nutrition Support",
  ]),
  ...rows("nutrition", "Performance Nutrition", [
    "Sports Nutrition Consultation",
    "Athletic Performance Nutrition",
    "Hydration Strategy Planning",
    "Supplement Review",
  ]),
  ...rows("nutrition", "Lifestyle Nutrition", [
    "Meal Planning Consultation",
    "Plant-Based Nutrition Coaching",
    "Vegan Transition Support",
    "Gut Health Program",
    "Food Sensitivity Guidance",
  ]),
];

// ── 4. Physical Therapy & Rehabilitation ─────────────────────────────────────
const rehabilitation: SeedEntry[] = [
  ...rows("rehabilitation", "Physical Therapy", [
    "Initial Physical Therapy Assessment",
    "Musculoskeletal Assessment",
    "Injury Rehabilitation",
    "Post-Surgical Rehabilitation",
    "Sports Rehabilitation",
    "Chronic Pain Rehabilitation",
    "Mobility Improvement Program",
    "Balance & Fall Prevention Therapy",
    "Functional Movement Assessment",
  ]),
  ...rows("rehabilitation", "Neurological Rehabilitation", [
    "Stroke Rehabilitation",
    "Parkinson's Rehabilitation",
    "Neurological Recovery Therapy",
    "Vestibular Rehabilitation",
  ]),
  ...rows("rehabilitation", "Orthopedic Rehabilitation", [
    "Joint Rehabilitation",
    "Spine Rehabilitation",
    "Post-Fracture Recovery",
  ]),
  ...rows("rehabilitation", "Sports Medicine", [
    "Sports Injury Assessment",
    "Return-to-Sport Program",
    "Performance Recovery Therapy",
  ]),
  ...rows("rehabilitation", "Occupational Health", [
    "Ergonomic Assessment",
    "Workplace Injury Recovery",
  ]),
  ...rows("rehabilitation", "Chiropractic & Osteopathy", [
    "Chiropractic Assessment",
    "Spinal Alignment Consultation",
    "Postural Assessment",
    "Scoliosis Management",
    "Osteopathic Consultation",
  ]),
];

// ── 5. Dental Care Professionals ─────────────────────────────────────────────
const dental: SeedEntry[] = [
  ...rows("dental", "General Dentistry", [
    "Dental Consultation",
    "Teledentistry Assessment",
    "Dental Pain Evaluation",
    "Oral Health Review",
    "Preventive Dental Consultation",
  ]),
  ...rows("dental", "Cosmetic Dentistry", [
    "Smile Design Consultation",
    "Veneer Consultation",
    "Teeth Whitening Consultation",
  ]),
  ...rows("dental", "Orthodontics", [
    "Orthodontic Consultation",
    "Aligner Review",
    "Braces Progress Review",
  ]),
  ...rows("dental", "Pediatric Dentistry", [
    "Pediatric Dental Assessment",
    "Teething Consultation",
    "Oral Hygiene Education",
  ]),
  ...rows("dental", "Oral Medicine", [
    "TMJ Assessment",
    "Jaw Pain Consultation",
    "Bruxism Assessment",
    "Oral Lesion Evaluation",
  ]),
  ...rows("dental", "Implant & Restorative Dentistry", [
    "Dental Implant Consultation",
    "Crown & Bridge Consultation",
  ]),
];

// ── 6. Alternative, Holistic & Integrative Medicine ──────────────────────────
const alternative_medicine: SeedEntry[] = [
  ...rows("alternative_medicine", "Integrative Medicine", [
    "Integrative Health Assessment",
    "Functional Wellness Consultation",
    "Lifestyle Medicine Consultation",
    "Preventive Wellness Planning",
  ]),
  ...rows("alternative_medicine", "Ayurveda", [
    "Ayurvedic Assessment",
    "Ayurvedic Lifestyle Planning",
    "Ayurvedic Nutrition Consultation",
  ]),
  ...rows("alternative_medicine", "Naturopathy", [
    "Naturopathic Consultation",
    "Natural Health Strategy Session",
  ]),
  ...rows("alternative_medicine", "Homeopathy", [
    "Homeopathic Assessment",
    "Homeopathic Follow-Up",
  ]),
  ...rows("alternative_medicine", "Mind-Body Wellness", [
    "Breathwork Session",
    "Mindfulness Coaching",
    "Stress Reduction Program",
  ]),
  ...rows("alternative_medicine", "Traditional Therapies", [
    "Acupressure Consultation",
    "Meridian Assessment",
    "Holistic Wellness Planning",
  ]),
];

// ── 7. Maternal, Nursing & Allied Health Support ─────────────────────────────
const nursing: SeedEntry[] = [
  ...rows("nursing", "Maternal Support", [
    "Lactation Consultation",
    "Breastfeeding Support",
    "Prenatal Education",
    "Postpartum Support",
    "Birth Planning Consultation",
    "Doula Support Session",
  ]),
  ...rows("nursing", "Nursing Services", [
    "Home Care Nursing Assessment",
    "Chronic Care Nursing Support",
    "Medication Management Education",
    "Wound Care Consultation",
    "Post-Discharge Follow-Up",
  ]),
  ...rows("nursing", "Speech & Language Therapy", [
    "Speech Assessment",
    "Language Development Assessment",
    "Swallowing Assessment",
    "Stuttering Therapy",
    "Communication Skills Therapy",
  ]),
  ...rows("nursing", "Occupational Therapy", [
    "Occupational Therapy Assessment",
    "Activities of Daily Living Training",
    "Fine Motor Skills Training",
    "Sensory Integration Therapy",
    "Cognitive Rehabilitation",
  ]),
  ...rows("nursing", "Allied Health", [
    "Case Management Consultation",
    "Care Coordination Session",
    "Rehabilitation Planning",
    "Independent Living Support",
  ]),
];

export const SUB_SERVICE_SEED: SeedEntry[] = [
  ...physician,
  ...mental_health,
  ...nutrition,
  ...rehabilitation,
  ...dental,
  ...alternative_medicine,
  ...nursing,
];
