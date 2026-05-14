# LeaseGuard — Session Handoff

> **For the next Claude Code session.** Read this file first. It tells you exactly where the
> project stands, what has been built, what is next, and every gotcha discovered so far.

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

## Current Status: MCP Server Complete, Frontend Not Started

### ✅ Done & Committed (18 commits on `main`)

| Commit | What |
|--------|------|
| `ef91ecf` | `CLAUDE.md` — stack decisions, architecture, commit conventions |
| `2fb3836–6d06243` | `REQUIREMENTS.md`, `PRD.md`, `EXPLAINER.md` updated |
| `43fcc64` | Project config (`package.json`, `tsconfig.json`, `jest.config.ts`, `.gitignore`, `.env.example`) |
| `9bc60a0` | `mcp-server/package.json` + `mcp-server/tsconfig.json` |
| `17e1301` | Supabase migrations 001, 002, 003 (full schema + pgvector corpus + feedback table) |
| `a3e883d` | Python scripts: `parse_pdf.py`, `build_corpus.py`, `validate_retrieval.py`, `scripts/requirements.txt`, `seed_benchmark.ts` |
| `274dc1c` | Shared libs: `lib/supabase.ts`, `lib/anthropic.ts`, `lib/gemini.ts`, `lib/rate-limiter.ts` |
| `001c3b3` | Next.js API routes: `/api/upload`, `/api/job/[id]`, `/api/report/[id]`, `/api/feedback` |
| `8c4b82a` | Tests: rate limiter (5), upload (5), job (3) |
| `9cedf7d` | Next.js app shell: `app/layout.tsx`, `app/page.tsx` (placeholder), `next.config.ts` |
| `1d2d1cc` | MCP server: `types.ts`, `lib/supabase.ts`, `lib/embeddings.ts` |
| `1fe4d5d` | MCP tools: `parse-document`, `detect-jurisdiction`, `segment-clauses` |
| `7088881` | MCP tools: `classify-clause`, `lookup-statute`, `lookup-tribunal` |
| `be5e06a` | MCP tools: `score-risk`, `detect-contradiction`, `check-missing` |
| `4773c4e` | MCP tools: `benchmark-clause`, `generate-negotiation`, `generate-report` |
| `65a8ea3` | MCP server entry point: `mcp-server/src/index.ts` (wires all 12 tools) |

---

## What Is NOT Built Yet

Work in this exact order (each phase gates the next):

### Phase 1 — Supabase Setup (30 min) 🔴 BLOCKING EVERYTHING
Run the 3 migrations against your actual Supabase project. Nothing else works without this.

```bash
# Install Supabase CLI if not already installed
npx supabase login
npx supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
# OR apply migrations manually in the Supabase SQL editor:
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_corpus_tables.sql
# supabase/migrations/003_feedback_table.sql
```

Also create a `.env.local` from `.env.example` and fill in all values.

### Phase 2 — Python Environment (15 min) 🔴 BLOCKING PARSE
```bash
pip install -r scripts/requirements.txt
# Requires: pymupdf, pytesseract, pillow, requests, google-generativeai, supabase
# Tesseract OCR binary must also be installed on the system
```

### Phase 3 — Build Corpus (2–4 hours, run once) 🔴 BLOCKING RAG
```bash
python scripts/build_corpus.py
# Scrapes Ontario RTA + LTB guidelines, generates Gemini embeddings, upserts to Supabase pgvector
# Requires GEMINI_API_KEY and SUPABASE_* env vars
```

### Phase 4 — Validate Retrieval (30 min)
```bash
python scripts/validate_retrieval.py
# Tests statute retrieval against known clause/statute pairs
# Adjust similarity threshold in lookup-statute.ts if precision is poor
# Current threshold: 0.45 — may need tuning up or down
```

### Phase 5 — Seed Benchmark Corpus (30 min)
```bash
npx tsx scripts/seed_benchmark.ts
# Pre-seeds 50 benchmark clauses across 5 clause types
# Benchmarking feature is invisible until sample_size >= 10 per type
```

### Phase 6 — Agent Orchestration 🔴 HIGHEST CODE VALUE
Wire Claude to call MCP tools dynamically. This is the core product loop.

**File to create:** `lib/agent.ts` (or `app/api/analyze/route.ts`)

The agent should:
1. Call `parse_document` → get raw text
2. Call `detect_jurisdiction` → confirm CA-ON, fail fast if not
3. Call `segment_clauses` → get clause array
4. **In parallel batches:** for each clause call `classify_clause` → then `lookup_statute` + `lookup_tribunal` simultaneously → then `score_risk`
5. After all clauses: call `detect_contradiction` for each known interaction pair
6. Call `check_missing` once with all found clause types
7. **In parallel:** for each high-risk clause (score ≥ 4) call `generate_negotiation`
8. Call `benchmark_clause` for each clause (fire-and-forget, non-blocking)
9. Call `generate_report` with all results

