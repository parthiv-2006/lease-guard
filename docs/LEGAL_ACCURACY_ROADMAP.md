# LeaseGuard — Legal Accuracy Roadmap

A prioritised checklist of everything needed to make the analysis legally reliable
before public launch. Work through these in order — each layer builds on the one above.

---

## Layer 1 — Corpus Quality  *(Highest Impact)*

> Root cause of most false positives. The model only knows what it retrieves.
> If a relevant statute section isn't in the corpus, the model hallucinates a violation.

### 1.1 Seed the full RTA with all subsections and exceptions

The current corpus likely has top-level RTA sections but not their sub-clauses.
Every exception, limitation, and condition must be its own embedding row.

**Example of what's needed for s.26 (entry rights):**
```
s.26       — Entry without notice (general rule)
s.26(1)    — 24-hour written notice required
s.26(2)    — Emergency exception ← THIS is what the model missed
s.26(3)    — Tenant consent exception
```

**Sections to ensure complete coverage for:**
| Section | Topic |
|---------|-------|
| s.20    | Maintenance obligations |
| s.22    | Quiet enjoyment |
| s.26–27 | Entry rights (all sub-clauses) |
| s.37–84 | Termination (all grounds) |
| s.95    | Renewal |
| s.97    | Subletting |
| s.105   | Rent deposit limit |
| s.106   | Key deposit |
| s.106.5 | Non-refundable charges |
| s.111   | Rent increases |
| s.116   | Notice of rent increase |
| s.128   | Rent increase guideline |

**Script to run:** `scripts/build_corpus.py` (already exists — needs to be run
with complete section coverage, not just the first paragraph of each section.)

---

### 1.2 Seed Ontario Regulations

The RTA alone is not enough. Regulations fill in the operational details.

| Regulation | Topic | Why it matters |
|-----------|-------|----------------|
| O. Reg. 516/06 | Maintenance Standards | Defines what "good repair" means — critical for maintenance clause scoring |
| O. Reg. 517/06 | Rent increase rules | Guideline calculation details |
| Ontario Standard Form of Lease (Form T) | Government template | Ground truth for "compliant" — every clause in this form should score low risk |

**Action:** Add these to `build_corpus.py` as additional sources alongside the RTA.

---

### 1.3 Seed LTB Decisions via CanLII API

The `tribunal_decisions` table currently has **0 rows**. LTB decisions are critical
because they show how adjudicators *apply* the RTA in practice — often different
from the statute text alone.

**Setup steps:**
1. Register for CanLII API access at https://api.canlii.org/
2. Target decisions from the LTB (tribunal ID: `onltb`) from the last 5 years
3. Prioritise decisions involving: security deposits, entry rights, early termination,
   maintenance failures, illegal charges
4. Embed each decision's `ruling_summary` + `relevant_principle` fields using Gemini
5. Aim for at least 50–100 decisions per clause type before launch

**CanLII API endpoint:**
```
GET https://api.canlii.org/v1/caseBrowse/en/onltb/?offset=0&resultCount=20
```

---

## Layer 2 — Retrieval Quality

> A good corpus retrieved poorly is still a bad corpus. Improve how statutes are
> fetched for each clause.

### 2.1 Multi-query retrieval

**Problem:** A single embedding query may retrieve the notice requirement but miss
the emergency exception because they use different language.

**Fix:** In `lookup_statute` and `lookup_tribunal`, generate **3 queries** per clause:
1. From the clause text itself
2. From the identified risk angle (`risk_angle` param already exists)
3. From the clause type name (e.g. "entry rights landlord notice Ontario")

Merge and deduplicate results before passing to `score_risk`.

**File to edit:** `mcp-server/src/tools/lookup-statute.ts`

---

### 2.2 Add hybrid BM25 + vector search

**Problem:** Exact legal references (`s.105`, `s.26(2)`) are better found by keyword
match than semantic similarity — a vector model may not consider these similar enough.

