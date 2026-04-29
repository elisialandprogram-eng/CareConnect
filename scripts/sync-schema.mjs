import { readFileSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;
const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE URL missing");

const pool = new Pool({ connectionString: url, max: 4 });

const sql = readFileSync("migrations/0000_spotty_donald_blake.sql", "utf8");
const stmts = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

function quoteIdent(s) {
  return '"' + s.replace(/"/g, '""') + '"';
}

function splitColumns(body) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const planned = [];

for (const raw of stmts) {
  const s = raw.replace(/;$/, "").trim();
  if (!s) continue;

  // CREATE TYPE ... AS ENUM (...)
  let m = s.match(/^CREATE TYPE\s+("?\w+"?\.)?"?(\w+)"?\s+AS ENUM\s*\((.*)\)$/is);
  if (m) {
    const typeName = m[2];
    const values = m[3];
    planned.push({
      kind: "type",
      sql: `DO $$ BEGIN CREATE TYPE "public"."${typeName}" AS ENUM(${values}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    });
    continue;
  }

  // CREATE TABLE "name" ( ... )
  m = s.match(/^CREATE TABLE\s+"?(\w+)"?\s*\(([\s\S]+)\)$/i);
  if (m) {
    const table = m[1];
    const body = m[2];
    const cols = splitColumns(body);
    const colDefs = cols.filter((c) => !/^(PRIMARY KEY|UNIQUE|CONSTRAINT|CHECK|FOREIGN KEY)\b/i.test(c));
    const tableConstraints = cols.filter((c) => /^(PRIMARY KEY|UNIQUE|CONSTRAINT|CHECK|FOREIGN KEY)\b/i.test(c));
    planned.push({
      kind: "table",
      table,
      createSql: `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (${cols.join(", ")});`,
      colDefs,
      tableConstraints,
    });
    continue;
  }

  // ALTER TABLE ADD CONSTRAINT FK
  m = s.match(/^ALTER TABLE\s+"?(\w+)"?\s+ADD CONSTRAINT\s+"?(\w+)"?\s+(.+)$/is);
  if (m) {
    const table = m[1];
    const constraint = m[2];
    const rest = m[3];
    planned.push({
      kind: "constraint",
      table,
      constraint,
      sql: `DO $$ BEGIN ALTER TABLE ${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(constraint)} ${rest}; EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;`,
    });
    continue;
  }

  // CREATE INDEX / CREATE UNIQUE INDEX
  m = s.match(/^CREATE(\s+UNIQUE)?\s+INDEX\s+"?(\w+)"?\s+(.+)$/is);
  if (m) {
    const unique = m[1] ? " UNIQUE" : "";
    const idx = m[2];
    const rest = m[3];
    planned.push({
      kind: "index",
      sql: `CREATE${unique} INDEX IF NOT EXISTS ${quoteIdent(idx)} ${rest};`,
    });
    continue;
  }

  console.warn("[skip-unparsed]", s.slice(0, 120));
}

async function tableExists(name) {
  const r = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
    [name],
  );
  return r.rowCount > 0;
}

async function getColumns(table) {
  const r = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    [table],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

let executed = 0,
  errors = 0;

async function exec(sqlText, label) {
  try {
    await pool.query(sqlText);
    executed++;
  } catch (e) {
    errors++;
    console.error(`[err] ${label}: ${e.message}`);
  }
}

// 1) Types
for (const p of planned.filter((x) => x.kind === "type")) {
  await exec(p.sql, "type");
}

// 2) Tables — create or add missing columns
for (const p of planned.filter((x) => x.kind === "table")) {
  const exists = await tableExists(p.table);
  if (!exists) {
    await exec(p.createSql, `create table ${p.table}`);
  } else {
    const existing = await getColumns(p.table);
    for (const def of p.colDefs) {
      const m = def.match(/^"?(\w+)"?\s+(.+)$/);
      if (!m) continue;
      const colName = m[1];
      const colType = m[2];
      if (!existing.has(colName)) {
        await exec(
          `ALTER TABLE ${quoteIdent(p.table)} ADD COLUMN IF NOT EXISTS ${quoteIdent(colName)} ${colType};`,
          `add column ${p.table}.${colName}`,
        );
      }
    }
  }
}

// 3) Constraints (FKs)
for (const p of planned.filter((x) => x.kind === "constraint")) {
  await exec(p.sql, `constraint ${p.constraint}`);
}

// 4) Indexes
for (const p of planned.filter((x) => x.kind === "index")) {
  await exec(p.sql, "index");
}

console.log(`Done. executed=${executed} errors=${errors}`);
await pool.end();
