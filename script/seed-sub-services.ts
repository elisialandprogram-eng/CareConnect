import { db } from "../server/db";
import { subServices, providerTypeEnum } from "../shared/schema";
import { sql } from "drizzle-orm";

const categories = ["physiotherapist", "doctor", "nurse"];

const physiotherapistSubServices = [
  { name: "Sports Injury Rehabilitation", description: "Treatment for athletic injuries and performance optimization" },
  { name: "Neurological Rehabilitation", description: "Therapy for stroke, Parkinson's, and other nerve conditions" },
  { name: "Pediatric Physiotherapy", description: "Developmental delay and coordination training for children" },
  { name: "Geriatric Physiotherapy", description: "Fall prevention and mobility restoration for seniors" },
  { name: "Women's Health", description: "Prenatal, postnatal care and pelvic floor therapy" },
  { name: "Manual Therapy", description: "Joint mobilization and soft tissue manipulation" }
];

const doctorSubServices = [
  { name: "Family Medicine", description: "General routine checkups and chronic disease management" },
  { name: "Pediatrics", description: "Specialized care for children and developmental assessments" },
  { name: "Cardiology", description: "Heart disease treatment and blood pressure management" },
  { name: "Dermatology", description: "Skin disease treatment and cosmetic procedures" },
  { name: "Psychiatry", description: "Mental health diagnosis and medication management" },
  { name: "Orthopedic Surgery", description: "Bone, joint surgery and fracture treatment" }
];

const nurseSubServices = [
  { name: "General Nursing Care", description: "Vital sign monitoring and medication administration" },
  { name: "Wound Care", description: "Professional dressing and treatment of chronic wounds" },
  { name: "IV Therapy", description: "Intravenous medication and hydration administration" },
  { name: "Geriatric Nursing", description: "Specialized elderly care and health monitoring" },
  { name: "Maternal & Newborn Care", description: "Post-delivery support and lactation consulting" },
  { name: "Emergency Nursing", description: "Acute injury care and trauma stabilization" }
];

async function seed() {
  console.log("Seeding sub-services...");
  
  const allSubServices = [
    ...physiotherapistSubServices.map(s => ({ ...s, category: "physiotherapist" as const })),
    ...doctorSubServices.map(s => ({ ...s, category: "doctor" as const })),
    ...nurseSubServices.map(s => ({ ...s, category: "nurse" as const }))
  ];

  for (const service of allSubServices) {
    try {
      await db.insert(subServices).values({
        name: service.name,
        description: service.description,
        category: service.category,
        isActive: true
      });
      console.log(`Added sub-service: ${service.name} (${service.category})`);
    } catch (error) {
      console.error(`Error adding sub-service ${service.name}:`, error);
    }
  }

  console.log("Seeding completed.");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
