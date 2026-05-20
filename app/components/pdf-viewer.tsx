"use client";

import { useState, useEffect, useRef } from "react";
import { riskColor, riskBg, riskBorder } from "./shared";
import type { Clause } from "./types";

// ── CSS injection for pdfjs text layer ───────────────────────────────────────

let _cssInjected = false;
function injectTextLayerCSS() {
  if (_cssInjected || typeof document === "undefined") return;
  _cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .lg-pdf-text-layer {
      position: absolute;
      top: 0; left: 0;
      overflow: hidden;
      pointer-events: none;
      line-height: 1;
    }
    .lg-pdf-text-layer span {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0% 0%;
      pointer-events: auto;
    }
    .lg-pdf-text-layer span.lg-hl {
      background-color: rgba(234,179,8,0.30);
      border-radius: 2px;
    }
    .lg-pdf-text-layer span.lg-hl-flash {
      background-color: rgba(234,179,8,0.60);
      box-shadow: 0 0 0 1.5px rgba(234,179,8,0.70);
    }
  `;
  document.head.appendChild(style);
}

// ── Text normalisation ────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOCK document  (Phase-1 fallback — shown when no real PDF URL is available)
// ─────────────────────────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
  if (!hex || hex.length < 7) return "transparent";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type Section =
  | { t: "header" }
  | { t: "bp"; n: string; h: string; text: string }
  | { t: "clause"; id: string }
  | { t: "sigs" };

const PAGES: Array<{ num: number; sections: Section[] }> = [
  {
    num: 1,
    sections: [
      { t: "header" },
      {
        t: "bp", n: "1", h: "Parties and Property",
        text: 'This Residential Tenancy Agreement ("Agreement") is entered into between Mapleleaf Properties Inc. (the "Landlord"), registered at 1800–55 University Ave, Toronto, ON, and the undersigned individual(s) (the "Tenant"). The Landlord agrees to rent to the Tenant the residential premises municipally described as Unit 1204–123 King St W, Toronto, ON M5X 1C4 (the "Premises"), subject to the terms of this Agreement and the Residential Tenancies Act, 2006, S.O. 2006, c. 17 (the "Act").',
      },
      {
        t: "bp", n: "2", h: "Term of Tenancy",
        text: 'The tenancy commences on September 1, 2026 and continues for a fixed term ending August 31, 2027 (the "Term"), thereafter continuing on a month-to-month basis. Either party may terminate the month-to-month tenancy in writing in accordance with the Act.',
      },
    ],
  },
  {
    num: 2,
    sections: [
      { t: "clause", id: "c1" },
      {
        t: "bp", n: "4", h: "Rules and Common Areas",
        text: "The Tenant agrees to abide by all building rules and regulations as amended by the Landlord from time to time, provided such rules do not conflict with the Act.",
      },
      { t: "clause", id: "c2" },
    ],
  },
  {
    num: 3,
    sections: [
      { t: "clause", id: "c3" },
      {
        t: "bp", n: "7", h: "Utilities and Services",
        text: "The Tenant is solely responsible for establishing accounts and paying all charges for hydro, natural gas, internet, telephone, and cable services. Monthly rent includes water and municipal waste collection.",
      },
      { t: "clause", id: "c4" },
    ],
  },
  {
    num: 4,
    sections: [
      {
        t: "bp", n: "9", h: "Maintenance and Repairs",
        text: "The Landlord shall maintain the Premises and the residential complex in a good state of repair, fit for habitation, and in compliance with health, safety, housing, and maintenance standards as required by the Act.",
      },
      {
        t: "bp", n: "11", h: "Assignment and Subletting",
        text: "The Tenant shall not assign this tenancy or sublet the Premises without prior written consent of the Landlord. The Landlord shall not arbitrarily withhold or delay consent to a proposed assignment or sublet that meets the requirements of the Act.",
      },
      { t: "clause", id: "c5" },
    ],
  },
  {
    num: 5,
    sections: [
      {
        t: "bp", n: "14", h: "Quiet Enjoyment",
        text: "Provided the Tenant complies with all obligations under this Agreement and the Act, the Tenant shall have the right to quiet enjoyment of the Premises, free from interference or harassment by the Landlord or anyone claiming through the Landlord.",
      },
      {
        t: "bp", n: "16", h: "Parking",
        text: "One underground parking space (Space #47, Level P2) is included in the monthly rent at no additional charge, for a single passenger vehicle only.",
      },
      { t: "clause", id: "c6" },
    ],
  },
  {
    num: 6,
    sections: [
      {
        t: "bp", n: "20", h: "Smoking Prohibition",
        text: "Smoking of tobacco, cannabis, or any other substance is strictly prohibited within the unit, on balconies and terraces appurtenant to the unit, and in all common areas of the building.",
      },
      { t: "clause", id: "c7" },
      {
        t: "bp", n: "22", h: "Entire Agreement",
        text: "This Agreement, including any attached Schedules, constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, and understandings.",
      },
      { t: "sigs" },
    ],
  },
];

function DocHeader() {
  return (
    <div style={{ marginBottom: 26, paddingBottom: 18, borderBottom: "1.5px solid #181614" }}>
      <div style={{ fontSize: 8, letterSpacing: "0.13em", textTransform: "uppercase", color: "#9a9590", fontFamily: "'DM Sans', sans-serif", marginBottom: 9 }}>
        Province of Ontario · Residential Tenancies Act, 2006
      </div>
      <div style={{ fontSize: 19, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "#181614", letterSpacing: "-0.01em", marginBottom: 16 }}>
        Residential Tenancy Agreement
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 24px" }}>
        {([ ["Landlord", "Mapleleaf Properties Inc."], ["Unit Address", "1204 – 123 King St W"], ["City / Postal", "Toronto, ON  M5X 1C4"], ["Monthly Rent", "$2,850.00"], ["Term Commencement", "September 1, 2026"], ["Term End Date", "August 31, 2027"] ] as [string, string][]).map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 8, color: "#9a9590", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans', sans-serif", marginBottom: 1 }}>{label}</div>
            <div style={{ fontSize: 10.5, color: "#181614", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BpSection({ n, h, text }: { n: string; h: string; text: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#181614", flexShrink: 0, minWidth: 16 }}>{n}.</span>
        <span style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#181614" }}>{h}</span>
      </div>
      <p style={{ margin: 0, fontSize: 10, fontFamily: "'DM Sans', sans-serif", color: "#3d3d3d", lineHeight: 1.72, paddingLeft: 23, textAlign: "justify" }}>{text}</p>
    </div>
  );
}

function ClauseSec({ clause, highlighted, flash }: { clause: Clause; highlighted: boolean; flash: boolean }) {
  const col = riskColor(clause.risk_level);
  const bg = riskBg(clause.risk_level);
  const bdr = riskBorder(clause.risk_level);
  const lbls: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
  const bgColor = flash ? bg : highlighted ? hexAlpha(bg, 0.45) : "transparent";
  const borderColor = highlighted ? col : "transparent";

  return (
    <div
      id={`pdf-${clause.id}`}
      style={{ marginBottom: 14, paddingLeft: highlighted ? 9 : 12, paddingTop: highlighted ? 7 : 0, paddingBottom: highlighted ? 7 : 0, borderLeft: `3px solid ${borderColor}`, background: bgColor, borderRadius: highlighted ? "0 5px 5px 0" : 0, transition: "background 0.5s ease, border-color 0.35s ease, padding 0.25s ease", position: "relative" }}
    >
      {highlighted && (
        <div style={{ position: "absolute", top: 7, right: 0, fontSize: 8, padding: "2px 8px", background: bg, border: `1px solid ${bdr}`, borderRadius: "3px 0 0 3px", color: col, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", opacity: flash ? 1 : 0.75, transition: "opacity 0.5s" }}>
          {lbls[clause.risk_level] ?? clause.risk_level}
        </div>
      )}
      <div style={{ display: "flex", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: highlighted ? col : "#181614", flexShrink: 0, minWidth: 16, transition: "color 0.35s" }}>{clause.number}.</span>
        <span style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: highlighted ? col : "#181614", transition: "color 0.35s" }}>{clause.heading}</span>
      </div>
      <p style={{ margin: 0, fontSize: 10, fontFamily: "'DM Sans', sans-serif", color: "#3d3d3d", lineHeight: 1.72, paddingLeft: 23, textAlign: "justify" }}>{clause.raw_text}</p>
    </div>
  );
}

function SigSection() {
  return (
    <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid #ddd8cf" }}>
      <div style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#181614", marginBottom: 14 }}>24. Signatures</div>
      <p style={{ margin: "0 0 20px", fontSize: 9.5, fontFamily: "'DM Sans', sans-serif", color: "#6b6560", lineHeight: 1.65 }}>
        By signing below, both parties acknowledge they have read, understood, and agree to the terms of this Agreement.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {["Landlord", "Tenant"].map((party) => (
          <div key={party}>
            <div style={{ fontSize: 8.5, color: "#9a9590", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 32 }}>{party}</div>
            {["Signature", "Print Name", "Date"].map((lbl, i) => (
              <div key={lbl} style={{ marginTop: i > 0 ? 20 : 0 }}>
                <div style={{ borderBottom: "1px solid #9a9590", marginBottom: 4 }} />
                <div style={{ fontSize: 8.5, color: "#b0aaa4", fontFamily: "'DM Sans', sans-serif" }}>{lbl}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockPDFViewer({ clauses, activeClauseId }: { clauses: Clause[]; activeClauseId: string | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClauseId || !scrollRef.current) return;
    setFlashId(activeClauseId);
    const clearFlash = setTimeout(() => setFlashId(null), 1800);
    const scrollEl = scrollRef.current;
    const target = scrollEl.querySelector<HTMLElement>(`#pdf-${activeClauseId}`);
    if (target) {
      const cRect = scrollEl.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const targetTop = scrollEl.scrollTop + tRect.top - cRect.top - (cRect.height / 2 - tRect.height / 2);
      scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
    return () => clearTimeout(clearFlash);
  }, [activeClauseId]);

  const activeClause = clauses.find((c) => c.id === activeClauseId) ?? null;

  function renderSection(sec: Section, key: number | string) {
    switch (sec.t) {
      case "header": return <DocHeader key="hdr" />;
      case "bp": return <BpSection key={sec.n} n={sec.n} h={sec.h} text={sec.text} />;
      case "sigs": return <SigSection key="sigs" />;
      case "clause": {
        const c = clauses.find((cl) => cl.id === sec.id);
        if (!c) return null;
        return <ClauseSec key={c.id} clause={c} highlighted={activeClauseId === c.id} flash={flashId === c.id} />;
      }
      default: return null;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#484848" }}>
      <div style={{ flexShrink: 0, height: 36, background: "#2c2c2c", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
        <svg width="13" height="14" viewBox="0 0 13 14" fill="none" style={{ opacity: 0.45, flexShrink: 0 }}>
          <rect x="0.5" y="0.5" width="9" height="13" rx="1" stroke="#fff" strokeWidth="1.2" />
          <path d="M9.5 0.5L12.5 3.5v9a1 1 0 01-1 1H3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9.5 0.5v3h3" stroke="#fff" strokeWidth="1.2" />
        </svg>
        <span style={{ fontSize: 11, color: "#ccc", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>KingSt_Lease_2026.pdf</span>
        <span style={{ fontSize: 10, color: "#666", fontFamily: "'DM Sans', sans-serif" }}>6 pp.</span>
        <div style={{ flex: 1 }} />
        {activeClause ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 3, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: riskColor(activeClause.risk_level) }} />
            <span style={{ fontSize: 10, color: "#bbb", fontFamily: "'DM Sans', sans-serif" }}>Clause {activeClause.number} — {activeClause.heading}</span>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: "#555", fontFamily: "'DM Sans', sans-serif" }}>Click a clause to highlight</span>
        )}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: "16px 12px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {PAGES.map((page) => (
          <div key={page.num} style={{ background: "#fff", width: "100%", maxWidth: 620, padding: "44px 48px 34px", boxShadow: "0 2px 12px rgba(0,0,0,0.42)", position: "relative" }}>
            <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontSize: 8.5, color: "#c5bfb5", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em" }}>— {page.num} —</div>
            {page.sections.map((sec, i) => renderSection(sec, i))}
          </div>
        ))}
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  REAL PDF viewer  (Phase-2 — pdfjs-dist canvas + text layer rendering)
// ─────────────────────────────────────────────────────────────────────────────

