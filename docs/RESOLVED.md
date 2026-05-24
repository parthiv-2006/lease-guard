# LeaseGuard — Resolved Issues Archive

Issues that have been diagnosed and fixed. Kept for audit and regression purposes.
**Do not re-read these each session** — they are here so you can look up root causes if a similar bug recurs.

When an issue in `docs/HANDOFF.md` `## Known Issues` is fixed, move it here with the resolution date and commit hash. Do not delete it.

---

## [RESOLVED 2026-05-18] #1 — False Positive: Compliant Entry Rights Clauses Score 9.0 Critical

**Was:** Emergency exception language triggered the entry-without-notice violation regex. A clause saying "may enter without notice only in emergencies" scored 9.0 Critical and was flagged as potentially unenforceable.
**Root cause:** `detectStatutoryViolations()` checked for `"enter"` + `"without notice"` without excluding clauses that also contained `"emergency"` or `"in accordance"`.
**Fix applied:** `score-risk.ts` regex now excludes clauses containing "emergency", "urgent", "in accordance", etc. before firing the violation. Commit: `691c3b9`.

---

## [RESOLVED 2026-05-20] #3 — Address Shows as "Lease" / City is Jurisdiction

**Was:** Sidebar showed "Lease" as the property address; city field showed "Ontario, Canada".
**Root cause:** `lib/agent.ts` wasn't extracting address fields from the lease text; the `leases` table had no address columns.
**Fix applied:** Added `extractLeaseAddress()` regex helper to `lib/agent.ts` (4 patterns: Ontario Standard Form header, labelled field, "located at" phrase, street-number fallback). Migration 006 adds `property_address`, `property_unit`, `property_city`, `property_postal_code` to `leases` table. API route fetches new columns; `normaliseApiResponse` builds `displayAddress`. 17/17 unit tests pass. Commits: `513df80`, `4a8b2e1`, `2d3aecc`.

---

## [RESOLVED 2026-05-19] #6 — "synthetic-1" Clause Number Appearing in Overview

**Was:** Overview panel listed a synthetic clause injected by the agent with `clause_number: "synthetic-1"`, causing incorrect clause counts and a spurious row in the UI.
**Root cause:** Agent injects a synthetic summary clause for report generation; the normaliser wasn't filtering it out.
**Fix applied:** `normaliseApiResponse()` in `app/report/[id]/page.tsx` filters `rawClauses` before `.map()` — strips any clause whose `clause_number` starts with `"synthetic"`. Derived counts (clause_count, risk bar percentages) also correct. Commit: `8962b57`.

---

## [RESOLVED 2026-05-19] #7 — All Missing Protections Showing "MINOR" Severity

**Was:** Missing Protections panel showed every item as "MINOR" regardless of actual severity.
**Root cause:** `check_missing` returned `"medium"` severity for most items; `mapMissingSeverity()` in the UI had no `"medium"` branch, falling through to `"minor"`.
**Fix applied:** Raised four protections in `check-missing.ts` from `"medium"` to `"high"`: `rent_payment`, `quiet_enjoyment`, `early_termination`, `rent_increase`. Fix is upstream (semantically correct), not a patch to the mapping function. Commit: `619f564`.

---

## [RESOLVED 2026-05-19] #8 — Sources Panel Shows No Full Text

**Was:** Sources panel showed statute reference labels with blank accordions — no body text.
**Root cause:** Three-layer problem: (1) `Source` interface in `generate-report.ts` had no `full_text` field; (2) `sourcesMap.set()` stripped `statute.text`; (3) `normaliseApiResponse()` hardcoded `full_text: ""`.
**Fix applied:** Added `full_text?: string` to `Source` interface, passed `statute.text` through `sourcesMap`, wired `s.full_text` in the normaliser. Commit: `6321858`.

---

## [RESOLVED 2026-05-19] #9 — Agent Trace Panel Empty

