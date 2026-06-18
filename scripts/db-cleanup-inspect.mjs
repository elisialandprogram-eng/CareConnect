import pg from "pg";
const { Pool } = pg;
const dburl = process.env.SUPABASE_DATABASE_URL;
if (!dburl) { console.error("SUPABASE_DATABASE_URL not set"); process.exit(1); }
const pool = new Pool({ connectionString: dburl, max: 3, ssl: { rejectUnauthorized: false } });
const c = await pool.connect();
console.log("Host:", new URL(dburl).host);
const tables = (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).rows.map(r=>r.table_name);
console.log("Total tables:", tables.length);
const counts = {};
for (const t of tables) {
  const r = await c.query(`SELECT COUNT(*)::int n FROM "${t}"`);
  counts[t] = r.rows[0].n;
}
console.log("\nNon-empty tables:");
for (const [t,n] of Object.entries(counts)) if (n>0) console.log(`  ${t.padEnd(45)} ${n}`);
const admins = await c.query(`SELECT id,email,role FROM users WHERE role IN ('admin','global_admin','country_admin') ORDER BY role,email`);
console.log("\nAdmins (will be PRESERVED):");
for (const a of admins.rows) console.log(`  ${a.role.padEnd(14)} ${a.email}  (${a.id})`);
const seqs = (await c.query(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' ORDER BY sequence_name`)).rows.map(r=>r.sequence_name);
console.log("\nSequences:", seqs.join(", "));
console.log("\nAll table names:", tables.join(", "));
c.release(); await pool.end();
