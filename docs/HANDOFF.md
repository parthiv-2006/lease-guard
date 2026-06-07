# LeaseGuard — Session Handoff

> **Read this first at the start of every session.**
> Type "end session" when done — Claude will update this file, push commits, and back up.
> This file is gitignored — local only. Remote backup pushed to `handoff-backup` branch at every session end.

> Stack: Next.js + Claude MCP + Supabase pgvector + Gemini embeddings + Groq chat/copilot (all REST only)
> State: **FULLY DEPLOYED + SECURITY HARDENED + ALL P0 BLOCKERS CLEARED** — 27-issue audit done, RLS/rate-limit migrations applied, NEXT_PUBLIC_BASE_URL set. No remaining blockers.
> First command: `cd mcp-server && npm run build && cd .. && npx tsc --noEmit`

---

## Active Right Now

(nothing — session cleanly closed 2026-06-07, session 27)

---

## Launch Blockers

**Nothing ships until all P0 items are done.**

### P0 — Blocks any public URL

- [x] **Real `ANTHROPIC_API_KEY`** — set in `.env`. ✅ Resolved 2026-05-27.
- [x] **Deploy MCP server to Railway** — live at `leaseguard-mcp-production.up.railway.app`. `MCP_SERVER_URL` set on Vercel. ✅ Resolved 2026-05-29.
- [x] **Supabase production redirect URLs** — `https://leaseguard-sigma.vercel.app/auth/callback` added. ✅ Resolved 2026-05-29.
- [x] **RLS migrations 011 + 012 applied** — RLS enabled on all user-data tables; `api_rate_limits` table + `check_and_increment_rate_limit()` RPC created. ✅ Resolved 2026-05-30.
- [x] **GitHub Secrets for E2E** — `E2E_LEASE_FAULTY` and `E2E_LEASE_COMPLIANT` added. ✅ Resolved 2026-05-30.
- [x] **Set `NEXT_PUBLIC_BASE_URL` env var** — `NEXT_PUBLIC_BASE_URL=https://leaseguard-sigma.vercel.app` set in Vercel. Sitemap, robots.txt, and share links now use the correct production URL. ✅ Resolved 2026-05-30.

### P1 — Required before public launch

*(all P1 items resolved)*

### P2 — Post-launch

- Expand LTB corpus further (currently 84 decisions). Run `node scripts/seed_decisions_exa.mjs` with new queries; `dispute_resolution` and `rent_increase` need different strategy (Exa returns guidance docs, not decisions).
- CanLII Playwright scraper unblocked from Cloudflare — may work from residential IP (`scripts/seed_decisions_playwright.py --headed`)

---

## Live Infrastructure

| Service | URL | Platform | Status |
|---------|-----|----------|--------|
| Frontend + API routes | https://leaseguard-sigma.vercel.app | Vercel (free) | ✅ Live |
| MCP Server | https://leaseguard-mcp-production.up.railway.app | Railway (free $5/mo credit) | ✅ Always-on |
| Database + Storage | xtigqcoogbraorwhmshw.supabase.co | Supabase (free) | ✅ Running |
| UptimeRobot monitors | — | UptimeRobot (free) | ✅ Active (2 monitors, 5-min interval) |

**Health endpoints:**
- `GET https://leaseguard-sigma.vercel.app/api/job/health` — Vercel keepalive
- `GET https://leaseguard-mcp-production.up.railway.app/health` — Railway keepalive

---

## Userflow Test Results (2026-05-22 — ebf8bf97-563d-4b7d-859f-8ecf76905335)

Full end-to-end test against `highlyFaultyLease.pdf` (9.5 Critical). All 8 panels and highlights verified.

| Panel | Result | Notes |
|-------|--------|-------|
| Overview | ✅ | Risk gauge 9.5 Critical, executive summary renders |
| Red Flags | ✅ | Correctly highlights all critical, high, and medium risk clauses |
| Clause Explorer | ✅ | Detailed breakdown of Ontario lease clauses |
| Feedback bar | ✅ | POSTs to `/api/feedback`, shows confirmation message |
| Negotiation Guide | ✅ | Negotiation guide shows key action items |
| Negotiation Copilot | ✅ | Modal opens, compiles draft proposals using tone options |
| Missing Protections | ✅ | Identifies missing mandatory requirements |
| Contradictions | ✅ | Renders contradictory clauses side-by-side |
| Sources | ✅ | 46 statute sections with full body text |
| Agent Trace — Gantt | ✅ | 67 tool calls, Gantt timeline renders lanes |
| Agent Trace — List | ✅ | Lists all calls including `benchmark_clause` |
| PDF Viewer | ✅ | 3 pages rendered, highlights persistent risk layers with no index drift |

