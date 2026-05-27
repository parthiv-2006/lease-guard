# LeaseGuard — Claude Code Instructions

## Pre-Build Protocol

**Before writing any code for a feature or fix, Claude MUST:**
1. Ask Parthiv any clarifying questions needed to produce a complete implementation plan.
2. Wait for answers before writing a single line of code.
3. Only proceed once all ambiguities are resolved.

This applies to every task — no exceptions. Do not start implementing while questions remain unanswered. Clarify first, build second.

---

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
| Embeddings | Gemini gemini-embedding-001 (REST only) | Vector embeddings only — never use the SDK |
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
    ├── score_clause_risk     → TypeScript regex + rule engine (deterministic, NOT LLM)
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

### Similarity threshold — validated, re-validate after corpus changes
Thresholds: **0.60** (pure vector) and **0.55** (hybrid BM25+vector). Validated 7/7 (100%)
via `python scripts/validate_retrieval.py` on 2026-05-20. Re-run after any corpus change
(new regulations, LTB decisions). Target: 7/7 — tune threshold if it drops before continuing.

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

## File Structure (current)

See `docs/HANDOFF.md ## File Structure` for the full annotated tree.
Key locations for quick reference:

```
/
├── CLAUDE.md                        ← You are here. Law file + session protocols.
├── instrumentation.ts               ← Disables TLS verification in dev (Windows SSL fix)
├── docs/
│   ├── HANDOFF.md                   ← Session state. Gitignored. Updated by "end session".
│   ├── RESOLVED.md                  ← Archive of all fixed issues. Committed. Append when fixing.
│   ├── LEGAL_ACCURACY_ROADMAP.md    ← Legal accuracy checklist.
│   └── CORPUS_ENHANCEMENT_PLAN.md   ← Layer 1 corpus work plan.
├── app/
│   ├── page.tsx                     ← Landing + upload + processing
│   ├── report/[id]/page.tsx         ← Report shell + normaliseApiResponse()
│   ├── components/                  ← panels.tsx, pdf-viewer.tsx, trace-timeline.tsx, lease-chat.tsx, shared.tsx
│   └── api/                         ← upload/, job/[id]/, report/[id]/, chat/[leaseId]/, feedback/
├── lib/
│   ├── agent.ts                     ← 14-step pipeline with parallel batches
│   └── mcp-client.ts               ← stdio subprocess, 90s timeout
├── mcp-server/src/
│   ├── start.ts                     ← ENTRY POINT — loads dotenv then dynamic import
│   ├── lib/embeddings.ts            ← Gemini REST, 768-dim, RETRIEVAL_QUERY default
│   └── tools/                       ← 12 tools: score-risk.ts, lookup-statute.ts, etc.
├── scripts/
│   ├── build_corpus.py              ← RTA granular subsection rows
│   ├── build_regulations.py         ← O.Reg.516/06 + O.Reg.517/06 + Standard Form
│   ├── validate_retrieval.py        ← Retrieval accuracy — must pass 7/7
│   └── eval-accuracy.mjs            ← Scoring accuracy — must pass 15/15
└── supabase/migrations/             ← 001–006, all applied
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

## Documentation System

Four layers, each with a distinct purpose. Write to the right layer — never duplicate across layers.

| Layer | File | Purpose | Updated when |
|-------|------|---------|-------------|
| **Session state** | `docs/HANDOFF.md` | Active issues, launch blockers, key decisions, env vars, health checks, session log | Every "end session" trigger |
| **Resolved archive** | `docs/RESOLVED.md` | All fixed issues with root cause + commit hash | When an issue in Known Issues is resolved |
| **Persistent memory** | `memory/` (`~/.claude/projects/.../memory/`) | Permanent gotchas, user prefs, project state — survives machine failures | When a new `[PERMANENT]` gotcha is found, or project phase changes |
| **Legal accuracy roadmap** | `docs/LEGAL_ACCURACY_ROADMAP.md` | Checklist of legal accuracy improvements, with completion dates | When a checklist item is completed (mark ✅) |

### What goes where

- **`docs/HANDOFF.md`** — session state, active issues, key decisions table, current infrastructure, environment variables, health check commands, session log. Rewritten in full every session end.
- **`docs/RESOLVED.md`** — every ✅ fixed issue from Known Issues. Move it there when fixed; never delete. Future-you will want the root cause when a similar bug recurs.
- **`memory/gotchas_permanent.md`** — permanent constraints that cause silent failures and are not derivable from reading current code (e.g. gRPC broken on Windows, jurisdiction code format, field name mismatches). Append when a new one is found.
- **`memory/project_state.md`** — current phase and launch blockers. Update when blockers are resolved or new ones added.
- **`docs/LEGAL_ACCURACY_ROADMAP.md`** — legal accuracy checklist items. Mark ✅ with date when done.

### What never goes in memory

Code patterns, function names, file paths, API shapes, or anything derivable by reading the current codebase. Memory is for facts that survive machine failure and can't be recovered from the code.

---

## Session Handoff Protocol

### HANDOFF.md — local only, never committed directly

`docs/HANDOFF.md` is **gitignored** — local only, never committed directly to `main`. It is
backed up to the `handoff-backup` remote branch at every session end (see "end session" trigger).

---

### "end session" trigger

When the user types **"end session"**, immediately perform all of the following in order
without asking for confirmation:

1. Run `git log --oneline -5` to get the latest commit hashes for the session log.
2. Run `git status` to confirm nothing is uncommitted that should be.
3. Push any unpushed commits: `git push origin main`.
4. Rewrite `docs/HANDOFF.md` in full using the structure below, incorporating everything
   learned this session — new gotchas, bugs fixed, files changed, next steps.
5. Back up `docs/HANDOFF.md` to the `handoff-backup` remote branch:
   ```powershell
   git add -f docs/HANDOFF.md
   git commit --no-verify -m "chore: handoff backup $(Get-Date -Format 'yyyy-MM-dd')"
   git push origin HEAD:handoff-backup --force
   git reset HEAD~1
   ```
6. Move any ✅-fixed issues from `docs/HANDOFF.md` `## Known Issues` to `docs/RESOLVED.md`
   with the resolution date and commit hash.
