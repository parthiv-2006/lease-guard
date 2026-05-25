# LeaseGuard — Layer 1 Corpus Enhancement Plan [FULLY EXECUTED]

> **Scope:** Layer 1 of the Legal Accuracy Roadmap — Corpus Quality — plus two bug fixes
> in `score-risk.ts` and `validate_retrieval.py` that were discovered during plan review
> and must ship alongside the corpus work.
>
> **Last updated:** 2026-05-25 (completed & verified)

---

## Current State Snapshot (Post-Execution)

| Asset | State |
|-------|-------|
| `statutes` table | 2373 rows — full RTA with granular subsections, O.Reg 516/06, O.Reg 517/06, and Standard Form of Lease |
| `tribunal_decisions` table | **84 rows** — 46 manually compiled + 38 real CanLII decisions via Exa REST API fallback |
| `scripts/build_corpus.py` | Complete — Checks text mismatch to automatically trim parent RTA rows and re-embed |
| `scripts/validate_retrieval.py` | Complete — Embeds query before calling Supabase RPC; 7/7 tests pass successfully |
| `mcp-server/src/tools/score-risk.ts` | **Deterministic TypeScript regex** — Updated with compliant patterns and emergency-exception rules |
| Gemini embedding model | `gemini-embedding-001`, 768-dim, REST only (gRPC broken on Windows) |
| Dedup logic | In `build_corpus.py` — skips rows already in DB that match exactly, updates mismatched text |

---

## Critical Findings from Code Review

These were missed in the first draft of this plan. They change what needs to be built.

### Finding 1 — score-risk.ts Is Regex, Not an LLM

The roadmap's Layer 3 ("Scoring Prompt Design") calls for adding few-shot examples and
compliance-check passes to the `score_risk` prompt. **There is no LLM prompt in
`score_risk`.** The entire tool is rule-based TypeScript: `detectStatutoryViolations()`
uses regex pattern matching; `scoreClause()` uses hardcoded multipliers.

**Implication for this plan:** Layer 3 of the roadmap needs a new decision — either
refactor `score_risk` to use an LLM, or fix the rules directly. This plan recommends
**fixing the rules first** (Work Item 0 below), then revisiting LLM-based scoring for
ambiguous cases (score 4–7) in a separate workstream.

---

### Finding 2 — The Entry Rights False Positive Has Two Root Causes, Not One

The original plan said: *"add s.26(2) to corpus → false positive fixed."* This is
incomplete. Reading `score-risk.ts` reveals the actual failure chain:

**Root cause A — Corpus (Work Item 1.1):**
The s.26 corpus row is one blob containing all subsections. A search for the emergency
exception retrieves s.26 as a whole, but the embedding is diluted by the surrounding
notice-requirement text. The model never gets a targeted "s.26(2) — emergency" chunk.

**Root cause B — Regex logic (Work Item 0 — must fix first):**
Even if s.26(2) is in the corpus, `detectStatutoryViolations()` still fires this pattern:

```ts
if (
  lowerClause.includes("enter") &&          // "enter" ← matches
  lowerClause.includes("without notice") && // "without notice" ← matches (it's in there)
  statuteText.includes("notice")            // any statute about notice ← matches
)
→ violation flagged, score jumps to 9
```

A clause saying *"may enter without notice only in emergencies"* hits all three conditions.
The regex doesn't check whether "emergency" also appears in the clause. **Corpus improvement
alone does not fix this.** Both root causes must be addressed.

---

### Finding 3 — validate_retrieval.py Will Produce Meaningless Results

The script calls `search_statutes` with raw text params:
```python
client.rpc("search_statutes", {
    "query_text": clause_text,
    "clause_type_filter": clause_type,
    ...
})
```

But the actual RPC function (migration 002) expects `query_embedding` — a 768-dimension
float array produced by Gemini. The script never calls the embed API. Every test returns
an empty result set and reports a false 0% hit rate. **The validation script has never
actually validated anything.** It needs to embed each test clause before querying.

---

### Finding 4 — s.26 Is Not Mapped to entry_rights in build_corpus.py

```python
SECTION_CLAUSE_MAP = {
    "27": "entry_rights",   # s.27 is mapped
    # s.26 is absent        # falls through to default "general"
}
```

New subsection rows `26(1)`, `26(2)`, `26(3)` will inherit clause_type from their parent.
Since s.26 has no mapping, all three subsections will be tagged `"general"`, not
`"entry_rights"`. They will not be retrieved when `clause_type = "entry_rights"` is used
as a retrieval filter. The map needs `"26": "entry_rights"` added.