---

## What This Project Is

LeaseGuard is an AI agent that reads Ontario residential lease PDFs, retrieves real statute
and tribunal text via RAG, and produces a grounded risk analysis with negotiation guidance.
Every legal claim must be backed by a retrieved source. The agent (Claude) calls MCP tools.
The LLM never asserts legal facts from training knowledge alone.

---

## Repository

- **GitHub:** https://github.com/parthiv-2006/lease-guard
- **Branch:** `main`
- **Backup branch:** `handoff-backup` (force-pushed at every session end)
- **Local path:** `C:\Users\Parthiv Paul\Documents\leaseguard`
- **Latest commit:** `a773fbd`

---

## Phase Completion Status

| Phase | What | Status |
|-------|------|--------|
| 1 | RTA statute corpus (pgvector) | ✅ 2372 chunks (RTA granular subsections + O.Reg.516/06 + O.Reg.517/06 + Standard Form) |
| 2 | MCP server — all 12 tools | ✅ Complete |
| 3 | Agent pipeline + API routes | ✅ Complete |
| 4 | Frontend — all 8 report panels | ✅ Complete |
| 5 | Legal accuracy — Layer 1 corpus | ✅ Regulations + s.12 seeded, validate_retrieval 7/7 (100%) |
| 5b | Legal accuracy — Layer 2.1 multi-query retrieval | ✅ 3 queries/clause, RRF merge, RETRIEVAL_QUERY task type fix |
| 5c | Legal accuracy — Layer 2.2 hybrid BM25+vector | ✅ Migration 005 applied; hybridSearch() with PGRST202 fallback |
| 5d | Legal accuracy — Layer 3 scoring (3.1–3.4) | ✅ Citation, compliance check, pattern caps, enforceability gate |
| 5e | Legal accuracy — Layer 4.1 LLM contradiction detection | ✅ SDK-based Haiku call, confidence gate 0.65, regex fallback. |
| 5f | Legal accuracy — Layer 5.1/5.2 eval harness | ✅ 30-case labelled suite, eval-accuracy.mjs, 100% precision/recall/FP. |
| 6 | LTB decisions corpus | ✅ 84 decisions seeded (46 manual + 38 real CanLII via Exa REST API fallback) |
| 7 | Deployment | ✅ Vercel (frontend) + Railway (MCP server) — fully live 2026-05-29 |
| 8 | Real PDF viewer | ✅ pdfjs-dist v5, canvas+text layer, clause highlighting with normAndMap mapping |
| 9 | UX features | ✅ Negotiation Copilot (template fallback), FeedbackBar dropdown, Live Gantt Trace Timeline |
| 10 | PIPEDA compliance | ✅ Privacy policy, upload consent gate, sign-up notice, DELETE erasure, dashboard delete, report footer |
| 11 | Security / pre-launch polish (Tier 2) | ✅ Rate limiting on all 4 API routes. Terms of Service page (/terms, 12 sections). Inline 4-state delete confirmation. |
| 12 | SEO / UX polish (Tier 3+4) | ✅ SVG favicon, OG+Twitter meta, opengraph-image.tsx, branded 404+error pages, sitemap.ts+robots.ts, per-page metadata |
| 13 | Interactive RAG Chat UI | ✅ "Ask Your Lease" powered by Groq llama-3.3-70b SSE streaming. |
| 14 | E2E test suite + CI pipeline | ✅ 48 Playwright tests. GitHub Actions CI: 4 jobs — typecheck → test → build → e2e. |
| 15 | UI polish + panel empty states + wide-screen layout | ✅ Empty states on all 6 panels. Sidebar 300px, content 1400px. |
| 16 | Pre-launch hardening | ✅ DB-backed rate limiting, 3-min timeout, retry endpoint + button, dashboard all-status view. |
| 17 | DB-backed chat rate limiting | ✅ 50/day·15/hr auth · 10/day·5/hr guest · 30/lease per-lease. `chat_requests` table. |
| 18 | Recruiter "wow" features (F1–F5) | ✅ F1 live stats bar · F2 per-report OG share card · F3 RAG drill-down in trace · F4 trace replay · F5 landing hero upgrade |

---

## Current State

### ✅ Fully Working End-to-End

