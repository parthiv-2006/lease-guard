# LeaseGuard — Session Handoff

> **For the next Claude Code session.** Read this file first. It tells you exactly where the
> project stands, what has been built, what is broken, what is next, and every gotcha discovered so far.

---

## What This Project Is

LeaseGuard is an AI agent that reads Ontario residential lease PDFs, retrieves real statute
and tribunal text via RAG, and produces a grounded risk analysis with negotiation guidance.

**Key constraint:** Every legal claim must be backed by a retrieved source from pgvector.
The agent (Claude) calls MCP tools. The LLM never asserts legal facts from training knowledge alone.

---

## Repository

- **GitHub:** https://github.com/parthiv-2006/lease-guard
- **Branch:** `main`
- **Local path:** `C:\Users\Parthiv Paul\Documents\leaseguard`

---

## Current Status (as of 2026-05-16)

**Current HEAD:** `79351bf` — run `git log --oneline -5` to verify.

### ✅ Fully Complete

| What | Notes |
|------|-------|
| Supabase migrations applied | All 3 migrations. Schema is live. |
| `.env.local` created | All keys set (see Environment Variables section) |
| Tesseract OCR installed | At `C:\Program Files\Tesseract-OCR`, added to user PATH |
| Python deps installed | `pip install -r scripts/requirements.txt` done |
| MCP server deps installed | `cd mcp-server && npm install` done |
| MCP server TypeScript built | `tsc` builds clean, output in `mcp-server/dist/` |
| Claude Code MCP config | `.claude/settings.json` wires MCP server (gitignored — see below) |
| Benchmark corpus seeded | 50 clauses × 5 types in `clause_comparisons` via `seed_benchmark.ts` |
| RTA statute corpus | **All 1574 chunks embedded** in `statutes` table (completed 2026-05-16) — 564 new + 1010 skipped, 0 errors. Covers s.1–s.263 including all transitional provisions. |
| Full pipeline tested E2E | All 12 MCP tools tested against `faultyLease.pdf` — all working |
| RAG lookup bugs fixed | See Critical Gotchas #13–15 below |
| `score_risk` improved | 6 new violation patterns added (s.4, s.14, s.20, s.59, s.105/106, s.108) |
| `classify_clause` improved | rent_payment and dispute_resolution keyword coverage expanded |

### ❌ Not Built Yet

- `tribunal_decisions` table: **0 rows** — LTB decisions corpus not started
- Next.js backend API routes: `app/api/upload`, `app/api/job/[id]`, `app/api/report/[id]` are stubs
- `lib/agent.ts`: the Claude orchestration loop — **this is the next thing to build**
- Frontend: `app/page.tsx` is a placeholder, `app/report/[id]/page.tsx` doesn't exist

---

## MCP Server — Claude Code Integration

The MCP server is wired into Claude Code via `.claude/settings.json` (gitignored).
**This file must be recreated if you clone fresh or the worktree changes.** Create it at:

```
<project-root>/.claude/settings.json
```

Contents:
```json
{
  "mcpServers": {
    "leaseguard": {
      "command": "node",
      "args": ["C:/Users/Parthiv Paul/Documents/leaseguard/mcp-server/dist/start.js"],
      "type": "stdio"
    }
  }
}
```

**Important:** The entry point is `start.js` not `index.js`. `start.ts` loads dotenv before
dynamically importing `index.js` — this is required because `lib/supabase.ts` reads env vars
at module level, and ESM static imports are hoisted before any code runs. Without `start.ts`,
the MCP server crashes with "SUPABASE_URL is not set".

After any change to the MCP server TypeScript, rebuild:
```bash
cd mcp-server && npm run build
```

Then restart Claude Code to reload the MCP server.

---

## Critical Gotchas (Hard-Won Knowledge)

### 1. Gemini gRPC SSL fails on Windows — always use REST