---

### Finding 5 — Stale Parent Rows Will Add Noise After Subsection Seeding

After adding `26(1)`, `26(2)`, `26(3)` as separate rows, the existing `26` row remains
and still contains the full subsection text. A query for "emergency entry" will now
retrieve *both* the diluted parent `26` row and the targeted `26(2)` row, wasting two
of the three retrieval slots (`match_count: 3`). The parent rows for expanded sections
must be updated to contain only their intro sentence after subsection seeding completes.

---

### Finding 6 — validate_retrieval.py Test Suite Doesn't Cover the Known False Positive

All 5 existing test cases are for *clearly illegal* clauses. None tests a compliant clause
that should score low. The exact false positive scenario — *"may enter without notice only
in emergencies"* — is not in the test suite. You cannot measure improvement without a
baseline test that fails today and passes after fixes are applied.

---

## Work Items (Revised)

### Work Item 0 — Fix score-risk.ts Regex (Prerequisite — Do Before Corpus Work)

**File:** `mcp-server/src/tools/score-risk.ts`

**Problem:** The entry-without-notice pattern fires on compliant emergency-exception
clauses. The non-refundable deposit pattern also fires on clauses that merely mention
"deposit" alongside "non-refundable" in a different context.

**Changes needed in `detectStatutoryViolations()`:**

```ts
// BEFORE — fires on compliant emergency clauses
if (
  (lowerClause.includes("enter")) &&
  (lowerClause.includes("without notice") || lowerClause.includes("any time")) &&
  (statuteText.includes("24") || statuteText.includes("notice"))
)

// AFTER — excludes clauses that qualify "without notice" with emergency language
if (
  (lowerClause.includes("enter")) &&
  (lowerClause.includes("without notice") || lowerClause.includes("any time")) &&
  !lowerClause.includes("emergency") &&     // ← new
  !lowerClause.includes("urgent") &&        // ← new
  !lowerClause.includes("in accordance") && // ← catches "in accordance with RTA" clauses
  (statuteText.includes("24") || statuteText.includes("notice"))
)
```

**Also fix:** The `highRiskTypes` array gives entry_rights a +1 score bump unconditionally.
This bump should only apply when the clause is *restrictive*, not when it explicitly follows
the RTA. Add a check before applying the bump.

**Scope:** Small, surgical. No schema changes. Rebuild MCP server after editing:
```powershell
cd mcp-server && npm run build && cd ..
```

---

### Work Item 0b — Fix validate_retrieval.py

**File:** `scripts/validate_retrieval.py`

**Problem:** Calls `search_statutes` RPC with `query_text` string — but the RPC expects
`query_embedding` (768-dim float array). The script never calls Gemini. All results are
empty; hit rate is always 0%.

**Fix:** Add a `_embed_clause(text)` call (same REST approach as `build_corpus.py`)
before each RPC call, then pass `query_embedding` instead of `query_text`.

**Also fix — add the missing compliant-clause test case:**

```python
{
    "clause_text": (
        "The Landlord may enter the rental unit only in accordance with the "
        "Residential Tenancies Act, requiring 24-hour written notice except in "
        "cases of emergency or with the Tenant's consent."
    ),
    "clause_type": "entry_rights",
    "expected_sections": ["26", "27"],
    "should_flag_unenforceable": False,  # This is the false positive to catch
    "expected_score_max": 4,             # Should score low — compliant clause
},
```

This test case will **fail today** and **pass after Work Items 0 + 1.1** are complete,
giving you a concrete before/after measurement.

**Remove the broken fallback attempt** that calls `search_statutes` a second time with
fewer params — it masks the real error instead of surfacing it.

---

### Work Item 1.1 — Granular RTA Subsection Seeding

**File:** `scripts/build_corpus.py`

**Problem:** One embedding row per section buries subsection exceptions inside diluted
vectors. s.26(2) (emergency entry exception) is the confirmed false-positive cause.

**New parsing strategy:**

```
s.26        → row "26"     — intro sentence only (the general rule statement)
s.26(1)     → row "26(1)" — 24-hour written notice required
s.26(2)     → row "26(2)" — Emergency exception: entry without notice permitted
s.26(3)     → row "26(3)" — Tenant consent: no notice required
```

`section_number` is a `text` column — `"26(2)"` is valid and won't conflict with `"26"`.

**Fix the clause_type mapping gap at the same time:**

