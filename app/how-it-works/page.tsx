import Link from "next/link";
import type { Metadata } from "next";
import { AuthButton } from "../components/auth-button";

export const metadata: Metadata = {
  title: "How It Works — LeaseGuard",
  description:
    "LeaseGuard reads your Ontario lease against real statute text and tells you exactly what you are agreeing to. Here is how the analysis pipeline works.",
};

const STEPS = [
  {
    n: "01",
    title: "Upload your lease PDF",
    body:
      "Drag and drop any Ontario residential lease — scanned or digital. LeaseGuard accepts text-layer PDFs and image-only scans (OCR via Tesseract). Maximum 25 MB.",
  },
  {
    n: "02",
    title: "Text extraction",
    body:
      "PyMuPDF extracts the text layer directly. If the PDF is a scanned image with no text layer, Tesseract OCR reads it page by page. Confidence is reported alongside the result.",
  },
  {
    n: "03",
    title: "Document and jurisdiction validation",
    body:
      "Before any expensive analysis runs, LeaseGuard checks that the document is actually a residential lease and that it governs Ontario. Resumes, invoices, and leases from other provinces are rejected immediately with a clear explanation.",
  },
  {
    n: "04",
    title: "Clause segmentation",
    body:
      "The full lease text is split into individual clauses. Each clause gets a number, an optional heading, and character-position markers so the PDF viewer can highlight the exact passage later.",
  },
  {
    n: "05",
    title: "Statute retrieval via RAG",
    body:
      "For each clause, LeaseGuard queries 2,372 chunks of Ontario statute text — the Residential Tenancies Act, O.Reg. 516/06, O.Reg. 517/06, and the Ontario Standard Form of Lease — using hybrid BM25 + vector search. Three queries are generated per clause and merged using Reciprocal Rank Fusion so the most relevant sections rise to the top.",
  },
  {
    n: "06",
    title: "Risk scoring",
    body:
      "Scoring is deterministic TypeScript — not an LLM judgment call. Patterns are matched against the retrieved statute text, statutory violations are flagged, and a 0–10 risk score is produced with a plain-English explanation. Clauses that contradict the RTA are marked potentially unenforceable.",
  },
  {
    n: "07",
    title: "Contradiction detection",
    body:
      "Pairs of clause types that commonly conflict — entry rights vs. quiet enjoyment, rent increase vs. rent payment — are checked against each other using a Claude call grounded in the retrieved statutes. Only high-confidence contradictions (above 0.65) are surfaced.",
  },
  {
    n: "08",
    title: "Report assembled",
    body:
      "All results are combined into a structured report: Overview, Red Flags, Clause Explorer, Negotiation Guide, Missing Protections, Contradictions, Sources, and Agent Trace. Every legal claim links back to a specific statute section — nothing is asserted from AI training knowledge alone.",
  },
];

const CHECKS = [
  { type: "Rent increases", desc: "RTA s. 116 — written notice, 90-day minimum, guideline cap" },
  { type: "Landlord entry rights", desc: "RTA s. 27 — 24-hour written notice required for most entry" },
  { type: "Maintenance obligations", desc: "RTA s. 20 — landlord must maintain in good state of repair" },
  { type: "Subletting & assignment", desc: "RTA s. 97 — landlord cannot unreasonably withhold consent" },
  { type: "Early termination clauses", desc: "RTA s. 48 — tenant rights on landlord notice to vacate" },
  { type: "Security deposits", desc: "RTA s. 105–10 — only last month’s rent deposit is lawful in Ontario" },
];