Complete pipeline smoke-tested with `faultyLease.pdf` and `compliantLease.pdf`:
PDF upload → Supabase Storage → parse → jurisdiction → segment → parallel clause analysis
→ contradiction detection → missing protections → negotiation → report assembled → all 8 panels render.

### Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| Supabase migrations | **10 of 10 applied (001–010)** | 009: upload_ip column + indexes. 010: chat_requests table. Both APPLIED 2026-05-26 ✅ |
| Supabase Storage | `leases` bucket created | Private, 25MB limit, PDF only |
| Supabase auth redirect | `https://leaseguard-sigma.vercel.app/auth/callback` added | ✅ Added 2026-05-29 |
| `.env` file | Present at project root | All keys set |
| Tesseract OCR | Installed locally | `C:\Program Files\Tesseract-OCR`, in PATH |
| Railway Docker image | node:22-slim + Python + Tesseract | Dockerfile at project root |
| RTA corpus | **2372 chunks** in `statutes` table | RTA granular subsections + O.Reg.516/06 + O.Reg.517/06 + Standard Form |
| Benchmark corpus | 50 rows in `clause_comparisons` | Seeded |
| Tribunal corpus | **84 rows** in `tribunal_decisions` | 46 manual + 38 real CanLII decisions via Exa REST API |

---

## Known Issues

> Resolved issues are archived in `docs/RESOLVED.md`. When you fix an issue here, move it there with date + commit.

### #2 — Negotiation Panel Shows "Clause 1", "Clause 2" for Old Reports

**Symptom:** Old reports show "Clause 1", "Clause 2" instead of real clause type names.
**Root cause:** Reports before commit `26333fc` don't have `clause_type` in `negotiation_points`.
**Fix:** Works for all new uploads. Old reports not worth backfilling.

---

## Critical Gotchas

### [PERMANENT] #1 — Gemini gRPC SSL fails on Windows — always use REST

Both `@google/generative-ai` (npm) and `google-generativeai` (Python) use gRPC which has
its own BoringSSL stack ignoring Windows trust stores. Every embedding call fails.
**Fix:** `embeddings.ts` and `build_corpus.py` call Gemini REST API directly. Never reintroduce the SDK.

---

### [PERMANENT] #2 — Gemini model is `gemini-embedding-001`, not `text-embedding-004`

`text-embedding-004` returns 404. Always pass `outputDimensionality: 768` to match DB schema.
REST endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`

---

### [PERMANENT] #3 — ontario.ca is a React SPA — use Wayback Machine

`https://www.ontario.ca/laws/statute/06r17` returns a JS shell. Use Wayback Machine URL for fetching.
ontario.ca URL stored in DB for citation; Wayback URL used only for fetching.

---

### [PERMANENT] #4 — Windows Python SSL — `truststore` needed

Python on Windows doesn't trust government CAs. `build_corpus.py` uses `truststore.inject_into_ssl()`.
This fixes `requests` but NOT gRPC. See #1.

---

### [PERMANENT] #5 — `@google/generative-ai` removed from mcp-server — do not reinstall

Removed when switching to REST. `package.json` does not list it. Do not add it back.

---

### [PERMANENT] #6 — ESM dotenv ordering — `start.ts` must be the entry point

Static `import` statements in ESM are hoisted. Entry point is always `mcp-server/dist/start.js`.
`start.ts` loads dotenv then dynamic-imports `index.js`.

---

### [PERMANENT] #7 — Never say "illegal" — always "potentially unenforceable"

Ontario RTA: problematic clauses are void and unenforceable, not illegal. All prompts,
tool outputs, and UI copy must use "potentially unenforceable". Enforced in tool prompts.

---

### [PERMANENT] #8 — Jurisdiction code must be `"CA-ON"` not `"ON"`

All `statutes` rows have `jurisdiction_code = 'CA-ON'`. If lookups return empty, check this first.

---

### [PERMANENT] #9 — `lookup-statute.ts` field names must match DB schema exactly

DB columns: `full_text` (not `text`), `corpus_version` (not `last_verified`).
RPC param: `match_threshold` (not `similarity_threshold`). Wrong names → silent 400 errors.

---

### [PERMANENT] #10 — score-risk.ts is deterministic TypeScript regex, not an LLM

There is no LLM prompt in `score_risk`. It is pure TypeScript: regex patterns, compliance checks, and score math.
All improvements must be coded directly. Key functions: `detectStatutoryViolations()`, `checkStatuteCompliance()`,
`applyCompliantPatterns()`, `scoreClause()`.

---

### [PERMANENT] #11 — Corpus chunk numbering uses "." creating ambiguity

