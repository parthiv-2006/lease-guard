import Link from "next/link";
import type { Metadata } from "next";
import { AuthButton } from "../components/auth-button";

export const metadata: Metadata = {
  title: "About — LeaseGuard",
  description:
    "LeaseGuard is an AI-powered Ontario lease analysis tool. Every legal claim is grounded in retrieved statute text — not LLM opinion.",
};

const PRINCIPLES = [
  {
    title: "Retrieval, not assertion",
    body:
      "LeaseGuard never cites a statute from AI training memory. Every legal claim is backed by a statute section retrieved at runtime from a corpus of 2,372 RTA chunks, indexed in Supabase pgvector. If no relevant section can be retrieved, no claim is made.",
  },
  {
    title: "Unenforceable, not illegal",
    body:
      "Under Ontario’s RTA, problematic clauses are almost always void and unenforceable — the landlord has not committed a criminal offense. LeaseGuard always uses the correct language: “potentially unenforceable” rather than “illegal”, unless a specific offense provision applies.",
  },
  {
    title: "Deterministic scoring",
    body:
      "Risk scores are produced by a TypeScript rule engine — not an LLM judgment call. Patterns are matched, statutory violations are checked programmatically, and scores follow a consistent algorithm. The same clause always receives the same score.",
  },
  {
    title: "Ontario-only, by design",
    body:
      "LeaseGuard uses the Ontario Residential Tenancies Act, 2006 and LTB case law exclusively. Analyzing leases from other provinces with Ontario law would be actively misleading. Uploads that are not Ontario residential leases are rejected with a clear explanation.",
  },
];

const STACK = [
  { label: "Agent", value: "Claude (Anthropic) — MCP tool orchestrator" },
  { label: "Embeddings", value: "Gemini gemini-embedding-001 — 768 dimensions" },
  { label: "Vector DB", value: "Supabase pgvector — hybrid BM25 + vector search" },
  { label: "PDF parsing", value: "PyMuPDF + Tesseract OCR" },
  { label: "Frontend", value: "Next.js on Vercel" },
  { label: "Corpus", value: "2,372 RTA chunks — granular subsection level" },
];

export default function AboutPage() {
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
                  color: href === "/about" ? "#181614" : "#6b6560",
                  textDecoration: "none",
                  fontWeight: href === "/about" ? 500 : 400,
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
            About LeaseGuard
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "clamp(36px, 5vw, 52px)",
              lineHeight: 1.08,
              color: "#181614",
              margin: "0 0 24px",
              letterSpacing: "-0.02em",
            }}
          >
            Built so you can read what you sign
          </h1>
          <p
            style={{
              fontSize: "16px",
              color: "#6b6560",
              lineHeight: 1.75,
              margin: "0 0 16px",
              maxWidth: "600px",
            }}
          >
            Most Ontario tenants sign a lease without fully understanding it.
            Many leases contain clauses that are void under the Residential
            Tenancies Act — but tenants rarely know this until a dispute arises.
            By then, the leverage is gone.
          </p>
          <p
            style={{
              fontSize: "16px",
              color: "#6b6560",
              lineHeight: 1.75,
              margin: 0,
              maxWidth: "600px",
            }}
          >
            LeaseGuard reads every clause against real statute text and tells
            you exactly what you are agreeing to — before you sign.
          </p>
        </div>

        {/* Design principles */}
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "28px",
            color: "#181614",
            margin: "0 0 28px",
            letterSpacing: "-0.01em",
          }}
        >
          Design principles
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "64px" }}>
          {PRINCIPLES.map((p, i) => (
            <div
              key={p.title}
              style={{
                background: "#fff",
                border: "1px solid #e8e4dc",
                borderRadius:
                  i === 0
                    ? "10px 10px 2px 2px"
                    : i === PRINCIPLES.length - 1
                    ? "2px 2px 10px 10px"
                    : "2px",
                padding: "24px 28px",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#181614",
                  marginBottom: "8px",
                  letterSpacing: "-0.01em",
                }}
              >
                {p.title}
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#6b6560", lineHeight: 1.7 }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>

        {/* Tech stack */}
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
            How it is built
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#9a9590" }}>
            The full stack, for those who want to know.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {STACK.map((s, i) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  gap: "16px",
                  padding: "12px 0",
                  borderBottom:
                    i < STACK.length - 1 ? "1px solid #e8e4dc" : "none",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#9a9590",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                    width: "100px",
                  }}
                >
                  {s.label}
                </span>
                <span style={{ fontSize: "13px", color: "#6b6560" }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Limitations */}
        <div
          style={{
            background: "#fefce8",
            border: "1px solid #fde68a",
            borderRadius: "10px",
            padding: "24px 28px",
            marginBottom: "48px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#92400e",
              marginBottom: "10px",
            }}
          >
            Limitations to be aware of
          </div>
          <ul
            style={{
              margin: 0,
              padding: "0 0 0 16px",
              fontSize: "13px",
              color: "#78350f",
              lineHeight: 1.8,
            }}
          >
            <li>LeaseGuard only covers Ontario residential leases — commercial, agricultural, and non-Ontario leases are not supported.</li>
            <li>Analysis quality depends on text extraction quality. Poorly scanned PDFs may produce lower-confidence results.</li>
            <li>The LTB decisions corpus is currently limited. Tribunal citation quality will improve as the corpus grows.</li>
            <li>LeaseGuard is an educational tool, not a substitute for legal advice. For specific disputes, consult a licensed paralegal or lawyer.</li>
          </ul>
        </div>

        {/* Legal disclaimer */}
        <div
          style={{
            background: "#f6f3ee",
            border: "1px solid #e8e4dc",
            borderRadius: "10px",
            padding: "24px 28px",
            marginBottom: "48px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#9a9590",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}
          >
            Legal disclaimer
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "#6b6560", lineHeight: 1.7 }}>
            LeaseGuard provides educational information only and does not
            constitute legal advice. Every legal claim in a LeaseGuard report is
            grounded in retrieved statute text and is provided for informational
            purposes. For matters requiring professional legal judgment — such as
            disputes with a landlord, LTB applications, or negotiating lease
            terms — consult a licensed paralegal or lawyer. Community Legal
            Clinics in Ontario offer free tenant legal help to those who qualify.
          </p>
        </div>

        {/* Contact */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "13px", color: "#9a9590", marginBottom: "20px" }}>
            Questions, feedback, or a lease you think LeaseGuard got wrong?
          </p>
          <a
            href="mailto:parthiv.paul5545@gmail.com"
            style={{
              display: "inline-block",
              padding: "10px 28px",
              borderRadius: "7px",
              border: "1px solid #ddd8cf",
              background: "#fff",
              color: "#181614",
              fontSize: "13px",
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.01em",
              marginBottom: "32px",
            }}
          >
            Get in touch
          </a>
          <div>
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
          </div>
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
        a licensed paralegal or lawyer. Analysis is grounded in the Ontario
        Residential Tenancies Act, 2006.
      </footer>
    </div>
  );
}
