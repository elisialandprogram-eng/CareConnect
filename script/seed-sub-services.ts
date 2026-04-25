import { db } from "../server/db";
import { subServices } from "../shared/schema";
import { sql } from "drizzle-orm";

const physiotherapistSubServices = [
  // ABPTS Specialties
  { name: "Cardiovascular & Pulmonary", description: "Heart attacks, COPD, cardiopulmonary rehabilitation" },
  { name: "Clinical Electrophysiology", description: "Nerve and muscle disorders" },
  { name: "Geriatric Physiotherapy", description: "Arthritis, osteoporosis, Alzheimer's, Parkinson's disease" },
  { name: "Neurological Rehabilitation", description: "Stroke, brain injury, spinal cord injury" },
  { name: "Oncology Rehabilitation", description: "Cancer-related physical rehabilitation" },
  { name: "Orthopedic Physiotherapy", description: "Joint pain, back injuries, musculoskeletal conditions" },
  { name: "Pediatric Physiotherapy", description: "Developmental delays and genetic conditions in children" },
  { name: "Sports Physical Therapy", description: "Injury prevention and athletic performance" },
  { name: "Women's Health", description: "Pelvic floor dysfunction, prenatal/postnatal care" },
  { name: "Wound Management", description: "Chronic wounds, burns, and pressure ulcers" },
  // Additional Practice Areas
  { name: "Amputee Rehabilitation", description: "Prosthetic training and functional mobility" },
  { name: "Hand Therapy", description: "Hand and upper extremity rehabilitation" },
  { name: "Vestibular Rehabilitation", description: "Balance and dizziness disorders" },
  { name: "Aquatic Therapy", description: "Physical therapy performed in water" },
  { name: "Critical Care PT", description: "Physiotherapy for patients in intensive care" },
  { name: "Osteoporosis Management", description: "Resistance and weight-bearing training" }
];

const doctorSubServices = [
  // Primary Care
  { name: "Family Medicine", description: "Comprehensive care for individuals of all ages" },
  { name: "Internal Medicine", description: "Adult general medicine and complex illness diagnosis" },
  { name: "Pediatrics", description: "Medical care for children from birth to age 25" },
  // Internal Medicine Subspecialties
  { name: "Cardiology", description: "Heart and vascular disease treatment" },
  { name: "Gastroenterology", description: "Digestive system and liver disorders" },
  { name: "Pulmonology", description: "Lung and respiratory tract diseases" },
  { name: "Endocrinology", description: "Hormone imbalances and diabetes management" },
  { name: "Nephrology", description: "Kidney disease and hypertension management" },
  { name: "Rheumatology", description: "Arthritis and autoimmune disease treatment" },
  { name: "Infectious Disease", description: "Treatment for complex infections" },
  { name: "Medical Oncology", description: "Cancer diagnosis and medical treatment" },
  // Surgical Specialties
  { name: "General Surgery", description: "Trauma and abdominal surgical procedures" },
  { name: "Orthopedic Surgery", description: "Surgical treatment of bones, joints, and muscles" },
  { name: "Neurosurgery", description: "Surgical treatment of the brain and spine" },
  { name: "Plastic & Reconstructive Surgery", description: "Reconstructive and cosmetic surgery" },
  { name: "Cardiothoracic Surgery", description: "Heart and chest surgery" },
  { name: "Urology", description: "Urinary tract and male reproductive system" },
  { name: "Obstetrics & Gynecology", description: "Pregnancy care and female reproductive health" },
  // Other Specialties
  { name: "Dermatology", description: "Skin, hair, and nail disease treatment" },
  { name: "Neurology", description: "Non-surgical treatment of brain and nerve disorders" },
  { name: "Psychiatry", description: "Mental health diagnosis and treatment" },
  { name: "Ophthalmology", description: "Eye disease treatment and surgery" },
  { name: "Otolaryngology (ENT)", description: "Ear, nose, and throat disorders" },
  { name: "Emergency Medicine", description: "Acute injury and trauma care" },
  { name: "Radiology", description: "Medical imaging and interventional procedures" }
];

const nurseSubServices = [
  // Advanced Practice
  { name: "Family Nurse Practitioner", description: "Primary care across the lifespan" },
  { name: "Psychiatric-Mental Health NP", description: "Advanced mental health care" },
  { name: "Certified Nurse Midwife", description: "Pregnancy, birth, and newborn care" },
  { name: "Nurse Anesthetist (CRNA)", description: "Advanced anesthesia administration" },
  // Clinical Specialties
  { name: "Critical Care / ICU Nursing", description: "Care for life-threatening conditions" },
  { name: "Emergency/Trauma Nursing", description: "Acute care and stabilization" },
  { name: "Surgical/Perioperative Nursing", description: "Care before, during, and after surgery" },
  { name: "Pediatric Nursing", description: "Specialized care for children" },
  { name: "Neonatal Intensive Care (NICU)", description: "Care for premature or ill newborns" },
  { name: "Geriatric Nursing", description: "Specialized care for elderly patients" },
  { name: "Oncology Nursing", description: "Support and treatment for cancer patients" },
  { name: "Dialysis/Nephrology Nursing", description: "Care for patients with kidney disease" },
  { name: "Wound & Ostomy Nursing", description: "Specialized wound care and management" },
  { name: "Hospice & Palliative Care", description: "End-of-life and comfort care" },
  { name: "Home Health Nursing", description: "Care provided in the patient's home" },
  { name: "Rehabilitation Nursing", description: "Support for recovering functional abilities" },
  { name: "School Nursing", description: "Health care in educational settings" },
  { name: "Occupational Health Nursing", description: "Workplace health and safety" }
];

async function seed() {
  console.log("Starting comprehensive sub-services seeding...");
  
  // Clear existing sub-services to avoid duplicates (optional, but cleaner for "comprehensive" request)
  // await db.delete(subServices);
  
  const allSubServices = [
    ...physiotherapistSubServices.map(s => ({ ...s, category: "physiotherapist" as const })),
    ...doctorSubServices.map(s => ({ ...s, category: "doctor" as const })),
    ...nurseSubServices.map(s => ({ ...s, category: "nurse" as const }))
  ];

  for (const service of allSubServices) {
    try {
      // Use upsert or check for existence to avoid duplicates
      await db.insert(subServices).values({
        name: service.name,
        description: service.description,
        category: service.category,
        isActive: true
      }).onConflictDoUpdate({
        target: [subServices.name, subServices.category],
        set: { description: service.description }
      });
      console.log(`Added/Updated sub-service: ${service.name} (${service.category})`);
    } catch (error) {
      // If unique constraint fails (and onConflict didn't catch it due to missing unique index), just log
      console.error(`Error adding sub-service ${service.name}:`, error);
    }
  }

  console.log("Comprehensive seeding completed.");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