**Key constraint:** Parallelise steps 4 and 7 or the pipeline will take 4–6 minutes.
Target: 90 seconds total for a 20-clause lease.

The Claude agent is invoked via the Anthropic API with MCP tools. See `lib/anthropic.ts`
for the base client. The MCP server runs as a subprocess or Vercel serverless function.

### Phase 7 — Frontend
`app/page.tsx` is currently a placeholder. Needs:
- Upload UI (drag-and-drop PDF, progress indicator)
- Real-time job status polling (calls `/api/job/[id]`)
- Report view (`app/report/[id]/page.tsx` — does not exist yet)
- Clause explorer (expandable list of clauses with risk scores)
- Red flags section (unenforceable clauses highlighted)
- Negotiation points section (counter-language shown on expand)
- Implicit protections panel
- Share link functionality (already wired in `/api/report/[id]`)

### Phase 8 — Pre-launch
- Rate limiting + abuse protection (basic rate limiter exists in `lib/rate-limiter.ts` but needs to be integrated into the upload route)
- Privacy policy page (PIPEDA required — lease PDFs contain PII)
- Legal disclaimer on every report page (required, see CLAUDE.md)
- Vercel deployment config + env vars

---

## File Structure (current state)

```
/
├── CLAUDE.md                        ← Read this. Stack decisions, constraints, commit rules.
├── HANDOFF.md                       ← This file.
├── REQUIREMENTS.md / PRD.md / EXPLAINER.md
├── package.json                     ← Root: Next.js + test dependencies
├── tsconfig.json / jest.config.ts / next.config.ts
├── .env.example                     ← Copy to .env.local, fill in values
├── app/
│   ├── layout.tsx                   ← Root layout (placeholder)
│   ├── page.tsx                     ← Landing page (PLACEHOLDER — needs full UI)
│   └── api/
│       ├── upload/route.ts          ← PDF upload, job creation, rate limiting
│       ├── job/[id]/route.ts        ← Job status polling
│       ├── report/[id]/route.ts     ← Report fetch + share link
│       └── feedback/route.ts        ← User feedback endpoint
├── lib/
│   ├── supabase.ts                  ← Supabase client (anon key, for Next.js)
│   ├── anthropic.ts                 ← Anthropic API client
│   ├── gemini.ts                    ← Gemini embeddings client
│   └── rate-limiter.ts              ← In-memory rate limiter (IP-based)
├── mcp-server/
│   ├── package.json                 ← ESM, MCP SDK, uuid, zod, supabase, gemini
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                 ← MCP server entry point (wires all 12 tools)
│       ├── types.ts                 ← ClauseType, Clause, Statute, Decision, RiskScore, NegotiationPoint
│       ├── lib/
│       │   ├── supabase.ts          ← Supabase client (service role key, for MCP server)
│       │   └── embeddings.ts        ← Gemini embed() wrapper (768-dim, text-embedding-004)
│       └── tools/
│           ├── parse-document.ts    ← Spawns Python subprocess (parse_pdf.py)
│           ├── detect-jurisdiction.ts ← Regex + postal code + act name voting
│           ├── segment-clauses.ts   ← Clause boundary detection + cross-reference extraction
│           ├── classify-clause.ts   ← Keyword-based clause type classification
│           ├── lookup-statute.ts    ← pgvector similarity search + keyword fallback
│           ├── lookup-tribunal.ts   ← pgvector search with 5-year recency preference
│           ├── score-risk.ts        ← Heuristic risk scoring (statute-grounded violations)
│           ├── detect-contradiction.ts ← Known pair detection + generic grant/restrict check
│           ├── check-missing.ts     ← Ontario required protection checklist
│           ├── benchmark-clause.ts  ← Percentile comparison + PII scrubbing + pool contribution
│           ├── generate-negotiation.ts ← Counter-language templates per clause type
│           └── generate-report.ts   ← Weighted risk assembly + executive summary
├── scripts/
│   ├── parse_pdf.py                 ← PyMuPDF + Tesseract OCR. Outputs JSON to stdout.
│   ├── build_corpus.py              ← Scrapes RTA + LTB docs, embeds, upserts to Supabase
│   ├── validate_retrieval.py        ← Tests pgvector retrieval quality
│   ├── seed_benchmark.ts            ← Pre-seeds 50 benchmark clauses
│   └── requirements.txt             ← Python deps (pymupdf, pytesseract, etc.)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql   ← leases, clauses, contradictions, negotiation_points,
│       │                               tool_call_logs, reports, feedback tables
│       ├── 002_corpus_tables.sql    ← statutes, decisions (pgvector), clause_comparisons,
│       │                               search_statutes() and search_decisions() SQL functions
│       └── 003_feedback_table.sql   ← feedback table (if not already in 001)
└── __tests__/
    ├── setup.ts
    ├── rate-limiter.test.ts
    ├── api-upload.test.ts
    └── api-job.test.ts
```