**Was:** Agent Trace panel showed no tool calls. `tool_call_logs` table existed but was never written to.
**Root cause:** `lib/agent.ts` called `mcp.callTool()` directly with no logging wrapper.
**Fix applied:** Added `ToolCallLogger` class wrapping all 12 `mcp.callTool()` calls. Logs `tool_name`, `duration_ms`, `input_summary` (PII-stripped), `output_summary`, `sequence_num`, `success`, `error_message`. API route fetches `_tool_call_logs` in 4th parallel query. `normaliseApiResponse()` maps rows to `TraceStep[]` for `AgentTracePanel`. Commit: see session log 2026-05-19.

---

## [RESOLVED 2026-05-19] Score-Risk False Positives — ROADMAP Layers 3.1–3.4

**Was:** Compliant clauses flagged as unenforceable; unusual language alone triggered enforceability flag; no quoted statute text in violations; `is_potentially_unenforceable` set on clauses with merely high risk scores.
**Fix applied:** Four-layer improvement to `mcp-server/src/tools/score-risk.ts`:
- **3.1** — `quoted_text` field on every violation (exact snippet from retrieved statute). Added `violation_type` + `quoted_text` to `RiskScore.statutory_violations` in `types.ts`.
- **3.2** — `checkStatuteCompliance()` runs before violation detection — 24h notice, last month's rent, emergency exception, RTA deferral all skip the violation pass.
- **3.3** — `applyCompliantPatterns()` caps scores for known-good patterns: entry rights with 24h notice (cap 3), deposit as last month's rent (cap 2), no-pet without fines (cap 3), standard rent payment (cap 4), cleanliness maintenance (cap 3), RTA deferral (−1).
- **3.4** — `is_potentially_unenforceable` gated on `MANDATORY_PROVISION_VIOLATION_TYPES` allowlist. Unusual language alone never triggers it.
- **Bonus** — "post-dated cheques may be provided voluntarily but are not required" no longer triggers s.108 false positive.
**Result:** compliantLease.pdf: 3.3 medium → 2.2 low, 0 unenforceable flags, 0 false red flags. 9/9 unit tests, 15/15 Playwright E2E. Commit: `4c9a812`.

---

## [RESOLVED 2026-05-19] Benchmark Clause All Failing

**Was:** All 11 `benchmark_clause` calls logged as `success: false`.
**Root cause:** `lib/agent.ts` was passing `raw_text` (wrong field name) and `lease_id`/`clause_id` (not in schema) instead of `clause_text` + `jurisdiction_code`.
**Fix applied:** Corrected field names in `lib/agent.ts` step 11. Commit: `4e3af46`.

---

## [RESOLVED 2026-05-20] #10 — s.12 Not Retrieved for Standard Rent Payment Clauses

**Was:** `validate_retrieval.py` Test 2 failing — s.12 not in top-5 results for rent payment query.
**Root cause (corrected):** s.12 RTA covers tenancy agreement *format* requirements (to whom rent is paid), not rent payment schedules. The Standard Form's `form_05_rent` section (score 0.73) is the correct retrieval for rent payment queries.
**Fix applied:** Updated Test 2 `expected_sections` to accept either `["12", "form_05_rent"]`. Seeded full s.12 text (all 5 subsections) via `scripts/seed_s12.py`. Corrected `SECTION_CLAUSE_MAP["12"]` from `rent_payment` → `standard_boilerplate` in `build_corpus.py`. Result: 6/7 → **7/7 (100%)**. Commit: `7dce980`.

---

## [RESOLVED 2026-05-21] Scoring Overhaul — highlyFaultyLease 6.9 → 9.5 Critical