```python
SECTION_CLAUSE_MAP: dict[str, str] = {
    "26": "entry_rights",   # ← ADD THIS (currently missing, defaults to "general")
    "27": "entry_rights",
    # ... rest unchanged
}
```

**After seeding — update stale parent rows:**

For every section that now has granular subsection rows, update the parent row's `full_text`
to contain only the section intro sentence (everything before the first `(1)` marker).
This prevents the diluted parent from occupying a retrieval slot.

```sql
-- Run in Supabase SQL editor after seeding completes
-- Example: trim s.26 to intro sentence only
UPDATE statutes
SET full_text = '26 The landlord may enter a rental unit...'  -- first sentence only
WHERE act_name = 'Residential Tenancies Act, 2006'
  AND section_number = '26';
```

I'll generate the specific UPDATE statements for each expanded section as part of
the seeding script output — no manual SQL needed.

**Priority sections for granular seeding:**

| Section | Subsections | Why critical |
|---------|------------|--------------|
| s.26–27 | (1)(2)(3) each | Emergency + consent exceptions — confirmed false positive |
| s.20    | (1)(2)(3)(4) | Maintenance duty: repair vs. normal wear, timelines |
| s.22    | (1)(2) | Quiet enjoyment: what "substantial interference" means |
| s.37–41 | (1)–(5) each | Termination grounds — most complex, most misread |
| s.105   | (1)(2)(3) | Deposit limit, refund obligation, interest |
| s.106   | (1)(2)(3) | Key deposit: max amount, return timeline |
| s.111   | (1)(2)(3)(4) | Rent increase: notice, cap, exceptions |
| s.116   | (1)(2)(3) | Notice of rent increase: form, timing |
| s.95–97 | (1)–(6) | Assignment + subletting: consent rules |

**Expected output:** ~400–500 new rows. Total corpus: ~2000–2100 rows.
Runtime: ~8 minutes at 1s/embed call. Well within Gemini free tier (1000 RPD).

**Verification query (run in Supabase SQL editor after seeding):**
```sql
SELECT section_number, section_title, clause_type, length(full_text) as chars
FROM statutes
WHERE act_name = 'Residential Tenancies Act, 2006'
  AND section_number IN ('26', '26(1)', '26(2)', '26(3)', '27', '27(1)', '27(2)')
ORDER BY section_number;
```
All 7 rows should exist. `26(2)` should have `clause_type = 'entry_rights'`.

---

### Work Item 1.2 — Ontario Regulations Corpus

**New file:** `scripts/build_regulations.py`

Separate from `build_corpus.py` so regulation seeding can be re-run without risk of
triggering the full RTA build.

**Source 1 — O. Reg. 516/06 (Maintenance Standards)**

Defines what "good repair" means under RTA s.20. Without it, the model has no grounded
definition of acceptable maintenance standards.

- Wayback URL: `https://web.archive.org/web/20220101/https://www.ontario.ca/laws/regulation/060516`
- `act_name`: `"O. Reg. 516/06 — Maintenance Standards"`
- All sections → `clause_type: "maintenance_repairs"`
- Key sections: s.4 (exterior), s.5 (interior), s.6 (electrical), s.7 (heating), s.8 (plumbing)

**Source 2 — O. Reg. 517/06 (Rent Increase)**

Defines annual guideline calculation details. Needed for rent increase clause scoring.

- Wayback URL: `https://web.archive.org/web/20220101/https://www.ontario.ca/laws/regulation/060517`
- `act_name`: `"O. Reg. 517/06 — Rent Increase"`
- All sections → `clause_type: "rent_increase"`

**Source 3 — Ontario Standard Form of Lease (Form T)**

Ground truth for compliant lease language. Every clause in this form should score 2–4.
This is the most important calibration document.

- **Requires manual download** (see pre-work checklist below)
- Save as: `scripts/source-docs/ontario_standard_lease.pdf`
- Processing: `parse_pdf.py` → extract text → map clauses by heading → embed each
- `act_name`: `"Ontario Standard Form of Lease"`
- `clause_type`: mapped from clause heading (e.g. "Rent" → `rent_payment`)

**Note on Wayback Machine URLs for regulations:** Regulations are smaller documents and
the 2022-01-01 snapshot reliably captures them. O. Reg. 516/06 was last substantively
amended in 2017; O. Reg. 517/06 is recalculated annually but the structure is stable.
Use the canonical `ontario.ca` URL in the DB for citation, Wayback URL only for fetching.

---

