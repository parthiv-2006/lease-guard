# Handoff: LeaseGuard Frontend

## Overview

This is the complete frontend design for LeaseGuard — an AI-powered Ontario lease analysis tool that reads residential lease PDFs against the Residential Tenancies Act and produces a structured risk report with negotiation guidance.

The design covers the full user journey: PDF upload → real-time processing progress → multi-panel analysis report.

---

## About the Design Files

The files in this folder are **high-fidelity HTML prototypes** — design references showing intended look, layout, typography, colour, and interactive behaviour. They are **not** production code to copy directly.

Your task is to **recreate these designs in the existing Next.js codebase** (`app/page.tsx`, `app/report/[id]/page.tsx`, etc.) using Next.js App Router conventions, TypeScript, and whatever component/styling approach is already established. The HTML prototypes use inline React+Babel for portability — translate these into proper Next.js components.

Open `LeaseGuard.html` in a browser to interact with all screens. The prototype uses mock data (`lg-data.js`) — the real API endpoints already exist as stubs in the codebase.

---

## Fidelity

**High-fidelity.** Pixel-precise colours, typography, spacing, and interactions are all specified below and visible in the prototypes. Recreate them as closely as possible using the codebase's chosen styling approach.

---

## Screens

### 1. Landing / Upload Page (`app/page.tsx`)

**Purpose:** User's first contact. They drag-and-drop or click to select a PDF lease, validate it, and trigger analysis.

**Layout:**
- Full-viewport column flex, background `#f6f3ee`
- **Header** — 56px tall, `border-bottom: 1px solid #e8e4dc`, horizontal padding 48px. Left: wordmark. Right: three nav links.
- **Hero** — centered column, `padding: 64px 24px 80px`, `max-width: 720px` for headline
- **Upload zone** — `max-width: 560px`, centered
- **Stats bar** — 4-column flex row, white card below upload zone

**Upload zone states:**
- *Default:* `border: 1.5px dashed #c8c3ba`, `border-radius: 10px`, `background: #fdfcfa`, `padding: 52px 40px`
- *Drag-over:* border darkens to `#181614`, background to `#f0ede6`
- *Error:* border to `#b91c1c`
- *File selected:* shows filename + size in a green confirmation chip; two buttons: Remove (ghost) + Analyse Lease (filled black)

**Validation rules (match existing API):**
- Extension must be `.pdf`
- Size must not exceed 25 MB
- Error message appears below the zone in a `#fef2f2` / `#fecaca` red chip

**Typography:**
- Wordmark: Cormorant Garamond 600, 17px
- Headline: Cormorant Garamond 600, clamp(40px, 6vw, 68px), `letter-spacing: -0.02em`
- Body / labels: DM Sans 400, 16px / 13px
- Nav links: DM Sans 400, 13px, colour `#6b6560`, hover `#181614`

**Stats bar values:** `< 90s` Median analysis time · `1,574` RTA sections indexed · `100%` Cited to statute · `Free` No account required

**Footer:** 12px, `#b0aaa4`, legal disclaimer text. Pinned to bottom.

---

### 2. Processing / Progress Screen

**Purpose:** Shown immediately after upload. Polls `/api/job/[id]` every 2s. Shows animated step-by-step progress.

**Layout:**
- Same header as landing
- Centered column, `max-width: 520px`
- File info card (white, 1px border) at top showing filename + page count + jurisdiction
- `h2` title + subtitle paragraph
- Vertical step timeline
- Time display card at bottom

**Step timeline (5 steps):**
1. Extracting text — `parse_document`
2. Detecting jurisdiction — `detect_jurisdiction`
3. Reading clauses — `segment_clauses`
4. Researching law — `lookup_statute` (longest step, ~18s real-world)
5. Building report — `generate_report`

**Timeline anatomy per step:**
- Left rail: 1px vertical connector line (`#e8e4dc` pending, `#181614` done/active), 20px circle dot
- Dot states: pending = 16px grey disc; active = 20px open circle with animated inner pulse dot; done = 20px filled black disc with white checkmark
- Right: step label (14px, `#b0aaa4` pending → `#181614` active, `#6b6560` done) + detail line (12px) when active or done

**Pulse animation (CSS):**
```css
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}
```

**Real implementation:** Replace the simulated step timers with actual polling. Map API `status` field to step index:
- `pending` → step 0 active
- `processing` → derive step from `progress_pct` or a step field if you add one to the API response
- `complete` → all steps done, redirect to `/report/[id]`
- `failed` → show error state

---

### 3. Report Page (`app/report/[id]/page.tsx`)

**Purpose:** Full analysis report. Two-column layout: fixed dark sidebar + scrollable main content area. Eight panels navigated via sidebar.