7. If any new `[PERMANENT]` gotcha was discovered this session, append it to
   `memory/gotchas_permanent.md` and add a pointer line to `memory/MEMORY.md`.
8. Confirm to the user: "Session closed. HANDOFF.md updated. X commits pushed. Handoff backed up to `handoff-backup` branch."

Do NOT ask "should I update the handoff?" — just do it when "end session" is typed.

---

### At the start of every session

1. Read `docs/HANDOFF.md` in full before touching any code.
2. Check `## Active Right Now` and `## Launch Blockers` first.
3. Spot-check `memory/gotchas_permanent.md` for permanent constraints relevant to today's work.
4. If `docs/HANDOFF.md` does not exist: read `memory/project_state.md` and
   `memory/gotchas_permanent.md` to reconstruct context, then recreate HANDOFF.md from
   those sources + `docs/LEGAL_ACCURACY_ROADMAP.md`.

---

### HANDOFF.md structure (maintain all sections in this order)

**Header block — 3-bullet TL;DR at the very top, above everything else:**
```
> Stack: Next.js + Claude MCP + Supabase pgvector + Gemini embeddings
> State: <one line — current phase and what's working>
> First command: <the single command to run to verify everything is healthy>
```

**`## Active Right Now`** — filled during a session, cleared to "(nothing)" at end of session.
Shows what is currently in progress so a session can be resumed mid-task:
```
- <task name> — <where it's at, e.g. "corpus seeding running, 400/1033 done">
- Commits this session: <hash> <message>, <hash> <message>
- Next action: <exact next step>
```

