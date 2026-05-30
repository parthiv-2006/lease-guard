/**
 * Programmatic PDF generation for LeaseGuard.
 * Produces text-based (selectable, searchable) PDFs — never rasterized screenshots.
 * Uses jsPDF's text API directly; no html2canvas dependency.
 */
"use client";

import type { Report } from "@/app/components/types";

// ── Constants ──────────────────────────────────────────────────────────────────
const PW = 210; // A4 page width  (mm)
const PH = 297; // A4 page height (mm)
const ML = 18;  // left margin
const MR = 18;  // right margin
const MT = 18;  // top margin (used after addPage)
const MB = 18;  // bottom margin (page break trigger)
const CW = PW - ML - MR; // content width

// ── Risk colour palette ────────────────────────────────────────────────────────
type RGB = [number, number, number];

const RISK_COLOR: Record<string, RGB> = {
  critical: [185, 28,  28],
  high:     [180, 83,   9],
  medium:   [161, 98,   7],
  low:      [ 21, 128, 61],
};
const RISK_BG: Record<string, RGB> = {
  critical: [254, 242, 242],
  high:     [255, 247, 237],
  medium:   [255, 251, 235],
  low:      [240, 253, 244],
};
const GRAY:        RGB = [107, 101, 96];
const LIGHT_GRAY:  RGB = [154, 149, 144];
const BORDER:      RGB = [220, 216, 210];
const BLACK:       RGB = [ 24,  22, 20];
const BRAND_BG:    RGB = [ 24,  22, 20];
const BRAND_FG:    RGB = [235, 232, 226];

function riskColor(level: string): RGB { return RISK_COLOR[level] ?? RISK_COLOR.low; }
function riskLabel(level: string): string { return level.charAt(0).toUpperCase() + level.slice(1); }

// ── PDF writer helper ──────────────────────────────────────────────────────────