**Layout:**
- `display: flex; height: 100vh; overflow: hidden`
- **Sidebar:** 256px fixed, `background: #131110`, sticky, `height: 100vh`, `overflow: auto`
- **Main:** `flex: 1; overflow: auto`
- **Top bar inside main:** 52px sticky, `background: #f6f3ee`, `border-bottom: 1px solid #e8e4dc`. Contains breadcrumb (← New analysis / filename) and corpus version tag.
- **Panel content:** `padding: 36px 40px 60px; max-width: 860px`

#### Sidebar anatomy
```
┌─────────────────────────────┐
│ LeaseGuard          17px    │  ← brand, Cormorant Garamond 600, #ebe8e2
├─────────────────────────────┤
│ 1204 – 123 King St W        │  ← address 13px #ebe8e2
│ Toronto, ON M5X 1C4         │  ← 12px #7a7570
│ [7.2 — High] badge          │
│ 28pp · Ontario · text       │  ← 11px #4a4744
├─────────────────────────────┤
│ ANALYSIS (section label)    │  ← 10px all-caps #4a4744
│  □ Overview                 │
│  □ Red Flags         4      │
│  □ Clause Explorer          │
│  □ Negotiation Guide 4      │
│  □ Missing Protections 3    │
│  □ Contradictions    2      │
│  □ Sources                  │
│  □ Agent Trace              │
├─────────────────────────────┤
│ [Share Report]  [Export PDF]│
└─────────────────────────────┘
```

Active nav item: `background: #252220`, `border-left: 2px solid #ebe8e2`, label `#ebe8e2`
Inactive: `border-left: 2px solid transparent`, label `#7a7570`
Count badges: `background: #252220`, colour from risk level or default `#7a7570`

---

### 4. Overview Panel

**Purpose:** Entry point to the report. Risk gauge + executive summary + stat cards + clause breakdown table.

**Layout:**
- 2-column grid: `200px` (gauge card) + `1fr` (summary card), `gap: 32px`
- Then 4-column stat card row, `gap: 14px`
- Then full-width clause breakdown card
- Then (conditional) walk-away alert in red

**Risk Arc Gauge (SVG):**
- 140×140px SVG
- Track arc: 270° sweep (225° → 135° clockwise), `stroke: #e8e4dc`, `stroke-width: 9`, rounded linecap
- Fill arc: same geometry, length = `(score / 10) * 270°`, stroke colour from risk level
- Centre text: score (Cormorant Garamond 600, 36px, risk colour), level label underneath (DM Sans, 12px, `#9a9590`)
- Fill arc has `filter: drop-shadow(0 0 6px <riskColor>40)`

**Risk colours:**
| Level    | Colour    |
|----------|-----------|
| critical | `#b91c1c` |
| high     | `#c2410c` |
| medium   | `#b45309` |
| low      | `#15803d` |

**Stat cards:** White, `border: 1px solid #e8e4dc`, `border-radius: 8px`, `padding: 16px 20px`. Value in Cormorant Garamond 600, 28px. Label in DM Sans 11px all-caps `#9a9590`. Clickable — navigates to the relevant panel.

**Clause breakdown table:** Lists all clauses with clause number circle (28px, `#f6f3ee` bg), heading, type tag, unenforceable flag, and `RiskBadge`. Entire row is clickable → navigates to Clause Explorer.

**Risk bar:** 8px tall horizontal bar, each segment coloured by risk level, proportional to clause count.

---

### 5. Red Flags Panel

**Purpose:** Shows only clauses with `risk_level: "high"` or `"critical"`, sorted by score descending. First card opens by default.

**Clause card anatomy:**
- `border-left: 3px solid <riskColor>` accent
- Collapsed header: clause number circle + heading + type tag + unenforceable badge + `RiskBadge` + chevron
- Expanded body (4 sections):
  1. **Original clause text** — monospaced (`JetBrains Mono`), `background: #f6f3ee`, `border-left: 2px solid #ddd8cf`
  2. **What this means** — 14px plain English
  3. **Risk reasoning** — 13px `#5c5751`
  4. **Statutory conflicts** — each violation in a `#fef2f2` / `#fecaca` chip with `<code>` section tag + description
- **Negotiation hint** (if available) — `#f6f9ff` / `#dbeafe` blue card showing ask + priority badge
- **Feedback bar** — "Was this analysis accurate?" Yes/No buttons. POST to `/api/feedback` with `{ clause_id, lease_id, vote: "up" | "down" }`.

---

### 6. Clause Explorer Panel

**Purpose:** All clauses with filter + sort controls.

**Filters:** All | Critical | High | Medium | Low — pill buttons, active state `background: #181614; color: #fff`

**Sort:** Dropdown — Highest risk first / Lowest risk first / Clause number

Same `ClauseCard` component as Red Flags, but no default-open.

---

### 7. Negotiation Guide Panel