**`## What This Project Is`** — one paragraph, unchanged unless architecture changes.

**`## Repository`** — GitHub URL, branch, local path, latest commit hash.

**`## Phase Completion Status`** — table of phases with ✅ / ❌ / 🔄 status.

**`## Current State`** — subsections for infrastructure, frontend, API routes. Keep accurate.

**`## Known Issues`** — each issue has:
- Symptom (what the user sees)
- Root cause (why it happens)
- Fix pointer (file + approach, or "see ROADMAP.md §X")
- Remove issues once fixed; don't let this become a graveyard.

**`## Critical Gotchas`** — non-obvious constraints. Each tagged as either:
- `[PERMANENT]` — will never change (e.g. "never use gRPC on Windows")
- `[ACTIVE]` — requires action before launch (e.g. "similarity threshold unvalidated")

  Keep `[PERMANENT]` items but stop re-reading them each session once internalized.
  `[ACTIVE]` items must be reviewed every session until resolved.

**`## Data Shape Reference`** — API response shapes vs UI type shapes. Update when shapes change.

**`## Environment Variables`** — all keys with one-line descriptions. Keep current.

**`## Quick Health Check`** — runnable commands to verify DB, corpus, and build are healthy.

**`## File Structure`** — accurate tree of all important files. Update when files are added/removed.

**`## Recommended Next Steps`** — prioritised list. Link to Known Issues rather than duplicating.
  Format: `1. <action> — <why it matters> (see Known Issue #N / ROADMAP.md §X)`

**`## Session Log`** — one row per session with commit hash:
```
| Date       | First commit | What was done |
|------------|-------------|---------------|
| 2026-05-18 | 691c3b9     | Fixed score-risk false positive, rewrote validate_retrieval.py, seeded RTA subsections |
```

---

## Self-Verification Protocol

After implementing any UI feature, API change, or data pipeline fix, **verify visually before
declaring done**. TypeScript compilation passing is necessary but not sufficient — always close
the loop with a browser tool.

### Tool Priority for This Project

1. **Claude Preview** — default for all Next.js UI changes (fastest)
2. **Claude in Chrome** — use when you need to inspect real API payloads or test file upload
3. **Playwright** — use for full end-to-end flows (PDF upload → analysis → report panels)
4. **Computer Use** — not needed for this project (web-only)

### Standard Verification Flow After Any UI Change

```
1. preview_start          → ensure dev server is running (once per session)
2. preview_screenshot /   → confirm landing page renders
3. preview_screenshot /report/[lease-id]  → confirm report page renders
4. preview_click          → click each panel tab that was affected
5. preview_screenshot     → confirm panel has real data (not empty/blank)
6. preview_console_logs   → must show zero JS errors
7. preview_eval           → assert key data present, e.g.:
     document.querySelectorAll('[data-panel]').length > 0
```

### LeaseGuard-Specific Verification Flows

See `docs/HANDOFF.md ## Self-Verification Protocol` for per-change-type flows
(report panel, API route, agent pipeline, MCP tool) and known-good lease IDs.

### What Counts as "Verified"

A feature is verified when ALL of the following are true:
- [ ] Build is clean (`npx tsc --noEmit` and `cd mcp-server && npm run build`)
- [ ] Screenshot shows the panel/page renders with real data (not empty, not loading spinner)
- [ ] Console logs are clean (no JS errors or unhandled promise rejections)
- [ ] API response contains the expected fields (spot-checked via Chrome MCP or Playwright)
- [ ] No adjacent panels are broken (screenshot the full report page, not just the changed tab)

### Test Lease IDs

Keep a known-good lease ID in HANDOFF.md `## Quick Health Check` for visual regression checks.
Re-use it every session to avoid re-uploading. If it expires (90-day report TTL), re-upload
`scripts/source-docs/ontario_standard_lease.pdf` and update the ID.