The `@google/generative-ai` npm package and `google-generativeai` Python package both use
gRPC, which has its own BoringSSL TLS stack. On Windows, gRPC's SSL ignores `truststore`,
system cert stores, and `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH`. Every embedding call fails with
`CERTIFICATE_VERIFY_FAILED`.

**Fix already applied everywhere:** Both `mcp-server/src/lib/embeddings.ts` and
`scripts/build_corpus.py` call the Gemini REST API directly via `fetch`/`requests`.
Never reintroduce the gRPC SDK.

### 2. Gemini model renamed — `text-embedding-004` no longer exists

The model `text-embedding-004` returns 404. The current model is `gemini-embedding-001`.
Both the Python script and TypeScript embeddings lib use this. It produces 3072-dim vectors
by default — we pass `outputDimensionality: 768` to match the `vector(768)` Supabase schema.

REST endpoint (both Python and TypeScript use this):
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent
```

Body:
```json
{
  "content": { "parts": [{ "text": "..." }] },
  "taskType": "RETRIEVAL_DOCUMENT",
  "outputDimensionality": 768
}
```

### 3. ontario.ca is a React SPA — use Wayback Machine

Requesting `https://www.ontario.ca/laws/statute/06r17` returns a 54KB JavaScript shell with
"Please enable JavaScript." The full static HTML is available via Wayback Machine:

```
https://web.archive.org/web/20220101120457/https://www.ontario.ca/laws/statute/06r17
```

`build_corpus.py` fetches this URL. The RTA content has not changed materially since 2022.
The canonical URL (ontario.ca) is stored in the DB for citation purposes.

### 4. Windows Python SSL — truststore needed for requests (not gRPC)

Python on Windows doesn't trust government CA certificates out of the box. `truststore`
patches Python's `ssl` module so `requests` works for ontario.ca and Wayback Machine.
This is already in `build_corpus.py`:
```python
import truststore
truststore.inject_into_ssl()
```
`truststore` does NOT fix gRPC. See gotcha #1.

### 5. Gemini free tier daily quota (~1000 RPD)

`gemini-embedding-001` free tier appears to have a daily request limit around 1000.
The 1s throttle prevents per-minute rate limits during a run, but a full corpus build
(1574 chunks) may need to be spread across 2 days. The dedup check handles this gracefully —
re-runs skip already-embedded sections. The full RTA is now in the DB as of 2026-05-16.

### 6. ESM dotenv ordering in MCP server

Static `import` statements in ESM are hoisted and execute before any module-level code.
This means you cannot do `import { config } from 'dotenv'; config();` and then import
`lib/supabase.ts` — supabase.ts will have already read `process.env.SUPABASE_URL` as
`undefined` before dotenv runs.

**Fix:** `mcp-server/src/start.ts` loads dotenv synchronously, then uses dynamic
`await import('./index.js')` to load the rest of the server after env vars are set.

### 7. `@google/generative-ai` removed from mcp-server

The npm package was removed when we switched to REST. Do not reinstall it.

### 8. Similarity threshold (0.45) needs validation

The 0.45 cosine similarity floor in `lookup-statute.ts` and `lookup-tribunal.ts` is an
estimate. Run `scripts/validate_retrieval.py` before going to production.

### 9. Benchmark invisible without seeded data

`benchmark_clause` returns `sufficient_data: false` until `clause_comparisons` has ≥ 10
rows per clause type. The 50-row seed is done — benchmarking is active for all 5 types.

### 10. Language constraint — never say "illegal"

Ontario RTA: problematic clauses are **void and unenforceable**, not "illegal". All output
must use "potentially unenforceable" or "may not be enforceable." Enforced in tool prompts
and the report generator. Do not regress on this.

### 11. Tesseract PATH (Windows)

Tesseract is installed at `C:\Program Files\Tesseract-OCR` and added to the user PATH.
`parse_pdf.py` will fail with "tesseract not found" if PATH is not set. Verify with:
```powershell
tesseract --version
```

### 12. `__tests__` warning — "Cannot log after tests are done"