`_chunk_section` numbers chunks as `"106.1"`, `"106.31"` etc. (chunk index).
`"12.1"` is a separate RTA section, NOT chunk 1 of s.12.

---

### [PERMANENT] #21 — Gemini taskType: RETRIEVAL_QUERY for lookup, RETRIEVAL_DOCUMENT for corpus

- `"RETRIEVAL_DOCUMENT"` — use when embedding corpus rows (build_corpus.py, build_regulations.py)
- `"RETRIEVAL_QUERY"` — use when embedding search queries at runtime (lookup-statute.ts, lookup-tribunal.ts)

Default in `embeddings.ts` is `RETRIEVAL_QUERY`. Never change the default back to `RETRIEVAL_DOCUMENT`.

---

### [PERMANENT] #22 — Multi-query retrieval: 3 queries per clause, RRF merge (k=60)

`lookup-statute.ts` and `lookup-tribunal.ts` generate 3 queries per clause.
Blended score: `0.7 * (rrfScore / maxRRF) + 0.3 * maxCosine`, k=60, top 5 returned.
If you add a new ClauseType, add entries to `CLAUSE_TYPE_QUERY_PHRASES` and `DECISION_TYPE_QUERY_PHRASES`.

---

### [ACTIVE] #12 — Similarity threshold tuned to 0.60 — validate after next corpus changes

Hybrid BM25+vector threshold: 0.55. Re-run `python scripts/validate_retrieval.py` after any corpus changes.

---

### [PERMANENT] #23 — Claude Code OAuth token auth: `authToken + apiKey: null` (fixed session 21)

OAuth tokens (`sk-ant-oat01-...`) require `Authorization: Bearer` — NOT `x-api-key`.
Three compounding issues that all must be fixed together:

1. **Wrong constructor param** — `new Anthropic({ apiKey: oauthToken })` sends it as `x-api-key` → 401.
   Fix: use `authToken` instead.
2. **Env var collision** — SDK auto-reads `ANTHROPIC_API_KEY` from env as the default for `apiKey`,
   even when you pass `authToken`. Must pass `apiKey: null` to suppress it, otherwise SDK sends both
   `x-api-key` (from env) AND `Authorization: Bearer`, and the invalid `x-api-key` wins → 401.
3. **Model restriction** — Claude Code OAuth only has access to Claude 4.x models.
   `claude-3-5-haiku-20241022` returns 404. Use `claude-haiku-4-5-20251001`.

**Correct pattern** (used in `detect-contradiction.ts` and `lib/anthropic.ts`):
```typescript
const isOAuth = token.startsWith("sk-ant-oat");
const client = isOAuth
  ? new Anthropic({ authToken: token, apiKey: null, timeout: MS })
  : new Anthropic({ apiKey: token, timeout: MS });
```

---

### [PERMANENT] #24 — pdfjs-dist v5: worker must be loaded from CDN or copied to /public

`pdf-viewer.tsx` sets `GlobalWorkerOptions.workerSrc` to the unpkg CDN URL for `pdfjs-dist@5.x`.
Do NOT use `react-pdf` or `pdfjs-dist/webpack` wrappers — they break Next.js App Router.

---

### [PERMANENT] #25 — Windows dev SSL: `UNABLE_TO_VERIFY_LEAF_SIGNATURE` for Supabase