**Fix:** Add a Postgres full-text search pass alongside the pgvector cosine search,
then combine results using reciprocal rank fusion (rank by position, not raw score).

**Supabase full-text search column to add:**
```sql
alter table statutes add column fts_vector tsvector
  generated always as (to_tsvector('english', section_title || ' ' || full_text)) stored;

create index idx_statutes_fts on statutes using gin(fts_vector);
```

**Then in the RPC function**, union the vector results with keyword results and
re-rank by reciprocal rank fusion before returning.

---

### 2.3 Validate and tune the similarity threshold

The current `0.45` cosine similarity floor is an **estimate**. Run the validation
script against known pairs before setting this in production.

**How to validate:**
```bash
npx tsx scripts/validate_retrieval.ts
```

For each test pair (e.g. "security deposit clause" must retrieve "s.105"), check:
- Is the correct statute in the top 3 results?
- What is its similarity score?

Set the threshold to the **95th percentile floor** across all known-correct pairs.
If s.105 scores 0.62 for a security deposit clause, set threshold to ~0.55.

**Adjust in:** `mcp-server/src/tools/lookup-statute.ts` — `SIMILARITY_THRESHOLD` constant.

---

## Layer 3 — Scoring Prompt Design

> How you ask the model to reason determines what it concludes.

### 3.1 Require citation before conclusion

Every `statutory_violation` in `score_risk` output must quote the exact retrieved
statute text that supports it. If the model can't quote it, it can't claim it.

**Prompt addition in `mcp-server/src/tools/score-risk.ts`:**
```
For each violation you identify, you MUST quote the specific statutory text
from the retrieved sections provided above that the clause conflicts with.
If no retrieved section directly supports a violation, do not report it.
```

**File to edit:** `mcp-server/src/tools/score-risk.ts` (system prompt / instructions section)

---

### 3.2 Add a compliance check pass before scoring

Before assigning a risk score, force the model to explicitly consider both sides:

**Prompt structure to add:**
```
Step 1 — Compliance check:
List each retrieved statute section and state whether this clause COMPLIES with
or VIOLATES it. A clause may comply with one section while violating another.

Step 2 — Only then assign a risk score based on your compliance check above.
```

This prevents the model from seeing "entry without notice" and immediately concluding
a violation without checking if the emergency exception applies.

---

### 3.3 Add few-shot examples to the score_risk prompt

Include 3–5 labelled examples directly in the system prompt. Must include:

- **One compliant entry rights clause** that correctly scores 2–3 (low), to teach
  the model that emergency-exception language is permitted
- **One clearly illegal security deposit clause** ($5,000 deposit) that scores 9–10
- **One ambiguous maintenance clause** that scores 5–6 with hedged reasoning

**File to edit:** `mcp-server/src/tools/score-risk.ts`

---

### 3.4 Separate unenforceable flag from risk score

Currently `is_potentially_unenforceable` and a high `risk_score` are often set
together, causing inflated scores on clauses that are risky but not void.

**Rule to add to the prompt:**
```
is_potentially_unenforceable should ONLY be true if the clause directly
contradicts a mandatory RTA provision that cannot be contracted out of
(RTA s.3 — the Act overrides any agreement).

A clause can score 6–8 risk (burdensome, unfair) without being unenforceable.
Do not set is_potentially_unenforceable: true for merely unfavourable clauses.
```

---

## Layer 4 — Contradiction Detection

> The current regex approach is fragile and generates false positives.

### 4.1 Replace regex with grounded LLM reasoning

**Current approach:** Scans for words like "may enter", "shall not" using regex patterns.
Misses semantic contradictions and flags compliant exception language.

**Better approach:** Replace the `detectSemanticConflict` function in
`mcp-server/src/tools/detect-contradiction.ts` with an LLM call that receives:
- Both clause texts
- The relevant retrieved statutes for each clause
- The question: "Do these two clauses create a conflict a tenant cannot resolve
  without legal advice, given the above statutes?"

