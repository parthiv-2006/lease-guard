# Handoff: Split-Screen Interactive PDF Visualizer

## Overview

This feature adds a **split-screen PDF view** to the LeaseGuard report page. When activated, the report area divides into two panes: a scrollable mock-PDF of the lease on the left and the existing analysis panels on the right. Clicking any clause card in the panels automatically scrolls the PDF to that clause and highlights it in its risk colour.

**Why it matters:** findings are currently decoupled from the source document. The split-screen view lets users verify every AI finding against the exact lease text, building trust and reducing the need to manually cross-reference the original file.

---

## About the Design Files

The files in `design_reference/` are **high-fidelity HTML prototypes** — interactive design references showing the exact intended look, layout, and behaviour. They are **not** production code to copy directly.

Your task is to **recreate these designs in the existing Next.js codebase** (`app/components/`, `app/report/[id]/page.tsx`) using TypeScript, the established inline-style pattern, and the existing `Report` / `Clause` types from `app/components/types.ts`.

Open `LeaseGuard v2.html` in a browser and click **"View PDF"** in the top bar of the report page to see the feature in action.

---

## Fidelity

**High-fidelity.** Pixel-precise colours, typography, spacing, and interactions are all specified below and visible in the prototype. Recreate them as closely as possible using the codebase's existing styling approach (inline styles, no CSS modules or Tailwind).

---

## Files to Create / Modify

| Action | File | Notes |
|--------|------|-------|
| **Create** | `app/components/pdf-viewer.tsx` | New split-screen PDF component |
| **Modify** | `app/report/[id]/page.tsx` | Add split-screen state to `ReportShell` |
| **Modify** | `app/components/panels.tsx` | Thread `onClauseActivate` prop through clause cards |

---

## Implementation Plan

### Step 1 — Add `onClauseActivate` to panel components (`panels.tsx`)

Add an optional `onClauseActivate?: (clauseId: string) => void` prop to:

- `ClauseCard` — call it when the card **opens** (`setOpen(true)`)
- `RedFlagsPanel` — accept and pass down to each `ClauseCard`
- `ClauseExplorerPanel` — accept and pass down to each `ClauseCard`
- `NegotiationPanel` → `NegotiationCard` — call with `n.clause_id` when card **opens**
- `ContradictionsPanel` — make each clause tag button call `onClauseActivate(clause_a_id)` / `onClauseActivate(clause_b_id)` on click
- `SourcesPanel` — make "Used by: Clause N" links call `onClauseActivate(id)` on click

Thread the prop from `ReportShell` down through the panels object.

**For `ClauseCard`, also fire on mount when `defaultOpen=true`** (the first Red Flag card opens by default — the PDF should highlight it immediately when the split view is open):
```tsx
useEffect(() => {
  if (defaultOpen) onClauseActivate?.(clause.id);
}, []);
```

#### ClauseCard prop changes
```tsx
interface ClauseCardProps {
  clause: Clause;
  negotiation?: NegotiationPoint;
  defaultOpen?: boolean;
  onClauseActivate?: (clauseId: string) => void; // ← ADD
}

function ClauseCard({ clause, negotiation, defaultOpen, onClauseActivate }: ClauseCardProps) {
  // Replace: onClick={() => setOpen(o => !o)}
  // With:
  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) onClauseActivate?.(clause.id);
  }
```

#### Panel prop changes (identical pattern for Red Flags + Clause Explorer)
```tsx
interface RedFlagsPanelProps {
  report: Report;
  onClauseActivate?: (clauseId: string) => void; // ← ADD
}

function RedFlagsPanel({ report, onClauseActivate }: RedFlagsPanelProps) {
  // Pass down:
  return <ClauseCard ... onClauseActivate={onClauseActivate} />
```

#### Contradictions — make clause tags clickable
```tsx
// Replace the plain <span> clause label with:
<button
  onClick={() => onClauseActivate?.(x.clause_a_id)}
  style={{
    fontSize: "12px", padding: "3px 10px", background: "#f6f3ee",
    border: "1px solid #e8e4dc", borderRadius: "4px", color: "#5c5751",
    cursor: "pointer", transition: "border-color 0.15s",
    fontFamily: "'DM Sans', sans-serif",
  }}
  onMouseEnter={e => e.currentTarget.style.borderColor = "#c5bfb5"}
  onMouseLeave={e => e.currentTarget.style.borderColor = "#e8e4dc"}
  title="Highlight in PDF"
>{x.clause_a_label}</button>
```