`instrumentation.ts` sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` in non-production.
Runs at Next.js startup before any routes execute. Vercel (Linux, `NODE_ENV=production`) is unaffected.

---

### [ACTIVE] #14 — CanLII API key pending

Registered 2026-05-18. Once received: add `CANLII_API_KEY` to `.env` and `.env.local`.

---

### [PERMANENT] #15 — `detect_contradiction` input schema expects `{ id, text, type }`

Zod schema requires `{ id: string, text: string, type: string }`.

---

### [PERMANENT] #20 — `is_potentially_unenforceable` requires a MANDATORY_PROVISION_VIOLATION

Only specific `violation_type` values may set `is_potentially_unenforceable: true` (per RTA s.3).
Unusual language or high risk score alone is NOT sufficient.

---

### [PERMANENT] #16 — Report API fetches 4 tables in parallel

`app/api/report/[id]/route.ts` fetches `reports`, `leases`, `clauses`, and `tool_call_logs` in parallel.
`_tool_call_logs` powers the Agent Trace Panel — do not remove that fetch.

---

### [PERMANENT] #17 — `.env` not `.env.local` is used by the MCP server

`start.ts` resolves `../../.env` from `mcp-server/dist/`. Next.js reads `.env.local`.
Both files must exist with the same values.

---

### [PERMANENT] #26 — Next.js Dev Server Retains Old Env Vars

Restart `npm run dev` after modifying `.env` or `.env.local`.

---

### [PERMANENT] #27 — benchmark_clause Excluded from Gantt Trace Timeline

Filtered out of the Gantt chart. Switch to "List" view to verify benchmark_clause calls in E2E tests.

---

### [PERMANENT] #31 — AI safety: all user text must pass through lib/ai-safety.ts before LLM calls

`lib/ai-safety.ts` — shared safety utility. Three exports used across routes:
- `detectPromptInjection(text)` — 25-pattern detector; returns `{ blocked, reason }`. Call before any LLM call. Return 400 if blocked.
- `sanitizeChatMessage(text)` — strips null bytes, control chars, LLM token delimiters, collapses newlines. Apply to all free-form user messages.
- `sanitizeName(text)` — strips newlines, angle brackets, backticks; max 120 chars. Apply to all name fields embedded in prompts.
- `CHAT_SCOPE_GUARD` — prepend to system prompts that accept user free-text. Restricts scope to lease/RTA topics and instructs model to resist jailbreaks.
Do NOT embed raw user input in any LLM system prompt without sanitizing first.

---

### [PERMANENT] #32 — Negotiation Copilot uses Groq JSON mode, NOT Anthropic tool_use

`app/api/negotiation/generate/route.ts` — migrated from Anthropic `claude-3-5-haiku-20241022` with `tool_choice` to Groq `llama-3.3-70b-versatile` with `response_format: { type: "json_object" }` (2026-05-27).
JSON schema described in system prompt; response parsed + validated field-by-field before use.
Template fallback (`generateTemplateProposal`) runs if Groq returns 4xx/5xx, times out, or returns malformed JSON.
Do NOT reintroduce `@anthropic-ai/sdk` to this route.

---

### [PERMANENT] #28 — Chat uses Groq (Llama 3.3 70B), NOT Gemini or Claude

`app/api/chat/[leaseId]/route.ts` — migrated from `gemini-2.0-flash` to Groq `llama-3.3-70b-versatile` (2026-05-27).
Reason: Gemini free tier (1,500 RPD) was exhausted by embedding calls in the analysis pipeline, leaving no quota for chat.
Groq free tier: 14,400 RPD / 30 RPM — no quota conflicts.
API: OpenAI-compatible (`https://api.groq.com/openai/v1/chat/completions`), uses `Authorization: Bearer` header.
Roles: standard OpenAI format (`"user"` / `"assistant"`) — no role conversion needed unlike Gemini.
Embeddings: still use `gemini-embedding-001` (1 call per chat message — negligible quota impact).
Do NOT reintroduce `@anthropic-ai/sdk` or Gemini generate calls to this route.

---

### [PERMANENT] #29 — DB-backed rate limiting: leases table counts, not in-memory store

`app/api/upload/route.ts` uses `checkDbUploadRateLimit()` from `lib/upload-rate-limit.ts`.
Limits: auth users 5/day by `user_id`, guests 3/day by `upload_ip`.
Migration 009 adds `upload_ip` column. Do NOT revert to `checkRateLimit()` from `rate-limiter.ts` for uploads — it resets on every Vercel cold start.

---

### [PERMANENT] #30 — Analysis timeout: 3 minutes, retryable via POST /api/job/[id]/retry

`runLeaseAnalysis` wraps the pipeline in `Promise.race` with 180s timeout.
If timeout fires: writes `status="failed"` to DB, emits SSE error event.
Pipeline step 14 (mark complete) has `.neq("status","failed")` guard to prevent race overwrite.
Retry endpoint blocks `not_a_lease` / `wrong_jurisdiction` errors (file was deleted on those failures).

---

### [PERMANENT] #33 — Railway Docker: node:22-slim required, NOT node:20-slim

Node 20 lacks native WebSocket support required by the Supabase JS client — app crashes on startup and /health never becomes reachable. Always use `node:22-slim` in the Dockerfile (both builder and runtime stages).

---

### [PERMANENT] #34 — @anthropic-ai/sdk must be in mcp-server/package.json

The SDK is used by `detect-contradiction.ts`. In Docker (Railway), only `mcp-server/package.json` deps are installed — the root `node_modules` is NOT available. If it's missing from `mcp-server/package.json`, the build fails with TS2307. Current version: `^0.39.0`.

---

### [PERMANENT] #35 — All imports must be at the top of each file (no mid-file imports)