The upload route fires `triggerAnalysis()` as fire-and-forget. In tests it tries to reach
the MCP server, gets `ECONNREFUSED`, and logs after Jest finishes. Fix: add to
`__tests__/setup.ts`:
```ts
global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
```

### 13. CRITICAL: Jurisdiction code must be `"CA-ON"`, not `"ON"`

All MCP tools pass `jurisdiction_code: "CA-ON"` to Supabase queries. The corpus was
originally stored with `"ON"` — this was fixed by running an UPDATE to change all rows.
`build_corpus.py` now hardcodes `JURISDICTION_CODE = "CA-ON"`. Do not change this back.

If lookups ever return empty again, the first thing to check is that all `statutes` rows
have `jurisdiction_code = 'CA-ON'` (not `'ON'` or anything else).

### 14. CRITICAL: `lookup-statute.ts` field names must match DB schema exactly

The `statutes` table columns are:
- `full_text` (not `text`)
- `corpus_version` (not `last_verified`)
- RPC param is `match_threshold` (not `similarity_threshold`)

These were wrong and caused silent 400 errors from PostgREST (caught and swallowed), making
all statute lookups return empty. All fixed in commit `714de7c`.

### 15. CRITICAL: `lookup-tribunal.ts` table name is `tribunal_decisions`