---

### Step 2 — Create `app/components/pdf-viewer.tsx`

This component renders a multi-page mock-PDF of the lease document with clause highlighting.

**Phase 1 (this handoff) — mock document renderer.** The prototype renders a static mock document with realistic boilerplate text and the real clause `raw_text` inserted at the correct positions. The actual page is a designed simulation — not a real PDF render. Implement exactly this for now; real PDF.js integration can follow in a separate sprint.

**Phase 2 (future) — real PDF.js render.** When the real `storageUrl` from Supabase is available, replace the mock pages with a `pdf.js` canvas render + text-layer highlight overlay.

#### Component interface
```tsx
interface PDFViewerProps {
  clauses: Clause[];
  activeClauseId: string | null;
}

export function PDFViewer({ clauses, activeClauseId }: PDFViewerProps) { ... }
```

#### Document structure

The mock document is a `const PAGES` array of page descriptors. Each page has sections:

```ts
type Section =
  | { t: 'header' }
  | { t: 'bp'; n: string; h: string; text: string }   // boilerplate clause
  | { t: 'clause'; id: string }                        // real clause from props
  | { t: 'sigs' }                                      // signature block

const PAGES: Array<{ num: number; sections: Section[] }> = [
  { num: 1, sections: [
    { t: 'header' },
    { t: 'bp', n: '1', h: 'Parties and Property', text: '...' },
    { t: 'bp', n: '2', h: 'Term of Tenancy',       text: '...' },
  ]},
  { num: 2, sections: [
    { t: 'clause', id: 'c1' },  // Damage Deposit
    { t: 'bp', n: '4', h: 'Rules and Common Areas', text: '...' },
    { t: 'clause', id: 'c2' },  // Early Termination Penalty
  ]},
  { num: 3, sections: [
    { t: 'clause', id: 'c3' },  // Rent Payment Terms
    { t: 'bp', n: '7', h: 'Utilities and Services', text: '...' },
    { t: 'clause', id: 'c4' },  // Landlord Entry Rights
  ]},
  { num: 4, sections: [
    { t: 'bp', n: '9',  h: 'Maintenance and Repairs',    text: '...' },
    { t: 'bp', n: '10', h: "Tenant's Insurance",         text: '...' },
    { t: 'bp', n: '11', h: 'Assignment and Subletting',  text: '...' },
    { t: 'clause', id: 'c5' },  // Rent Increase Provision
  ]},
  { num: 5, sections: [
    { t: 'bp', n: '13', h: 'Notices',         text: '...' },
    { t: 'bp', n: '14', h: 'Quiet Enjoyment', text: '...' },
    { t: 'bp', n: '15', h: 'Keys and Access', text: '...' },
    { t: 'bp', n: '16', h: 'Parking',         text: '...' },
    { t: 'clause', id: 'c6' },  // Pet Restriction
  ]},
  { num: 6, sections: [
    { t: 'bp', n: '18', h: 'Alterations',              text: '...' },
    { t: 'bp', n: '19', h: 'Smoke Detectors and Safety', text: '...' },
    { t: 'bp', n: '20', h: 'Smoking Prohibition',      text: '...' },
    { t: 'clause', id: 'c7' },  // Liability and Indemnification
    { t: 'bp', n: '22', h: 'Entire Agreement',         text: '...' },
    { t: 'bp', n: '23', h: 'Governing Law',            text: '...' },
    { t: 'sigs' },
  ]},
];
```

Copy the full boilerplate text values from `design_reference/lg-pdfview.jsx` — the `PAGES` constant at the top of that file has all the copy.

#### Scrolling to active clause

Use a `ref` on the scroll container and `scrollTo()` (not `scrollIntoView`) to centre the active clause:

```tsx
const scrollRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!activeClauseId || !scrollRef.current) return;

  setFlashId(activeClauseId);
  const clearFlash = setTimeout(() => setFlashId(null), 1800);

  const scrollEl = scrollRef.current;
  const target = scrollEl.querySelector<HTMLElement>(`#pdf-${activeClauseId}`);
  if (target) {
    const cRect = scrollEl.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const targetTop = scrollEl.scrollTop + tRect.top - cRect.top
      - (cRect.height / 2 - tRect.height / 2);
    scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  return () => clearTimeout(clearFlash);
}, [activeClauseId]);
```

#### Clause section — highlight colours

Each real clause section (`t: 'clause'`) renders with `id={`pdf-${clause.id}`}`. When `activeClauseId === clause.id`, apply:

| State | `borderLeft` | `background` |
|-------|-------------|-------------|
| Inactive | `3px solid transparent` | `transparent` |
| Flash (first 1.8s) | `3px solid <riskColor>` | `riskBg(level)` (full opacity) |
| Persistent (after flash) | `3px solid <riskColor>` | `riskBg(level)` at ~45% opacity |

Use CSS transition on background for a smooth fade: `transition: background 0.5s ease, border-color 0.35s ease`.

Apply `hexAlpha(riskBg(level), 0.45)` for the persistent state:
```ts
function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
```

#### PDF toolbar (visual chrome, non-functional)
```
[PDF icon] KingSt_Lease_2026.pdf  6 pp.          [• Clause N — Heading highlighted]
```
- Background: `#2c2c2c`, height `36px`, bottom border `1px solid #1a1a1a`
- Filename: `11px`, `#ccc`, DM Sans 500
- Page count: `10px`, `#666`
- Active clause pill (right side): `rgba(255,255,255,0.08)` background, risk dot + clause name
- When no clause selected: `"Click a clause to highlight"` in `#555`

#### Page chrome
- Outer scroll container background: `#484848`
- Pages: `background: #fff`, `padding: 44px 48px 34px`, `box-shadow: 0 2px 12px rgba(0,0,0,0.42)`, `maxWidth: 620px`, centered
- Page footer: `— N —` centred, `8.5px`, `#c5bfb5`
- Gap between pages: `12px`

#### Sub-components typography

**Document header** (page 1 only):
- Province line: `8px`, `#9a9590`, `letter-spacing: 0.13em`, uppercase
- Title "Residential Tenancy Agreement": `19px`, Cormorant Garamond 600, `#181614`
- Metadata grid: 2-column, label `8px #9a9590` / value `10.5px DM Sans 600 #181614`
- Bottom border: `1.5px solid #181614`

**Boilerplate clause section:**
- Clause number + heading: `10px`, DM Sans 700, `#181614`
- Body text: `10px`, DM Sans 400, `#3d3d3d`, `line-height: 1.72`, `paddingLeft: 23px`, `text-align: justify`
- `marginBottom: 14px`

**Real clause section (same as boilerplate + highlight states above):**
- ID: `pdf-${clause.id}`
- Number + heading colour shifts to `riskColor(level)` when highlighted
- Risk badge (top-right, `position: absolute`): `8px`, uppercase, background/border from riskBg/riskBorder
- `opacity: 0.75` on the badge once flash fades

**Signature block:**
- `marginTop: 24px`, `paddingTop: 18px`, `borderTop: 1px solid #ddd8cf`
- Heading `10px` DM Sans 700
- Intro paragraph `9.5px #6b6560`
- 2-column grid (Landlord / Tenant), each with three `borderBottom: 1px solid #9a9590` lines labelled Signature / Print Name / Date

---

### Step 3 — Update `ReportShell` in `app/report/[id]/page.tsx`

#### New state
```tsx
const [splitScreen, setSplitScreen]       = useState(false);
const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
const [pdfWidthPct, setPdfWidthPct]       = useState(48);
const mainRef = useRef<HTMLDivElement>(null);
```

#### Pass `onClauseActivate` to all panels
```tsx
const onClauseActivate = (id: string) => setActiveClauseId(id);

const panels: Record<PanelId, React.ReactNode> = {
  overview:       <OverviewPanel report={report} onNavigate={setActivePanel} />,
  redflags:       <RedFlagsPanel report={report} onClauseActivate={onClauseActivate} />,
  clauses:        <ClauseExplorerPanel report={report} onClauseActivate={onClauseActivate} />,
  negotiation:    <NegotiationPanel report={report} onClauseActivate={onClauseActivate} />,
  missing:        <MissingPanel report={report} />,
  contradictions: <ContradictionsPanel report={report} onClauseActivate={onClauseActivate} />,
  sources:        <SourcesPanel report={report} onClauseActivate={onClauseActivate} />,
  trace:          <AgentTracePanel report={report} />,
};
```

#### Add "View PDF" toggle button to the existing top bar

Insert before the closing `</div>` of the top bar, after the corpus version span:

```tsx
<button
  onClick={() => setSplitScreen(s => !s)}
  title={splitScreen ? 'Close PDF view' : 'View lease PDF alongside report'}
  style={{
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '5px 12px', borderRadius: '5px', cursor: 'pointer',
    fontSize: '11px', fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
    background: splitScreen ? '#181614' : 'transparent',
    border: `1px solid ${splitScreen ? '#181614' : '#ddd8cf'}`,
    color: splitScreen ? '#fff' : '#6b6560',
    transition: 'all 0.15s', letterSpacing: '0.02em', flexShrink: 0,
  }}
  onMouseEnter={e => {
    if (!splitScreen) {
      e.currentTarget.style.borderColor = '#9a9590';
      e.currentTarget.style.color = '#181614';
    }
  }}
  onMouseLeave={e => {
    if (!splitScreen) {
      e.currentTarget.style.borderColor = '#ddd8cf';
      e.currentTarget.style.color = '#6b6560';
    }
  }}
>
  {/* Split icon — two vertical rectangles */}
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
    stroke={splitScreen ? '#fff' : '#6b6560'} strokeWidth="1.5">
    <rect x="1" y="2" width="5.5" height="12" rx="1" />
    <rect x="9.5" y="2" width="5.5" height="12" rx="1" />
  </svg>
  {splitScreen ? 'Close PDF' : 'View PDF'}
</button>
```

#### Replace the existing panel content area

Replace the existing `<div style={{ flex: 1, overflow: 'auto', ... }}>` block (the one containing the panel) with a conditional:

```tsx
{splitScreen ? (
  /* ── Split-screen layout ── */
  <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

    {/* PDF pane */}
    <div style={{
      flexShrink: 0, width: `${pdfWidthPct}%`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <PDFViewer clauses={report.clauses} activeClauseId={activeClauseId} />
    </div>

    {/* Drag handle */}
    <div
      onMouseDown={handleDividerDrag}
      style={{ width: '5px', flexShrink: 0, cursor: 'ew-resize', background: 'transparent', transition: 'background 0.15s', zIndex: 5, position: 'relative' }}
      onMouseEnter={e => e.currentTarget.style.background = '#ddd8cf'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Grip dots */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'none' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#c5bfb5' }} />
        ))}
      </div>
    </div>

    {/* Panels pane */}
    <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
      {/* Active clause callout strip */}
      {activeClauseId && (() => {
        const c = report.clauses.find(cl => cl.id === activeClauseId);
        return c ? (
          <div style={{
            padding: '7px 24px', background: '#f6f9ff',
            borderBottom: '1px solid #dbeafe',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#1d4ed8" strokeWidth="1.5">
              <rect x="1" y="2" width="5.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="5.5" height="12" rx="1" />
            </svg>
            <span style={{ fontSize: '11px', color: '#1d4ed8', fontFamily: "'DM Sans', sans-serif" }}>
              Clause {c.number} — {c.heading} highlighted in PDF
            </span>
            <button
              onClick={() => setActiveClauseId(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9a9590', fontSize: '11px', fontFamily: "'DM Sans', sans-serif" }}
            >✕</button>
          </div>
        ) : null;
      })()}
      <div style={{ padding: '28px 28px 60px' }}>
        {panels[activePanel]}
      </div>
    </div>
  </div>
) : (
  /* ── Normal single-column layout (unchanged) ── */
  <div style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ padding: '36px 40px 60px', maxWidth: '860px', width: '100%' }}>
      {panels[activePanel]}
    </div>
  </div>
)}
```

#### Drag-to-resize handler

Add this function inside `ReportShell`, and attach `ref={mainRef}` to the outer flex container (the div wrapping both sidebar and main content):

```tsx
function handleDividerDrag(e: React.MouseEvent) {
  e.preventDefault();
  const main = mainRef.current;
  if (!main) return;
  const startX   = e.clientX;
  const startPct = pdfWidthPct;
  const mainW    = main.offsetWidth;

  function onMove(ev: MouseEvent) {
    const delta = ((ev.clientX - startX) / mainW) * 100;
    setPdfWidthPct(Math.max(25, Math.min(70, startPct + delta)));
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ew-resize';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
```

> **Note:** the `mainRef` must be on the right-hand column div (flex: 1, containing the top bar + content), not the outer wrapper that also includes the sidebar. The divider drag is measured relative to the available content width.

---

## Design Tokens Used

All tokens are from the existing LeaseGuard system — no new values are introduced.

