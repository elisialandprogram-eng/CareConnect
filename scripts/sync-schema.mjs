#!/usr/bin/env node
import pg from "pg";
import { pgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema.ts";
import { getTableConfig } from "drizzle-orm/pg-core";

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No database URL configured");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const tables = Object.values(schema).filter((v) => {
  try {
    getTableConfig(v);
    return true;
  } catch {
    return false;
  }
});

let added = 0;
for (const table of tables) {
  const cfg = getTableConfig(table);
  const tableName = cfg.name;

  const { rows: existing } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [tableName],
  );

  if (existing.length === 0) {
    console.log(`SKIP table ${tableName} (does not exist)`);
    continue;
  }

  const have = new Set(existing.map((r) => r.column_name));

  for (const col of cfg.columns) {
    if (have.has(col.name)) continue;

    const type = col.getSQLType();
    const def = col.default !== undefined && col.default !== null
      ? ` DEFAULT ${typeof col.default === "string" ? `'${col.default}'` : col.default}`
      : "";
    const sql = `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col.name}" ${type}${def}`;
    try {
      await client.query(sql);
      console.log(`+ ${tableName}.${col.name} (${type})`);
      added++;
    } catch (e) {
      console.error(`! Failed: ${sql}\n  ${e.message}`);
    }
  }
}

console.log(`\nDone. Added ${added} columns.`);
await client.end();
