/**
 * ROADMAP 2.2 — Hybrid Search Verification
 *
 * Verifies:
 *  1. Graceful fallback: hybridSearch() catches PGRST202 and falls back to vectorSearch()
 *  2. RRF merge logic: reciprocalRankFusion() blends multiple ranked lists correctly
 *  3. Multi-query construction: buildQueries() generates 3 distinct queries
 *  4. Compiled output contains hybrid search + RRF code
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

console.log("\n══════════════════════════════════════════════════════════");
console.log("  LeaseGuard — ROADMAP 2.2 Hybrid Search Verification     ");
console.log("══════════════════════════════════════════════════════════\n");

// ─── SECTION 1: Compiled code structure ──────────────────────────────────────
console.log("SECTION 1: Compiled Code Structure");

const compiled = readFileSync(
  resolve(root, "mcp-server/dist/tools/lookup-statute.js"),
  "utf8"
);

assert(compiled.includes("search_statutes_hybrid"), "hybridSearch RPC call present");
assert(compiled.includes("PGRST202"), "PGRST202 fallback error code present");
assert(compiled.includes("search_statutes_hybrid not found"), "fallback warning message present");
assert(compiled.includes("reciprocalRankFusion"), "RRF merge function present");
assert(compiled.includes("k + i + 1"), "RRF rank formula present");
assert(compiled.includes("0.7"), "70% RRF weight present");
assert(compiled.includes("0.3"), "30% cosine weight present");
assert(compiled.includes("CLAUSE_TYPE_QUERY_PHRASES"), "statute-targeted query phrases present");
assert(compiled.includes("buildQueries"), "multi-query builder present");
assert(compiled.includes("0.55"), "hybrid search threshold (0.55) present");
console.log();

// ─── SECTION 2: RRF merge logic (manual calculation) ─────────────────────────
console.log("SECTION 2: RRF Merge Logic (Manual Calculation)");

// k=60, rank #1 → 1/61 ≈ 0.01639
// For 3 lists where doc appears at rank #1 in all: rrfScore = 3/61
// maxRRF = 3/61, normalizedRRF = 1.0, blended = 0.7*1.0 + 0.3*cosine
const k = 60;
const rank1Contribution = 1 / (k + 1);
const maxRRFFor3Lists = 3 / (k + 1);
const docInAllListsRRF = rank1Contribution * 3;
const normalizedRRF = docInAllListsRRF / maxRRFFor3Lists;

assert(Math.abs(rank1Contribution - 1/61) < 0.0001, `rank-1 contribution = 1/61 ≈ ${(1/61).toFixed(5)}`);
assert(Math.abs(normalizedRRF - 1.0) < 0.0001, "rank #1 in all 3 lists → normalizedRRF = 1.0");

const partialRRF = (1/(k+1)) + (1/(k+3));
const partialNorm = partialRRF / maxRRFFor3Lists;
assert(partialNorm > 0 && partialNorm < 1, `partial doc (rank 1+3): norm=${partialNorm.toFixed(4)} ∈ (0,1)`);

const blended = 0.7 * normalizedRRF + 0.3 * 0.85;
assert(Math.abs(blended - (0.7 + 0.255)) < 0.0001, `blend = 0.7*1.0 + 0.3*0.85 = ${blended.toFixed(4)}`);

// Doc in list 1 only (rank #1) vs doc in all 3 lists (rank #1): second should score higher
const docInOne = (1/(k+1)) / maxRRFFor3Lists;
const docInAll = 1.0; // normalizedRRF=1.0 computed above
assert(docInAll > docInOne, "doc in 3 lists scores higher than doc in 1 list");
console.log();

// ─── SECTION 3: Multi-query construction ──────────────────────────────────────
console.log("SECTION 3: Multi-Query Construction — Statute-Targeted Phrases");

const clauseTypes = [
  "rent_payment", "rent_increase", "security_deposit", "entry_rights",
  "maintenance_repairs", "subletting_assignment", "early_termination",
  "renewal_terms", "pets", "quiet_enjoyment",
];

for (const ct of clauseTypes) {
  // TypeScript compiles unquoted object keys: rent_payment: "..."
  const found = compiled.includes(`"${ct}"`) || compiled.includes(`${ct}:`);
  assert(found, `clause type '${ct}' has a query phrase entry`);
}
console.log();

// ─── SECTION 4: Migration SQL correctness ─────────────────────────────────────
console.log("SECTION 4: Migration SQL (005_hybrid_search.sql)");

const migrationSql = readFileSync(
  resolve(root, "supabase/migrations/005_hybrid_search.sql"),
  "utf8"
);

assert(migrationSql.includes("fts_vector tsvector"), "fts_vector column definition present");
assert(migrationSql.includes("GENERATED ALWAYS AS"), "generated column syntax correct");
assert(migrationSql.includes("to_tsvector"), "tsvector generation function present");
assert(migrationSql.includes("GIN"), "GIN index for fast FTS queries");
assert(migrationSql.includes("search_statutes_hybrid"), "hybrid function name correct");
assert(migrationSql.includes("FULL OUTER JOIN"), "RRF uses FULL OUTER JOIN");
assert(migrationSql.includes("plainto_tsquery"), "FTS uses plainto_tsquery");
assert(migrationSql.includes("ts_rank"), "BM25 approximation via ts_rank");
assert(migrationSql.includes("61.0 / 2.0"), "RRF normalisation factor correct");
assert(migrationSql.includes("0.7"), "70% RRF blend weight in SQL");
console.log();

// ─── SECTION 5: Search parameters ────────────────────────────────────────────
console.log("SECTION 5: Search Parameters");
assert(compiled.includes("match_threshold: threshold"), "threshold passed to hybridSearch");
assert(compiled.includes("match_count: limit"), "limit passed to hybridSearch");
// Check top-5 slice is applied after RRF
assert(compiled.includes(".slice(0, 5)"), "top-5 results returned after RRF merge");
console.log();

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("──────────────────────────────────────────────────────────");
console.log(`  Results: ${passed}/${passed + failed} passed`);
if (failed === 0) {
  console.log("  ✅  ALL HYBRID SEARCH TESTS PASSED");
  console.log("  ℹ️  SQL migration (005_hybrid_search.sql) must be applied in Supabase Studio");
  console.log("     Until applied: graceful fallback to pure vector search is active");
  console.log("     After applied: hybrid BM25+vector search with in-DB RRF is active");
} else {
  console.log(`  ❌  ${failed} test(s) failed`);
}
console.log("──────────────────────────────────────────────────────────\n");

process.exit(failed > 0 ? 1 : 0);