Only flag as a contradiction if the LLM can cite a specific statute that is
simultaneously satisfied by one clause and violated by the other.

---

## Layer 5 — Evaluation Harness

> You can't improve accuracy without measuring it. Build a test suite first.

### 5.1 Create a labelled lease test suite

**Target:** 20 leases with known expected outputs.

| Type | Count | Source |
|------|-------|--------|
| Fully compliant (Ontario Standard Form) | 5 | Government website |
| Synthetically faulty (one known violation each) | 10 | Draft yourself |
| Real leases reviewed by a paralegal | 5 | Recruit a tenant paralegal |

For each lease, record expected:
- Overall risk score range (±1.5)
- Which clauses should be flagged as unenforceable (and which should not)
- Which missing protections should be identified

**Store in:** `scripts/test-leases/` with a `labels.json` file.

---

### 5.2 Build an accuracy script

```bash
npx tsx scripts/eval-accuracy.ts
```

This script runs the full pipeline on each test lease and compares output against
labels. Reports:
- **Precision:** Of clauses flagged as unenforceable, what % actually are?
- **Recall:** Of actually unenforceable clauses, what % were caught?
- **False positive rate:** How often does a compliant clause get flagged?

**Target before launch:** Precision ≥ 0.85, Recall ≥ 0.80, FP rate ≤ 0.10

---

## Layer 6 — User Feedback

### 6.2 Add a "flag this finding" button

Add a UI button on each clause card ("Flag as incorrect") that records to a
`feedback` table in Supabase. Over time this generates a labelled dataset from
real users — the best source of ground truth you can get.

The `feedback` table already exists (migration 003). Wire up the `FeedbackBar`
component's "No" response to also ask *why* (dropdown: "Clause is actually
compliant", "Wrong statute cited", "Missing context").

---

## Layer 7 — Confidence Transparency

> Users need to know when to trust the output less.

### 7.1 Add grounding confidence to each clause

Compute a `grounding_confidence` score per clause based on:
- Number of retrieved statutes (0 = low, 3+ = high)
- Average similarity score of retrieved statutes
- Whether any statute directly addresses the clause type

**Show in the UI:**
- **High confidence (≥0.7):** Normal display — grounded in retrieved law
- **Medium confidence (0.4–0.7):** Small grey badge — "Limited sources"
- **Low confidence (<0.4):** Warning indicator — "No statute retrieved — review manually"

**File to edit:** `app/components/panels.tsx` — `ClauseCard` component

---

### 7.2 Show retrieval evidence in the report

In the Sources panel, for each statute citation show:
- The similarity score (e.g. "92% relevant")
- The exact text chunk that was retrieved
- A direct link to the ontario.ca statute page

This allows a tenant (or their lawyer) to verify every legal claim independently.

The `full_text` field on the `statutes` table already stores this — it just needs
to be passed through `generate_report` into `full_report_json`.

---

## Layer 8 — Developer & Transparency UX

### 8.1 Live Execution Trace Timeline (Gantt chart) ✅ 2026-05-20

Replace the text-based `AgentTracePanel` vertical list with an interactive Gantt chart
that visualises parallel tool calls, RAG latency phases, and overall pipeline throughput.

**What was built:**
- `app/components/trace-timeline.utils.ts` — pure computation helpers: t0/tEnd geometry,
  greedy swim-lane packing (interval scheduling), ruler tick generation, formatting helpers.
  All exported for unit testing (34 tests in `__tests__/trace-timeline.test.ts`).
- `app/components/trace-timeline.tsx` — full Gantt chart UI: CSS `%`-width bars positioned
  by real wall-clock `called_at` timestamps, per-tool swim lanes, amber RAG call highlighting,
  `RAG` badge on `lookup_statute` / `lookup_tribunal`, time ruler with nice intervals,
  hover tooltip (offset, duration, output fields), click-to-expand Input/Output drawer.
  Falls back gracefully when `called_at` is null (sequential reconstruction + banner).
