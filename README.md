# LeaseGuard

Clause-by-clause Ontario lease risk analysis grounded in retrieved statute text, not model memory.

[![CI](https://github.com/parthiv-2006/lease-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/parthiv-2006/lease-guard/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-161%20passing-brightgreen)](#testing)
[![Scoring Accuracy](https://img.shields.io/badge/scoring%20accuracy-30%2F30-brightgreen)](#testing)
[![Retrieval](https://img.shields.io/badge/retrieval%20precision-7%2F7-brightgreen)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)

<br/>

| Scoring accuracy | Retrieval precision | Automated tests | Legal corpus |
|:---:|:---:|:---:|:---:|
| **30 / 30** | **7 / 7** | **161** | **2,372 chunks** |
| 100% on a 30-case labelled suite covering all 17 violation types | Hybrid BM25+vector at threshold 0.55; pure vector misses 1/7 | 113 unit + 48 Playwright E2E, full CI on every push | RTA granular subsections, O.Reg 516/06, O.Reg 517/06, Standard Form, 84 LTB decisions |

---

## What It Is

Ontario residential tenants routinely sign leases containing clauses that are illegal under the Residential Tenancies Act — non-refundable deposits, entry-without-notice provisions, lease-break fees, mandatory arbitration waivers. Most tenants cannot identify these violations without legal training. LeaseGuard uploads a lease PDF, runs it through a 12-tool MCP pipeline backed by a 2,372-chunk pgvector corpus of RTA text and LTB tribunal decisions, and produces a nine-panel interactive risk report in under 90 seconds.

The key design constraint: the system never asserts legal facts from model memory. Risk scores come from a deterministic TypeScript regex engine covering 17 mandatory-provision violation types, not from an LLM judgment call. Every red flag links to the retrieved statute chunk that triggered it.

Built as a capstone project during The Odin Project curriculum.

---

## Features

- **Grounded risk scoring** — deterministic TypeScript engine checks each clause against 17 `MANDATORY_PROVISION_VIOLATION_TYPES` (e.g., `entry_without_notice`, `early_termination_fee`, `surveillance_in_unit`, `vital_services_cutoff`). Each violation carries a per-type weight (0.5–2.5) derived from LTB precedent severity; scores are clamped to [0, 10] and reproduce exactly across runs. A compliance-check pass runs before violation detection — clauses that explicitly satisfy a statute are cleared without penalty.
- **Hybrid statute retrieval** — BM25 keyword search and 768-dim Gemini vector search merged with Reciprocal Rank Fusion in a single Postgres RPC call (`search_statutes_hybrid`). Pure vector achieves 6/7 retrieval accuracy on the validation suite; hybrid reaches 7/7 by rescuing exact section-number lookups that semantic search misses.
- **Parallel clause pipeline** — clauses analyzed in concurrent batches of 5 via `Promise.allSettled`. A typical 3-page lease completes 67 tool calls in 60–90 seconds. Per-clause failures do not abort the pipeline.
- **Nine report panels** — risk overview with gauge and stat cards, red flags with statute citations, clause explorer (enforceability status, benchmark percentile, suggested compliant language), negotiation guide, missing protections, contradiction detector, statute sources, PDF viewer with persistent clause highlights, and a live Gantt trace of every tool call.
- **Negotiation Copilot** — one click generates a tone-aware email or addendum (Assertive / Formal / Cooperative) via Groq Llama 3.3 70B in JSON mode, with jsPDF export. Falls back to a static template if the model is unavailable.
- **Ask Your Lease chat** — floating RAG chat on every report page. Groq Llama 3.3 70B answers questions with retrieved statute and LTB decision citations. Rate-limited at 50 messages/day for authenticated users, 10/day for guests.
- **PDF viewer with clause annotations** — pdfjs-dist v5 renders the original PDF with colour-coded risk highlights using a `normAndMap` position algorithm that survives OCR position drift across page turns.
- **Live agent trace** — every MCP tool call logged with sequence number, duration, and PII-safe input/output summary; rendered as a Gantt chart with parallel swim lanes or a flat list.
- **Prompt injection defence** — 25-pattern detector covers classic instruction-override phrases, LLM control tokens (`<|im_start|>`, `[INST]`, `<<SYS>>`), DAN patterns, and markdown header injection. A scope guard prepends to every chat system prompt before user-supplied context.
- **PIPEDA compliance** — upload consent gate, data retention notice, DELETE cascade API, PII-stripped benchmark storage, and signed storage URLs that expire after 1 hour.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 15 (App Router, React 19) | Single deployment with API routes eliminates the cold-start overhead of a separate FastAPI service, and TypeScript types are shared end-to-end between route handlers and React components |
| Agent | Claude Haiku 4.5 via Anthropic SDK | Native MCP client handles the tool-call loop, retry logic, and context management across 14 pipeline steps. Gemini does not speak MCP natively and would require a custom tool-call runtime |
| Chat & Copilot | Groq `llama-3.3-70b-versatile` | 14,400 requests/day free tier with no quota conflict against Gemini embedding calls; OpenAI-compatible API simplifies streaming and JSON-mode integration |
| Embeddings | Gemini `gemini-embedding-001` via REST | 1,500 requests/minute free tier; direct REST calls to avoid the gRPC/BoringSSL SSL errors the `@google/generative-ai` SDK produces on Windows |
| Vector store | Supabase pgvector | Same database as all relational data, so hybrid BM25+vector search runs in one SQL round-trip. No fourth external service with its own API key and failure mode |
| Database | Supabase PostgreSQL | 10 migrations across 6 tables (leases, clauses, reports, contradictions, negotiation points, tool call logs); GIN index on `fts_vector` column for BM25 |
| Storage | Supabase Storage | Uploaded PDFs with 1-hour signed URL expiry; files for rejected leases are deleted on validation failure |
| MCP Server | TypeScript / Node.js | 12 tools exposed over stdio (dev) / SSE (prod); each tool lives in its own file and is testable without invoking Claude |
| PDF parsing | Python subprocess (PyMuPDF + Tesseract) | PyMuPDF handles ligatures, encoding normalisation, and multi-column layouts that `pdf-parse` and pdfjs-dist miss; Tesseract OCR fallback kicks in when text-layer confidence drops below 0.4 |
| PDF viewer | pdfjs-dist v5 | Canvas + text layer rendering with persistent clause highlight annotations |
| CI | GitHub Actions | 4-job pipeline: `typecheck` and `test` run in parallel, `build` waits for both, `e2e` runs 48 Playwright tests against the production build |

---

## Architecture

```
User uploads PDF
       │
       ▼
Next.js /api/upload
  ├─ Rate limit (DB-backed: 5/day auth, 3/day guest)
  ├─ Store PDF in Supabase Storage
  └─ Create lease row (status: pending) → fire background pipeline
       │
       ▼
lib/agent.ts — runLeaseAnalysis()          SSE stream → client
  │  3-minute timeout wrapper              (/api/stream/[id])
  │
  ├─ 1. parse_document       PyMuPDF + Tesseract (Python subprocess, ~300ms)
  ├─ 2. detect_jurisdiction  LLM + regex (rejects non-Ontario documents)
  ├─ 3. segment_clauses      LLM — returns clause array with char offsets
  │
  └─ 4. Per-clause batches (CLAUSE_BATCH_SIZE = 5, concurrent):
         ├─ classify_clause       LLM → primary_type + keywords
         ├─ lookup_statute  ──┐
         ├─ lookup_tribunal ──┴── Hybrid BM25+vector · RRF · threshold 0.55
         └─ score_risk           Deterministic TypeScript regex (NOT LLM)
  │
  ├─ 5. detect_contradiction  Claude Haiku 4.5 · confidence gate ≥ 0.65
  ├─ 6. check_missing         Supabase checklist lookup
  ├─ 7. generate_negotiation  LLM (parallel, clauses with risk_score ≥ 4 only)
  ├─ 8. benchmark_clause      Fire-and-forget, never blocks pipeline
  └─ 9. generate_report       Structured assembly → persist to DB

       │
       ▼
Supabase: leases · clauses · reports · contradictions
          negotiation_points · tool_call_logs
       │
       ▼
/report/[id] — 4 parallel table fetches
  ├─ Ask Your Lease chat  ── Groq Llama 3.3 70B + same RAG corpus
  └─ Negotiation Copilot  ── Groq Llama 3.3 70B JSON mode
```

**Scoring is deterministic by design.** The most consequential reliability decision in the system is that `score_risk` is TypeScript regex, not a second LLM call. The same clause produces the same score on every run, every violation includes a statute-section citation, and the 30-case eval harness (`scripts/eval-accuracy.mjs`) runs in ~2 seconds per CI commit without API calls.

**Hybrid search closes a precision gap in legal text retrieval.** Pure vector search misses exact section-number lookups because the embedding space aligns on semantics, not citation strings like "s.105(1)". BM25 fills that gap: `search_statutes_hybrid` runs both searches in one Postgres round-trip and merges via Reciprocal Rank Fusion (`score = Σ 1/(60 + rank_i)`), improving retrieval from 6/7 to 7/7 on the validation suite.

**MCP server/client separation.** The MCP server owns its 12 tools behind a protocol boundary. Claude's native MCP client handles the tool-call loop, result injection, and retry logic. Each tool file is independently testable without invoking Claude — which is why the unit tests for `score_risk`, `lookup_statute`, and `detect_contradiction` run without any Anthropic API calls.

---

## How It Works

1. **Upload.** The user submits a PDF from the landing page. `/api/upload` validates the file (10MB cap, PDF MIME type only), stores it in Supabase Storage, creates a lease row with `status: pending`, and fires `runLeaseAnalysis()` as a fire-and-forget background task. The client opens `/api/stream/[id]` for live SSE progress events.

2. **Parse and validate.** The MCP `parse_document` tool spawns a Python subprocess running PyMuPDF. When text-layer extraction confidence drops below 0.4, the script falls back to Tesseract OCR. The resulting raw text runs through two validation passes: a regex heuristic that rejects resumes, invoices, and non-lease contracts, then a jurisdiction detection call that throws `LeaseValidationError("wrong_jurisdiction")` for non-Ontario documents. On validation failure, the stored PDF is deleted from Storage.

3. **Segment and classify.** `segment_clauses` asks Claude to split the raw text into clauses with character offsets — these offsets later anchor the PDF viewer highlights. Each clause then calls `classify_clause` to extract its `primary_type` (one of ~20 types: `entry_rights`, `security_deposit`, `early_termination`, etc.) and focus keywords for targeted retrieval.

4. **Retrieve and score (batched).** For each clause, `lookup_statute` and `lookup_tribunal` run in parallel. Both call `search_statutes_hybrid` in Supabase — a single SQL RPC that runs BM25 on `fts_vector` and cosine similarity on `embedding` (768-dim Gemini vectors), merges results with RRF, and filters at relevance threshold 0.55. The retrieved statutes feed directly into `score_risk`. Before detecting any violation, the scorer runs a per-statute compliance check: if the clause explicitly satisfies a statute (e.g., mentions "24-hour written notice" alongside an entry-rights section), that statute is cleared and skipped. Remaining statutes are checked against 17 violation patterns; matches produce a `statute_section` citation and a quoted snippet from the retrieved text. Clauses process in concurrent batches of 5 via `Promise.allSettled`; per-clause failures are logged and skipped without aborting the pipeline.

5. **Contradiction detection.** After all clauses complete, `detect_contradiction` is called for 7 predefined high-conflict type pairs (e.g., `entry_rights` ↔ `quiet_enjoyment`, `rent_increase` ↔ `rent_payment`). Claude Haiku 4.5 receives both clause texts plus up to 4 retrieved statute chunks per clause as grounding. Results below confidence 0.65 are discarded; confirmed contradictions are written to the `contradictions` table.

6. **Report assembly.** `generate_report` aggregates clause scores, contradictions, missing protections (from a Supabase checklist lookup against found clause types), and negotiation points into a structured payload persisted to `reports`. The lease row flips to `status: complete`, the SSE stream closes, and the client navigates to `/report/[id]`.

7. **Interactive analysis.** The report page fetches from 4 Supabase tables in parallel (clauses, report, contradictions, negotiation points). The PDF viewer renders the original file via pdfjs-dist with colour-coded risk annotations. The "Ask Your Lease" chat panel runs per-question hybrid RAG retrieval against the statute corpus before calling Groq, so every answer cites specific RTA sections rather than drawing from model memory alone.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.10+ with `pip`
- Tesseract OCR: `choco install tesseract` (Windows) or `brew install tesseract` (macOS)

### Installation

```bash
git clone https://github.com/parthiv-2006/lease-guard.git
cd lease-guard
npm install
cd mcp-server && npm install && cd ..
pip install -r scripts/requirements.txt
```

### Configuration

Create `.env.local` in the project root and `.env` in `mcp-server/` (the MCP server reads the root `.env` at startup via dotenv):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude Haiku 4.5 agent calls — from console.anthropic.com |
| `GEMINI_API_KEY` | Gemini `gemini-embedding-001` REST calls (embeddings only) |
| `GROQ_API_KEY` | Groq Llama 3.3 70B for chat and Negotiation Copilot |
| `SUPABASE_URL` | Supabase project URL (server-side) |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS for pipeline writes) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client-side, safe to expose) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-side) |

### Database Setup

Apply all 10 migrations via the Supabase CLI or dashboard:

```bash
supabase db push
```

### Corpus Build

```bash
# RTA granular subsections (~2,196 chunks)
python scripts/build_corpus.py

# O.Reg 516/06, O.Reg 517/06, Standard Form of Lease
python scripts/build_regulations.py

# Validate retrieval accuracy — expect 7/7
python scripts/validate_retrieval.py
```

### Running Locally

```bash
# Terminal 1
npm run dev

# Terminal 2 (required for analysis to work)
npm run mcp:dev
```

Open `http://localhost:3000` and upload an Ontario residential lease PDF.

---

## Testing

```bash
# Unit and integration tests (113 passing)
npm test

# With coverage report
npm test -- --coverage

# E2E tests — Playwright against production build (48 tests)
npm run e2e

# Scoring accuracy eval — 30-case labelled suite, expect 30/30
node scripts/eval-accuracy.mjs

# Retrieval accuracy — validates pgvector corpus, expect 7/7
python scripts/validate_retrieval.py

# MCP server typecheck and compile
cd mcp-server && npm run build
```

All external services (Supabase, Anthropic, Groq, Gemini) are mocked in `__tests__/setup.ts`. The unit suite runs without any API credentials.

| Suite | Tests | Coverage area |
|-------|-------|--------------|
| `api-upload.test.ts` | 12 | File validation, size limits, DB-backed rate limiting |
| `api-report.test.ts` | 10 | Response shape, normalisation, DELETE cascade |
| `api-job.test.ts` | 8 | SSE job status, polling transitions |
| `api-job-retry.test.ts` | 7 | Retry endpoint, wrong-jurisdiction block |
| `api-chat.test.ts` | 13 | Groq streaming, RAG retrieval, rate limiting |
| `api-negotiation.test.ts` | 7 | Tone variants, Groq JSON mode, template fallback |
| `lib-agent.test.ts` | 9 | Pipeline tool-call sequencing, 3-minute timeout |
| `rate-limiter.test.ts` | 20 | Token bucket behaviour (in-memory + DB-backed) |
| `trace-timeline.test.ts` | 34 | Gantt swim-lane computation helpers |
| E2E (`e2e/*.spec.ts`) | 48 | Landing, static pages, report panels, chat |

---

## Project Structure

```
├── app/
│   ├── page.tsx                    Landing page, upload form, job polling, retry button
│   ├── dashboard/page.tsx          Lease history with job status per row
│   ├── report/[id]/page.tsx        Report shell + normaliseApiResponse()
│   ├── privacy/ · terms/ · about/  Static informational pages
│   ├── components/
│   │   ├── overview-panel.tsx      Risk gauge, stat cards, clause breakdown
│   │   ├── panels.tsx              Red Flags, Clause Explorer, Negotiation,
│   │   │                           Missing Protections, Contradictions, Sources
│   │   ├── negotiation-copilot.tsx Groq JSON-mode copilot modal (email + addendum)
│   │   ├── lease-chat.tsx          Floating RAG chat (Groq + pgvector)
│   │   ├── pdf-viewer.tsx          pdfjs-dist v5, canvas + text layer, clause highlights
│   │   ├── trace-timeline.tsx      Gantt chart with parallel swim lanes
│   │   └── shared.tsx              RiskArc, RiskBadge, StatCard, FeedbackBar
│   └── api/
│       ├── upload/route.ts         PDF intake, DB-backed rate limiting
│       ├── job/[id]/route.ts       SSE job status stream (3-min timeout)
│       ├── job/[id]/retry/route.ts POST retry for failed analyses
│       ├── report/[id]/route.ts    GET (4 parallel table fetches) + DELETE cascade
│       ├── chat/[leaseId]/route.ts Groq SSE streaming + hybrid RAG
│       ├── negotiation/generate/   Groq JSON mode — email + addendum
│       ├── stream/[id]/route.ts    SSE live progress events
│       └── feedback/route.ts       Thumbs up/down with comment
│
├── lib/
│   ├── agent.ts                    14-step pipeline, batched parallel clauses, 3-min timeout
│   ├── mcp-client.ts               stdio ↔ SSE transport selector
│   ├── ai-safety.ts                25-pattern injection detector, sanitizers, scope guard
│   ├── upload-rate-limit.ts        DB-backed per-user/IP rate limiter
│   └── pdf-export.ts               jsPDF report + copilot export
│
├── mcp-server/src/tools/
│   ├── score-risk.ts               Deterministic regex engine (17 violation types, NOT LLM)
│   ├── lookup-statute.ts           Hybrid BM25+vector · 3 queries · RRF · threshold 0.55
│   ├── detect-contradiction.ts     Claude Haiku 4.5 · confidence gate 0.65 · regex fallback
│   └── [9 other tools]
│
├── scripts/
│   ├── build_corpus.py             RTA granular subsection rows → Supabase
│   ├── build_regulations.py        O.Reg 516/06 + 517/06 + Standard Form
│   ├── seed_decisions_exa.mjs      LTB decisions via Exa REST API
│   ├── validate_retrieval.py       7/7 corpus accuracy check
│   └── eval-accuracy.mjs           30-case precision/recall eval harness
│
├── e2e/
│   ├── landing.spec.ts             8 tests
│   ├── static-pages.spec.ts        12 tests
│   ├── report.spec.ts              15 tests
│   └── chat.spec.ts                13 tests
│
└── supabase/migrations/            10 migrations (001–010, all applied)
    ├── 001_initial_schema.sql
    ├── 005_hybrid_search.sql       fts_vector GIN index + hybrid search RPC
    ├── 006_lease_address.sql       Property address extraction columns
    ├── 009_upload_ip.sql           DB-backed upload rate-limit table
    └── 010_chat_requests.sql       Chat rate-limit table
```

---

## Known Limitations

- **Ontario only.** The corpus covers the Ontario RTA, O.Reg 516/06, O.Reg 517/06, and 84 LTB decisions. Leases from other Canadian provinces are detected at the jurisdiction step and rejected; other provincial legislation is not indexed.
- **English only.** PyMuPDF extracts text reliably from standard Latin-alphabet PDFs. Leases in French or containing non-standard character encodings may produce incomplete extraction and partial analysis.
- **Low-quality scans.** Tesseract accuracy drops on faded, handwritten, or low-DPI scans. Extraction confidence is logged per page but not surfaced on the report — a user may receive a partial analysis without a clear indication of why.
- **Corpus version lag.** The statute corpus is a point-in-time snapshot. Amendments to the RTA or new LTB policy guidelines after the last corpus build are not reflected. The `corpus_version` field on each report records the build date.
- **Clause segmentation edge cases.** Very long single-paragraph leases or non-standard formatting sometimes cause the LLM segmenter to produce boundaries that don't align precisely with the PDF text layer, leading to highlight drift in the PDF viewer.
- **MCP server cold start in production.** On Railway, a fresh deploy adds ~2–4 seconds to the first analysis before the SSE server warms up.
- **No legal advice.** LeaseGuard identifies patterns against the Ontario RTA; it does not constitute legal advice. Commercial leases and condominium corporation agreements are outside scope.

---

## What I Would Build Next

1. **Multi-province jurisdiction expansion** — the RAG pipeline already supports multi-collection retrieval; the constraint is sourcing and embedding province-specific statute corpora. British Columbia's RTBA and Alberta's Residential Tenancies Act are the logical next additions, covering roughly 5 million additional renters.

2. **Landlord-side clause drafting** — `score-risk.ts` already generates RTA-compliant rewrite templates for each of the 17 violation types (`COMPLIANT_LANGUAGE_TEMPLATES`). A landlord-facing UI that accepts raw clause text and returns a compliant rewrite would convert the violation detector into a drafting assistant without any new infrastructure.

3. **Clause benchmarking at scale** — the `benchmark_clause` tool compares clauses against a 50-row corpus. Expanding to a statistically meaningful dataset (1,000+ clauses per type) would let the system tell tenants not just whether a clause is legal, but how it compares to typical lease language in the dataset — converting a binary pass/fail into a market-context signal.

4. **Native mobile upload** — the upload flow works on mobile browsers but was designed for desktop. A React Native wrapper using the existing Next.js API routes would let tenants photograph a lease page and trigger OCR analysis directly from their phone camera, removing the friction of PDF transfer.

5. **LTB outcome trend view** — the tribunal retrieval currently surfaces relevant decisions as supporting evidence. A separate view showing the historical trend of LTB outcomes per clause type (e.g., "boards ruled in the tenant's favour on surveillance clauses in 87% of retrieved decisions") would convert the legal grounding into actionable negotiation leverage.

---

## Legal Disclaimer

LeaseGuard provides educational information only and does not constitute legal advice. For matters requiring professional legal judgment, consult a licensed paralegal or lawyer. Analysis is grounded in the Ontario Residential Tenancies Act, 2006.

---

## License

MIT