TypeScript with `"module": "NodeNext"` can fail to resolve mid-file `import` declarations. Always place all `import` statements at the top of the file, before any other code. Discovered when `import Anthropic` was placed after function definitions in `detect-contradiction.ts`.

---

## Data Shape Reference

### What `/api/report/[id]` Returns (flat shape)

```json
{
  "lease_id": "uuid",
  "overall_risk_score": 5.2,
  "overall_risk_level": "medium",
  "executive_summary": "...",
  "red_flags": [...],
  "contradictions": [...],
  "missing_protections": [...],
  "negotiation_points": [...],
  "sources": [...],
  "_lease": { "id", "uploaded_at", "file_path", "property_address", "property_city", ... },
  "_clauses": [ { "id", "clause_number", "raw_text", "primary_type", "risk_score", "risk_level",
                  "is_potentially_unenforceable", "plain_english_explanation", "statutory_violations",
                  "analysis_confidence", "suggested_compliant_language" } ],
  "_tool_call_logs": [ { "id", "tool_name", "sequence_num", "duration_ms", "success", "called_at" } ],
  "pdf_url": "https://...supabase.co/storage/...  (1-hour signed URL)"
}
```

---

## Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...       # Claude agent — OAuth token (sk-ant-oat01-...) works via authToken+apiKey:null pattern. See Gotcha #23.
GEMINI_API_KEY=AIzaSy...           # Embeddings only (gemini-embedding-001, REST only). Chat/negotiation uses Groq.
GROQ_API_KEY=gsk_...               # Chat (Ask Your Lease) + Negotiation Copilot. llama-3.3-70b-versatile, free tier 14,400 RPD. REQUIRED.
SUPABASE_URL=https://xtigqcoogbraorwhmshw.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://xtigqcoogbraorwhmshw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
CANLII_API_KEY=                    # PENDING — registered 2026-05-18
MCP_SERVER_URL=https://leaseguard-mcp-production.up.railway.app  # Set on Vercel. Switches mcp-client.ts to SSE transport.
```

**On Vercel (production):** All of the above except `NEXT_PUBLIC_BASE_URL` (still needs setting).
**On Railway (MCP server):** `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV=production`.

Supabase project ID: `xtigqcoogbraorwhmshw`

---

## Quick Health Check

```bash
# 1. MCP server builds clean
cd mcp-server && npm run build && cd ..

# 2. TypeScript clean
npx tsc --noEmit

# 3. Unit tests (156/156 expected)
npm test

# 4. Accuracy eval (30/30 expected, exit 0)
node scripts/eval-accuracy.mjs

# 5. Live health checks
curl https://leaseguard-sigma.vercel.app
curl https://leaseguard-mcp-production.up.railway.app/health
# Expected: {"status":"ok"}

# 6. Corpus row counts
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('statutes').select('id', { count: 'exact', head: true }).then(r => console.log('statutes:', r.count));
sb.from('tribunal_decisions').select('id', { count: 'exact', head: true }).then(r => console.log('tribunal_decisions:', r.count));
"
# Expected: statutes: ~2372, tribunal_decisions: 84
```

---

## File Structure

```
/
├── CLAUDE.md                        ← Project instructions + pre-build protocol
├── README.md
├── Dockerfile                       ← Multi-stage: node:22-slim builder + runtime w/ Python + Tesseract
├── railway.toml                     ← Railway deploy config: DOCKERFILE builder, /health check
├── fly.toml                         ← Unused (switched to Railway)
├── instrumentation.ts               ← Disables TLS verification in dev (Windows SSL fix)
├── playwright.config.ts             ← E2E config: chromium, webServer auto-start
├── e2e/
│   ├── landing.spec.ts              ← 8 tests
│   ├── static-pages.spec.ts         ← 12 tests
│   ├── report.spec.ts               ← 15 tests
│   └── chat.spec.ts                 ← 13 tests
├── docs/
│   ├── HANDOFF.md                   ← This file. Gitignored.
│   ├── RESOLVED.md                  ← Archive of all fixed issues.
│   ├── LEGAL_ACCURACY_ROADMAP.md
│   ├── CORPUS_ENHANCEMENT_PLAN.md
│   └── ARCHITECTURE.md
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     ← Landing + upload + processing screen
│   ├── report/[id]/page.tsx         ← Report shell + normaliseApiResponse()
│   ├── components/
│   │   ├── types.ts
│   │   ├── shared.tsx
│   │   ├── panels.tsx
│   │   ├── pdf-viewer.tsx
│   │   ├── trace-timeline.tsx
│   │   └── lease-chat.tsx
│   └── api/
│       ├── chat/[leaseId]/route.ts
│       ├── upload/route.ts          ← waitUntil() keeps Lambda alive after 202
│       ├── job/[id]/route.ts
│       ├── job/[id]/retry/route.ts
│       ├── report/[id]/route.ts
│       ├── stream/[id]/route.ts
│       ├── pdf-url/[id]/route.ts
│       └── feedback/route.ts
├── lib/
│   ├── agent.ts                     ← 14-step pipeline, 3-min timeout
│   ├── mcp-client.ts               ← stdio OR SSEClientTransport (auto-selects on MCP_SERVER_URL)
│   └── [other lib files]
├── mcp-server/
│   ├── package.json                 ← includes @anthropic-ai/sdk ^0.39.0 (required for Railway build)
│   └── src/
│       ├── start.ts                 ← ENTRY POINT
│       ├── index.ts                 ← SSE server + /health endpoint
│       └── tools/                  ← 12 tools
├── scripts/
│   ├── build_corpus.py / build_regulations.py
│   ├── validate_retrieval.py        ← 7/7 (100%)
│   ├── eval-accuracy.mjs            ← 30/30 PASS
│   └── requirements.txt
└── supabase/migrations/             ← 001–012, all applied
```

---

## Recommended Next Steps

1. **Set `NEXT_PUBLIC_BASE_URL`** on Vercel — `https://leaseguard-sigma.vercel.app`. Last remaining P0; unblocks correct sitemap/robots URLs and share-link generation.