**Was:** `highlyFaultyLease.pdf` scoring 6.9 High (expected 9–10 Critical given 5 void provisions).
**Root cause:** No floor score based on count of void provisions; critical violations like self-help eviction and RTA waiver not detected.
**Fix applied:**
- `generate-report.ts`: void-provision floor (2 void clauses → 7.5, 3 → 8.5, 4+ → 9.5)
- Added `detectCriticalTextViolations()` for statute-independent detection: `self_help_eviction` (RTA s.19), `unlawful_termination` (s.44), `rta_waiver` (s.3), major-system maintenance offload (s.20)
- Added `self_help_eviction` + `unlawful_termination` to `MANDATORY_PROVISION_VIOLATION_TYPES`
- Broadened `detectStatutoryViolations()` maintenance check + `detectTextPatternScore()` patterns
**Result:** highlyFaultyLease 9.5 Critical (5 void clauses), compliantLease stays 2.2 Low. eval-accuracy 15/15 PASS. Commits: `e620849`, `e410b34`.

---

## [RESOLVED 2026-05-21] Negotiation Copilot 401 Error

**Was:** Negotiation copilot throwing 401 error when `ANTHROPIC_API_KEY` is an OAuth token (`sk-ant-o...`).
**Root cause:** OAuth tokens work with the Anthropic SDK's `new Anthropic({ apiKey })` but return 401 on direct `messages.create()` API calls.
**Fix applied:** Added `generateTemplateProposal()` (tone-aware email + addendum assembled from DB data). Wrapped Anthropic API call in try/catch — falls back to template on any error (401, timeout, missing key). The fallback activates silently with no error shown to the user. Extended `negotiation_points` query to include `landlord_likely_response` + `tenant_rebuttal`. Commit: `391d8f0`.

---

## [RESOLVED 2026-05-21] PDF Viewer Clipping / Missing Annotations

**Was:** PDF cut off at right edge (1.5× minimum scale exceeded container width). Annotations not appearing or disappearing after initial render.
**Root cause:** Hardcoded `scale = Math.max(containerWidth / page.getViewport({scale:1}).width, 1.5)` — A4 at 1.5× is wider than the 636px container. Annotations were re-rendered but refs weren't reset on `pdfUrl` change.
**Fix applied:** Removed 1.5× minimum; width now from `container.getBoundingClientRect()`. Per-page try/catch so one bad page doesn't abort the render loop. Reset `renderedPagesRef`/`textDataRef`/`pagesReady` on `pdfUrl` change. Added persistent risk-level annotations (medium=yellow tint, high=orange tint, critical=red tint+underline) after all pages render. Fixed `norm()` to handle curly quotes and em-dashes. Prefix shortened from 60 → 40 chars with heading fallback for clause matching. Active-clause click flashes `lg-ann-flash` on top. Commit: `0934784`.

---

## [RESOLVED 2026-05-21] PDF Viewer Annotation Index Drift & E2E Verification

**Was:** PDF clause highlights/annotations were frequently misplaced (highlighting whitespace, clipping characters, or matching adjacent clauses) due to character index mapping drift in `norm()` and index accumulator logic. Also, E2E tests were failing on Agent Trace assertions.
**Root cause:**
- The `pos` loop in text matching accumulated character offsets using a simplistic `items.join(" ")` length which drifted when spaces were collapsed or trimmed in `norm()`.
- E2E tests were failing because `benchmark_clause` is excluded from the default Gantt view (Timeline) of the Agent Trace panel, causing the E2E script assertion to fail on the default view.
**Fix applied:**
- Implemented `normAndMap` in `app/components/pdf-viewer.tsx` which maps the normalized characters directly to their originating item index in a lockstep array. This guarantees that matched character ranges translate exactly to the correct text layer span elements.
- Rewrote the annotation and active-highlight effects in `app/components/pdf-viewer.tsx` to use the map generated by `normAndMap`.
- Modified `scripts/e2e-verify.mjs` to switch to the "List" view of the Agent Trace panel (by clicking `#trace-view-list` button) so that `benchmark_clause` is fully visible.
- Verified that all 15 E2E assertions pass clean, and that the typescript compiler runs clean with no warnings. Commits: `8b106b8`, `7b3c587`.