The tribunal lookup was querying a table called `decisions` (doesn't exist). The correct
table is `tribunal_decisions`. Fixed in commit `714de7c`. The `relevance_score` field
(not `similarity`) is also required.

### 16. `score_risk` input schema — `risk_score_result` is a nested object

When calling `score_risk` manually (e.g. from Claude Desktop), the input requires:
```json
{
  "clause": { ... },
  "statutes": [...],
  "risk_score_result": {
    "clause_id": "...",
    "primary_type": "...",
    "subtype": null,
    "confidence": 0.75,
    "requires_legal_lookup": true,
    "lookup_priority": "high",
    "keywords": [...]
  }
}
```
`risk_score_result` is the full output of `classify_clause`, passed through as a nested
object — not flattened. The Zod schema will reject it otherwise.

### 17. `generate_report` schema — exact nested shapes required

`generate_report` expects:
- `analyzed_clauses[].risk_score_result` — nested `ClassificationResult` object (same shape as #16)
- `negotiation_points[].negotiability_basis`, `.landlord_likely_response`, `.your_rebuttal` — all required
- `missing_protections[].risk_if_missing` — required string field

Missing any of these causes a Zod validation error. The tool returns `{ error: "Invalid input", details: {...} }` with field-level error messages.

---

## What to Build Next

### Phase 3 — Next.js Backend API Routes (immediate priority)

The MCP tools are proven. The corpus is complete. The next step is wiring them into
a real async job system so a browser can upload a PDF and get a report back.

#### 1. `lib/agent.ts` — Claude orchestration loop

Invoke Claude via the Anthropic API with the 12 MCP tools. The agent must:

1. Call `parse_document` → raw text + pages
2. Call `detect_jurisdiction` → confirm ON, fail fast otherwise
3. Call `segment_clauses` → array of clause objects
4. **In parallel batches (critical for 90s target):** for each clause:
   - `classify_clause` → then simultaneously `lookup_statute` + `lookup_tribunal` → then `score_risk`
5. After all clauses: `detect_contradiction` for each known interaction pair
6. `check_missing` once with the set of found clause types
7. **In parallel:** `generate_negotiation` for each clause with score ≥ 4
8. `benchmark_clause` for each clause (fire-and-forget, non-blocking)
9. `generate_report` with all accumulated results

**Parallelise steps 4 and 7 or the pipeline takes 4–6 minutes.** Target: 90s total.

The agent prompt must explicitly instruct Claude to process clauses in parallel batches.

#### 2. `app/api/upload/route.ts` — PDF upload handler

- Accept multipart PDF upload
- Store in Supabase Storage (`leases` bucket)
- Create a job row in `analysis_jobs` table (status: `pending`)
- Kick off `lib/agent.ts` as a background job (fire-and-forget)
- Return `{ job_id }`

#### 3. `app/api/job/[id]/route.ts` — Status polling

- Read `analysis_jobs` row by ID
- Return `{ status, progress_pct, error? }`
- Frontend polls this every 2s until `status === 'complete'`

#### 4. `app/api/report/[id]/route.ts` — Report retrieval

- Read completed report from `analysis_reports` table
- Return full structured report JSON

### Phase 4 — Frontend

After backend API routes work end-to-end:
- `app/page.tsx` → drag-and-drop PDF upload, jurisdiction selector, progress bar
- `app/report/[id]/page.tsx` → full report view: overall score, clause cards, negotiation tips

### Phase 5 — LTB Decisions Corpus

`tribunal_decisions` table is empty. This limits `lookup_tribunal` to keyword fallback only.
Need to acquire LTB case decisions via CanLII API (requires registration). Plan for 2–4 weeks
of incremental acquisition. See CanLII ToS before scraping.

### Phase 6 — Retrieval Validation

Run `scripts/validate_retrieval.py` against known clause/statute pairs to confirm the 0.45
cosine similarity threshold. Adjust if needed before public launch.

---

## File Structure (current state)

```
/
├── CLAUDE.md                        ← Read this. Stack decisions, constraints, commit rules.
├── HANDOFF.md                       ← This file.
├── REQUIREMENTS.md / PRD.md / EXPLAINER.md
├── package.json                     ← Root: Next.js + test dependencies
├── tsconfig.json / jest.config.ts / next.config.ts
├── .env.local                       ← EXISTS (gitignored). All keys set.
├── .env.example                     ← Template
├── app/
│   ├── layout.tsx                   ← Root layout (placeholder)
│   ├── page.tsx                     ← Landing page (PLACEHOLDER — needs full UI)
│   └── api/
│       ├── upload/route.ts          ← PDF upload, job creation, rate limiting (stub)
│       ├── job/[id]/route.ts        ← Job status polling (stub)
│       ├── report/[id]/route.ts     ← Report fetch + share link (stub)
│       └── feedback/route.ts        ← User feedback endpoint
├── lib/
│   ├── supabase.ts                  ← Supabase client (anon key, for Next.js)
│   ├── anthropic.ts                 ← Anthropic API client
│   ├── gemini.ts                    ← Gemini embeddings client (superseded by REST impl in mcp-server)
│   └── rate-limiter.ts              ← In-memory rate limiter (IP-based)
├── mcp-server/
│   ├── package.json                 ← ESM, MCP SDK, uuid, zod, supabase (NO @google/generative-ai)
│   ├── tsconfig.json
│   └── src/
│       ├── start.ts                 ← ENTRY POINT (loads dotenv, then dynamic imports index.ts)
│       ├── index.ts                 ← MCP server: registers all 12 tools
│       ├── types.ts                 ← ClauseType, Clause, Statute, RiskScore, etc.
│       ├── lib/
│       │   ├── supabase.ts          ← Supabase client (service role key)
│       │   └── embeddings.ts        ← embed() via Gemini REST API (gemini-embedding-001, 768-dim)
│       └── tools/
│           ├── parse-document.ts    ← Spawns Python subprocess (parse_pdf.py)
│           ├── detect-jurisdiction.ts
│           ├── segment-clauses.ts
│           ├── classify-clause.ts   ← Updated: rent_payment + dispute_resolution keywords expanded
│           ├── lookup-statute.ts    ← pgvector similarity search + keyword fallback (FIXED)
│           ├── lookup-tribunal.ts   ← pgvector search with 5-year recency preference (FIXED)
│           ├── score-risk.ts        ← Updated: 6 new violation detection patterns
│           ├── detect-contradiction.ts
│           ├── check-missing.ts
│           ├── benchmark-clause.ts
│           ├── generate-negotiation.ts
│           └── generate-report.ts
├── scripts/
│   ├── parse_pdf.py                 ← PyMuPDF + Tesseract OCR. Outputs JSON to stdout.
│   ├── build_corpus.py              ← Fetches Wayback RTA snapshot, embeds via Gemini REST, upserts
│   │                                   JURISDICTION_CODE = "CA-ON". Full 1574-chunk corpus done.
│   ├── _test_parse.py               ← Smoke test: fetch + parse only (no DB writes)
│   ├── validate_retrieval.py        ← Tests pgvector retrieval quality (not yet run in prod)
│   ├── seed_benchmark.ts            ← Pre-seeds 50 benchmark clauses (already run)
│   └── requirements.txt             ← certifi, truststore, pymupdf, pytesseract, requests, etc.
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_corpus_tables.sql    ← statutes, decisions (pgvector), search_statutes(), search_decisions()
│       └── 003_feedback_table.sql
├── .claude/
│   └── settings.json               ← GITIGNORED. MCP server config for Claude Code. Must recreate.
└── __tests__/
    ├── setup.ts
    ├── rate-limiter.test.ts
    ├── api-upload.test.ts
    └── api-job.test.ts
```

---

## Environment Variables

```env
# .env.local (exists locally, gitignored)
ANTHROPIC_API_KEY=          # Set if using Anthropic API directly; Claude Code auth works locally
GEMINI_API_KEY=             # ✅ Set
SUPABASE_URL=               # ✅ Set
SUPABASE_ANON_KEY=          # ✅ Set
SUPABASE_SERVICE_ROLE_KEY=  # ✅ Set
NEXT_PUBLIC_SUPABASE_URL=   # ✅ Set
NEXT_PUBLIC_SUPABASE_ANON_KEY= # ✅ Set
```

The `.env` file at the project root is also present and used by the MCP server
(`start.ts` resolves it as `resolve(__dirname, "../../.env")` from `dist/`).

---

## Quick Environment Check

Run these at the start of a new session to confirm everything is healthy:

```bash
# 1. Confirm you're on the right commit
git log --oneline -5
# Should show 79351bf at top

# 2. MCP server builds clean
cd mcp-server && npm run build && cd ..
# Should exit 0 with no TypeScript errors

# 3. Tests pass
npx jest --passWithNoTests
# Should show all passing

# 4. Check corpus row count
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('statutes').select('id', { count: 'exact', head: true })
  .then(r => console.log('statutes rows:', r.count));
sb.from('clause_comparisons').select('id', { count: 'exact', head: true })
  .then(r => console.log('clause_comparisons rows:', r.count));
"
# Should show: statutes rows: ~1574, clause_comparisons rows: 50
```

---

## Commit History (recent)

```
79351bf  expand classify_clause keyword coverage for rent and dispute clauses
8349b2a  improve score_risk violation detection for 6 clause patterns
a85d9b0  fix build_corpus: use CA-ON jurisdiction code to match tool expectations
714de7c  fix lookup-statute and lookup-tribunal: correct column names and RPC params
86e0cd7  fix parse-document: use fileURLToPath to resolve script path on Windows
86fc493  add 1s throttle between gemini embedding requests
225416e  fix mcp embeddings: switch to gemini-embedding-001 rest api, drop grpc sdk
249df96  fix build_corpus.py: switch gemini embeddings from grpc sdk to rest api
```

---

## Recommended Next Session Starting Point

**Build `lib/agent.ts`** — the Claude orchestration loop — then wire it into the Next.js
API routes (`upload`, `job/[id]`, `report/[id]`).

1. Read `lib/anthropic.ts` (the base Anthropic client) to understand what's already there
2. Read `mcp-server/src/index.ts` to see all 12 tool definitions
3. Read `mcp-server/src/types.ts` for the shared type shapes (Clause, Statute, RiskScore, etc.)
4. Implement `lib/agent.ts` per the orchestration steps in "What to Build Next" above
5. Test on the Ontario Standard Form of Lease (public PDF from ontario.ca) before touching frontend

The MCP server + Supabase corpus are fully ready. The only missing piece is the glue between
a PDF upload and a stored report.
