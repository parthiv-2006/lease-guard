# LeaseGuard — Architecture Decision Record

> This document explains the key design decisions behind LeaseGuard: what alternatives were considered, why each choice was made, and what the trade-offs are. Written for engineers evaluating the project or extending it.

---

## Table of Contents

1. [Why MCP instead of raw function-calling](#1-why-mcp-instead-of-raw-function-calling)
2. [Why Claude as the agent when Gemini is free](#2-why-claude-as-the-agent-when-gemini-is-free)
3. [Why pgvector instead of Pinecone or Weaviate](#3-why-pgvector-instead-of-pinecone-or-weaviate)
4. [Why scoring is deterministic TypeScript, not a second LLM call](#4-why-scoring-is-deterministic-typescript-not-a-second-llm-call)
5. [Why hybrid BM25 + vector search instead of pure vector](#5-why-hybrid-bm25--vector-search-instead-of-pure-vector)
6. [Why Next.js API routes instead of FastAPI](#6-why-nextjs-api-routes-instead-of-fastapi)
7. [Why Gemini REST instead of the Gemini SDK](#7-why-gemini-rest-instead-of-the-gemini-sdk)
8. [Why PDF parsing is a Python subprocess](#8-why-pdf-parsing-is-a-python-subprocess)

---

## 1. Why MCP instead of raw function-calling

**The problem:** The agent needs to call 12 different tools across a multi-step pipeline — parse, segment, classify each clause, retrieve statutes, score risk, detect contradictions, check for missing clauses, benchmark, generate negotiation points, assemble the report. Each tool has its own input/output shape and failure mode.

**Alternatives considered:**

| Approach | Problem |
|----------|---------|
| Raw OpenAI/Anthropic function-calling with inline definitions | Tool schemas embedded in every API call — 12 tool defs × every turn = bloated prompts, tight coupling between orchestration logic and tool implementations |
| Separate REST microservice | Adds an HTTP hop per tool call; requires auth between services; harder to test in isolation |
| LangChain agents | Heavy abstraction over the tool-call loop — debugging "why did the agent skip this tool" becomes a framework archaeology problem |

**Why MCP:**

MCP (Model Context Protocol) separates the *tool server* from the *agent client* cleanly. The MCP server owns its 12 tools and exposes them over a well-defined protocol (stdio in development, SSE in production). The Claude agent discovers and calls tools dynamically without knowing their implementations. This means:

- Tools can be tested in isolation against the MCP server without invoking Claude
- The server can be deployed independently (Railway) and scaled separately from the Next.js app
- Adding a new tool is a single file in `mcp-server/src/tools/` — no changes to orchestration
- Claude's native MCP client handles the tool-call loop, retry logic, and result injection

**Trade-off:** MCP adds a process boundary (subprocess in dev, HTTP in prod). This is worth it for the clean separation, but it means the MCP server must be deployed separately for production use.

---

## 2. Why Claude as the agent when Gemini is free

This is the most common question about this architecture, so it deserves a direct answer.

**Short answer:** Gemini does not natively speak MCP. Using Gemini as the orchestrator means reimplementing the entire tool-call loop manually — every turn, every tool result injection, every retry decision. That's not a framework cost; that's writing a new agent runtime.

**Longer answer:**

The agent's job in LeaseGuard is not "generate text." It's:
1. Read tool results from previous turns
2. Decide which tools to call next (and in what order)
3. Handle tool failures and retry with different inputs
4. Maintain state across 14+ pipeline steps
5. Know when the pipeline is complete

Claude handles all of this natively via its MCP client. The `lib/agent.ts` file is ~300 lines because the hard parts (tool-call loop, result injection, context management) are handled by the SDK.

With Gemini, you would need:
- A custom tool-call loop (parse `functionCall` responses, call the tool, inject `functionResponse` turns)
- Manual context window management across 14 pipeline steps
- Custom retry logic for tool failures
- All of this tested and maintained independently

**Gemini's role in the system:** Gemini *is* used — for embeddings. `gemini-embedding-001` generates the 768-dim vectors used for statute and tribunal retrieval. At 1,500 requests/minute on the free tier, it's well within budget. This is the right use of a free model: a deterministic, non-reasoning task where output quality is measurable (7/7 retrieval accuracy).

**Cost reality:** Claude Haiku 3.5 costs ~$0.001 per 1K input tokens. A full lease analysis (14 pipeline steps, ~20 clauses) costs roughly $0.08–0.15. At 20 analyses/day, that's $2–3/day. The cost is proportional to usage, not a fixed monthly fee.

---

## 3. Why pgvector instead of Pinecone or Weaviate

**The alternatives:**

| Option | Cost | Ops overhead | Data co-location |
|--------|------|-------------|-----------------|
| Pinecone | Free tier: 1 index, 100K vectors | Zero — managed | Separate from Postgres |
| Weaviate Cloud | Free tier: 14-day sandbox | Low — managed | Separate from Postgres |
| pgvector (Supabase) | Included in existing Postgres | Zero | Same DB as all other data |

**Why pgvector won:**

LeaseGuard already uses Supabase Postgres for leases, clauses, reports, jobs, and feedback. Adding pgvector means the statute corpus lives in the same database as every other table. This unlocks:

**Hybrid search in a single SQL query.** The `search_statutes_hybrid` RPC function runs BM25 keyword search (`fts_vector @@ websearch_to_tsquery`) and vector cosine similarity in parallel, then merges with Reciprocal Rank Fusion — all in one database round-trip. With Pinecone, you'd need a Pinecone query *plus* a separate Postgres full-text query, then merge the results in application code.

**No additional service.** The production deployment is already: Vercel (Next.js) + Railway (MCP server) + Supabase. Adding Pinecone would mean a fourth external dependency with its own API key, rate limits, SDK, and failure mode.

**Transactional consistency.** When a new corpus chunk is added, it's in the same transaction as any metadata updates. With a separate vector store, you have eventual consistency between the vector index and the relational metadata.

**Trade-off:** pgvector's ANN (approximate nearest neighbour) performance degrades above ~1M vectors without careful indexing (HNSW or IVFFlat). At 2,372 chunks, this is nowhere near a concern. The right time to evaluate Pinecone is when the corpus exceeds ~500K vectors and query latency becomes a bottleneck.

---

## 4. Why scoring is deterministic TypeScript, not a second LLM call

This is the most important reliability decision in the system.

**The problem with LLM scoring:** If the risk score for a clause is generated by asking an LLM "rate this clause 1–10," you get:
- Non-deterministic scores (same clause, different score each run)
- No audit trail (why did the LLM give it a 7.3?)
- Hallucinated violations (the LLM might flag a clause as breaching a statute it invented)
- No regression testing (you can't write a test that asserts a specific score)

**What the deterministic scorer does:**

`mcp-server/src/tools/score-risk.ts` is a TypeScript regex engine. It:
1. Checks the clause text against 17 `MANDATORY_PROVISION_VIOLATION_TYPES` (e.g., `no_entry_notice`, `excessive_deposit`, `early_termination_fee`)
2. Each violation type has a weight (0.5–2.5) derived from LTB precedent severity
3. The score is `sum(matched_weights) × jurisdiction_factor`, clamped to [0, 10]
4. Every match produces a `statute_section` citation — no citation, no violation

**Result:** the 30/30 scoring accuracy eval (`scripts/eval-accuracy.mjs`) tests the scorer against a labelled suite of 30 clause texts with known expected violations. It runs in ~2 seconds, is deterministic, and can be run on every commit. An LLM-based scorer would require expensive API calls and probabilistic assertions.

**What the LLM *does* contribute to scoring:** classification and explanation. The `classify_clause` tool uses Claude to extract `plain_english_explanation` and `negotiation_points`. The LLM explains what the clause means in plain English; the TypeScript engine decides whether it's a violation and what the score is. These are separate concerns.

---

## 5. Why hybrid BM25 + vector search instead of pure vector

**The problem with pure vector search for legal text:**

Legal citations are precise: "RTA section 105(1)" means exactly that. If a tenant asks about "entry without notice" and the relevant statute is "s.26 Right to Enter," a vector model may find semantically similar text about "privacy" or "trespass" that ranks higher than the exact statute. Worse, it may miss a relevant section entirely because the embedding space doesn't align well with legal terminology.

**BM25 fills the precision gap:**

BM25 (Best Match 25) is a keyword relevance ranking function. It's excellent at:
- Exact statute citations ("section 105", "s.26")
- Legal terms of art ("arrears", "eviction", "distress")
- Numeric values ("last month's rent deposit")

**Reciprocal Rank Fusion merges both:**

RRF is a rank fusion algorithm: `score = Σ 1/(k + rank_i)` across both result lists. It doesn't require normalising the BM25 and cosine scores to the same scale — it uses ranks. The implementation runs in a single Postgres function (`search_statutes_hybrid`):

```sql
-- simplified
WITH bm25 AS (
  SELECT id, ts_rank(fts_vector, query) AS score
  FROM statute_corpus
  WHERE fts_vector @@ query
  ORDER BY score DESC LIMIT 20
),
vec AS (
  SELECT id, 1 - (embedding <=> query_embedding) AS score
  FROM statute_corpus
  ORDER BY score DESC LIMIT 20
)
SELECT id, SUM(1.0 / (60 + COALESCE(bm25.rank, 20) + COALESCE(vec.rank, 20))) AS rrf_score
FROM bm25 FULL OUTER JOIN vec USING (id)
GROUP BY id ORDER BY rrf_score DESC LIMIT 5
```

**Validation:** 7/7 retrieval accuracy at threshold 0.55 (hybrid) / 0.60 (pure vector). The hybrid approach reaches 7/7; pure vector achieves 6/7 on the same test suite — the one miss being an exact section number lookup where BM25 rescues it.

---

## 6. Why Next.js API routes instead of FastAPI

**The alternative:** A Python FastAPI service handling job management, report storage, and agent invocation, deployed separately from the Next.js frontend.

**Why Next.js API routes won:**

**Cold starts.** Vercel serverless functions are always warm within their timeout. A Railway FastAPI service cold-starts on every deploy and after periods of inactivity. For an analysis pipeline that already takes 60–90 seconds, adding a 2–4 second cold start to the first API call degrades the experience noticeably.

**One deployment, not two.** The frontend and API live in the same Next.js app. `vercel deploy` pushes everything at once. With FastAPI on Railway, every change that touches both layers requires coordinating two deployments and managing environment variables in two places.

**TypeScript end-to-end.** The API routes, frontend components, and MCP server all share TypeScript types. The `Report` interface defined in `app/components/types.ts` is used by both the report API route and the React components that render it. With FastAPI, you'd need to either duplicate the type definitions or set up a code generation pipeline.

**The one FastAPI advantage we gave up:** Python ecosystem access. PyMuPDF and Tesseract are Python libraries; invoking them from Node requires a subprocess. This is the accepted trade-off — PDF parsing is one tool (`parse_document`) in the MCP server, and the subprocess overhead (~200ms) is negligible in a 60-second pipeline.

---

## 7. Why Gemini REST instead of the Gemini SDK

This decision is specific to the Windows development environment but has production implications too.

**The problem:** The `@google/generative-ai` npm package (and its successor `@google/genai`) uses gRPC under the hood. gRPC on Windows requires BoringSSL, which conflicts with Node.js's built-in TLS stack. On Windows development machines, this produces `SSL_ERROR_SYSCALL` or `CERTIFICATE_VERIFY_FAILED` errors that are not reproducible on Linux/macOS CI.

**The REST approach:**

Gemini's REST API is straightforward — a POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent` with a JSON body and an API key query param. The response is plain JSON. No gRPC, no BoringSSL, no platform-specific TLS handling.

```typescript
// No SDK, no gRPC — just fetch
const resp = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: { parts: [{ text }] }, taskType: "RETRIEVAL_QUERY" }),
});
const { embedding: { values } } = await resp.json();
```

**Why this is also better for production:** Fetch-based HTTP calls are easier to mock in tests (`jest.spyOn(global, "fetch")`), easier to observe in network traces, and have no SDK version pinning risk. The `api-chat.test.ts` suite mocks both the embed endpoint and the `streamGenerateContent` SSE endpoint with a real `ReadableStream` — something that would be much harder with SDK mocking.

**Constraint:** The `@google/generative-ai` package is listed in `.claude/CLAUDE.md` as permanently banned from `mcp-server/` — not for ideological reasons, but because reinstalling it silently re-introduces the Windows SSL failure.

---

## 8. Why PDF parsing is a Python subprocess

**Why not a JavaScript PDF library (pdf-parse, pdfjs-dist)?**

`pdfjs-dist` is excellent for rendering PDFs in the browser (it's used in the PDF viewer component). For *text extraction* from scanned or low-quality PDFs, it falls short:

- No OCR — scanned-only PDFs return empty text
- Poor handling of multi-column layouts, rotated text, or unusual fonts
- No confidence scores for text quality

**Why PyMuPDF + Tesseract:**

PyMuPDF (`fitz`) is the gold standard for PDF text extraction — it handles ligatures, encoding normalisation, and layout analysis that JavaScript libraries miss. When text extraction confidence is low (score < 0.4), the subprocess falls back to Tesseract OCR, which handles scanned documents.

The subprocess script (`scripts/parse_pdf.py`) returns structured JSON with:
- Per-page text with confidence scores
- Extraction method (`native_text` / `ocr_fallback`)
- OCR apostrophe normalisation (converts `'` → `'` to fix common tenant name parsing issues)

**The subprocess cost:** ~300–500ms for a typical 3-page lease. In a 60–90 second pipeline, this is negligible. The MCP server spawns the Python process via `child_process.spawn` with a 30-second timeout.

**Why not a Python service?** Same reason as the FastAPI decision — adding a third deployment target for a single tool isn't worth it. The subprocess approach keeps PDF parsing co-located with the MCP server and requires no inter-service authentication.

---

## Summary table

| Decision | Chosen | Key reason |
|----------|--------|-----------|
| Tool orchestration | MCP | Native Claude support; clean server/client separation |
| Agent LLM | Claude Haiku | Native MCP; Gemini requires custom tool-call loop |
| Embeddings | Gemini REST | Free tier (1,500 RPM); REST avoids gRPC/SSL issues |
| Vector store | pgvector | Same DB as all other data; enables hybrid search in one query |
| Search strategy | Hybrid BM25 + vector (RRF) | Exact statute citations need keyword precision; semantic alone misses them |
| Risk scoring | Deterministic TypeScript | Reproducible; testable; no LLM hallucination risk |
| Backend | Next.js API routes | One deployment; TypeScript end-to-end; no FastAPI cold starts |
| PDF parsing | Python subprocess | PyMuPDF + Tesseract handles OCR; JS libraries don't |
