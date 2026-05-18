/**
 * Apply a specific SQL migration file directly to Supabase.
 * Usage: npx tsx scripts/apply-migration.ts supabase/migrations/004_fix_search_decisions.sql
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("Usage: npx tsx scripts/apply-migration.ts <path-to-sql>");
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, "utf-8");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log(`🚀  Applying migration: ${migrationFile}\n`);
  const { error } = await supabase.rpc("exec_sql", { sql });
  if (error) {
    // exec_sql may not exist — fall back to hint
    console.error("❌  RPC exec_sql not available. Run this SQL manually in the Supabase SQL editor:\n");
    console.log(sql);
    process.exit(1);
  }
  console.log("✅  Migration applied successfully.");
}

main();