| Token | Value | Usage |
|-------|-------|-------|
| PDF backdrop | `#484848` | PDF pane outer background |
| PDF toolbar | `#2c2c2c` | Toolbar strip |
| PDF toolbar border | `#1a1a1a` | Toolbar bottom border |
| Page white | `#fff` | Individual page background |
| Page shadow | `0 2px 12px rgba(0,0,0,0.42)` | Page card shadow |
| Text primary | `#181614` | Headings in document |
| Text body | `#3d3d3d` | Document body text |
| Text tertiary | `#9a9590` | Labels, page numbers |
| Split button active bg | `#181614` | "View PDF" button active state |
| Split button border | `#ddd8cf` | "View PDF" button inactive border |
| Callout strip bg | `#f6f9ff` | Active clause callout |
| Callout strip border | `#dbeafe` | Active clause callout border |
| Callout text | `#1d4ed8` | Active clause callout text |
| Divider hover | `#ddd8cf` | Resize handle on hover |
| Grip dots | `#c5bfb5` | Three drag dots on handle |
| Risk critical | `#b91c1c` / `#fef2f2` / `#fecaca` | Colour / bg / border |
| Risk high | `#c2410c` / `#fff7ed` / `#fed7aa` | Colour / bg / border |
| Risk medium | `#b45309` / `#fffbeb` / `#fde68a` | Colour / bg / border |
| Risk low | `#15803d` / `#f0fdf4` / `#bbf7d0` | Colour / bg / border |

---

## Interactions & Behaviour

| Trigger | Effect |
|---------|--------|
| Click "View PDF" button | `splitScreen` toggles; layout reflows; PDF pane mounts |
| Click "Close PDF" button | `splitScreen` false; PDF pane unmounts; normal layout restores |
| Open clause card (Red Flags / Clause Explorer) | `onClauseActivate(clause.id)` → PDF scrolls + flashes highlight |
| Open negotiation card | `onClauseActivate(n.clause_id)` → highlights corresponding source clause |
| Click clause tag in Contradictions | `onClauseActivate(clause_a/b_id)` → highlights that clause in PDF |
| Click "Clause N" link in Sources | `onClauseActivate(id)` → highlights that clause in PDF |
| Mount ClauseCard with `defaultOpen=true` | Fires `onClauseActivate` on mount (first Red Flag auto-highlights) |
| Drag resize handle | `pdfWidthPct` updates live; range 25–70%; `cursor: ew-resize` on body during drag |
| Click ✕ on callout strip | `setActiveClauseId(null)` clears highlight in PDF |
| Panel navigation (sidebar) | No effect on `activeClauseId`; PDF highlight persists across panel changes |

---

## State Management (in `ReportShell`)

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `splitScreen` | `boolean` | `false` | Whether split view is active |
| `activeClauseId` | `string \| null` | `null` | ID of clause currently highlighted in PDF |
| `pdfWidthPct` | `number` | `48` | Width of PDF pane as % of content area |
| `flashId` | `string \| null` | `null` | Internal to `PDFViewer` — drives flash→persistent transition |

---

## Future: Real PDF Rendering (Phase 2)

When the real PDF `storageUrl` is available from Supabase, replace the mock page renderer with:

1. Load the PDF using `pdfjs-dist` (`import * as pdfjsLib from 'pdfjs-dist'`)
2. Render each page to a `<canvas>` using `page.render({ canvasContext, viewport })`
3. Layer a text-layer div over the canvas (use `pdfjsLib.renderTextLayer`)
4. On clause activation, search the text layer for `clause.raw_text` (or a distinctive substring) and wrap matching text nodes in a `<mark>` with the risk highlight colour
5. The `scrollTo` logic in `PDFViewer.useEffect` is unchanged

The `PDFViewer` interface (`clauses`, `activeClauseId`) stays the same — only the internal rendering changes.

---

## Files in This Bundle

| File | Purpose |
|------|---------|
| `README.md` | This document — primary implementation guide |
| `design_reference/LeaseGuard v2.html` | **Open in browser** — full interactive prototype |
| `design_reference/lg-pdfview.jsx` | PDF viewer component (design reference) |
| `design_reference/lg-report-v2.jsx` | Report shell with split-screen (design reference) |
| `design_reference/lg-panels-v2.jsx` | Panels with clause activation events (design reference) |
| `design_reference/lg-data.js` | Mock report data |
| `design_reference/lg-shared.jsx` | Shared components (unchanged) |

---

*LeaseGuard — Read what you sign.*
