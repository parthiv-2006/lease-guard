# LeaseGuard — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-13  
**Author:** Parthiv Paul  
**Status:** Draft  

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Problem Statement](#2-problem-statement)
3. [Target Users](#3-target-users)
4. [User Personas](#4-user-personas)
5. [User Stories](#5-user-stories)
6. [Competitive Landscape](#6-competitive-landscape)
7. [Feature List](#7-feature-list)
8. [User Flows](#8-user-flows)
9. [Success Metrics](#9-success-metrics)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Launch Plan](#11-launch-plan)

---

## 1. Product Vision

**One sentence:**  
LeaseGuard gives every tenant access to the same quality of lease analysis that
only people who can afford a lawyer currently get.

**The aspiration:**  
The information asymmetry between landlords and tenants is structural. Landlords
use lawyers to draft agreements; tenants sign them in 48 hours. LeaseGuard closes
that gap — not by replacing lawyers, but by making sure no tenant walks into a
signing blind.

**What success looks like in 12 months:**  
A tenant uploads a lease, reads the report, identifies a clause they would have
missed, negotiates it out, and saves themselves from a future dispute. That happens
thousands of times. LeaseGuard becomes the tool that circulates in student housing
Facebook groups, Reddit threads, and newcomer community chats.

---

## 2. Problem Statement

### The Core Problem

Residential leases are long, technical, and deliberately one-sided. They are written
by landlords' legal teams to maximise landlord protections and minimise tenant
recourse. The average tenant has neither the time, the legal training, nor the money
to counterbalance this.

### The Consequences

- Tenants agree to unenforceable clauses and later discover they have no legal recourse
  when they try to enforce them — because they signed
- Tenants miss missing protections they were entitled to by law simply because
  those protections were not written into the lease
- Tenants lose security deposits over clauses they did not understand when they
  signed
- Tenants are pressured into signing under time constraints with no way to quickly
  assess risk

### Why Existing Solutions Fall Short

| Existing Option | Why It Falls Short |
|---|---|
| Hiring a paralegal or lawyer | Costs $200–$500+, takes days, inaccessible for most |
| Reading it yourself | Requires legal knowledge most tenants do not have |
| Asking an AI chatbot | No grounding in real law; outputs opinions, not citations |
| Tenant advocacy orgs | Reactive (helps after disputes), not proactive |
| Free legal clinics | Underfunded, long wait times, not available at signing speed |

### The Opportunity

There is no free, fast, legally-grounded tool that gives tenants a clear risk
assessment before they sign. LeaseGuard fills that gap specifically for Ontario
tenants, with a path to expand province by province.

---

## 3. Target Users

### Primary Market

**Ontario residential tenants** who are about to sign a new lease or renew an
existing one — particularly:

- University and college students (Toronto, Ottawa, Waterloo, Hamilton)
- Young professionals signing their first or second lease
- International students and newcomers unfamiliar with Ontario tenant law
- Tenants in high-pressure rental markets (Toronto, Mississauga, Ottawa)

### Secondary Market (Post-MVP)

- Tenant advocacy organisations looking for a tool to recommend to clients
- Student unions and campus housing offices
- Legal aid clinics wanting a triage tool before consultation

### Who Is NOT the Target User (MVP)

- Commercial tenants
- Landlords
- Tenants outside Ontario
- Tenants already in an active dispute (they need a lawyer, not an analysis tool)

---

## 4. User Personas

### Persona 1 — The International Student

**Name:** Priya, 22  
**Situation:** First year master's student at UofT. Moving from India. Signing her
first Canadian lease. Has no frame of reference for what is normal in Ontario.  
**Pain point:** Does not know which clauses are standard and which are red flags.
Worried about being taken advantage of. Cannot afford legal consultation on a
student budget.  
**What she needs:** A clear, plain-English explanation of what she is agreeing to
and what her rights are — before she signs.  
**How she finds LeaseGuard:** Reddit thread in r/UofT or r/TorontoRenting.

---

### Persona 2 — The First-Time Renter

**Name:** Marcus, 24  
**Situation:** Just graduated, first full-time job in Toronto, signing his first
apartment lease. Lease is 35 pages. Landlord wants it signed in 24 hours or the
unit goes to the next applicant.  
**Pain point:** No time to read it properly. No lawyer. No one in his life who
knows tenant law.  
**What he needs:** A fast risk assessment that tells him what to focus on and
what he can push back on — before the 24-hour deadline.  
**How he finds LeaseGuard:** Twitter/X post, word of mouth, Product Hunt.

---

### Persona 3 — The Cautious Re-Signer

**Name:** Sarah, 31  
**Situation:** Renewing her lease after two years. Landlord has added several
new clauses to the renewal. She is not sure what changed or whether the new
terms are acceptable.  
**Pain point:** No easy way to compare the new clauses to what she signed before
or to understand if the new terms are standard.  
**What she needs:** A focused analysis of the changed and new clauses, with
context for whether they are reasonable.  
**How she finds LeaseGuard:** Google search for "Ontario lease review tool."

---

### Persona 4 — The Tenant Advocate

**Name:** James, 45  
**Situation:** Volunteer coordinator at a community legal clinic. Sees dozens
of tenants a week who have already signed bad leases. Wants a tool to recommend
to tenants before they sign so they come in informed.  
**Pain point:** Clinic is reactive; tenants show up after the problem. He wants
something proactive he can point people to.  
**What he needs:** A trustworthy, legally grounded tool he can recommend without
worrying it will give bad advice.  
**How he finds LeaseGuard:** Legal aid network, social media, direct outreach.

---

## 5. User Stories

### Upload & Analysis

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | tenant | upload my lease PDF in under 30 seconds | I can start the analysis without friction |
| US-02 | tenant | see a real-time progress indicator | I know the analysis is running and roughly when it will finish |
| US-03 | tenant | receive a complete analysis in under 90 seconds | I can use it under time pressure |
| US-04 | tenant | upload a scanned paper lease | I am not blocked because my lease is not a digital PDF |
| US-05 | tenant | have the system automatically determine my province | I do not need to understand jurisdictional law myself |

### Understanding the Report

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-06 | tenant | see an overall risk score at a glance | I can immediately understand if this lease is broadly fair or problematic |
| US-07 | tenant | read every clause explained in plain English | I understand what I am actually agreeing to |
| US-08 | tenant | see each risk score explained with a specific reason | I know why a clause is flagged, not just that it is |
| US-09 | tenant | click through to the actual law being cited | I can verify the claim myself |
| US-10 | tenant | see which protections are missing from my lease | I know what rights I have that the lease failed to mention |
| US-11 | tenant | see contradictions between clauses highlighted | I understand where ambiguity in the lease could hurt me |
| US-12 | tenant | know when the legal information was last updated | I can assess how current the analysis is |

### Taking Action

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-13 | tenant | see a prioritised list of clauses worth negotiating | I know where to focus my limited negotiating energy |
| US-14 | tenant | see the exact wording I should propose as a replacement | I can negotiate with specific language, not vague requests |
| US-15 | tenant | understand the landlord's likely response and how to reply | I feel prepared for the negotiation conversation |
| US-16 | tenant | know which clauses are walk-away concerns | I can make an informed decision about whether to sign at all |
| US-17 | tenant | know which clauses are standard boilerplate | I do not waste energy negotiating things every lease has |

### Sharing & Reference

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-18 | tenant | share my report via a link | I can show it to a friend, parent, or advisor for a second opinion |
| US-19 | tenant | export my report as a PDF | I can save it for my records or bring it to a legal clinic |
| US-20 | tenant advocate | recommend the tool confidently | I know it cites real law and not AI opinion |

---

## 6. Competitive Landscape

| Product | What It Does | Key Weakness vs. LeaseGuard |
|---------|-------------|---------------------------|
| **ChatGPT / Claude (direct)** | General AI assistant — can "review" a lease if prompted | No grounding in real law; no citations; no structured output; hallucination risk |
| **DoNotPay** | AI legal tool for various consumer issues | Broad scope, not deep on Canadian tenant law; subscription cost |
| **Kira Systems** | Enterprise contract analysis AI | Built for law firms; far too expensive and complex for tenants |
| **Lease Lens (US)** | US-focused lease review | US law only; no Canadian jurisdiction coverage |
| **Community Legal Clinics** | Free tenant legal advice | Reactive, not real-time; long wait times; appointment-based |
| **Reading it yourself** | Free, always available | Requires expertise most tenants lack; takes hours |

### LeaseGuard's Differentiation

1. **Grounded in retrieved law** — not LLM opinion. Every claim cites a statute or tribunal decision.
2. **Tenant-specific** — built for one user type, deeply, rather than broadly for many
3. **Ontario-native** — not a US product with a Canadian checkbox
4. **Actionable output** — negotiation language, not just risk flags
5. **Free** — no paywall, no subscription, no consultation fee
6. **Fast** — analysis in under 90 seconds, suitable for time-pressured decisions

---

## 7. Feature List

### Must Have (MVP)

| ID | Feature | Rationale |
|----|---------|-----------|
| F-01 | PDF upload (text and scanned) | Core input method |
| F-02 | Automatic jurisdiction detection | Non-negotiable for legal accuracy |
| F-03 | Clause-by-clause segmentation | Foundation of all downstream analysis |
| F-04 | Clause type classification | Required for targeted law retrieval |
| F-05 | Statute retrieval via RAG (Ontario RTA) | What makes it not a wrapper |
| F-06 | Risk scoring with cited reasoning | Core output |
| F-07 | Plain-English clause explanations | Usability for non-legal audience |
| F-08 | Missing protections detection | High-value, unique feature |
| F-09 | Contradiction detection | Unique, high-value |
| F-10 | Negotiation guide with counter-language | Differentiating output |
| F-11 | Walk-away clause flagging | High-stakes tenant decision support |
| F-12 | Overall risk score + executive summary | Report entry point |
| F-13 | Sources panel with statute links | Trust and verifiability |
| F-14 | Shareable report URL (opt-in, with explicit consent notice) | Viral distribution mechanism |
| F-15 | Legal disclaimer on all outputs | Ethical and legal requirement |
| F-16-mvp | User feedback button on every report ("Was this analysis accurate?") | Required to track quality metric: user-reported factual errors < 2% |
| F-17-mvp | Agent reasoning trace panel (collapsible) showing tool call sequence | Proves "not a wrapper" — key for technical credibility and portfolio reviewers |

### Should Have (Post-MVP v1.1)

| ID | Feature | Rationale |
|----|---------|-----------|
| F-16 | Clause benchmarking percentiles | Adds powerful context once corpus is large enough — pre-seed corpus before launch |
| F-17 | LTB tribunal decision retrieval | Strengthens negotiation grounding |
| F-18 | PDF export of report | User retention and reference |
| F-19 | Implicit protections panel | Educates tenants on rights they have regardless of lease |
| F-20 | Clause highlighting in PDF preview | Improves usability of report |
| F-21 | User accounts and saved reports | Retention and renewal use case |

### Nice to Have (Future)

| ID | Feature | Rationale |
|----|---------|-----------|
| F-22 | BC jurisdiction support | Second largest Canadian rental market |
| F-23 | Alberta jurisdiction support | Third province in natural expansion |
| F-24 | Lease comparison (original vs. renewal) | Persona 3 (re-signer) use case |
| F-25 | Email report delivery | Accessibility for low-tech users |
| F-26 | Tenant rights education hub | SEO and trust-building |
| F-27 | Landlord red-flag database | Crowd-sourced landlord reputation signals |

### Will Not Build (MVP)

- Commercial lease analysis
- Legal advice or dispute representation
- Real-time chat interface
- Integration with e-signature platforms
- Mobile native app
- Multi-language support

---

## 8. User Flows

### 8.1 Primary Flow — First-Time Upload

```
Landing page
    │
    ▼
Upload PDF (drag-and-drop or click)
    │
    ├── File too large (>25MB) → error: "File exceeds 25MB limit"
    ├── Not a PDF → error: "Only PDF files are supported"
    └── Valid PDF
            │
            ▼
        Processing screen
        "Analysing your lease — usually takes 60–90 seconds"
        [Progress: Extracting text → Detecting jurisdiction →
                   Reading clauses → Researching law → Building report]
            │
            ├── Unsupported jurisdiction →
            │       "We currently support Ontario leases only.
            │        More provinces coming soon."
            │
            ├── Extraction failed →
            │       "We could not read this PDF. Try exporting it
            │        from your email as a fresh PDF and re-uploading."
            │
            └── Analysis complete
                    │
                    ▼
                Report page
                [Overview → Red Flags → Clause Explorer →
                 Missing Protections → Contradictions →
                 Negotiation Guide → Sources]
```

### 8.2 Report Interaction Flow

```
Report page loads with Overview panel
    │
    ├── User clicks a Red Flag clause
    │       → Clause expands: plain-English explanation,
    │         risk score + reasoning, statute links,
    │         negotiation point
    │
    ├── User clicks "Negotiation Guide"
    │       → Sorted list of all negotiation points
    │         by priority (High → Medium → Low)
    │         Each shows: ask / counter-language /
    │         legal argument / rebuttal
    │
    ├── User clicks a statute citation
    │       → Opens ontario.ca or CanLII in new tab
    │
    ├── User clicks "Share Report"
    │       → Copies unique report URL to clipboard
    │         "Anyone with this link can view your report
    │          for 90 days."
    │
    └── User clicks "Export PDF"
            → Downloads report as formatted PDF
              with disclaimer footer
```

---

## 9. Success Metrics

### Activation

| Metric | Target (Month 3) | Notes |
|--------|-----------------|-------|
| Leases analysed | 200+ | Measures real usage, not signups |
| Analysis completion rate | > 85% | % of uploads that reach a complete report |
| Time to complete report | < 90s median | Core UX promise |

### Engagement

| Metric | Target (Month 3) | Notes |
|--------|-----------------|-------|
| Report pages viewed per session | > 3 panels | Are users actually reading the report? |
| Negotiation guide opened rate | > 50% | Is the actionable output being used? |
| Source links clicked | > 30% | Are users verifying claims? |
| Report shared rate | > 20% | Viral distribution signal |

### Quality

| Metric | Target | Notes |
|--------|--------|-------|
| Statute retrieval hit rate | > 90% | % of lookups that return ≥ 1 relevant result |
| Jurisdiction detection accuracy | > 95% | Validated on sample set |
| User-reported factual errors | < 2% | Tracked via feedback button on report |

### Growth

| Metric | Target (Month 6) | Notes |
|--------|-----------------|-------|
| Organic referral rate | > 40% | Users finding it via word of mouth |
| Returning users | > 25% | Renewal and re-upload use case |
| Community mentions | 5+ | Reddit, housing Facebook groups, Discord |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **LLM hallucination on legal facts** | Medium | High | RAG over real law is mandatory; no legal claim without retrieved source; confidence flagging |
| **Outdated law corpus** | Medium | High | Corpus versioning; monthly refresh; corpus date shown on every report |
| **Low jurisdiction detection accuracy** | Low | High | Extensive testing on real Ontario leases; user confirmation prompt for low-confidence cases |
| **PDF extraction failures (scanned leases)** | Medium | Medium | Tesseract OCR fallback; user-friendly error with retry instructions |
| **Legal liability for incorrect analysis** | Low | High | Prominent disclaimer on all outputs; use "unenforceable" not "illegal"; recommend legal counsel for high-risk clauses |
| **Anthropic API credit exhaustion** | Medium | High | Per-IP rate limiting (5 analyses/hour); queue system for bursts; $5 credit covers ~200 analyses — replenish proactively |
| **Free tier rate limits blocking burst traffic** | Medium | Medium | Realistic throughput is 15–20 analyses/day, not 100. Queue and rate-limit accordingly; document actual capacity honestly |
| **Render/service cold starts breaking 90s SLA** | High | Medium | Backend is Next.js API routes on Vercel (serverless, always warm) — FastAPI on Render dropped specifically to eliminate this risk |
| **Supabase free tier pause** | Medium | Low | Warm-up ping on deploy; acceptable for portfolio-scale traffic |
| **Benchmarking cold start (no comparison data)** | High | Medium | Pre-seed corpus before launch using Ontario Standard Form of Lease + 20–30 sample leases via `/scripts/seed_benchmark.ts` |
| **Corpus too narrow (LTB decisions not representative)** | Medium | Medium | Start with broad clause types; expand corpus before enabling negotiation grounding |
| **CanLII ToS violation via scraping** | Medium | High | Use CanLII registered API only — not HTML scraping. Register at canlii.org. Budget 2–4 weeks for corpus acquisition |
| **PIPEDA non-compliance at launch** | Medium | High | Privacy policy, upload consent, and data retention policy required before any public URL is shared |
| **Statute retrieval false positives (threshold too low)** | Medium | Medium | Validate 0.45 cosine similarity threshold against known clause/statute pairs before production; adjust upward if false positives appear |

---

## 11. Launch Plan

### Phase 0 — Foundation (Weeks 1–2)

- [ ] Set up Supabase (PostgreSQL + pgvector + Storage)
- [ ] Build RAG corpus: scrape and embed RTA + LTB guidelines
- [ ] Validate jurisdiction detection on 20 real Ontario leases
- [ ] Define and test all MCP tool schemas

### Phase 1 — Core Agent (Weeks 3–5)

- [ ] Implement MCP server (TypeScript) with all 12 tools
- [ ] Build PDF extraction pipeline (PyMuPDF + Tesseract)
- [ ] Implement clause segmentation and classification
- [ ] Implement statute retrieval (RAG) and risk scoring
- [ ] Implement contradiction and missing clause detection
- [ ] End-to-end test with 10 real Ontario leases

### Phase 2 — Report & Frontend (Weeks 6–7)

- [ ] Build FastAPI backend (job management, report storage)
- [ ] Build Next.js frontend (upload, report view, all panels)
- [ ] Implement shareable report URLs
- [ ] Add legal disclaimer to all report outputs
- [ ] Deploy: Vercel (frontend) + Render (backend)

### Phase 3 — Quality & Polish (Week 8)

- [ ] Validate output accuracy against known lease clauses
- [ ] Add PDF export
- [ ] Performance optimisation (target: < 90s median)
- [ ] Add corpus version display and last-updated date
- [ ] Write README and technical write-up for portfolio

### Phase 4 — Launch

- [ ] Post on Reddit: r/TorontoRenting, r/PersonalFinanceCanada, r/UofT
- [ ] Submit to Product Hunt
- [ ] Share technical write-up on LinkedIn / personal blog
- [ ] Gather feedback from 20 real users, iterate

---

*LeaseGuard — Read what you sign.*