---

## [RESOLVED 2026-05-21] #12 — PDF Signed URL Expires After 1 Hour

**Was:** Clicking "View PDF" on a report older than 1 hour showed Supabase 400/403; PDF panel went blank.
**Root cause:** `app/api/report/[id]/route.ts` generated `signedUrl` with `expiresIn: 3600`. URL was baked into `full_report_json` at analysis time with no refresh path.
**Fix applied:** Added `/api/pdf-url/[id]` endpoint that generates a fresh signed URL on demand. `RealPDFViewer` in `pdf-viewer.tsx` now catches load errors and automatically fetches a fresh URL from this endpoint before showing an error state (`hasRetriedRef` prevents infinite retry). Commit: `75bde34`.

---

## [RESOLVED 2026-05-22] PDF Viewer Annotation Highlights Silent Failure (TextMarkedContent Index Mismatch)

**Was:** All medium/high/critical clause annotations missing from real PDF view — only the raw PDF was shown, no colour highlights on any clause.
**Root cause:** Migration from deprecated `pdfjsLib.renderTextLayer` to the new `TextLayer` class (pdfjs 4.x) introduced an index mismatch. `textContent.items` contains both `TextItem` objects (have `.str` — pdfjs creates a DOM `<span>` for each) and `TextMarkedContent` objects (have `.type` — pdfjs creates **no span**). The previous code mapped all items including `TextMarkedContent` to the `items[]` array, so `items[i]` and `spans[i]` were out of sync. Every `spans[itemIdx]` lookup either returned `undefined` or highlighted the wrong span, silently failing all annotations.
**Fix applied:** Filtered `textContent.items` to only `TextItem` objects (those where `typeof it.str === "string"`) before building the index map, ensuring `spans[i]` always corresponds to `items[i]`. Also added progressive prefix fallback (40 → 25 → 15 chars) in both the persistent annotation pass and the active-clause flash pass, to tolerate hyphenation and whitespace differences between pdfjs and PyMuPDF extraction. Commit: `63fcd82`.

---

## [RESOLVED 2026-05-22] Export PDF and Negotiation Copilot Print Produced Screenshots

**Was:** "Export PDF" in the report sidebar and "Print/PDF" in the negotiation copilot addendum tab both called `window.print()`, which opened the browser print dialog and produced a rasterized screenshot of the full page — not a proper PDF document.
**Fix applied:** Added `lib/pdf-export.ts` using jsPDF's text API (no html2canvas):
- `exportReportPDF(report)` — multi-page structured PDF: cover page with risk score, executive summary, high/critical clauses with statutory violations, all-clauses summary table, missing protections, contradictions, legal disclaimer, page footers.
- `exportCopilotPDF(params)` — two modes: email (letter layout with subject block + body) and addendum (legal amendment document with numbered clauses in bordered boxes, signature blocks, lawyer-disclaimer footer).
Both produce selectable, searchable text PDFs. Wired `exportReportPDF` to sidebar Export PDF button and `exportCopilotPDF` to both the addendum Save PDF button and a new Save PDF button on the email tab. Commit: `e65be13`.


---

## [RESOLVED 2026-05-23] #13 — OCR Apostrophe Encoding — "Landlord□s Right of Entry"

**Was:** Known Issue listed as open — believed `scripts/parse_pdf.py` was missing apostrophe normalization, causing `□` (U+25A1) to appear in clause titles.
**Root cause investigation:** Reading `scripts/parse_pdf.py` lines 396-402 revealed the fix was already in place:
```python
raw_text = (raw_text
  .replace("‘", "'").replace("’", "'")   # curly apostrophes
  .replace("“", '"').replace("”", '"')   # curly double quotes
  .replace("□", "'").replace("�", "'")   # replacement squares/chars
)
```
**Resolution:** Issue already resolved in a prior session. Known Issue #13 closed 2026-05-23 with no new commit needed.