2. **Verify negotiation/generate rate limiter in production** — the route now calls `checkDbRateLimit` which uses the `check_and_increment_rate_limit()` RPC (migration 012). Confirm it returns 200 on first call and 429 after 10 calls from the same IP.

3. **Expand LTB corpus** — add more decisions via `seed_decisions_manual.py` (currently 84 rows). Target 150+.

4. **Custom domain** — point `leaseguard.ca` (or similar) at Vercel. Update `NEXT_PUBLIC_BASE_URL` and Supabase redirect URLs when done.

---

## Session Log

| Date | First commit | What was done |
|------|-------------|---------------|
| 2026-05-16 | — | Phase 1: RTA corpus built (1574 chunks via Gemini REST) |
| 2026-05-17 | — | Phase 2+3: All 12 MCP tools + agent pipeline + API routes. 48 tests passing. |
| 2026-05-17 | — | Phase 4: Full frontend — all 8 panels wired to real API |
| 2026-05-18 | 26333fc | Smoke tests ×3: fixed Storage, RPC, contradiction schema, normaliseApiResponse. |
| 2026-05-18 | 691c3b9 | Legal accuracy: fixed score-risk false positive, seeded 634 RTA subsection rows (1574→2196) |
| 2026-05-19 | 2a0357a | Seeded O.Reg.516/06 + O.Reg.517/06 + Standard Form (2196→2372) |
| 2026-05-19 | 4c9a812 | score-risk 3.1–3.4: citation, compliance-first check, compliantLease: 3.3→2.2, 0 FP |
| 2026-05-19 | f9e5343 | ROADMAP 2.1: multi-query retrieval + RRF. Fixed RETRIEVAL_DOCUMENT→RETRIEVAL_QUERY bug. |
| 2026-05-19 | 79acfc5 | ROADMAP 4.1: LLM contradiction detection. Anthropic SDK, tool_choice, confidence 0.65. |
| 2026-05-20 | 7dce980 | Migration 005 applied. Seeded s.12. Retrieval 6/7→7/7. |
| 2026-05-20 | 2d3aecc | Property address extraction. extractLeaseAddress() + migration 006. |
| 2026-05-20 | 9246847 | Eval harness: 15-case labels.json + eval-accuracy.mjs. 15/15 PASS. |
| 2026-05-20 | 733fe0f | Negotiation Copilot, FeedbackBar dropdown, docs consolidated. |
| 2026-05-20 | be08a41 | Live Execution Trace Timeline (Gantt). 34 new unit tests. |
| 2026-05-20 | 284276d | Real PDF rendering: pdfjs-dist v5, canvas+text layer, clause highlighting. |
| 2026-05-21 | e410b34 | Scoring overhaul: void-provision floor, detectCriticalTextViolations(). highlyFaultyLease 6.9→9.5. |
| 2026-05-21 | f729b4b | SSE transport support in MCP server for Railway cloud deployment. |
| 2026-05-21 | 75bde34 | /api/pdf-url/[id] on-demand signed URL refresh + pdf-viewer auto-retry. |
| 2026-05-21 | 5b463fa | Manual LTB decision seeder from local .txt files. |
| 2026-05-22 | 63fcd82 | Fix PDF annotation highlights: filter TextMarkedContent items. |
| 2026-05-22 | e65be13 | Programmatic PDF export via jsPDF (report + copilot). |
| 2026-05-22 | 20a9c6d | Layout, spacing, mobile responsiveness fixes (17 issues). |
| 2026-05-23 | 53b9308 | 26 LTB decisions seeded. Suggested compliant language. Grounding confidence badge. |
| 2026-05-23 | f4bbdc4 | PIPEDA compliance — 6 units. Migration 008 applied. |
| 2026-05-23 | e224f47 | Tier 2 security: rate limiting on job/report/feedback routes. Terms of Service page. |
| 2026-05-23 | 89f24e7 | Tier 3+4 SEO/UX: SVG favicon, OG meta, opengraph-image.tsx, 404/error pages, sitemap/robots. |
| 2026-05-24 | 9d0f664 | Eval suite 15→30 cases. 4 new violation types. 20 new LTB decisions (26→46). 30/30 PASS. |
| 2026-05-24 | 40464a2 | seed_decisions_exa.mjs: 20 real CanLII decisions via Exa REST API (46→66). |
| 2026-05-25 | 3848354 | Corpus scaled to 84 tribunal decisions. s.26 RTA rows re-embedded. 7/7 + 30/30 confirmed. |
| 2026-05-25 | cb9ff3f | "Ask Your Lease" chat: Gemini 2.0 Flash SSE streaming, RAG grounding, 13 unit tests. |
| 2026-05-26 | 51ee534 | Merged all feature branches to main. 108/108 unit tests. |
| 2026-05-26 | 520e499 | 48 Playwright E2E tests. GitHub Actions CI 4-job pipeline. |
| 2026-05-26 | 84598f3 | SSE singleton fix. PDF viewer fixes. Empty states on all 6 panels. Wide-screen layout. 113/113 unit tests. |
| 2026-05-26 | 27bfd1c | **Session 18:** DB-backed upload rate limiting. 3-min pipeline timeout. POST /api/job/[id]/retry. Dashboard shows all job statuses. Migration 009. 125/125 unit tests. |
| 2026-05-27 | ba227a1 | **Session 20:** Chat migrated Gemini→Groq. Negotiation Copilot Anthropic→Groq JSON mode. AI safety lib. Safety guards on chat + negotiation. |
| 2026-05-27 | ce3e3f9 | **Session 21:** Fixed Anthropic SDK OAuth token auth (authToken + apiKey:null). Model → claude-haiku-4-5-20251001. |
| 2026-05-27 | cf48bdb | **Session 23:** README rewritten. 14 screenshots. Demo video re-recorded. GitHub release v1.0.0. CI test fixes. 153/153 tests. |
| 2026-05-28 | a232da9 | **Session 24:** Full security audit. 9 vulnerabilities fixed. 156/156 tests. |
| 2026-05-30 | 9894141 | **Session 26:** Full security audit (27 issues). RLS enabled on all tables (migration 011). DB-backed rate limiter (migration 012 + lib/rate-limiter-db.ts). Auth ownership checks on report/job/pdf-url/negotiation. CSP + HSTS headers. PDF signed URL TTL 3600→900s. Path traversal guard on parse-document. Chat history validated. Error messages sanitized. CI hardened (npm audit, placeholder UUIDs, TLS bypass removed). ffmpeg-static removed. Migrations applied manually. GitHub secrets added. Commits 9894141–5537fbf. |
| 2026-05-29 | 51a2053 | **Session 25:** Full deployment. Railway MCP server live. Vercel redeployed with MCP_SERVER_URL. Supabase auth redirect added. UptimeRobot monitors active. Dockerfile → node:22-slim. @anthropic-ai/sdk added to mcp-server/package.json. Commits 51a2053–a773fbd. |
| 2026-06-07 | b130419 | **Session 27:** All 5 recruiter "wow" features shipped. F1 live stats bar. F2 per-report OG share card + dark restyle + share modal with live OG preview. F3 RAG drill-down in agent trace. F4 animated trace replay. F5 landing hero upgrade: Sample Report + GitHub nav links, "How it works" 3-step strip, featured clause card with monospace text + RTA citation, tightened meta description. ToS/Privacy liability updates. Commits aeb369a–33a44b1. |
