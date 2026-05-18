# LeaseGuard — Claude Code Instructions

## Project Overview

LeaseGuard is an AI agent that reads Ontario residential lease PDFs, retrieves real statute
and tribunal text via RAG, and produces a grounded risk analysis with negotiation guidance.
It is explicitly not an AI wrapper — every legal claim must be backed by a retrieved source.

**Key constraint:** The agent (Claude) calls MCP tools. Those tools query Supabase pgvector
for real law. The LLM never asserts legal facts from training knowledge alone.

---

## Confirmed Stack Decisions

| Layer | Technology | Role |
|-------|-----------|------|
| Agent | Claude (Anthropic API) | MCP tool orchestrator |
| Embeddings | Gemini text-embedding-004 | Vector embeddings only — not the agent |
| Vector DB | Supabase pgvector | Statute + decision + benchmark corpus |
| Database | Supabase PostgreSQL | Leases, clauses, reports, jobs |
| File Storage | Supabase Storage | Uploaded PDFs |
| MCP Server | TypeScript (Node.js) | Exposes 12 tools to the Claude agent |
| PDF Parsing | Python subprocess (PyMuPDF + Tesseract) | Called from MCP server via child process |
| Backend | Next.js API routes (Vercel) | Job management, report storage, upload handling |
| Frontend | Next.js (Vercel) | Upload UI, report view |

**Why Claude, not Gemini, as the agent:** Gemini does not natively speak MCP. Using Gemini
as the orchestrator requires reimplementing the entire tool-call loop manually. Claude handles
MCP natively. Gemini is used for embeddings only (1,500 req/min free tier is sufficient).

**Why Next.js API routes, not FastAPI:** Eliminating a second service removes one cold-start
source and simplifies deployment. API routes on Vercel are always warm (serverless).

---

## Architecture

```
User (browser)
    │ upload PDF
    ▼
Next.js API routes (Vercel)
    │ create job, store PDF in Supabase Storage
    │ invoke Claude agent via Anthropic API
    ▼
Claude Agent (MCP client)
    │ calls tools dynamically based on what it finds
    ▼
MCP Server (TypeScript, Vercel serverless or Railway)
    ├── parse_document        → Python subprocess (PyMuPDF / Tesseract)
    ├── detect_jurisdiction   → LLM + regex
    ├── segment_into_clauses  → LLM
    ├── classify_clause       → LLM
    ├── lookup_statute        → Supabase pgvector (Gemini embeddings)
    ├── lookup_tribunal       → Supabase pgvector (Gemini embeddings)
    ├── score_clause_risk     → LLM (requires retrieved statutes as input)
    ├── detect_contradiction  → LLM (stateful, cross-clause)
    ├── check_missing_clauses → Supabase checklist lookup
    ├── benchmark_clause      → Supabase PostgreSQL
    ├── generate_negotiation  → LLM (requires retrieved statutes as input)
    └── generate_report       → structured assembly (templated, not one giant LLM call)
    │
    ▼
Supabase (PostgreSQL + pgvector + Storage)
```

---

## Critical Constraints

### Rate Limits (realistic numbers)
- Anthropic API (Claude Haiku 3.5): ~$0.001 per 1K input tokens. $5 free credit ≈ 200+ analyses.
- Gemini embeddings: 1,500 req/min — sufficient for corpus build and ongoing use.
- Realistic throughput: 15-20 analyses/day on Gemini free tier if Gemini is used for any
  LLM calls. Budget accordingly.

### Parallelization is required to hit 90s
Sequential tool calls across 20+ clauses = 4-6 minutes. Clauses must be processed in
parallel batches. The agent should batch classify + lookup + score calls across clauses
concurrently, not sequentially.

### PDF parsing lives in Python
`parse_document` MCP tool spawns a Python subprocess running PyMuPDF (primary) and
Tesseract (OCR fallback). The subprocess script lives in `/scripts/parse_pdf.py`.
The MCP server executes it via `child_process.spawn`.

### Benchmarking corpus must be pre-seeded
The benchmark feature is invisible until `sample_size ≥ 10` per clause type. Before launch,
run the analysis pipeline against the Ontario Standard Form of Lease (government-published)
and 20-30 sample leases to seed the corpus. Script: `/scripts/seed_benchmark.ts`.

### Similarity threshold needs validation
The 0.45 cosine similarity floor for statute retrieval is a starting estimate. Run
`/scripts/validate_retrieval.ts` against known clause/statute pairs before setting this
in production. Adjust upward if false positives appear.

### "Unenforceable", not "illegal"
Under Ontario's RTA, problematic clauses are almost always **void and unenforceable**,
not "illegal." The landlord has not committed an offense; the clause simply cannot be
enforced. All output language, prompts, and UI copy must use "potentially unenforceable"
or "may not be enforceable," never "illegal," unless a specific offense provision is cited.

---

## Legal & Privacy Constraints

- **PIPEDA applies.** Lease PDFs contain personal information (names, addresses, sometimes
  SINs). A privacy policy, upload consent, and data retention policy are required before
  public launch.
- **CanLII ToS.** Bulk automated scraping of CanLII for LTB decisions may require review
  of their terms. Use their API (requires registration) rather than HTML scraping.
  Build the CanLII corpus incrementally — plan for 2-4 weeks of acquisition time.
- **Legal disclaimer** must appear on every report output, every API response, and the
  upload confirmation screen.
- **PII stripping** before writing to the benchmark corpus is mandatory. Use spaCy NER +
  regex to strip names, addresses, phone numbers, and unit numbers from clause text.