class Writer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any; // jsPDF instance — typed as any to avoid requiring @types/jspdf
  y: number;

  constructor(doc: unknown) {
    this.doc = doc;
    this.y = MT;
  }

  // Advance cursor
  nl(mm = 5) { this.y += mm; }

  // Add a new page and reset cursor
  page() {
    this.doc.addPage();
    this.y = MT;
  }

  // Break page if `needed` mm won't fit
  checkBreak(needed = 8) {
    if (this.y + needed > PH - MB) this.page();
  }

  // ── Text helpers ─────────────────────────────────────────────────────────────

  private color(rgb: RGB) { this.doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
  private resetColor() { this.color(BLACK); }

  heading1(text: string) {
    this.checkBreak(14);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(20);
    this.doc.text(text, ML, this.y);
    this.y += 9;
    this.resetColor();
  }

  heading2(text: string, colorRgb?: RGB) {
    this.checkBreak(11);
    if (colorRgb) this.color(colorRgb);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.text(text, ML, this.y);
    this.y += 7;
    this.resetColor();
  }

  heading3(text: string) {
    this.checkBreak(9);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.doc.text(text, ML, this.y);
    this.y += 6;
    this.resetColor();
  }

  // Body text with optional left indent and optional colour
  body(text: string, indent = 0, colorRgb?: RGB, maxW?: number) {
    if (colorRgb) this.color(colorRgb);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10);
    const lines: string[] = this.doc.splitTextToSize(text, (maxW ?? CW) - indent);
    for (const line of lines) {
      this.checkBreak(6);
      this.doc.text(line, ML + indent, this.y);
      this.y += 5.2;
    }
    this.resetColor();
  }

  italic(text: string, indent = 0, colorRgb?: RGB) {
    if (colorRgb) this.color(colorRgb);
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(10);
    const lines: string[] = this.doc.splitTextToSize(text, CW - indent);
    for (const line of lines) {
      this.checkBreak(6);
      this.doc.text(line, ML + indent, this.y);
      this.y += 5.2;
    }
    this.resetColor();
  }

  small(text: string, indent = 0, colorRgb?: RGB) {
    if (colorRgb) this.color(colorRgb);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    const lines: string[] = this.doc.splitTextToSize(text, CW - indent);
    for (const line of lines) {
      this.checkBreak(5);
      this.doc.text(line, ML + indent, this.y);
      this.y += 4.5;
    }
    this.resetColor();
  }

  centered(text: string, fontSize = 12, colorRgb?: RGB, bold = false) {
    this.checkBreak(fontSize * 0.4 + 3);
    if (colorRgb) this.color(colorRgb);
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(fontSize);
    this.doc.text(text, PW / 2, this.y, { align: "center" });
    this.y += fontSize * 0.38 + 2;
    this.resetColor();
  }

  // ── Structural helpers ────────────────────────────────────────────────────────

  divider(colorRgb: RGB = BORDER) {
    this.doc.setDrawColor(colorRgb[0], colorRgb[1], colorRgb[2]);
    this.doc.setLineWidth(0.3);
    this.doc.line(ML, this.y, ML + CW, this.y);
    this.y += 5;
  }

  // Dark header band (used for cover)
  headerBand(height = 28) {
    this.doc.setFillColor(BRAND_BG[0], BRAND_BG[1], BRAND_BG[2]);
    this.doc.rect(0, 0, PW, height, "F");
  }

  // Filled pill badge for risk level — returns the badge width
  riskBadge(level: string, x: number, y: number): number {
    const label = riskLabel(level).toUpperCase();
    const [cr, cg, cb] = riskColor(level);
    const [br, bg, bb] = RISK_BG[level] ?? [240, 240, 240];
    this.doc.setFontSize(7.5);
    this.doc.setFont("helvetica", "bold");
    const tw = this.doc.getTextWidth(label);
    const ph = 3.8; // pill height
    const pw = tw + 5; // pill width
    this.doc.setFillColor(br, bg, bb);
    this.doc.roundedRect(x, y - ph + 0.8, pw, ph, 1, 1, "F");
    this.doc.setDrawColor(cr, cg, cb);
    this.doc.setLineWidth(0.25);
    this.doc.roundedRect(x, y - ph + 0.8, pw, ph, 1, 1, "S");
    this.doc.setTextColor(cr, cg, cb);
    this.doc.text(label, x + 2.5, y);
    this.resetColor();
    this.doc.setFont("helvetica", "normal");
    return pw + 2;
  }

  // Labelled field on the same line: "Label  value"
  field(label: string, value: string, indent = 0) {
    this.checkBreak(7);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.color(GRAY);
    this.doc.text(label, ML + indent, this.y);
    const labelW = this.doc.getTextWidth(label) + 3;
    this.doc.setFont("helvetica", "normal");
    this.color(BLACK);
    const valLines: string[] = this.doc.splitTextToSize(value, CW - indent - labelW);
    this.doc.text(valLines[0] ?? "", ML + indent + labelW, this.y);
    this.y += 5.5;
    this.resetColor();
  }

  // Section header with a thin rule below
  sectionHeader(title: string) {
    this.checkBreak(14);
    this.nl(2);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11.5);
    this.doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    this.doc.text(title.toUpperCase(), ML, this.y);
    this.y += 4;
    this.divider(BORDER);
  }

  // Footer on every page  (call after all content is written)
  addPageFooters(totalPages: number, notice: string) {
    const pageCount = this.doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7.5);
      this.color(LIGHT_GRAY);
      this.doc.text(notice, ML, PH - 8);
      this.doc.text(`Page ${i} of ${totalPages}`, PW - MR, PH - 8, { align: "right" });
      this.resetColor();
    }
  }
}

// ── Report PDF ─────────────────────────────────────────────────────────────────