### Work Item 1.3 — LTB Decisions via CanLII API

**New file:** `scripts/seed_decisions.py`

The `tribunal_decisions` table has 0 rows. `lookup_tribunal` falls back to keyword search
which also returns nothing. The model currently has zero examples of how adjudicators
apply the RTA in practice — which is often different from the statute text alone.

**Target decisions by clause type:**

| Clause type | Target count | Primary search terms |
|------------|-------------|---------------------|
| `security_deposit` | 50 | "last month rent deposit", "illegal deposit", "s.105" |
| `entry_rights` | 50 | "entry without notice", "s.26", "s.27", "landlord access" |
| `maintenance_repairs` | 40 | "disrepair", "s.20", "maintenance standard", "O. Reg. 516" |
| `early_termination` | 40 | "N12", "own use", "N4", "arrears", "termination" |
| `rent_increase` | 30 | "above guideline increase", "AGI", "s.116", "rent increase notice" |
| `quiet_enjoyment` | 30 | "substantial interference", "s.22", "harassment" |

**Total target: 240 decisions minimum before launch.**

**CanLII API endpoints:**
```
Tribunal ID: onltb

# Browse (paginated, use publishedAfter=2020-01-01 for recency)
GET https://api.canlii.org/v1/caseBrowse/en/onltb/?offset=0&resultCount=20

# Keyword search
GET https://api.canlii.org/v1/caseSearch/en/?tribunals=onltb
    &searchString=s.26+entry+without+notice&resultCount=20

# Full decision text
GET https://api.canlii.org/v1/caseText/en/onltb/{caseId}/
```

**Extraction approach — regex first, no LLM needed:**

CanLII LTB decisions have consistent HTML structure with labelled sections: "Analysis",
"Reasons", "Findings", "Order". Extract these sections by heading using regex — no Claude
or Gemini call required for extraction. This is faster, cheaper, and fully reproducible.

Only fall back to a Claude Haiku call (~$0.001/1K tokens) for decisions where the HTML
structure is irregular (malformed or scanned PDFs uploaded to CanLII). Estimated cost for
240 decisions at average 10K tokens: ~$0.24 — negligible, but avoid it by default.

**PII stripping — mandatory before storing:**

```python
import spacy
nlp = spacy.load("en_core_web_sm")

def strip_pii(text: str) -> str:
    doc = nlp(text)
    result = text
    for ent in reversed(doc.ents):
        if ent.label_ in {"PERSON", "GPE", "LOC", "ORG", "FAC"}:
            result = result[:ent.start_char] + f"[{ent.label_}]" + result[ent.end_char:]
    return result
```

**Script interface:**
```bash
python scripts/seed_decisions.py --clause-type entry_rights --limit 50
python scripts/seed_decisions.py --clause-type security_deposit --limit 50
# etc.
```

**CanLII rate limits:** The API is throttled — expect ~1 req/sec sustained. 240 decisions
at ~3 calls each (search + fetch + embed) = ~720 calls ≈ 12–15 minutes per run.
The script should include 1s sleep between calls and retry on 429.

**`tribunal_decisions` table schema** (migration 002, already applied):
```sql
id                    uuid
jurisdiction_code     text          -- "CA-ON"
tribunal_name         text          -- "Ontario Landlord and Tenant Board"
case_id               text          -- CanLII case ID (unique)
case_title            text
decision_date         date
relevant_clause_types clause_type[]
ruling_summary        text          -- extracted "Analysis"/"Reasons" section
relevant_principle    text          -- the legal rule the case established
embedding             vector(768)
corpus_version        text
```

---

## Execution Order

Each step has a verification gate. Do not proceed to the next step until the gate passes.

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 0a  Fix score-risk.ts regex (30 min)                           │
│   Gate: re-run smoke test on compliantLease.pdf                     │
│         entry rights clause must score ≤ 5                          │
│         (even without corpus changes — the regex alone causes 9.0)  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 0b  Fix validate_retrieval.py + add compliant test case (1hr)  │
│   Gate: run script → all 6 tests complete without RPC error         │
│         compliant entry clause test FAILS (expected — no corpus fix  │
│         yet). Record baseline hit rate.                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 1.1  Granular subsection seeding (1 session)                   │
│   Gate: SELECT section_number FROM statutes WHERE                   │
│         section_number IN ('26(1)','26(2)','26(3)') → 3 rows        │
│         run validate_retrieval.py → compliant entry clause PASSES   │
│         hit rate improves vs baseline                               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 1.2  Ontario Regulations corpus (1 session)                    │
│   Gate: SELECT count(*) FROM statutes WHERE                         │
│         act_name LIKE 'O. Reg.%' → > 0 rows                         │
│         maintenance clause manual query returns regulation rows      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 1.3  LTB Decisions — entry_rights batch first (1 session)      │
│   Requires: CANLII_API_KEY in .env                                  │
│   Gate: SELECT count(*) FROM tribunal_decisions → ≥ 50              │
│         re-run validate_retrieval.py → hit rate stable or improved  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ STEP 1.3 cont.  Remaining clause types (1–2 sessions)               │
│   Target: 240 total rows in tribunal_decisions                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What You Need to Do Before I Can Build