---

## Known Issues & Gotchas

### 1. `extraction_method` mismatch (FIXED)
Python script outputs `"text"` or `"ocr"`. The original TypeScript interface incorrectly
checked for `"pdfplumber" | "pypdf2"`. This was fixed in commit `1fe4d5d` — the interface
now uses `"text" | "ocr" | "unknown"`.

### 2. `currentStart` tracking in `segment-clauses.ts`
The `charOffset` is correctly maintained via `lineWithNewline.length` increments.
`currentStart` is set to `charOffset` at each boundary. The `char_end` in `flushCurrent()`
uses `currentStart + rawText.length` which is an approximation (trimmed join != original
positions) — acceptable for display purposes but do not rely on it for precise byte offsets.

### 3. Similarity threshold (0.45) needs validation
The 0.45 cosine similarity floor is a starting estimate. Run `validate_retrieval.py`
against known clause/statute pairs before going to production. Adjust in `lookup-statute.ts`
and `lookup-tribunal.ts` if false positives appear.

### 4. Benchmark feature is invisible without seeded data
`benchmark_clause` returns `sufficient_data: false` until there are ≥ 10 rows per
clause type in `clause_comparisons`. Run `seed_benchmark.ts` before any demo.

### 5. CanLII scraping — check ToS first
`build_corpus.py` references CanLII for LTB decisions. Their bulk scraping ToS requires
review. Use their API (requires registration) rather than HTML scraping. Budget 2–4 weeks
of corpus acquisition time before the tribunal decision RAG is meaningful.

### 6. Python subprocess path resolution
`parse-document.ts` resolves the Python script path using `import.meta.url`:
```ts
path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..", "scripts", "parse_pdf.py")
```
This works when the MCP server runs from `mcp-server/dist/` (compiled). In dev with `tsx`,
`import.meta.url` points to `mcp-server/src/tools/` — the path still resolves correctly.
If deploying to Vercel, verify the script path is accessible (Vercel does not support
child_process in Edge Runtime — use Node.js runtime only).

### 7. No `@types/uuid` needed — `uuid` v11 ships its own types

### 8. Rate limiter is in-memory only
`lib/rate-limiter.ts` uses a `Map` in process memory. On Vercel serverless, each cold
start gets a fresh instance — rate limiting does not persist across invocations. For
production, replace with Redis (Upstash is the simplest Vercel-compatible option).

### 9. Language constraint — never say "illegal"
Ontario RTA: problematic clauses are **void and unenforceable**, not "illegal". All
output must use "potentially unenforceable" or "may not be enforceable." This is
enforced in the tool prompts and report generator. Do not regress on this.

---

## Environment Variables Required

```env
# .env.local (never commit)
ANTHROPIC_API_KEY=          # Claude agent — get from console.anthropic.com
GEMINI_API_KEY=             # Embeddings only — get from aistudio.google.com
SUPABASE_URL=               # From Supabase project settings
SUPABASE_ANON_KEY=          # From Supabase project settings → API
SUPABASE_SERVICE_ROLE_KEY=  # From Supabase project settings → API (keep secret)
NEXT_PUBLIC_SUPABASE_URL=   # Same as SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Same as SUPABASE_ANON_KEY
```

---

## How to Run Locally

```bash
# 1. Install root dependencies
npm install

# 2. Install MCP server dependencies
cd mcp-server && npm install && cd ..

# 3. Install Python dependencies
pip install -r scripts/requirements.txt

# 4. Copy and fill env vars
cp .env.example .env.local
# Edit .env.local with your actual keys

# 5. Run Next.js dev server
npm run dev

# 6. Test MCP server standalone (optional)
cd mcp-server && npm run dev
```

---

## Commit Convention (from CLAUDE.md)

- One commit per logical concern
- Imperative mood, lowercase, no period
- Push after every 2–3 commits or at end of session
- Never `git add .` — always stage specific files
- Branch naming: `feature/`, `fix/`, `chore/`, `corpus/`

---

## Recommended Next Session Starting Point

**Start here:** Run the Supabase migrations (Phase 1 above). Then create `lib/agent.ts`
— the Claude orchestration loop that calls MCP tools. This is the most impactful work
remaining and unlocks end-to-end testing of the full pipeline.

Test it against the Ontario Standard Form of Lease (publicly available PDF from
ontario.ca) to validate the entire tool chain before building the frontend.