export async function exportReportPDF(report: Report): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", putOnlyUsedFonts: true });
  const w = new Writer(doc);

  const today = new Date().toLocaleDateString("en-CA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const { lease, overall, clauses, missing_protections, contradictions, disclaimer } = report;
  const highRisk = clauses.filter((c) => c.risk_level === "critical" || c.risk_level === "high");
  const medRisk  = clauses.filter((c) => c.risk_level === "medium");

  // ── Cover ──────────────────────────────────────────────────────────────────
  w.headerBand(32);
  // Brand text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(BRAND_FG[0], BRAND_FG[1], BRAND_FG[2]);
  doc.text("LeaseGuard", ML, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(154, 149, 144);
  doc.text("AI-Powered Lease Risk Analysis · Ontario RTA", ML, 21);

  w.y = 42;

  // Big heading
  w.heading1("Risk Analysis Report");
  w.nl(1);

  // Property metadata grid (two columns)
  const col2 = ML + CW / 2;
  const meta: [string, string][] = [
    ["Property",     lease.address || "Rental Unit"],
    ["City",         lease.city || lease.jurisdiction || "Ontario"],
    ["Jurisdiction", lease.jurisdiction || "Ontario"],
    ["Analysis Date", today],
    ["Document",     lease.filename || "lease.pdf"],
    ["Corpus",       overall.corpus_version || "RTA-2024-Q4"],
  ];
  const savedY = w.y;
  for (let i = 0; i < meta.length; i++) {
    const isRight = i % 2 === 1;
    if (!isRight) w.y = savedY + Math.floor(i / 2) * 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(meta[i][0].toUpperCase(), isRight ? col2 : ML, w.y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    const valLines: string[] = doc.splitTextToSize(meta[i][1], CW / 2 - 5);
    doc.text(valLines[0] ?? "", isRight ? col2 : ML, w.y + 4.5);
  }
  w.y = savedY + Math.ceil(meta.length / 2) * 9 + 8;

  w.divider();

  // Risk score block
  w.checkBreak(22);
  const [rr, rg, rb] = riskColor(overall.risk_level);
  doc.setFillColor(RISK_BG[overall.risk_level]?.[0] ?? 240,
                   RISK_BG[overall.risk_level]?.[1] ?? 240,
                   RISK_BG[overall.risk_level]?.[2] ?? 240);
  doc.rect(ML, w.y, CW, 18, "F");
  doc.setDrawColor(rr, rg, rb);
  doc.setLineWidth(0.4);
  doc.rect(ML, w.y, CW, 18, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(rr, rg, rb);
  doc.text(`Overall Risk: ${overall.risk_score.toFixed(1)} / 10 (${riskLabel(overall.risk_level)})`, ML + 5, w.y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  const statLine = `${overall.clause_count} clauses · ${overall.red_flag_count} red flags · ${overall.missing_count} missing protections · ${overall.contradiction_count} contradictions`;
  doc.text(statLine, ML + 5, w.y + 13);
  w.y += 24;

  // Executive summary
  if (overall.executive_summary) {
    w.heading3("Executive Summary");
    w.body(overall.executive_summary);
    w.nl(3);
  }

  // ── High & Critical Clauses ──────────────────────────────────────────────────
  if (highRisk.length > 0) {
    w.sectionHeader(`Section 1: High-Risk Clauses (${highRisk.length})`);
    for (const clause of highRisk) {
      w.checkBreak(20);
      // Clause heading row
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      const clauseHeading = `${clause.number}. ${clause.heading}`;
      doc.text(clauseHeading, ML, w.y);
      const headW = doc.getTextWidth(clauseHeading);
      w.riskBadge(clause.risk_level, ML + headW + 4, w.y);
      w.y += 6;

      if (clause.plain_english_explanation) {
        w.body(clause.plain_english_explanation, 3);
      }
      if (clause.is_potentially_unenforceable) {
        w.small("Note: May be void and unenforceable under the RTA.", 3, [180, 83, 9]);
      }
      for (const v of clause.statutory_violations ?? []) {
        w.small(`  ${v.statute_section}: ${v.violation_description}`, 5, riskColor(clause.risk_level));
      }
      w.nl(5);
    }
  }

  // ── Medium Risk Clauses ────────────────────────────────────────────────────
  if (medRisk.length > 0) {
    w.sectionHeader(`Section 2: Medium-Risk Clauses (${medRisk.length})`);
    for (const clause of medRisk) {
      w.checkBreak(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      doc.text(`${clause.number}. ${clause.heading}`, ML, w.y);
      w.riskBadge(clause.risk_level, ML + doc.getTextWidth(`${clause.number}. ${clause.heading}`) + 4, w.y);
      w.y += 5.5;
      if (clause.plain_english_explanation) {
        w.small(clause.plain_english_explanation, 3, GRAY);
      }
      w.nl(4);
    }
  }

  // ── All Clauses Summary Table ──────────────────────────────────────────────
  w.sectionHeader("Section 3 — All Clauses Summary");
  const colWidths = [14, CW - 14 - 24, 24];
  const rowH = 7;

  // Table header
  w.checkBreak(10);
  doc.setFillColor(36, 34, 32);
  doc.rect(ML, w.y - 4, CW, rowH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(BRAND_FG[0], BRAND_FG[1], BRAND_FG[2]);
  doc.text("#", ML + 2, w.y);
  doc.text("Clause", ML + colWidths[0] + 2, w.y);
  doc.text("Risk", ML + colWidths[0] + colWidths[1] + 2, w.y);
  w.y += rowH - 2;

  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    w.checkBreak(rowH + 1);
    const rowY = w.y - 3.5;
    if (i % 2 === 0) {
      doc.setFillColor(248, 246, 243);
      doc.rect(ML, rowY, CW, rowH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(String(c.number), ML + 2, w.y);
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    const heading = c.heading.length > 48 ? c.heading.slice(0, 46) + "..." : c.heading;
    doc.text(heading, ML + colWidths[0] + 2, w.y);
    const [cr, cg, cb] = riskColor(c.risk_level);
    doc.setTextColor(cr, cg, cb);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(riskLabel(c.risk_level), ML + colWidths[0] + colWidths[1] + 2, w.y);
    w.y += rowH;
  }
  w.nl(4);

  // ── Missing Protections ────────────────────────────────────────────────────
  if (missing_protections.length > 0) {
    w.sectionHeader(`Section 4 — Missing Protections (${missing_protections.length})`);
    for (const mp of missing_protections) {
      w.checkBreak(14);
      const sevColor: RGB = mp.severity === "critical" ? riskColor("critical")
        : mp.severity === "important" ? riskColor("high") : riskColor("medium");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      doc.text(`• ${mp.protection_name}`, ML, w.y);
      w.y += 5.5;
      if (mp.rta_section) {
        w.small(`RTA ${mp.rta_section}`, 5, sevColor);
      }
      if (mp.explanation) {
        w.small(mp.explanation, 5, GRAY);
      }
      w.nl(3);
    }
  }

  // ── Contradictions ────────────────────────────────────────────────────────
  if (contradictions.length > 0) {
    w.sectionHeader(`Section 5 — Contradictions (${contradictions.length})`);
    for (const ct of contradictions) {
      w.checkBreak(12);
      const sevColor = riskColor(ct.severity);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(sevColor[0], sevColor[1], sevColor[2]);
      doc.text(`${ct.clause_a_label} vs. ${ct.clause_b_label}`, ML, w.y);
      w.y += 5.5;
      if (ct.explanation) w.small(ct.explanation, 3, GRAY);
      w.nl(3);
    }
  }

  // ── Disclaimer ────────────────────────────────────────────────────────────
  w.page();
  w.sectionHeader("Legal Disclaimer");
  const disc = disclaimer ?? "This report is generated by LeaseGuard AI and is provided for informational purposes only. It does not constitute legal advice. Problematic clauses identified in this report may be void and unenforceable under the Ontario Residential Tenancies Act, 2006; however, this report does not guarantee the enforceability or legality of any lease provision. You should consult a qualified Ontario lawyer or paralegal before taking any action based on this report. LeaseGuard is not responsible for any decisions made based on this analysis.";
  w.body(disc, 0, GRAY);

  // Page footers
  const totalPages = doc.getNumberOfPages();
  w.addPageFooters(totalPages, `LeaseGuard · ${lease.filename || "lease.pdf"} · ${today} · Not legal advice`);

  doc.save(`LeaseGuard_Report_${lease.address?.replace(/\s+/g, "_").slice(0, 30) || "report"}.pdf`);
}

// ── Copilot PDF ────────────────────────────────────────────────────────────────

export interface CopilotEmailParams {
  type: "email";
  subject: string;
  body: string;
  tenantName: string;
  landlordName: string;
  propertyAddress: string;
}

export interface CopilotAddendumParams {
  type: "addendum";
  title: string;
  intro: string;
  clauses: Array<{ original_number: string; heading: string; proposed_text: string }>;
  tenantName: string;
  landlordName: string;
  propertyAddress: string;
}

export type CopilotPDFParams = CopilotEmailParams | CopilotAddendumParams;

export async function exportCopilotPDF(params: CopilotPDFParams): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", putOnlyUsedFonts: true });
  const w = new Writer(doc);

  const today = new Date().toLocaleDateString("en-CA", {
    year: "numeric", month: "long", day: "numeric",
  });

  if (params.type === "email") {
    // ── Email PDF ────────────────────────────────────────────────────────────
    w.headerBand(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(BRAND_FG[0], BRAND_FG[1], BRAND_FG[2]);
    doc.text("LeaseGuard", ML, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(154, 149, 144);
    doc.text("Negotiation Email · Generated " + today, ML, 19);
    w.y = 36;

    w.heading2("Negotiation Proposal Email");
    w.nl(2);

    // Subject block
    doc.setFillColor(248, 246, 243);
    doc.rect(ML, w.y - 3, CW, 12, "F");
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.3);
    doc.rect(ML, w.y - 3, CW, 12, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text("SUBJECT", ML + 4, w.y + 1);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    doc.text(params.subject, ML + 4, w.y + 7);
    w.y += 18;

    w.divider();

    // Email body
    w.body(params.body);
    w.nl(8);

    // Party summary
    w.divider();
    w.field("Tenant(s):", params.tenantName);
    w.field("Landlord:", params.landlordName);
    w.field("Property:", params.propertyAddress);

    const totalPages = doc.getNumberOfPages();
    w.addPageFooters(totalPages, `LeaseGuard Negotiation Email · ${today} · Not legal advice`);
    doc.save(`LeaseGuard_Email_${today}.pdf`);

  } else {
    // ── Addendum PDF ──────────────────────────────────────────────────────────
    w.headerBand(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(BRAND_FG[0], BRAND_FG[1], BRAND_FG[2]);
    doc.text("LeaseGuard", ML, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(154, 149, 144);
    doc.text("Lease Amendment Addendum · Generated " + today, ML, 19);
    w.y = 36;

    // Centered legal title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    doc.text(params.title.toUpperCase(), PW / 2, w.y, { align: "center" });
    w.y += 9;

    // Thin rule
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.4);
    doc.line(ML + CW * 0.2, w.y, ML + CW * 0.8, w.y);
    w.y += 8;

    // Party / property block
    w.field("Property Address:", params.propertyAddress);
    w.field("Tenant(s):",        params.tenantName);
    w.field("Landlord:",         params.landlordName);
    w.field("Date:",             today);
    w.nl(4);
    w.divider();

    // Intro paragraph
    w.body(params.intro);
    w.nl(6);

    // Amendment clauses
    for (let i = 0; i < params.clauses.length; i++) {
      const c = params.clauses[i];
      w.checkBreak(22);

      // Clause heading on a shaded band
      doc.setFillColor(248, 246, 243);
      doc.rect(ML, w.y - 4, CW, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      doc.text(`${i + 1}.  AMENDMENT TO CLAUSE ${c.original_number}: ${c.heading.toUpperCase()}`, ML + 3, w.y);
      w.y += 7;

      w.italic("The original clause is deleted in its entirety and replaced with the following:", 3, GRAY);
      w.nl(1);

      // Proposed text in a bordered box
      const proposedLines: string[] = doc.splitTextToSize(`"${c.proposed_text}"`, CW - 16);
      const boxH = proposedLines.length * 5.5 + 8;
      w.checkBreak(boxH);
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.setLineWidth(0.3);
      doc.setFillColor(255, 255, 255);
      doc.rect(ML + 5, w.y - 3, CW - 10, boxH, "FD");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      for (const line of proposedLines) {
        doc.text(line, ML + 9, w.y + 2);
        w.y += 5.5;
      }
      w.y += 6;
      w.nl(3);
    }

    w.nl(4);
    w.divider();

    // Witness block
    w.checkBreak(12);
    w.body("IN WITNESS WHEREOF, the parties hereto have executed this Addendum as of the date first written above.");
    w.nl(10);

    // Signature table (two columns)
    w.checkBreak(36);
    const sigColW = CW / 2 - 10;
    const sigCols = [ML, ML + CW / 2 + 5] as const;
    for (const [ci, party] of (["Tenant", "Landlord"] as const).entries()) {
      const sx = sigCols[ci];
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.setLineWidth(0.4);
      doc.line(sx, w.y, sx + sigColW, w.y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.text(`${party} Signature`, sx, w.y + 4.5);
    }
    w.y += 12;
    // Print name lines
    for (const [ci, party] of (["Tenant", "Landlord"] as const).entries()) {
      const sx = sigCols[ci];
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.setLineWidth(0.4);
      doc.line(sx, w.y, sx + sigColW, w.y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.text(`${party} Print Name`, sx, w.y + 4.5);
    }
    w.y += 12;
    // Date lines
    const dateW = sigColW * 0.55;
    for (const [ci] of (["Tenant", "Landlord"] as const).entries()) {
      const sx = sigCols[ci];
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.line(sx, w.y, sx + dateW, w.y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.text("Date", sx, w.y + 4.5);
    }
    w.y += 14;

    const totalPages = doc.getNumberOfPages();
    w.addPageFooters(totalPages, `LeaseGuard Addendum · ${today} · Not legal advice — consult a lawyer before signing`);
    doc.save(`LeaseGuard_Amendment_${today}.pdf`);
  }
}
