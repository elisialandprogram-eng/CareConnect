import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS saved_latitude double precision`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS saved_longitude double precision`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS saved_providers (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id varchar NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      created_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT saved_providers_patient_provider_unique UNIQUE (patient_id, provider_id)
    )
  `);
  console.log("OK");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