**Purpose:** Every negotiation point, grouped by priority (High → Medium → Low).

**Card anatomy (expanded):**
- **Ask for** — 14px bold
- **Proposed replacement wording** — `JetBrains Mono` 12px in `#f6f9ff` box + `CopyButton` to clipboard
- **Legal basis** — 13px prose
- **If they say / You say** — 2-column grid:
  - Left: `#fff7ed` / `#fed7aa` amber card, italic landlord response in quotes
  - Right: `#f0f9ff` / `#bae6fd` blue card, tenant rebuttal
- Walk-away threshold badge: `#fef2f2` / `#fecaca` red chip on card header

**Copy to clipboard:** Use `navigator.clipboard.writeText()`. Button shows "Copy wording" → "Copied" for 1.8s.

---

### 8. Missing Protections Panel

**Purpose:** Rights guaranteed by the RTA that are absent from the lease.

**Card anatomy:**
- Severity accent on left border (critical = `#b91c1c`, important = `#b45309`, minor = `#15803d`)
- Header: protection name + RTA section `<code>` tag + severity badge
- Body: explanation + risk-if-missing amber box + suggested addition in blue `JetBrains Mono` box + CopyButton

---

### 9. Contradictions Panel

**Purpose:** Clause pairs that conflict with each other.

**Card anatomy:**
- Left border accent by severity
- Header: contradiction type label + severity badge + two clause tags with `↔` arrow between them
- Body: explanation prose
- Footer (`#faf9f6`): "Which governs?" answer + legal basis in monospace

**Contradiction types:** `direct_conflict` → "Direct Conflict", `ambiguity` → "Ambiguity", `overlap` → "Overlap"

---

### 10. Sources Panel

**Purpose:** Every RTA statute section retrieved during analysis.

**Per source:**
- Section number in `JetBrains Mono` 13px `#1d4ed8`
- Section title 14px bold
- Act name 11px `#9a9590`
- Full statutory text in `JetBrains Mono` 12px `#5c5751`
- ontario.ca external link + relevance score percentage + corpus version + "Used by: Clause N" attribution

---

### 11. Agent Trace Panel

**Purpose:** Proves grounding in retrieved law. Shows every MCP tool call in sequence.

**Layout:** Vertical timeline matching the processing screen aesthetic.

**Per step:**
- Numbered circle (24px, coloured by tool category)
- `tool_name` in `JetBrains Mono` coloured by tool + duration + OK/ERR badge
- Expandable: 2-column grid — Input JSON | Output JSON, both in `#f6f3ee` `<pre>` blocks

**Tool colour map:**
```
parse_document:       #1d4ed8
detect_jurisdiction:  #7c3aed
segment_clauses:      #0369a1
classify_clause:      #0d9488
lookup_statute:       #b45309
score_risk:           #c2410c
detect_contradiction: #b91c1c
check_missing:        #15803d
generate_negotiation: #1d4ed8
generate_report:      #374151
```

---

## Design Tokens

### Colours
```
Background (page):    #f6f3ee
Background (cards):   #ffffff
Background (muted):   #faf9f6
Background (subtle):  #f0ede6
Sidebar bg:           #131110
Sidebar active:       #252220
Sidebar hover:        #1a1816

Text (primary):       #181614
Text (secondary):     #6b6560
Text (tertiary):      #9a9590
Text (disabled):      #b0aaa4

Border (default):     #e8e4dc
Border (strong):      #ddd8cf
Border (sidebar):     #252220

Risk / Critical:      #b91c1c   bg #fef2f2   border #fecaca
Risk / High:          #c2410c   bg #fff7ed   border #fed7aa
Risk / Medium:        #b45309   bg #fffbeb   border #fde68a
Risk / Low:           #15803d   bg #f0fdf4   border #bbf7d0

Accent / Blue:        #1d4ed8   bg #f6f9ff   border #dbeafe
```

### Typography
```
Display / headings:   Cormorant Garamond, serif — weights 400, 600
UI / body:            DM Sans, sans-serif — weights 300, 400, 500, 600
Monospace / code:     JetBrains Mono — weights 400, 500

Font sizes:
  Wordmark:           17px  Cormorant 600
  Page headline:      clamp(40px, 6vw, 68px)  Cormorant 600  ls -0.02em
  Section title:      22px  Cormorant 600  ls -0.01em
  Card heading:       14px  DM Sans 600
  Body:               14px  DM Sans 400  lh 1.65
  Secondary body:     13px  DM Sans 400  lh 1.6
  Label / caption:    12px  DM Sans 400
  Tag / badge:        11px  DM Sans 500  ls 0.03em
  Micro / overline:   10px  DM Sans 500  ls 0.08em  uppercase
  Monospace body:     12px  JetBrains Mono 400  lh 1.7
```