interface RealPDFProps {
  pdfUrl: string;
  clauses: Clause[];
  activeClauseId: string | null;
  filename: string;
}

// Per-page text data collected after renderTextLayer completes
type PageTextData = {
  items: string[];          // raw strings in text-item order
  spans: HTMLSpanElement[]; // span[i] corresponds to items[i]
};

function RealPDFViewer({ pdfUrl, clauses, activeClauseId, filename }: RealPDFProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const textDataRef = useRef<Map<number, PageTextData>>(new Map());
  const prevHighlightRef = useRef<HTMLSpanElement[]>([]);

  // ── Load the PDF document ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    injectTextLayerCSS();

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfjsLib: any = await import("pdfjs-dist");
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }
        const pdf = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);
      } catch (err) {
        if (!cancelled) {
          console.error("[RealPDFViewer] load error:", err);
          setLoadError("Could not load the PDF. The link may have expired.");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [pdfUrl]);

  // ── Render each page once the page-count is known ─────────────────────────
  useEffect(() => {
    if (!pageCount || !containerRef.current || !pdfDocRef.current) return;

    const pdf = pdfDocRef.current;
    const container = containerRef.current;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfjsLib: any = await import("pdfjs-dist");

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        if (renderedPagesRef.current.has(pageNum)) continue;
        renderedPagesRef.current.add(pageNum);

        const pageSlot = container.querySelector<HTMLElement>(`[data-page="${pageNum}"]`);
        if (!pageSlot) continue;

        const canvas = pageSlot.querySelector<HTMLCanvasElement>("canvas");
        const textLayerDiv = pageSlot.querySelector<HTMLElement>(".lg-pdf-text-layer");
        if (!canvas || !textLayerDiv) continue;

        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
        const slotWidth = pageSlot.clientWidth || 620;

        const page = await pdf.getPage(pageNum);
        const unscaledVp = page.getViewport({ scale: 1 });

        // CSS-pixel viewport (for text layer + layout)
        const cssScale = slotWidth / unscaledVp.width;
        const cssVp = page.getViewport({ scale: cssScale });

        // HiDPI viewport (for canvas rendering)
        const renderVp = page.getViewport({ scale: cssScale * dpr });

        // Set canvas to device pixels, display at CSS pixels
        canvas.width = Math.floor(renderVp.width);
        canvas.height = Math.floor(renderVp.height);
        canvas.style.width = `${cssVp.width}px`;
        canvas.style.height = `${cssVp.height}px`;

        // Update slot height so the text layer overlay fits
        pageSlot.style.height = `${cssVp.height}px`;

        await page.render({ canvasContext: ctx, viewport: renderVp }).promise;

        // Text layer — uses CSS viewport so coordinates are in CSS pixels
        const textContent = await page.getTextContent();
        textLayerDiv.style.width = `${cssVp.width}px`;
        textLayerDiv.style.height = `${cssVp.height}px`;

        const task = pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: cssVp,
        });
        await task.promise;

        // Collect spans for clause-search (span[i] == textContent.items[i])
        const spans = Array.from(textLayerDiv.querySelectorAll<HTMLSpanElement>("span"));
        const items: string[] = textContent.items.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (it: any) => (typeof it.str === "string" ? it.str : "")
        );
        textDataRef.current.set(pageNum, { items, spans });
      }
    })();
  }, [pageCount]);

  // ── Highlight the active clause ────────────────────────────────────────────
  useEffect(() => {
    // Remove previous highlights
    prevHighlightRef.current.forEach((span) => {
      span.classList.remove("lg-hl", "lg-hl-flash");
    });
    prevHighlightRef.current = [];

    if (!activeClauseId) return;
    const clause = clauses.find((c) => c.id === activeClauseId);
    if (!clause?.raw_text) return;

    const searchPrefix = norm(clause.raw_text).slice(0, 60);

    for (const [pageNum, { items, spans }] of textDataRef.current.entries()) {
      const flatText = norm(items.join(" "));
      const matchIdx = flatText.indexOf(searchPrefix);
      if (matchIdx === -1) continue;

      // Map character position back to which spans overlap the match range
      const matchEnd = matchIdx + searchPrefix.length;
      let pos = 0;
      const matchSpans: HTMLSpanElement[] = [];

      for (let i = 0; i < items.length; i++) {
        const itemLen = norm(items[i]).length + 1; // +1 for the joining space
        const itemStart = pos;
        const itemEnd = pos + itemLen;

        if (itemEnd > matchIdx && itemStart < matchEnd && spans[i]) {
          matchSpans.push(spans[i]);
        }
        pos = itemEnd;
        if (pos > matchEnd) break;
      }

      if (matchSpans.length === 0) continue;

      // Apply highlight classes
      matchSpans.forEach((span) => {
        span.classList.add("lg-hl", "lg-hl-flash");
        prevHighlightRef.current.push(span);
      });
      // Flash fades after 1.8 s, persistent highlight stays
      setTimeout(() => {
        matchSpans.forEach((s) => s.classList.remove("lg-hl-flash"));
      }, 1800);

      // Scroll the page slot into view
      const pageSlot = containerRef.current?.querySelector<HTMLElement>(`[data-page="${pageNum}"]`);
      if (pageSlot && scrollRef.current) {
        const scrollEl = scrollRef.current;
        const cRect = scrollEl.getBoundingClientRect();
        const pRect = pageSlot.getBoundingClientRect();
        const targetTop = scrollEl.scrollTop + pRect.top - cRect.top - 60;
        scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      }
      break; // first page match is sufficient
    }
  }, [activeClauseId, clauses]);

  const activeClause = clauses.find((c) => c.id === activeClauseId) ?? null;

  // ── Error state ────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#484848", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.4 }}>
          <circle cx="16" cy="16" r="14" stroke="#e87070" strokeWidth="2" />
          <path d="M16 10v8M16 22v1" stroke="#e87070" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={{ color: "#e87070", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textAlign: "center", maxWidth: 220 }}>{loadError}</span>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#484848" }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, height: 36, background: "#2c2c2c", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
        <svg width="13" height="14" viewBox="0 0 13 14" fill="none" style={{ opacity: 0.45, flexShrink: 0 }}>
          <rect x="0.5" y="0.5" width="9" height="13" rx="1" stroke="#fff" strokeWidth="1.2" />
          <path d="M9.5 0.5L12.5 3.5v9a1 1 0 01-1 1H3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9.5 0.5v3h3" stroke="#fff" strokeWidth="1.2" />
        </svg>
        <span style={{ fontSize: 11, color: "#ccc", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {filename}
        </span>
        {pageCount > 0 && (
          <span style={{ fontSize: 10, color: "#666", fontFamily: "'DM Sans', sans-serif" }}>
            {pageCount} pp.
          </span>
        )}
        <div style={{ flex: 1 }} />
        {activeClause ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 3, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: riskColor(activeClause.risk_level) }} />
            <span style={{ fontSize: 10, color: "#bbb", fontFamily: "'DM Sans', sans-serif" }}>
              Clause {activeClause.number} — {activeClause.heading}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: "#555", fontFamily: "'DM Sans', sans-serif" }}>
            Click a clause to highlight
          </span>
        )}
      </div>

      {/* Scrollable page stack */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflow: "auto", padding: "16px 0 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
      >
        {pageCount === 0 && (
          <div style={{ color: "#666", fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginTop: 60 }}>
            Loading PDF…
          </div>
        )}

        <div
          ref={containerRef}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%", maxWidth: 660, padding: "0 12px" }}
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
              data-page={pageNum}
              style={{
                position: "relative",
                background: "#fff",
                boxShadow: "0 2px 12px rgba(0,0,0,0.42)",
                width: "100%",
                overflow: "hidden",
                // height set by render effect once page dimensions are known
              }}
            >
              <canvas style={{ display: "block" }} />
              <div className="lg-pdf-text-layer" />
            </div>
          ))}
        </div>
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public export
// ─────────────────────────────────────────────────────────────────────────────

interface PDFViewerProps {
  clauses: Clause[];
  activeClauseId: string | null;
  pdfUrl?: string | null;
  filename?: string;
}

export function PDFViewer({ clauses, activeClauseId, pdfUrl, filename }: PDFViewerProps) {
  if (pdfUrl) {
    return (
      <RealPDFViewer
        pdfUrl={pdfUrl}
        clauses={clauses}
        activeClauseId={activeClauseId}
        filename={filename ?? "lease.pdf"}
      />
    );
  }
  return <MockPDFViewer clauses={clauses} activeClauseId={activeClauseId} />;
}