Complete these in order. Steps 1–3 can be done today. Step 4 has a wait.

---

**Step 1 — Register for CanLII API** (5 minutes now, 1–3 day approval)

1. Go to **https://api.canlii.org/**
2. Click "Register"
3. In the *Purpose* field write:
   > "Tenant rights education platform — retrieving Ontario LTB decisions to help tenants understand their lease agreements. Non-commercial research use."
4. Submit. You will receive an approval email with your API key.
5. When the key arrives, add it to both `.env` and `.env.local` at the project root:
   ```
   CANLII_API_KEY=your_key_here
   ```

> **CanLII ToS note:** Their API terms permit non-commercial research and educational use.
> LeaseGuard's current scope (helping tenants, no paywall) fits this. Review again before
> any commercial launch.

---

**Step 2 — Download the Ontario Standard Form of Lease PDF** (5 minutes)

1. Go to **https://www.ontario.ca/page/residential-tenancy-agreement-standard-lease**
2. Download the PDF version (English)
3. Create this folder: `scripts/source-docs/` inside the project root
4. Save the file as: `scripts/source-docs/ontario_standard_lease.pdf`

This is a government-published document — no copyright restrictions.

---

**Step 3 — Install spaCy for PII stripping** (2 minutes — needed before Step 1.3)

Open PowerShell in the project root and run these two commands:
```powershell
pip install spacy
python -m spacy download en_core_web_sm
```

Verify it worked:
```powershell
python -c "import spacy; nlp = spacy.load('en_core_web_sm'); print('OK')"
```

---

**Step 4 — Nothing else is blocked on you.** Steps 0a, 0b, and 1.1 have zero external
dependencies and can be built the moment you're ready to start. Start those while waiting
for the CanLII approval email.

---

## Complete File Change Manifest

| File | Action | Blocked on |
|------|--------|-----------|
| `mcp-server/src/tools/score-risk.ts` | Edit — fix entry regex, conditional highRisk bump | Nothing |
| `scripts/validate_retrieval.py` | Edit — add embed call, fix RPC params, add compliant test case | Nothing |
| `scripts/build_corpus.py` | Edit — rewrite parser for subsections, add s.26 to clause map | Nothing |
| `scripts/build_regulations.py` | Create — new script for O. Reg. 516/06, 517/06, Form T | Standard Form PDF (Step 2) |
| `scripts/seed_decisions.py` | Create — CanLII fetch, regex extract, PII strip, embed | CanLII API key (Step 1) + spaCy (Step 3) |
| `scripts/requirements.txt` | Edit — add `spacy>=3.7` | Nothing |
| `scripts/source-docs/ontario_standard_lease.pdf` | You provide | Step 2 above |

No migrations. No frontend changes. No MCP server tool additions.

---

## Effort Estimate

| Item | Build time | Runtime | Blocked on |
|------|-----------|---------|-----------|
| 0a — score-risk regex fix | 30 min | instant | nothing |
| 0b — validate_retrieval fix | 1 hr | 2 min | nothing |
| 1.1 — subsection seeding | 2 hr | ~10 min | nothing |
| 1.2 — regulations corpus | 1 hr | ~5 min | Standard Form PDF |
| 1.3 — CanLII decisions | 2 hr build + 15 min/run | ~90 min total | CanLII key + spaCy |

**Recommended session order:**
- **Session A (now):** 0a + 0b + 1.1 — fully unblocked, fixes the entry rights false positive
- **Session B (after PDF downloaded):** 1.2 — regulations + Standard Form
- **Session C (after CanLII key arrives):** 1.3 — LTB decisions all clause types

---

*Created: 2026-05-18*
*Revised: 2026-05-18 — incorporated post-review critical findings*
*Next action: confirm pre-work steps, then begin Session A*
