import { defineConfig } from "drizzle-kit";

// SUPABASE_DATABASE_URL is the single source of truth — DATABASE_URL (Replit) is not used.
const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL is required. Set this secret to the Supabase pooled connection string."
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