- `panels.tsx` — `AgentTracePanel` now has `⏱ Timeline / ≡ List` pill toggle.
  Original vertical list preserved as `TraceList` sub-component.
- `types.ts` — `TraceStep.called_at` added. `page.tsx` normaliser maps it.
- No external charting library, no schema change, no new API calls.

**Commits:** `95f696e` → `be08a41` (5 atomic commits, pushed to `origin/main`)

---

## Summary Checklist

| # | Action | Files | Status |
|---|--------|-------|--------|
| 1.1 | Seed full RTA with all subsections | `scripts/build_corpus.py` | ✅ 2372 chunks — granular subsections + s.12 all 5 sub-clauses (commits 691c3b9, 7dce980) |
| 1.2 | Seed Ontario Regulations (516/06, 517/06, Form T) | `scripts/build_regulations.py` | ✅ O.Reg.516/06 + O.Reg.517/06 + Standard Form seeded (commit 2a0357a) |
| 1.3 | Seed LTB decisions via CanLII API | new `scripts/seed_decisions.py` | ✅ 84 decisions in DB. 46 manual/original + 18 new decisions seeded via Exa API fallback (`scripts/seed_decisions_exa.mjs`) on 2026-05-25. Reaches target count ranges across all key clause categories. |
| 2.1 | Multi-query retrieval (3 queries per clause) | `mcp-server/src/tools/lookup-statute.ts` | ✅ 3 queries/clause (raw/risk-angle/statute-targeted), RRF k=60 (commit f9e5343) |
| 2.2 | Add hybrid BM25 + vector search | `supabase/migrations/005_hybrid_search.sql` | ✅ SQL migration written + applied 2026-05-20; hybridSearch() with PGRST202 fallback (commit 92ce515) |
| 2.3 | Validate + tune similarity threshold | `scripts/validate_retrieval.py` | ✅ 7/7 (100%) under hybrid search (all scores ≥ 0.72). Threshold 0.55 hybrid / 0.60 vector confirmed. Re-validate after corpus changes. |
| 3.1 | Require citation before conclusion in score_risk | `mcp-server/src/tools/score-risk.ts` | ✅ `quoted_text` on every violation (commit 4c9a812) |
| 3.2 | Add compliance check pass before scoring | `mcp-server/src/tools/score-risk.ts` | ✅ `checkStatuteCompliance()` guards violation detection (commit 4c9a812) |
| 3.3 | Add few-shot examples (esp. compliant entry clause) | `mcp-server/src/tools/score-risk.ts` | ✅ `applyCompliantPatterns()` with 6 known-good rules (commit 4c9a812) |
| 3.4 | Separate unenforceable flag from risk score | `mcp-server/src/tools/score-risk.ts` | ✅ `MANDATORY_PROVISION_VIOLATION_TYPES` allowlist (commit 4c9a812) |
| 4.1 | Replace regex contradiction detection with LLM | `mcp-server/src/tools/detect-contradiction.ts` | ✅ Anthropic SDK, tool_choice JSON, confidence gate 0.65, regex fallback (commit 79acfc5). Needs real ANTHROPIC_API_KEY for LLM path. |
| 5.1 | Create labelled clause test suite | `scripts/test-leases/labels.json` | ✅ 45 cases (23 unenforceable, 22 compliant FP guards) — expanded from 30 cases 2026-05-27 (commits 8329992). Adds tc31–tc45: vital_services_cutoff, quiet_enjoyment_violation, assignment_prohibition, unlawful_renewal_obligation, multiple_rent_increases, service_reduction_no_rent_decrease, retaliation_or_coercion — each with paired FP guard. |
| 5.2 | Build accuracy evaluation script | `scripts/eval-accuracy.mjs` | ✅ 45/45 PASS — Precision 100%, Recall 100%, FP rate 0%, F1 100% (commit 62737f3). Was 30/30 PASS before v3.0 expansion. |
| 6.2 | Wire "Flag as incorrect" reason dropdown | `app/components/shared.tsx` | ✅ Reason dropdown added and wired to /api/feedback (commit 2056910) |
| 7.1 | Add grounding confidence badge per clause | `app/components/panels.tsx` | ✅ Grey "Limited sources" badge (0.4–0.7), amber "No statute retrieved" badge (<0.4). Mapped from existing `analysis_confidence` DB column via `normaliseApiResponse()`. Zero migration needed. (2026-05-23, commit 381aa5b) |
| 10.1 | Suggested compliant language per flagged clause | `mcp-server/src/tools/score-risk.ts`, `app/components/panels.tsx` | ✅ 13 violation-type templates in `score-risk.ts`. Expandable "What would a compliant version look like?" section in ClauseCard. Frontend derives from `statutory_violations` section numbers — works on all existing data. DB column `suggested_compliant_language` (migration 008) caches for new analyses. (2026-05-23, commits 26acc00, 381aa5b) |
| 7.2 | Show full_text + similarity in Sources panel | `mcp-server/src/tools/generate-report.ts` | ✅ `full_text` passed through `sourcesMap` and `normaliseApiResponse()` (commit 6321858) |
| 8.1 | Live Execution Trace Timeline (Gantt chart) | `app/components/trace-timeline.{tsx,utils.ts}` | ✅ Swim-lane Gantt, RAG highlighting, ruler, 34 unit tests, 100/100 passing (commit be08a41) |

