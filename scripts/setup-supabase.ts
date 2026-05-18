/**
 * One-time setup script — creates the Supabase Storage bucket and verifies
 * all required tables are reachable.
 *
 * Usage:
 *   npx tsx scripts/setup-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Try .env.local first (Next.js convention), fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" }); // only fills in vars not already set

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createBucket() {
  console.log("📦  Checking storage bucket 'leases'…");

  // List existing buckets
  const { data: buckets, error: listError } =
    await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }

  const exists = buckets?.some((b) => b.name === "leases");

  if (exists) {
    console.log("   ✅  Bucket 'leases' already exists — skipping creation.");
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    "leases",
    {
      public: false, // private — only service role can read
      fileSizeLimit: 26_214_400, // 25 MB
      allowedMimeTypes: ["application/pdf"],
    }
  );

  if (createError) {
    throw new Error(`Failed to create bucket: ${createError.message}`);
  }

  console.log("   ✅  Bucket 'leases' created successfully.");
}

async function checkTables() {
  console.log("\n🗄️   Checking required tables…");

  const tables = ["leases", "clauses", "reports", "negotiation_points", "contradictions", "tool_call_logs"];

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found — that's fine
      console.log(`   ⚠️   Table '${table}': ${error.message}`);
    } else {
      console.log(`   ✅  Table '${table}' reachable.`);
    }
  }
}

async function main() {
  console.log("🚀  LeaseGuard — Supabase setup\n");

  try {
    await createBucket();
    await checkTables();
    console.log("\n✨  Setup complete. You can now run: npm run dev\n");
  } catch (err) {
    console.error("\n❌  Setup failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