### Spacing
```
Page horizontal padding:  40–48px
Panel content padding:    36px 40px 60px
Card padding:             16–28px
Section gap:              32px
Card gap:                 12–14px
Inner section margin:     18–20px
```

### Borders & Radius
```
Cards:          border-radius: 8–10px;  border: 1px solid #e8e4dc
Badges/pills:   border-radius: 100px
Tags:           border-radius: 3–4px
Buttons:        border-radius: 5–6px
Code blocks:    border-radius: 5–6px
```

### Shadows
```
Share modal:    box-shadow: 0 20px 60px rgba(0,0,0,0.15)
Risk arc fill:  filter: drop-shadow(0 0 6px <riskColor>40)
```

---

## Interactions & Behaviour

| Interaction | Detail |
|---|---|
| PDF drag-over | Border → `#181614`, background → `#f0ede6` |
| PDF file selected | Confirmation chip + Remove + Analyse buttons appear |
| Analyse Lease clicked | POST `/api/upload` with `FormData({ file })`, receive `{ lease_id }`, navigate to processing screen |
| Processing polling | GET `/api/job/[id]` every 2s; map `status` to step index; on `complete` navigate to `/report/[id]` |
| Report panel nav | Instant (no animation); sidebar active state updates |
| Clause card expand | Toggle on click; first Red Flag card starts open |
| Copy button | `navigator.clipboard.writeText()`, label changes to "Copied" for 1.8s |
| Stat cards | Clickable, navigate to relevant panel |
| Share modal | Triggered from sidebar button; backdrop click dismisses; copy link button |
| Feedback Yes/No | Toggle state; POST `/api/feedback`; show "Thank you." inline |
| Agent trace step | Toggle expand/collapse; shows JSON I/O |
| Hover on nav items | `background: #1a1816` |
| Hover on clause rows | `background: #faf9f6` |
| Hover on filled buttons | Darken by ~10% |

---

## API Wiring (replacing mock data)

The prototype uses `window.MOCK_REPORT` from `lg-data.js`. Replace with real API calls:

```typescript
// app/report/[id]/page.tsx
const res = await fetch(`/api/report/${params.id}`);
const report = await res.json(); // shape matches MOCK_REPORT in lg-data.js

// Processing screen — poll job status
const job = await fetch(`/api/job/${leaseId}`).then(r => r.json());
// job.status: "pending" | "processing" | "complete" | "failed"

// Upload
const form = new FormData();
form.append("file", file);
const { lease_id } = await fetch("/api/upload", { method: "POST", body: form }).then(r => r.json());
```

The `MOCK_REPORT` object in `lg-data.js` is the exact shape to target for the API response.

---

## State Management

| State | Where | Description |
|---|---|---|
| `screen` | App root | `"landing" \| "processing" \| "report"` |
| `leaseId` | App root | Set on upload response, used for polling + report fetch |
| `activePanel` | Report page | Which of the 8 panels is visible |
| `expandedClauseId` | Each panel | Which clause card is open (one at a time per panel) |
| `vote` | FeedbackBar | `"up" \| "down" \| null` per clause |
| `copied` | CopyButton | Transient boolean, resets after 1.8s |
| `showShareModal` | Report page | Boolean |

---

## Files in this Bundle

| File | Purpose |
|---|---|
| `LeaseGuard.html` | **Open this in a browser** — interactive prototype of all screens |
| `lg-data.js` | Mock report data — defines the exact API response shape to target |
| `lg-shared.jsx` | `RiskArc`, `RiskBadge`, `ClauseTypeTag`, `Icon`, `StatCard`, `Collapsible`, `CopyButton`, `FeedbackBar` |
| `lg-landing.jsx` | Landing / upload page |
| `lg-processing.jsx` | Animated processing screen |
| `lg-overview.jsx` | Overview panel (gauge + summary + stats + clause list) |
| `lg-panels.jsx` | RedFlags, ClauseExplorer, Negotiation, Missing, Contradictions, Sources, AgentTrace panels |
| `lg-report.jsx` | Sidebar nav + report shell + share modal |
| `lg-app.jsx` | Root app (screen routing) |

---

## Legal / Copy Requirements

Every page of the report must include this disclaimer (already present in Overview panel):

> LeaseGuard provides educational information only and does not constitute legal advice. Every legal claim in this report is grounded in retrieved statute text. For professional legal judgment, consult a licensed paralegal or lawyer. Community Legal Clinics in Ontario offer free tenant legal help.

The corpus version and last-updated date must be visible on every report page (shown in the top bar and overview footer).

The word **"illegal"** must never appear in analysis output — use **"potentially unenforceable"** or **"may not be enforceable"** (enforced constraint from PRD, gotcha #10).

---

*LeaseGuard — Read what you sign.*