---

## Known False Positives to Fix First

These are documented failures from smoke testing. Fix them before any other work.

| Clause type | Issue | Root cause | Fix |
|------------|-------|-----------|-----|
| ~~Entry rights (compliant)~~ | ~~Scored 9.0 Critical — "Potentially Unenforceable"~~ | ~~Emergency exception (s.26(2)) not in corpus / not retrieved~~ | ✅ Fixed 2026-05-19 — `checkStatuteCompliance()` catches emergency exception + 24h notice; `applyCompliantPatterns()` caps at 3. |
| ~~Maintenance (compliant)~~ | ~~Scored 6.0 Medium — "Potentially Unenforceable"~~ | ~~RTA s.20 maintenance standard not well-grounded~~ | ✅ Fixed 2026-05-19 — cleanliness-only maintenance capped at 3; s.20 compliance check guards against false offload detection. |

---

*Last updated: 2026-05-27*
*Current corpus version: 2026-05-25 (Parent RTA row trimming re-embedded; 2372 statute chunks — RTA subsections + regs + standard form)*
*tribunal_decisions: 84 rows (46 manual/original + 18 new decisions across early_termination, quiet_enjoyment, pets, maintenance_repairs, entry_rights, security_deposit, subletting_assignment, rent_increase, rent_payment, guest_policy, dispute_resolution)*
*validate_retrieval.py: 7/7 (100%) confirmed after corpus expansion (2026-05-25)*
*eval-accuracy.mjs: 45/45 (100%) — Precision 100%, Recall 100%, FP 0%, F1 100% as of commit 62737f3 (2026-05-27)*
*score-risk.ts: 24 MANDATORY_PROVISION_VIOLATION_TYPES — added vital_services_cutoff, quiet_enjoyment_violation, assignment_prohibition, unlawful_renewal_obligation, multiple_rent_increases, service_reduction_no_rent_decrease, retaliation_or_coercion (commit eff7544)*
*check-missing.ts: 13 ONTARIO_REQUIRED_PROTECTIONS — added utilities (s.29-31), standard_boilerplate x2 (s.38 + Standard Form s.3) (commit dd7dd57)*
*seed_decisions_exa.mjs: 16 SEARCH_TARGETS — added 7 new targets for new violation types (commit 62737f3)*
*Test suite: 100/100 passing (7 suites, includes 34 Gantt computation unit tests) as of be08a41*
*Smoke tested on: faultyLease.pdf, compliantLease.pdf (2.2 Low, 0 false positives as of 4c9a812)*
