# LeaseGuard — Functional Requirements

> AI-powered lease analysis agent that reads rental agreements, cross-references
> real tenant law, detects risk, and generates grounded negotiation intelligence.
> Built as a genuine multi-tool MCP agent — not an AI wrapper.

**Version:** 1.0  
**Scope:** Ontario, Canada (Residential Tenancies Act) — MVP  
**Stack:** Free tier only  

---

## Table of Contents

1. [Project Philosophy](#1-project-philosophy)
2. [System Architecture](#2-system-architecture)
3. [MCP Server Specification](#3-mcp-server-specification)
4. [Module Requirements](#4-module-requirements)
   - 4.1 Document Ingestion
   - 4.2 Jurisdiction Detection
   - 4.3 Clause Segmentation
   - 4.4 Legal Research (RAG)
   - 4.5 Risk Assessment
   - 4.6 Contradiction Detection
   - 4.7 Missing Clause Detection
   - 4.8 Negotiation Intelligence
   - 4.9 Benchmarking
   - 4.10 Report Generation
5. [Data Models](#5-data-models)
6. [RAG Corpus Specification](#6-rag-corpus-specification)
7. [Frontend Requirements](#7-frontend-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Legal & Ethical Requirements](#9-legal--ethical-requirements)
10. [Out of Scope (MVP)](#10-out-of-scope-mvp)
11. [Free Stack](#11-free-stack)

---

## 1. Project Philosophy

### What Separates This from a Wrapper

A wrapper is: `PDF → "analyze this for risks" → LLM response → display`.

LeaseGuard is not that. Every architectural decision must enforce the following:

**1.1 Every legal claim must be grounded in retrieved source material.**  
The LLM has no authority to assert that a clause violates the law based on training
knowledge alone. It may only make that assertion after the `lookup_statute` tool has
returned the relevant section and that section has been passed as context. If no
statute is retrieved, the output must reflect uncertainty explicitly.

**1.2 The agent decides what to look up — the pipeline does not.**  
A fixed pipeline (`parse → classify → score → report`) is a wrapper with extra steps.
The MCP agent must dynamically decide which tools to invoke and in what order based
on what it discovers in each clause. A standard payment clause may require no legal
lookup. An early termination clause with an unusual fee structure triggers multiple
lookups, a tribunal decision search, and a negotiation point generation.

**1.3 Absence is as important as presence.**  
The agent must detect what is missing from the lease — protections that Ontario law
entitles every tenant to but that were quietly omitted. Detecting absence requires
structured state, not summarization.

**1.4 Cross-clause reasoning requires maintained state.**  
Clause 8 may grant the landlord entry rights. Clause 31 may guarantee quiet
enjoyment. These are in tension. The agent must track what has been found across the
full document and flag contradictions. A single LLM call cannot do this reliably.

**1.5 Negotiation output must be grounded in precedent.**  
Saying "this clause is risky" is wrapper output. Saying "the LTB has ruled against
this type of clause in three recent decisions; here is the counter-language that has
held up and the statutory basis for it" requires multi-tool retrieval and synthesis.

**1.6 Benchmarking requires a real comparison corpus.**  
"This rent increase clause is more aggressive than 84% of Ontario leases we've
analyzed" is a data claim. It requires an actual database of analyzed clauses. The
agent must populate and query this database — not estimate from model knowledge.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│   Upload PDF · View Report · Explore Clauses · Negotiation Guide │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST API
┌───────────────────────────────▼─────────────────────────────────┐
│                  Next.js API Routes (Vercel)                     │
│   Handles uploads · Creates jobs · Polls status · Serves reports │
└──────┬────────────────────────┬────────────────────────────────┘
       │                        │
┌──────▼──────┐        ┌────────▼────────────────────────────────┐
│  PostgreSQL  │        │           MCP Server (TypeScript)        │
│  + pgvector  │        │                                          │
│  (Supabase)  │◄───────│  Tools: parse · detect · segment ·      │
│              │        │  classify · lookup_statute ·             │
│  · Leases    │        │  lookup_decisions · score · contradict · │
│  · Clauses   │        │  check_missing · benchmark ·             │
│  · Statutes  │        │  negotiate · generate_report             │
│  · Decisions │        │                                          │
│  · Vectors   │        └──────────────────┬──────────────────────┘
└─────────────┘                            │
                         ┌─────────────────┴───────────────────┐
                         │                                      │
              ┌──────────▼──────────┐            ┌─────────────▼──────────┐
              │   Claude (Anthropic  │            │  Gemini text-embedding  │
              │   API) — MCP agent   │            │  -004 — embeddings only │
              │   orchestrator       │            │  (not the agent LLM)    │
              └─────────────────────┘            └────────────────────────┘
```

### Data Flow

```
1. User uploads PDF
2. Backend creates a Lease job (status: processing)
3. MCP agent is invoked with the job ID
4. Agent calls tools dynamically based on what it finds
5. Each tool call writes intermediate results to PostgreSQL
6. Final report is assembled and stored
7. Frontend polls job status → renders report when complete
```

### Why Claude as the agent (not Gemini)

Gemini does not natively speak MCP. Using Gemini as the orchestrator requires
reimplementing the entire tool-call loop manually (send tool list → parse tool call
response → execute → send result back → repeat). Claude handles MCP natively as an
MCP client. Gemini is used exclusively for embeddings (text-embedding-004), where its
free tier of 1,500 req/min is more than sufficient.

### Why Next.js API routes (not FastAPI)

A separate FastAPI service on Render free tier introduces a second cold-start vector
(30–60s per cold start) and a second deployment to maintain. Next.js API routes on
Vercel are serverless and always warm. For this scale there is no benefit to FastAPI.

### Why MCP (not just direct API calls)

- Each tool call is discrete, logged, and auditable — you can show exactly what
  the agent looked up and why
- Tool failures are handled gracefully (lookup fails → flag uncertainty, not hallucinate)
- The agent's reasoning chain is inspectable: which tools were called, in what order,
  with what inputs and outputs
- Claude Desktop can connect to the local MCP server for free local development and demo

---

## 3. MCP Server Specification

The MCP server is the core of the system. It exposes the following tools.
All inputs and outputs are typed. The agent calls these dynamically.

---

### 3.1 `parse_document`

**Purpose:** Extract structured text from a lease PDF, handling both text-based
and scanned documents.

**Input:**
```typescript
{
  file_path: string;          // path to uploaded PDF
  ocr_fallback: boolean;      // true = use Tesseract if text extraction fails
}
```

**Output:**
```typescript
{
  raw_text: string;
  page_count: number;
  extraction_method: "text" | "ocr";
  confidence: number;         // 0–1, OCR confidence if applicable
  metadata: {
    title?: string;
    created_at?: string;
    word_count: number;
  };
}
```

**Requirements:**
- Use PyMuPDF as primary extractor (text PDFs)
- Fall back to Tesseract OCR for image-based PDFs
- Strip headers, footers, and page numbers that would corrupt clause segmentation
- Must handle multi-column layouts
- Must not fail silently — return partial extraction with confidence score

---

### 3.2 `detect_jurisdiction`

**Purpose:** Identify which jurisdiction's laws govern this lease so the correct
legal corpus is queried. Must not rely on user input.

**Input:**
```typescript
{
  raw_text: string;
}
```

**Output:**
```typescript
{
  jurisdiction: string;         // e.g. "Ontario, Canada"
  jurisdiction_code: string;    // e.g. "CA-ON"
  confidence: "high" | "medium" | "low";
  detection_basis: string[];    // e.g. ["property address found: Toronto ON",
                                //        "reference to Residential Tenancies Act"]
  governing_law_clause?: string; // extracted text if explicit clause found
  supported: boolean;           // false if jurisdiction not in our corpus
}
```

**Requirements:**
- Search for explicit "Governing Law" clause first
- Search for property address and resolve province
- Search for references to named acts (RTA, etc.)
- If confidence is "low", flag to user that manual confirmation is needed
- If `supported: false`, halt analysis and return unsupported jurisdiction error

---

### 3.3 `segment_into_clauses`

**Purpose:** Split the raw lease text into discrete, individually-addressable
clauses — the unit of analysis for the rest of the pipeline.

**Input:**
```typescript
{
  raw_text: string;
  jurisdiction_code: string;
}
```

**Output:**
```typescript
{
  clauses: Array<{
    id: string;               // e.g. "clause_008"
    number: string;           // as written in lease, e.g. "8", "8.3(b)"
    heading?: string;         // section heading if present
    raw_text: string;
    char_start: number;       // position in original document
    char_end: number;
    cross_references: string[]; // clause numbers explicitly referenced within
  }>;
  total_count: number;
  segmentation_confidence: number;
}
```

**Requirements:**
- Must preserve original clause numbering as written
- Must detect and track cross-references between clauses (e.g. "subject to clause 12")
- Schedules and addendums must be included and flagged separately
- Must not merge adjacent clauses even if thematically related
- Must handle unnumbered clauses (assign synthetic ID)

---

### 3.4 `classify_clause`

**Purpose:** Determine the type and subtype of a clause to drive downstream
tool selection. This classification determines which statutes to look up.

**Input:**
```typescript
{
  clause_id: string;
  clause_text: string;
}
```

**Output:**
```typescript
{
  primary_type: ClauseType;
  subtype: string;
  confidence: number;
  requires_legal_lookup: boolean;
  lookup_priority: "high" | "medium" | "low" | "none";
  keywords: string[];           // extracted terms driving the classification
}
```

**ClauseType enum:**
```typescript
type ClauseType =
  | "rent_payment"              // base rent, due date, payment method
  | "rent_increase"             // timing, notice, amount caps
  | "security_deposit"          // amount, conditions, return timeline
  | "entry_rights"              // landlord access, notice requirements
  | "maintenance_repairs"       // who is responsible for what
  | "subletting_assignment"     // conditions and permissions
  | "early_termination"         // penalties, notice periods
  | "renewal_terms"             // automatic renewal, notice to vacate
  | "utilities"                 // what tenant pays
  | "pets"                      // restrictions and fees
  | "alterations"               // modifications to unit
  | "quiet_enjoyment"           // tenant's right to peaceful occupation
  | "liability_indemnification" // who is liable for what
  | "dispute_resolution"        // arbitration, waiver of rights
  | "parking_storage"           // included spaces and conditions
  | "guest_policy"
  | "standard_boilerplate"      // no legal lookup needed
  | "unknown";
```

**Requirements:**
- `requires_legal_lookup: false` for `standard_boilerplate` and `unknown`
- `lookup_priority: "high"` for dispute_resolution, entry_rights, early_termination
- Classification must be based on clause text, not heading alone
- Confidence below 0.6 must flag clause for human review

---

### 3.5 `lookup_statute`

**Purpose:** Retrieve the specific sections of Ontario's Residential Tenancies
Act (or other applicable acts) relevant to a clause type. This is the core
RAG tool — the agent's interface to real law.

**Input:**
```typescript
{
  clause_type: ClauseType;
  clause_text: string;
  jurisdiction_code: string;
  focus_keywords?: string[];   // agent-extracted terms to improve retrieval
}
```

**Output:**
```typescript
{
  statutes: Array<{
    act_name: string;          // e.g. "Residential Tenancies Act, 2006"
    section_number: string;    // e.g. "Section 42"
    section_title: string;
    text: string;              // full section text
    url: string;               // canonical government URL
    relevance_score: number;   // 0–1, vector similarity score
    last_verified: string;     // date corpus was last updated
  }>;
  retrieval_confidence: "high" | "medium" | "low" | "none";
  fallback_used: boolean;      // true if keyword fallback used instead of vector
}
```

**Requirements:**
- Query Supabase pgvector using Gemini embeddings (semantic search)
- Return top 3 most relevant sections, never more
- Never return a statute section with relevance_score below 0.45
- If no relevant statute found, return empty array and set retrieval_confidence: "none"
- Must not inject LLM-generated statute text — only return retrieved corpus content
- Every returned statute must have a verifiable government URL

---

### 3.6 `lookup_tribunal_decisions`

**Purpose:** Retrieve relevant LTB (Landlord and Tenant Board) tribunal decisions
and rulings that bear on a specific clause type or behavior pattern. Used to ground
negotiation advice in real precedent.

**Input:**
```typescript
{
  clause_type: ClauseType;
  clause_text: string;
  jurisdiction_code: string;
  risk_angle?: string;         // e.g. "landlord entry without notice"
}
```

**Output:**
```typescript
{
  decisions: Array<{
    case_number: string;
    decision_date: string;
    ruling_summary: string;    // 2–3 sentence summary
    outcome: "tenant_favour" | "landlord_favour" | "mixed";
    relevant_principle: string; // one-sentence takeaway
    url: string;               // CanLII URL
    relevance_score: number;
  }>;
  total_found: number;
  retrieval_confidence: "high" | "medium" | "low" | "none";
}
```

**Requirements:**
- Corpus sourced from CanLII (free, public)
- Return maximum 3 decisions per query
- Decisions must be from Ontario LTB specifically
- Prefer decisions from last 5 years unless earlier decisions are foundational
- Case numbers must be verifiable at CanLII

---

### 3.7 `score_clause_risk`

**Purpose:** Assign a risk score to a clause based on retrieved statutes,
not model opinion. This is where the legal research is synthesized into a judgment.

**Input:**
```typescript
{
  clause_id: string;
  clause_text: string;
  clause_type: ClauseType;
  retrieved_statutes: Statute[];
  retrieved_decisions: Decision[];
  jurisdiction_code: string;
}
```

**Output:**
```typescript
{
  risk_score: number;            // 1–10 (1 = standard/fair, 10 = illegal/predatory)
  risk_level: "low" | "medium" | "high" | "critical";
  is_potentially_unenforceable: boolean;
  is_unusual: boolean;           // legal but uncommon/aggressive
  is_standard: boolean;          // typical boilerplate, no concern
  plain_english_explanation: string;  // what this clause actually means
  risk_reasoning: string;        // why it scored this way, citing retrieved sections
  statutory_violations: Array<{
    statute_section: string;
    violation_description: string;
  }>;
  confidence: number;            // 0–1, lower if statutes were sparse
}
```

**Requirements:**
- `risk_reasoning` MUST cite specific retrieved statute sections by name and number
- If `retrieved_statutes` is empty, `confidence` must be below 0.5
- `is_potentially_unenforceable: true` only if a specific statute section is violated
- Score must reflect retrieved evidence, not LLM prior knowledge
- `plain_english_explanation` must be written for a non-legal audience
- Use "potentially unenforceable" not "illegal" — RTA violations render clauses void,
  not criminal. The landlord has not committed an offence; the clause simply cannot be
  enforced. Never use "illegal" without citing a specific offence provision.

---

### 3.8 `detect_contradiction`

**Purpose:** Identify cases where two clauses within the same lease conflict
with each other. This requires stateful cross-clause awareness and cannot be
done by analyzing clauses in isolation.

**Input:**
```typescript
{
  clause_a: { id: string; text: string; type: ClauseType; };
  clause_b: { id: string; text: string; type: ClauseType; };
}
```

**Output:**
```typescript
{
  has_contradiction: boolean;
  contradiction_type?: "direct_conflict" | "ambiguity" | "overlap";
  explanation?: string;          // plain-English description of the conflict
  which_governs?: string;        // if determinable, which clause likely prevails
  legal_basis?: string;          // statutory or interpretive basis for governance
  severity: "high" | "medium" | "low" | "none";
}
```

**Requirements:**
- Must be called for all pairs of clauses with known interaction patterns:
  - entry_rights ↔ quiet_enjoyment
  - maintenance_repairs ↔ liability_indemnification
  - early_termination ↔ renewal_terms
  - rent_increase ↔ security_deposit
  - subletting_assignment ↔ early_termination
- Agent must prioritize high-interaction pairs, not exhaustively check all N² pairs
- `which_governs` must cite a legal principle if asserted

---

### 3.9 `check_missing_clauses`

**Purpose:** Identify protections that Ontario's RTA entitles every tenant to
that are absent from this lease. Absence is a meaningful signal.

**Input:**
```typescript
{
  found_clause_types: ClauseType[];
  jurisdiction_code: string;
}
```

**Output:**
```typescript
{
  missing: Array<{
    protection_name: string;
    why_it_matters: string;        // plain-English explanation
    statutory_basis: string;       // which RTA section establishes this right
    severity: "critical" | "important" | "minor";
    note: string;                  // e.g. "applies by law even if not written"
  }>;
  implicit_protections: Array<{   // rights that apply by statute regardless
    protection_name: string;
    statutory_basis: string;
    explanation: string;
  }>;
}
```

**Ontario Required Checklist (must verify all):**
- Rent amount and payment terms (Section 12, RTA)
- Landlord's name and contact information (Section 12, RTA)
- Tenant's right to sublease (Section 97, RTA)
- Required notice period for entry (Section 27, RTA — 24 hours minimum)
- Tenant's right to reasonable enjoyment (Section 22, RTA)
- Prohibited reasons for eviction (Sections 59–84, RTA)
- Rent deposit rules (Section 105 — max 1 month, interest required)
- Right to assign tenancy (Section 95, RTA)
- Maintenance obligations (Section 20, RTA)
- Tenant's repair rights (Section 29, RTA)

**Requirements:**
- Rights marked `note: "applies by law even if not written"` must always appear
  in the implicit_protections list regardless of lease content — tenants often
  don't know they have rights that aren't in their lease
- `severity: "critical"` for any missing protection that directly affects
  financial or safety rights

---

### 3.10 `benchmark_clause`

**Purpose:** Compare a specific clause against the database of previously
analyzed Ontario leases to provide percentile context. This converts abstract
risk scores into concrete comparisons.

**Input:**
```typescript
{
  clause_type: ClauseType;
  clause_text: string;
  risk_score: number;
  jurisdiction_code: string;
}
```

**Output:**
```typescript
{
  percentile: number;              // 0–100, tenant-risk percentile
  comparison_label: string;        // e.g. "more aggressive than 84% of Ontario leases"
  sample_size: number;             // how many leases in comparison set
  typical_range: {
    low_risk_example?: string;     // anonymized example of fairer clause language
    median_score: number;
  };
  sufficient_data: boolean;        // false if sample_size < 10
}
```

**Requirements:**
- If `sample_size < 10`, set `sufficient_data: false` and omit `comparison_label`
- Do not fabricate percentile data — return null if insufficient data
- Anonymized clause text stored in comparison DB must not contain PII
- This tool must write to the DB as well as read (every analysis adds to the corpus)

---

### 3.11 `generate_negotiation_point`

**Purpose:** For high-risk clauses, generate a specific, actionable negotiation
strategy grounded in retrieved law and tribunal precedent — not generic advice.

**Input:**
```typescript
{
  clause_id: string;
  clause_text: string;
  clause_type: ClauseType;
  risk_score: number;
  retrieved_statutes: Statute[];
  retrieved_decisions: Decision[];
}
```

**Output:**
```typescript
{
  negotiable: boolean;              // is this realistically negotiable?
  negotiability_basis: string;      // why landlords typically accept/reject changes
  priority: "high" | "medium" | "low";
  ask: string;                      // plain-English: what to ask for
  counter_language: string;         // suggested replacement clause text
  legal_argument: string;           // the statutory/precedent basis to cite
  landlord_likely_response: string; // what the landlord may say
  your_rebuttal: string;            // how to respond to that
  walk_away_threshold: boolean;     // flag if this is a lease-breaking concern
}
```

**Requirements:**
- `counter_language` must be actual clause text, not a description
- `legal_argument` must cite specific retrieved statute or decision
- `negotiable: false` for clauses that are standard boilerplate or legally required
- `walk_away_threshold: true` only for clauses that are potentially illegal or
  waive fundamental statutory rights
- Do not generate negotiation points for clauses with `risk_score < 4`

---

### 3.12 `generate_report`

**Purpose:** Assemble all per-clause analyses, contradictions, missing protections,
and negotiation points into a structured, readable final report.

**Input:**
```typescript
{
  lease_id: string;
  jurisdiction: string;
  analyzed_clauses: AnalyzedClause[];
  contradictions: Contradiction[];
  missing_protections: MissingProtection[];
  implicit_protections: ImplicitProtection[];
  negotiation_points: NegotiationPoint[];
}
```

**Output:**
```typescript
{
  overall_risk_score: number;       // weighted average, 1–10
  overall_risk_level: "low" | "medium" | "high" | "critical";
  executive_summary: string;        // 3–4 sentence plain-English overview
  red_flags: RedFlag[];             // clauses scoring 7+, sorted by severity
  requires_attention: AnalyzedClause[]; // clauses scoring 4–6
  standard_clauses: AnalyzedClause[]; // clauses scoring 1–3
  contradictions: Contradiction[];
  missing_protections: MissingProtection[];
  implicit_protections: ImplicitProtection[];
  negotiation_guide: NegotiationPoint[]; // sorted by priority
  sources: Source[];                // all statutes and decisions cited
  analysis_metadata: {
    total_clauses: number;
    clauses_with_legal_lookup: number;
    statutes_retrieved: number;
    decisions_retrieved: number;
    corpus_last_updated: string;
    disclaimer: string;
  };
}
```

**Requirements:**
- `overall_risk_score` must be weighted: entry_rights, early_termination,
  dispute_resolution, and liability clauses carry 1.5× weight
- `executive_summary` must be written for a non-legal audience
- `sources` must list every statute and decision actually retrieved during analysis —
  no sources may appear that were not returned by a tool call
- `analysis_metadata.disclaimer` must include the full legal disclaimer text

---

## 4. Module Requirements

### 4.1 Document Ingestion Module

| ID | Requirement |
|----|-------------|
| DI-01 | Accept PDF files up to 25MB |
| DI-02 | Support text-based PDFs without requiring OCR |
| DI-03 | Fall back to Tesseract OCR for scanned/image PDFs |
| DI-04 | Strip page numbers, headers, and footers before processing |
| DI-05 | Handle multi-column layouts without scrambling text order |
| DI-06 | Reject non-PDF files with a clear error message |
| DI-07 | Store original PDF in Supabase Storage |
| DI-08 | Generate extraction confidence score; flag PDFs below 0.7 |

### 4.2 Jurisdiction Detection Module

| ID | Requirement |
|----|-------------|
| JD-01 | Must not require user to manually specify jurisdiction |
| JD-02 | Detect jurisdiction via property address, governing law clause, or act references |
| JD-03 | Return confidence level: high / medium / low |
| JD-04 | Halt analysis if jurisdiction is unsupported, with clear explanation |
| JD-05 | For low-confidence detections, surface the detection basis for user confirmation |

### 4.3 Clause Segmentation Module

| ID | Requirement |
|----|-------------|
| CS-01 | Preserve original clause numbering as written in the lease |
| CS-02 | Detect and track cross-references between clauses |
| CS-03 | Process addendums and schedules as separate clause sets, linked to parent lease |
| CS-04 | Assign synthetic IDs to unnumbered clauses |
| CS-05 | Detect and flag clauses that span multiple pages |
| CS-06 | Store `char_start` and `char_end` for each clause for frontend highlighting |

### 4.4 Legal Research (RAG) Module

| ID | Requirement |
|----|-------------|
| LR-01 | All statute retrieval uses semantic vector search over embedded corpus |
| LR-02 | Keyword fallback activates automatically if vector search returns < 2 results |
| LR-03 | Never return statute sections with relevance_score below 0.45 |
| LR-04 | Every statute returned must have a verifiable government URL |
| LR-05 | Corpus must be versioned — analysis reports must record corpus date |
| LR-06 | Corpus refresh script must be runnable to update embeddings when law changes |

### 4.5 Risk Assessment Module

| ID | Requirement |
|----|-------------|
| RA-01 | Risk score must be 1–10; never use model opinion without retrieved statutes |
| RA-02 | If no statute retrieved, confidence must be flagged below 0.5 |
| RA-03 | "Potentially unenforceable" flag requires citation of specific statute section — never use "illegal" for RTA violations |
| RA-04 | Plain-English explanation required for every scored clause |
| RA-05 | Risk reasoning must cite statute by name and section number |
| RA-06 | Scoring must be deterministic given the same inputs (no randomness) |

### 4.6 Contradiction Detection Module

| ID | Requirement |
|----|-------------|
| CD-01 | Check all known high-interaction clause pairs (see tool spec §3.8) |
| CD-02 | Contradictions must be surfaced in the report with both clause IDs cited |
| CD-03 | If one clause governs over another, legal basis must be stated |
| CD-04 | Severity levels: high (materially affects tenant rights), medium, low |

### 4.7 Missing Clause Detection Module

| ID | Requirement |
|----|-------------|
| MC-01 | Check all 10 required Ontario protections (see tool spec §3.9) |
| MC-02 | Always include implicit protections (apply by law regardless of lease) |
| MC-03 | Explain in plain English why each missing protection matters |
| MC-04 | Severity: critical (financial/safety), important, minor |

### 4.8 Negotiation Intelligence Module

| ID | Requirement |
|----|-------------|
| NI-01 | Generate negotiation points only for clauses with risk_score ≥ 4 |
| NI-02 | Counter-language must be actual replacement clause text, not a description |
| NI-03 | Legal argument must cite retrieved statute or decision, not LLM knowledge |
| NI-04 | Include landlord likely response and tenant rebuttal |
| NI-05 | Flag walk-away clauses that waive fundamental statutory rights |
| NI-06 | Mark non-negotiable clauses explicitly (standard boilerplate, legally required) |

### 4.9 Benchmarking Module

| ID | Requirement |
|----|-------------|
| BM-01 | Every completed analysis adds anonymized clause data to the comparison DB |
| BM-02 | Remove any PII from clause text before storing in comparison DB |
| BM-03 | Do not report percentiles when sample_size < 10 |
| BM-04 | Percentile context shown on all clauses with sufficient data |
| BM-05 | Comparison DB grows with each analysis — cold-start gracefully handled |
| BM-06 | Benchmark corpus must be pre-seeded before launch by running the pipeline against the Ontario Standard Form of Lease and 20–30 publicly available sample leases. A seeding script (`/scripts/seed_benchmark.ts`) must be part of the build |

### 4.10 Report Generation Module

| ID | Requirement |
|----|-------------|
| RG-01 | Sources section must list only statutes/decisions actually retrieved by tools |
| RG-02 | Overall risk score uses weighted average (entry, early_termination, dispute,   liability = 1.5×) |
| RG-03 | Executive summary must be written for non-legal audience |
| RG-04 | Legal disclaimer must appear in every generated report |
| RG-05 | Report must be persistently stored and accessible via a shareable URL |
| RG-06 | Report must be exportable as PDF |

---

## 5. Data Models

### 5.1 Lease

```typescript
{
  id: uuid;
  uploaded_at: timestamp;
  user_id: uuid | null;         // null for anonymous uploads
  status: "pending" | "processing" | "complete" | "failed";
  jurisdiction: string;
  jurisdiction_code: string;
  jurisdiction_confidence: "high" | "medium" | "low";
  raw_text: string;
  file_path: string;            // Supabase Storage path
  page_count: number;
  extraction_method: "text" | "ocr";
  overall_risk_score: number | null;
  overall_risk_level: string | null;
  corpus_version: string;       // which version of law corpus was used
  analysis_completed_at: timestamp | null;
  error_message: string | null;
}
```

### 5.2 Clause

```typescript
{
  id: uuid;
  lease_id: uuid;
  clause_number: string;
  heading: string | null;
  raw_text: string;
  char_start: number;
  char_end: number;
  primary_type: ClauseType;
  subtype: string | null;
  classification_confidence: number;
  risk_score: number | null;
  risk_level: string | null;
  is_potentially_unenforceable: boolean;
  is_unusual: boolean;
  is_standard: boolean;
  plain_english_explanation: string | null;
  risk_reasoning: string | null;
  statutory_violations: JSON | null;
  analysis_confidence: number | null;
  has_negotiation_point: boolean;
  cross_references: string[];
}
```

### 5.3 Statute (Corpus)

```typescript
{
  id: uuid;
  jurisdiction_code: string;
  act_name: string;
  section_number: string;
  section_title: string;
  full_text: string;
  url: string;
  embedding: vector(768);       // Gemini text-embedding-004
  clause_types: ClauseType[];   // which clause types this section is relevant to
  embedded_at: timestamp;
  corpus_version: string;
}
```

### 5.4 TribunalDecision (Corpus)

```typescript
{
  id: uuid;
  jurisdiction_code: string;
  tribunal: string;             // e.g. "Ontario LTB"
  case_number: string;
  decision_date: date;
  ruling_summary: string;
  outcome: "tenant_favour" | "landlord_favour" | "mixed";
  relevant_principle: string;
  relevant_clause_types: ClauseType[];
  url: string;                  // CanLII URL
  embedding: vector(768);
  embedded_at: timestamp;
}
```

### 5.5 Contradiction

```typescript
{
  id: uuid;
  lease_id: uuid;
  clause_a_id: uuid;
  clause_b_id: uuid;
  contradiction_type: "direct_conflict" | "ambiguity" | "overlap";
  explanation: string;
  which_governs: string | null;
  legal_basis: string | null;
  severity: "high" | "medium" | "low";
}
```

### 5.6 NegotiationPoint

```typescript
{
  id: uuid;
  lease_id: uuid;
  clause_id: uuid;
  priority: "high" | "medium" | "low";
  negotiable: boolean;
  ask: string;
  counter_language: string;
  legal_argument: string;
  landlord_likely_response: string;
  tenant_rebuttal: string;
  walk_away_threshold: boolean;
  cited_statutes: string[];
  cited_decisions: string[];
}
```

### 5.7 ClauseComparison (Benchmarking)

```typescript
{
  id: uuid;
  clause_type: ClauseType;
  anonymized_text: string;      // PII stripped
  risk_score: number;
  jurisdiction_code: string;
  analyzed_at: timestamp;
  embedding: vector(768);       // for semantic similarity matching
}
```

---

## 6. RAG Corpus Specification

### 6.1 Primary Sources (Ontario MVP)

| Source | Content | Acquisition | Update Frequency |
|--------|---------|-------------|-----------------|
| ontario.ca/laws | Residential Tenancies Act, 2006 — full text | Scrape + parse | Monthly check |
| Tribunals Ontario | LTB Guidelines (14 guidelines) | Scrape + parse | Monthly check |
| Tribunals Ontario | LTB Interpretation Guidelines | Scrape + parse | Monthly check |
| CanLII | Ontario LTB decisions (last 5 years) | Registered API only (no HTML scraping — ToS restriction). Plan 2–4 weeks for incremental acquisition. | Monthly additions |
| Ontario Government | Standard Form of Lease | PDF download | On form revision |

### 6.2 Chunking Strategy

- Statute text: chunk at section boundaries (Section N as one unit)
- Sub-sections that exceed 500 tokens: split at sub-section level
- Tribunal decisions: chunk at principle/ruling level (not full decision text)
- Each chunk must include metadata: act name, section number, URL, version date

### 6.3 Embedding

- Model: Gemini `text-embedding-004` (free, 768 dimensions)
- Store in Supabase pgvector column
- Indexing: ivfflat index for approximate nearest-neighbour search
- Similarity threshold: cosine similarity ≥ 0.45 to be returned

### 6.4 Corpus Versioning

- Each corpus build is assigned a version string (date-based: `2025-05-01`)
- Analysis reports record `corpus_version` used
- Stale corpus (> 60 days old) surfaces a warning in the report

---

## 7. Frontend Requirements

### 7.1 Upload Flow

- Drag-and-drop or click-to-upload PDF
- File size validation (max 25MB) before upload
- Real-time job status polling with progress indicator
- Estimated completion time shown (typical: 45–90 seconds)
- Clear error states for unsupported jurisdiction, failed extraction

### 7.2 Report View

**Overview Panel**
- Overall risk score displayed as a gauge (1–10)
- Risk level label (low / medium / high / critical) with color coding
- Executive summary in plain English
- Quick-stat cards: total clauses, red flags, missing protections, negotiation points

**Clause Explorer**
- All clauses listed, filterable by type and risk level
- Each clause expandable to show:
  - Plain-English explanation
  - Risk score with reasoning
  - Statutes cited (with link to source)
  - Tribunal decisions referenced (with link to CanLII)
  - Benchmarking percentile (if sufficient data)
  - Negotiation point (if generated)
- Clauses highlighted in the original PDF context (using `char_start`/`char_end`)

**Red Flags Panel**
- Clauses scoring 7+ sorted by severity
- Potentially illegal clauses marked distinctly
- Walk-away clauses called out explicitly

**Missing Protections Panel**
- List of absent protections with severity
- Implicit protections section ("you have these rights regardless of what the lease says")

**Contradictions Panel**
- Each contradiction shows both clause IDs with excerpts
- Explains which clause likely governs and why

**Negotiation Guide**
- All negotiation points sorted by priority
- Each point shows: what to ask for, the replacement clause text, the legal argument, the likely landlord response, the rebuttal
- Walk-away items visually distinct

**Agent Reasoning Trace**
- Collapsible panel showing exactly which tools were called during analysis, in order
- Each entry shows: tool name, inputs summary, outputs summary, duration
- Example: "lookup_statute(entry_rights) → returned Section 27 RTA (similarity: 0.87) → cited in Clause 8 risk score"
- This panel is the primary proof that LeaseGuard is not a wrapper — make it prominent for technical reviewers

**Sources**
- Every statute cited, with section number and government URL
- Every tribunal decision cited, with case number and CanLII URL
- Corpus version and last-updated date
- Legal disclaimer (full text)

### 7.3 Shareable Report

- Each completed report has a unique URL
- Reports are publicly accessible without login (opt-in anonymous sharing)
- Reports expire after 90 days unless user creates account

---

## 8. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF-01 | Full analysis completes in under 90 seconds for a standard 20-page lease |
| NF-02 | PDF extraction completes in under 10 seconds |
| NF-03 | Each individual tool call completes in under 8 seconds |
| NF-04 | System handles 10 concurrent analysis jobs without degradation |
| NF-05 | All tool call inputs and outputs are logged for auditability |
| NF-06 | Agent reasoning chain (tool call sequence + inputs/outputs) is stored per analysis |
| NF-07 | Frontend is responsive down to 375px viewport |
| NF-08 | Report is fully readable without JavaScript (SSR) |
| NF-09 | Corpus embedding is idempotent — re-running does not create duplicates |
| NF-10 | Upload endpoint must enforce per-IP rate limiting (max 5 analyses/hour) to prevent free-tier exhaustion |
| NF-11 | Clause analysis must be parallelised — classify + lookup + score run concurrently across clauses, not sequentially. Sequential processing of 20+ clauses exceeds the 90s target by 4× |
| NF-12 | 90-second target applies only when the service is warm. Cold-start time (first request after inactivity) is documented separately and not counted against the SLA |

---

## 9. Legal & Ethical Requirements

| ID | Requirement |
|----|-------------|
| LE-01 | Every report must prominently display: "This analysis is not legal advice. Consult a licensed paralegal or lawyer before making decisions about your lease." |
| LE-02 | The word "illegal" must not appear in output for RTA violations — use "potentially unenforceable." "Illegal" is only permissible when a specific penal provision (RTA or Criminal Code) is retrieved and cited |
| LE-03 | Confidence scores must be surfaced when the agent's certainty is low |
| LE-04 | Uploaded PDFs must not be used for any purpose beyond analysis |
| LE-05 | Clause comparison data stored in the benchmark DB must be PII-free |
| LE-06 | Users must be informed that their (anonymized) clause data contributes to benchmarking |
| LE-07 | Corpus version and last-updated date must appear on every report |
| LE-08 | The system must never claim to have analyzed a clause it did not process |
| LE-09 | PIPEDA compliance is required before public launch: privacy policy, upload consent notice, data retention policy (max 90 days for raw PDFs unless user has account), and breach notification procedure |
| LE-10 | CanLII corpus must be built via their registered API, not HTML scraping, to comply with their terms of service. Plan for 2–4 weeks of incremental acquisition |
| LE-11 | Output must use "potentially unenforceable" not "illegal." Under the RTA, problematic clauses are void — the landlord has not committed an offence. "Illegal" may only appear when a specific penal provision of the RTA or Criminal Code is cited |

---

## 10. Out of Scope (MVP)

The following are explicitly deferred to keep the MVP focused and shippable:

- Jurisdictions other than Ontario (BC, Alberta, NYC, etc.)
- Commercial lease analysis
- Real-time lease negotiation chat interface
- Integration with DocuSign or e-signature platforms
- Landlord-side analysis (this tool is tenant-first)
- Mobile app
- Multi-language support
- Historical rent tracking or market rent comparisons
- Automated corpus refresh (manual trigger only for MVP)
- Email delivery of reports

---

## 11. Free Stack

| Component | Technology | Free Limit | Notes |
|-----------|-----------|------------|-------|
| Agent LLM | Claude (Anthropic API) | $5 free credit on signup | Covers ~200+ analyses at Haiku rates; Gemini is embeddings-only and cannot serve as MCP agent |
| Embeddings | Gemini text-embedding-004 | 1,500 req/min free | Used for statute + decision + benchmark corpus; not for agent reasoning |
| Vector DB | Supabase pgvector | 500MB free | Full RTA corpus ≈ 50MB — well within limit |
| Database | Supabase PostgreSQL | 500MB free | Fine for portfolio scale |
| File Storage | Supabase Storage | 1GB free | ~200–500 lease PDFs |
| Auth | Supabase Auth | Free | Optional for MVP |
| PDF parsing | PyMuPDF | Open source | Python subprocess called from MCP server |
| OCR | Tesseract | Open source | Fallback for scanned PDFs |
| MCP Server | TypeScript / Node.js | Open source | Deployed on Railway free tier or run locally |
| Backend | Next.js API routes | Vercel free tier | Replaces FastAPI — serverless, always warm, no cold-start |
| Frontend | Next.js on Vercel | Free tier | Fine for portfolio traffic |
| Law corpus | ontario.ca (XML feeds) | Public, free | Use official XML legislation feeds, not HTML scraping |
| Decisions corpus | CanLII registered API | Free with registration | Not HTML scraping — register at canlii.org for API access |
| **Realistic throughput** | | **~15–20 analyses/day** | Rate-limited by Anthropic API free credit; not 100/day |
| **Total ongoing cost** | | **$0/month** | Anthropic credit is one-time; replenish if needed (~$5 covers months of portfolio traffic) |

---

*LeaseGuard — Built to read what tenants don't.*