---

## File Structure (target)

```
/
├── CLAUDE.md
├── REQUIREMENTS.md
├── PRD.md
├── EXPLAINER.md
├── app/                        # Next.js app directory
│   ├── api/
│   │   ├── upload/route.ts     # PDF upload, job creation
│   │   ├── job/[id]/route.ts   # Job status polling
│   │   └── report/[id]/route.ts
│   ├── page.tsx                # Landing / upload
│   └── report/[id]/page.tsx    # Report view
├── mcp-server/                 # TypeScript MCP server
│   ├── index.ts
│   ├── tools/
│   │   ├── parse-document.ts
│   │   ├── detect-jurisdiction.ts
│   │   ├── segment-clauses.ts
│   │   ├── classify-clause.ts
│   │   ├── lookup-statute.ts
│   │   ├── lookup-tribunal.ts
│   │   ├── score-risk.ts
│   │   ├── detect-contradiction.ts
│   │   ├── check-missing.ts
│   │   ├── benchmark-clause.ts
│   │   ├── generate-negotiation.ts
│   │   └── generate-report.ts
│   └── types.ts
├── scripts/
│   ├── parse_pdf.py            # Python PDF extraction (PyMuPDF + Tesseract)
│   ├── build_corpus.py         # Scrape + embed RTA and LTB guidelines
│   ├── seed_benchmark.ts       # Pre-seed benchmark corpus
│   └── validate_retrieval.ts  # Test statute retrieval accuracy
├── lib/
│   ├── supabase.ts
│   ├── anthropic.ts
│   └── gemini.ts               # Embeddings only
└── supabase/
    └── migrations/             # Database schema migrations
```

---

## Git Commit Convention

**Commit like a senior engineer: small, atomic, batched by concern.**

### Rules
- One commit per logical concern. Never bundle unrelated changes.
- Commit frequently — after each meaningful unit of work (a tool implemented,
  a schema migration added, a component built).
- Never commit broken code to main. Use feature branches for in-progress work.
- Commit messages: imperative mood, lowercase, no period.
  - Good: `add lookup_statute mcp tool with pgvector retrieval`
  - Bad: `Added some stuff to the MCP server and also fixed the schema`
- Push to GitHub after every 2-3 commits, or at end of every session.

### Branch naming
```
feature/<short-description>    # new capability
fix/<short-description>        # bug fix
chore/<short-description>      # tooling, deps, docs
corpus/<short-description>     # RAG corpus work
```

### Commit sequence example (building a new tool)
```bash
# 1. schema first
git add supabase/migrations/
git commit -m "add statute corpus table with pgvector column"

# 2. then the tool implementation
git add mcp-server/tools/lookup-statute.ts mcp-server/types.ts
git commit -m "implement lookup_statute tool with semantic retrieval"

# 3. then tests or validation
git add scripts/validate_retrieval.ts
git commit -m "add retrieval validation script for statute corpus"

# push after the logical unit is complete
git push origin feature/lookup-statute
```

### Never do
- `git add .` and commit everything at once
- Amend pushed commits
- Force push to main
- Commit `.env`, API keys, or uploaded PDFs

---

## Development Order

Build in this sequence — each phase gates the next:

1. **Corpus first** (`/scripts/build_corpus.py`) — validate statute retrieval quality
   before writing any agent code. Poor retrieval = everything downstream is wrong.
2. **MCP server tools** — build and test each tool in isolation with Claude Desktop locally.
3. **Agent orchestration** — wire Claude to call tools dynamically, test on 10 real leases.
4. **Next.js backend** (API routes) — job management, storage, report persistence.
5. **Frontend** — report UI, upload flow, clause explorer.
6. **Pre-seed benchmark corpus** — run pipeline on Ontario Standard Form + sample leases.
7. **Rate limiting + abuse protection** before any public URL is shared.

---

## Environment Variables

```env
ANTHROPIC_API_KEY=        # Claude agent
GEMINI_API_KEY=           # Embeddings only
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Never commit these. Use `.env.local` locally and Vercel environment variables in production.

---

## Session Handoff Protocol

### HANDOFF.md — local only, never committed

`HANDOFF.md` lives in the project root and is **gitignored**. It is a living document that
travels with the local checkout only and must never be pushed to the remote repository.

**At the start of every session:**
1. Read `HANDOFF.md` in full before touching any code.
2. It contains: known bugs and their root causes, accurate file structure, data-shape
   reference, gotchas that burned previous sessions, and recommended next steps.
3. If `HANDOFF.md` does not exist, recreate it from `LEGAL_ACCURACY_ROADMAP.md` and
   the most recent session summary in the Claude Code transcript.

**At the end of every session:**
1. Update `HANDOFF.md` with:
   - Any new gotchas discovered this session
   - Files modified and why
   - Bugs fixed (root cause + fix summary)
   - New known issues not yet fixed
   - Recommended next steps for the next session
2. Do NOT commit `HANDOFF.md` — it is in `.gitignore` and must stay there.

**What HANDOFF.md contains (sections to maintain):**
- `## Status` — one-line summary of where the project is right now
- `## Known Issues` — bugs with root cause + fix pointer
- `## Gotchas` — non-obvious constraints that caused bugs in the past
- `## File Structure` — accurate tree of all important files
- `## Data Shapes` — API response shapes vs UI type shapes (critical — they differ)
- `## Next Steps` — prioritised list of what to build/fix next
- `## Session Log` — table of sessions with dates and what changed