export default function HowItWorksPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f3ee",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          height: "56px",
          borderBottom: "1px solid #e8e4dc",
          background: "#f6f3ee",
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "17px",
            letterSpacing: "0.02em",
            color: "#181614",
            textDecoration: "none",
          }}
        >
          LeaseGuard
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <nav style={{ display: "flex", gap: "28px" }}>
            {[
              { label: "How it works", href: "/how-it-works" },
              { label: "Ontario RTA", href: "/ontario-rta" },
              { label: "About", href: "/about" },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                style={{
                  fontSize: "13px",
                  color: href === "/how-it-works" ? "#181614" : "#6b6560",
                  textDecoration: "none",
                  fontWeight: href === "/how-it-works" ? 500 : 400,
                  letterSpacing: "0.01em",
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <AuthButton />
        </div>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "48px 24px 80px",
        }}
      >
        {/* Hero */}
        <div style={{ marginBottom: "64px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "100px",
              background: "#fff",
              border: "1px solid #e8e4dc",
              fontSize: "11px",
              color: "#6b6560",
              marginBottom: "24px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#15803d",
                display: "inline-block",
              }}
            />
            The analysis pipeline
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "clamp(36px, 5vw, 52px)",
              lineHeight: 1.08,
              color: "#181614",
              margin: "0 0 18px",
              letterSpacing: "-0.02em",
            }}
          >
            How LeaseGuard works
          </h1>
          <p
            style={{
              fontSize: "16px",
              color: "#6b6560",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "580px",
            }}
          >
            Every claim in a LeaseGuard report is backed by a retrieved statute
            section. The AI never asserts legal facts from training knowledge
            alone — retrieval happens at runtime, on every analysis.
          </p>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: "72px" }}>
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              style={{
                display: "flex",
                gap: "0",
                marginBottom: i === STEPS.length - 1 ? 0 : "0",
              }}
            >
              {/* Left rail */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: "48px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "1px",
                    flex: "0 0 16px",
                    background: i === 0 ? "transparent" : "#e8e4dc",
                  }}
                />
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "#fff",
                    border: "1.5px solid #e8e4dc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "10px",
                    fontWeight: 500,
                    color: "#9a9590",
                    letterSpacing: "0.04em",
                  }}
                >
                  {step.n}
                </div>
                <div
                  style={{
                    width: "1px",
                    flex: 1,
                    minHeight: "24px",
                    background:
                      i === STEPS.length - 1 ? "transparent" : "#e8e4dc",
                  }}
                />
              </div>

              {/* Content */}
              <div
                style={{
                  paddingLeft: "20px",
                  paddingBottom: "40px",
                  paddingTop: "6px",
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#181614",
                    marginBottom: "8px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b6560",
                    lineHeight: 1.7,
                  }}
                >
                  {step.body}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* What LeaseGuard checks */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "12px",
            padding: "36px",
            marginBottom: "48px",
          }}
        >
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "26px",
              color: "#181614",
              margin: "0 0 6px",
              letterSpacing: "-0.01em",
            }}
          >
            What LeaseGuard checks
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "#9a9590",
              margin: "0 0 28px",
            }}
          >
            Six clause types — the most commonly abused areas of Ontario leases.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {CHECKS.map((c) => (
              <div
                key={c.type}
                style={{
                  padding: "16px",
                  background: "#f6f3ee",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#181614",
                    marginBottom: "4px",
                  }}
                >
                  {c.type}
                </div>
                <div style={{ fontSize: "12px", color: "#6b6560", lineHeight: 1.5 }}>
                  {c.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 32px",
              borderRadius: "7px",
              background: "#181614",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.02em",
            }}
          >
            Analyse your lease
          </Link>
          <p style={{ marginTop: "12px", fontSize: "12px", color: "#9a9590" }}>
            Free · no account required · Ontario leases only
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "16px 48px",
          borderTop: "1px solid #e8e4dc",
          fontSize: "11px",
          color: "#b0aaa4",
          textAlign: "center",
          lineHeight: 1.5,
          flexShrink: 0,
        }}
      >
        LeaseGuard provides educational information only and does not constitute
        legal advice. For matters requiring professional legal judgment, consult
        a licensed paralegal or lawyer.
      </footer>
    </div>
  );
}
