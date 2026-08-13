"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { AuthButton } from "./components/auth-button";
import { Reveal } from "./components/scroll-reveal";
import { LeaseHeroAnimation } from "./components/lease-hero-animation";
import { ScoreHero, SeverityRuler } from "./components/score-hero";
import { PROCESSING_STEPS } from "./components/processing-steps";

// ── Upload page ───────────────────────────────────────────────────────────────

type Screen = "landing" | "processing";

// Map progress_pct (0–100) to step index (0–4)
function pctToStep(pct: number): number {
  if (pct < 15) return 0;
  if (pct < 30) return 1;
  if (pct < 50) return 2;
  if (pct < 85) return 3;
  return 4;
}

// ── Landing Page ──────────────────────────────────────────────────────────────

interface LandingPageProps {
  onUploadSuccess: (leaseId: string, filename: string) => void;
}

const DEMO_LEASE_ID = "ebf8bf97-563d-4b7d-859f-8ecf76905335";

function LandingPage({ onUploadSuccess }: LandingPageProps) {
  const pathname = usePathname();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [clauseIdx, setClauseIdx] = useState(0);

  useEffect(() => {
    function checkWidth() { setShowNav(window.innerWidth >= 760); }
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);

  function validateFile(f: File | null | undefined): string | null {
    if (!f) return "No file selected.";
    if (!f.name.toLowerCase().endsWith(".pdf"))
      return "Only PDF files are supported.";
    if (f.size > 25 * 1024 * 1024)
      return `File exceeds 25 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB received).`;
    return null;
  }

  function handleFile(f: File | null | undefined) {
    const err = validateFile(f);
    if (err || !f) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function handleAnalyse() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Upload failed. Please try again.");
        setUploading(false);
        return;
      }
      onUploadSuccess(data.lease_id, file.name);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setUploading(false);
    }
  }

  function scrollToUpload() {
    document.getElementById("lg-upload-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!file) setTimeout(() => inputRef.current?.click(), 350);
  }

  const borderColor = error ? "#9c2b23" : "#17140f";
  const bgColor = dragOver ? "#efe6d3" : "#fffdfa";

  const CLAUSES = [
    {
      key: "late",
      label: "Late fees",
      text: "The tenant shall pay a late fee of $100 per day for any rent payment received after the 1st of the month.",
      locator: "Clause 12 · page 3 of 11",
      meaning:
        "A landlord cannot charge you anything beyond the rent and the specific fees the Act allows. A $100-per-day penalty is not one of them — on a two-week delay this clause claims $1,400 it almost certainly cannot collect.",
      statuteRef: "RTA s.134 (1)",
      statuteText:
        "No landlord shall, directly or indirectly, collect or require a tenant to pay any fee, premium, commission, bonus, penalty, key deposit or other like amount of money.",
    },
    {
      key: "pets",
      label: "No-pet clause",
      text: "No pets of any kind shall be kept on the premises at any time.",
      locator: "Clause 14 · page 3 of 11",
      meaning:
        "You can sign this and still keep a pet. Provisions in a tenancy agreement prohibiting pets are void in Ontario — though a landlord may still apply to end a tenancy over noise, damage or allergic reactions.",
      statuteRef: "RTA s.14",
      statuteText:
        "A provision in a tenancy agreement prohibiting the presence of animals in or about the residential complex is void.",
    },
    {
      key: "entry",
      label: "Landlord entry",
      text: "The landlord may enter the rental unit at any reasonable time to show it to prospective tenants.",
      locator: "Clause 21 · page 5 of 11",
      meaning:
        "Showings still require 24 hours written notice stating the reason and a time between 8 a.m. and 8 p.m. “Any reasonable time” quietly removes the notice you are entitled to.",
      statuteRef: "RTA s.27 (1)",
      statuteText:
        "A landlord may enter a rental unit in accordance with written notice given to the tenant at least 24 hours before the time of entry.",
    },
  ];
  const activeClause = CLAUSES[clauseIdx];

  const REPORT_ITEMS = [
    { n: "01", title: "Clause by clause", desc: "Every clause segmented, classified and scored on its own terms." },
    { n: "02", title: "Contradictions", desc: "Clauses cross-checked against each other for internal conflicts." },
    { n: "03", title: "Missing terms", desc: "Standard tenant protections your lease quietly leaves out." },
    { n: "04", title: "Negotiation copilot", desc: "Language you can send back to push on the riskiest clauses." },
    { n: "05", title: "Agent trace", desc: "Every tool call the agent made, in order, fully inspectable." },
    { n: "06", title: "Sources", desc: "Each citation opens the exact section of the Act it came from." },
  ];

  const TRUST_ITEMS = [
    { figure: "2,372", label: "Sections of Ontario law indexed", detail: "The full Residential Tenancies Act, kept current as case law and regulations change." },
    { figure: "100%", label: "Findings cited to statute", detail: "Every claim links to the section it came from — nothing is asserted from memory." },
    { figure: "< 90s", label: "Median time to a full report", detail: "Text and scanned PDFs both, with OCR when a lease has been photographed." },
    { figure: "1 click", label: "Delete your lease and report", detail: "PIPEDA-compliant removal, on demand, with no account required to start." },
  ];

  const navLinks = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Sample Report", href: `/report/${DEMO_LEASE_ID}` },
    { label: "Ontario RTA", href: "/ontario-rta" },
    { label: "GitHub", href: "https://github.com/parthiv-2006/lease-guard", external: true },
    { label: "Privacy", href: "/privacy" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f4ee",
        color: "#17140f",
        fontFamily: "'Public Sans', sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: showNav ? "0 clamp(20px,4vw,56px)" : "0 20px",
          height: 66,
          borderBottom: "1px solid #17140f",
          background: "rgba(247,244,238,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: "-0.01em",
          }}
        >
          LeaseGuard
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {showNav && (
            <nav style={{ display: "flex", gap: "clamp(14px,2.4vw,28px)", alignItems: "center" }}>
              {navLinks.map(({ label, href, external }) => {
                const isActive = !external && pathname === href;
                return (
                  <a
                    key={label}
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    style={{
                      fontSize: 14,
                      color: isActive ? "#17140f" : "#4a4438",
                      fontWeight: isActive ? 600 : 400,
                      textDecoration: "none",
                      borderBottom: isActive ? "1px solid #17140f" : "1px solid transparent",
                      paddingBottom: 2,
                      transition: "color 0.12s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#17140f"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = isActive ? "#17140f" : "#4a4438"; }}
                  >
                    {label}
                  </a>
                );
              })}
            </nav>
          )}
          <AuthButton />
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "clamp(40px,6vw,76px) clamp(20px,4vw,48px) 0",
          display: "flex",
          gap: "clamp(32px,4.5vw,64px)",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {/* Left column */}
        <div style={{ flex: "1 1 430px", minWidth: 300, paddingBottom: 64 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#6f6857",
              marginBottom: 30,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#2f6b3a",
                animation: "lg-pulse 2.4s ease-in-out infinite",
              }}
            />
            Ontario · RTA 2006
          </div>

          <h1
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "clamp(54px,7.4vw,104px)",
              lineHeight: 0.94,
              margin: "0 0 28px",
              letterSpacing: "-0.022em",
            }}
          >
            Read what
            <br />
            you sign.
          </h1>
          <p style={{ fontSize: 20, color: "#4a4438", maxWidth: 470, margin: "0 0 36px", lineHeight: 1.6 }}>
            Upload your lease. Every clause gets read against the actual statute, and you get a
            plain-English answer on what you just agreed to.
          </p>

          {/* Upload card */}
          <div
            id="lg-upload-card"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            style={{
              border: `1.5px dashed ${borderColor}`,
              background: bgColor,
              padding: "26px 26px 22px",
              maxWidth: 470,
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
          >
            <input
              id="lease-file-input"
              ref={inputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {!file ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    style={{
                      fontFamily: "'Public Sans', sans-serif",
                      fontSize: 15,
                      fontWeight: 600,
                      padding: "14px 24px",
                      border: "1px solid #17140f",
                      background: "#151209",
                      color: "#f4efe4",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#9c2b23";
                      e.currentTarget.style.borderColor = "#9c2b23";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#151209";
                      e.currentTarget.style.borderColor = "#17140f";
                    }}
                    onFocus={(e) => { e.currentTarget.style.outline = "2px solid #9c2b23"; e.currentTarget.style.outlineOffset = "3px"; }}
                    onBlur={(e) => { e.currentTarget.style.outline = "none"; }}
                  >
                    Choose lease PDF
                  </button>
                  <span style={{ fontSize: 15, color: "#6f6857" }}>
                    {dragOver ? "Release to upload" : "or drop it here"}
                  </span>
                </div>
                <div
                  style={{
                    borderTop: "1px solid #e0d9c6",
                    marginTop: 20,
                    paddingTop: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <Link
                    href={`/report/${DEMO_LEASE_ID}`}
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#9c2b23",
                      borderBottom: "1px solid #d8b6b2",
                      textDecoration: "none",
                    }}
                  >
                    Analyse a sample lease instead →
                  </Link>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6f6857" }}>
                    PDF · up to 25 MB
                  </span>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: "1px solid #cfc6ab",
                    background: "#f7f4ee",
                    padding: "12px 14px",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#2f6b3a", flexShrink: 0 }}>✓</span>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      flex: 1,
                      minWidth: 120,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.name}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6f6857" }}>
                    {formatSize(file.size)}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "#6f6857", margin: "10px 0 18px", fontFamily: "'IBM Plex Mono', monospace" }}>
                  PDF verified · jurisdiction confirmed during analysis
                </p>

                <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", marginBottom: 20 }}>
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={(e) => setConsentGiven(e.target.checked)}
                    style={{ marginTop: 3, width: 16, height: 16, accentColor: "#9c2b23", flexShrink: 0, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, color: "#4a4438", lineHeight: 1.6 }}>
                    I understand this PDF may contain personal information — names, addresses, financial
                    details — and consent to it being analysed and temporarily stored per the{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#9c2b23" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>
                    . Reports are deleted automatically after 90 days.
                  </span>
                </label>

                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleAnalyse}
                    disabled={uploading || !consentGiven}
                    style={{
                      fontFamily: "'Public Sans', sans-serif",
                      fontSize: 15,
                      fontWeight: 600,
                      padding: "14px 26px",
                      cursor: uploading ? "wait" : !consentGiven ? "not-allowed" : "pointer",
                      border: consentGiven ? "1px solid #17140f" : "1px solid #cfc6ab",
                      background: uploading ? "#4a4438" : consentGiven ? "#151209" : "#e8e2d2",
                      color: consentGiven ? "#f4efe4" : "#8a8272",
                    }}
                    onFocus={(e) => { e.currentTarget.style.outline = "2px solid #9c2b23"; e.currentTarget.style.outlineOffset = "3px"; }}
                    onBlur={(e) => { e.currentTarget.style.outline = "none"; }}
                  >
                    {uploading ? "Uploading…" : "Analyse lease"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setError(null);
                      setConsentGiven(false);
                    }}
                    disabled={uploading}
                    style={{
                      fontFamily: "'Public Sans', sans-serif",
                      fontSize: 15,
                      padding: "14px 20px",
                      border: "1px solid #cfc6ab",
                      background: "transparent",
                      color: "#4a4438",
                      cursor: "pointer",
                      opacity: uploading ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#17140f"; e.currentTarget.style.color = "#17140f"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#cfc6ab"; e.currentTarget.style.color = "#4a4438"; }}
                  >
                    Remove
                  </button>
                  {file && !consentGiven && (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8a4a17" }}>
                      Consent required
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {error && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "#fbeceb",
                border: "1px solid #e3b0a8",
                fontSize: 13,
                color: "#9c2b23",
                display: "flex",
                gap: 8,
                alignItems: "center",
                maxWidth: 470,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#9c2b23" strokeWidth="1.5" />
                <path d="M8 5v3.5M8 11v.5" stroke="#9c2b23" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 22,
              marginTop: 20,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.04em",
              color: "#6f6857",
              flexWrap: "wrap",
            }}
          >
            <span>Text + scanned PDF</span>
            <span>No account</span>
            <span>Delete anytime</span>
          </div>
        </div>

        {/* Right column — animated hero document */}
        <div style={{ flex: "1 1 480px", minWidth: 320, alignSelf: "stretch" }}>
          <LeaseHeroAnimation />
        </div>
      </section>

      {/* What it says / what it means */}
      <Reveal
        style={{
          background: "#151209",
          color: "#f4efe4",
          borderTop: "1px solid #17140f",
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(48px,6vw,84px) clamp(20px,4vw,48px)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
              marginBottom: "clamp(28px,4vw,48px)",
            }}
          >
            <h2
              style={{
                fontFamily: "'Newsreader', serif",
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: "clamp(34px,4.4vw,58px)",
                lineHeight: 1.02,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              What it says.
              <br />
              What it means.
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CLAUSES.map((c, i) => {
                const active = i === clauseIdx;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setClauseIdx(i)}
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "8px 14px",
                      border: active ? "1px solid #f4efe4" : "1px solid #4a4438",
                      background: active ? "#f4efe4" : "transparent",
                      color: active ? "#151209" : "#a8a08c",
                      cursor: "pointer",
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
              gap: 1,
              background: "#2b2720",
              border: "1px solid #2b2720",
            }}
          >
            <div style={{ background: "#151209", padding: "clamp(26px,3vw,40px)" }}>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#a8a08c",
                  marginBottom: 22,
                }}
              >
                Verbatim from your lease
              </div>
              <div
                style={{
                  fontFamily: "'Newsreader', serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: "clamp(22px,2.5vw,31px)",
                  lineHeight: 1.45,
                }}
              >
                &ldquo;{activeClause.text}&rdquo;
              </div>
              <div style={{ marginTop: 26, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#a8a08c" }}>
                {activeClause.locator}
              </div>
            </div>
            <div style={{ background: "#151209", padding: "clamp(26px,3vw,40px)", display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "#a8a08c",
                    marginBottom: 18,
                  }}
                >
                  In plain English
                </div>
                <p style={{ fontSize: 17, lineHeight: 1.65, margin: 0, color: "#e9e4d5" }}>{activeClause.meaning}</p>
              </div>
              <div style={{ border: "1px solid #2b2720", background: "#1c1811", padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#151209",
                      background: "#e9e4d5",
                      padding: "3px 9px",
                    }}
                  >
                    Retrieved
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#e9e4d5" }}>
                    {activeClause.statuteRef}
                  </span>
                </div>
                <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: "#a8a08c" }}>
                  {activeClause.statuteText}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Score as hero object */}
      <Reveal style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(48px,6vw,88px) clamp(20px,4vw,48px)" }}>
        <div style={{ display: "flex", gap: "clamp(28px,5vw,72px)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 auto" }}>
            <ScoreHero score={9.5} level="critical" />
          </div>
          <div style={{ flex: "1 1 380px", minWidth: 290 }}>
            <h2
              style={{
                fontFamily: "'Newsreader', serif",
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: "clamp(30px,3.6vw,46px)",
                lineHeight: 1.08,
                margin: "0 0 18px",
                letterSpacing: "-0.02em",
              }}
            >
              One number you can argue with.
            </h2>
            <p style={{ fontSize: 18, color: "#4a4438", lineHeight: 1.65, margin: "0 0 34px", maxWidth: 520 }}>
              Severity is weighted by how far each clause departs from the statute and how much it
              can cost you. Every point traces back to a section you can cite at the Landlord and
              Tenant Board.
            </p>
            <SeverityRuler score={9.5} level="critical" />
          </div>
        </div>
      </Reveal>

      {/* Inside your report */}
      <Reveal style={{ borderTop: "1px solid #17140f", background: "#fffdfa" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(40px,5vw,64px) clamp(20px,4vw,48px)" }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#6f6857",
              marginBottom: 34,
            }}
          >
            Inside your report
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
              gap: "clamp(24px,3vw,44px) clamp(24px,4vw,56px)",
            }}
          >
            {REPORT_ITEMS.map((item) => (
              <div key={item.n} style={{ borderTop: "1px solid #17140f", paddingTop: 16 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#9c2b23", marginBottom: 12 }}>
                  {item.n}
                </div>
                <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 8, fontFamily: "'Newsreader', serif", fontStyle: "italic" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 14, color: "#6f6857", lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Trust / grounding strip */}
      <Reveal style={{ borderTop: "1px solid #17140f", background: "#f7f4ee" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(40px,5vw,64px) clamp(20px,4vw,48px)" }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#6f6857",
              marginBottom: 30,
            }}
          >
            How the analysis is grounded
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "clamp(22px,3vw,40px)" }}>
            {TRUST_ITEMS.map((t) => (
              <div key={t.label}>
                <div style={{ fontFamily: "'Newsreader', serif", fontWeight: 600, fontSize: 32, lineHeight: 1, marginBottom: 10 }}>
                  {t.figure}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t.label}</div>
                <div style={{ fontSize: 13, color: "#6f6857", lineHeight: 1.6 }}>{t.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Closing CTA */}
      <Reveal style={{ borderTop: "1px solid #17140f", background: "#151209", color: "#f4efe4" }}>
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "clamp(48px,6vw,84px) clamp(20px,4vw,48px)",
            display: "flex",
            gap: 36,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "clamp(32px,4.4vw,58px)",
              lineHeight: 1,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Read it before
            <br />
            you sign it.
          </h2>
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={scrollToUpload}
              style={{
                fontFamily: "'Public Sans', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                padding: "16px 30px",
                border: "1px solid #f4efe4",
                background: "#f4efe4",
                color: "#151209",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#9c2b23";
                e.currentTarget.style.borderColor = "#9c2b23";
                e.currentTarget.style.color = "#fffdfa";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f4efe4";
                e.currentTarget.style.borderColor = "#f4efe4";
                e.currentTarget.style.color = "#151209";
              }}
            >
              Upload your lease
            </button>
            <Link href={`/report/${DEMO_LEASE_ID}`} style={{ fontSize: 15, color: "#a8a08c", borderBottom: "1px solid #4a4438", textDecoration: "none" }}>
              or see a sample report
            </Link>
          </div>
        </div>
      </Reveal>

      {/* Footer */}
      <footer
        style={{
          padding: "26px clamp(20px,4vw,56px)",
          fontSize: 13,
          color: "#6f6857",
          lineHeight: 1.6,
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <span>
          LeaseGuard provides educational information only and does not constitute legal advice.
          For matters requiring professional legal judgment, consult a licensed paralegal or
          lawyer.{" "}
          <a href="/privacy" style={{ color: "#6f6857", textUnderlineOffset: "2px" }}>
            Privacy Policy
          </a>
          . Analysis grounded in the Ontario Residential Tenancies Act, 2006.
        </span>
      </footer>
    </div>
  );
}

// ── Processing Page ───────────────────────────────────────────────────────────

interface LogLine {
  id: number;
  message: string;
  severity?: "info" | "success" | "warning" | "critical";
  timestamp: number;
}

function severityColor(s?: string): string {
  if (s === "critical") return "#ff9d94";
  if (s === "warning") return "#e0a45e";
  if (s === "success") return "#7ec98f";
  return "#a8a08c";
}

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

interface ProcessingPageProps {
  leaseId: string;
  filename: string;
  onReset: () => void;
}

function ErrorCard({
  tag,
  tagBg,
  tagColor,
  code,
  icon,
  title,
  body,
  checklist,
  note,
  children,
}: {
  tag: string;
  tagBg: string;
  tagColor: string;
  code: string;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  checklist?: string[];
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f4ee",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Public Sans', sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 480, width: "100%", border: "1px solid #17140f", background: "#fffdfa" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 24px",
            borderBottom: "1px solid #e0d9c6",
          }}
        >
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: tagColor,
              background: tagBg,
              padding: "3px 9px",
            }}
          >
            {tag}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#6f6857" }}>{code}</span>
        </div>

        <div style={{ padding: "32px 32px 36px", textAlign: "center" }}>
          <div style={{ marginBottom: 20 }}>{icon}</div>

          <div
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: 26,
              margin: "0 0 10px",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 14, color: "#4a4438", marginBottom: 22, lineHeight: 1.6 }}>{body}</div>

          {checklist && (
            <div style={{ background: "#f7f4ee", border: "1px solid #e0d9c6", padding: "14px 16px", textAlign: "left", marginBottom: 24 }}>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#6f6857",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                What to upload
              </div>
              {checklist.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 4.5" stroke="#2f6b3a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: 12, color: "#4a4438" }}>{item}</span>
                </div>
              ))}
            </div>
          )}

          {note && (
            <div
              style={{
                background: "#f7f0dc",
                border: "1px solid #e3cd8f",
                padding: "12px 16px",
                fontSize: 12,
                color: "#8a4a17",
                marginBottom: 24,
                textAlign: "left",
                lineHeight: 1.6,
              }}
            >
              {note}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}

function ProcessingPage({ leaseId, filename, onReset }: ProcessingPageProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string>("analysis_failed");
  const [detectedAs, setDetectedAs] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [usePollingFallback, setUsePollingFallback] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const startRef = useRef(Date.now());
  const logContainerRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(0);

  // Elapsed timer
  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Client-side timeout: if 3 minutes pass with no completion, show retry screen
  useEffect(() => {
    if (failed || elapsed < 180) return;
    setFailed(true);
    setErrorCode("analysis_failed");
    setErrorMsg(
      "Analysis timed out after 3 minutes. Please try again — this is usually a temporary issue."
    );
  }, [elapsed, failed]);

  // Retry handler — calls POST /api/job/[id]/retry, then resets state for a fresh attempt
  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/job/${leaseId}/retry`, { method: "POST" });
      if (res.ok) {
        // Reset all state for the fresh attempt
        startRef.current = Date.now();
        setElapsed(0);
        setFailed(false);
        setErrorCode("analysis_failed");
        setErrorMsg(null);
        setDetectedAs(null);
        setLogLines([]);
        setCurrentStep(0);
        setCompletedSteps([]);
        setUsePollingFallback(false);
        setRetrying(false);
      } else {
        const body = (await res.json()) as { message?: string };
        setErrorMsg(
          body.message ?? "Retry failed. Please try uploading a different file."
        );
        setRetrying(false);
      }
    } catch {
      setErrorMsg("Could not reach the server. Please check your connection and try again.");
      setRetrying(false);
    }
  }

  // Auto-scroll log container when new lines arrive
  useEffect(() => {
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLines]);

  // SSE stream — primary progress mechanism
  useEffect(() => {
    if (usePollingFallback) return;

    const es = new EventSource(`/api/stream/${leaseId}`);

    es.onmessage = (e: MessageEvent) => {
      let event: { type: string; message: string; step?: number; severity?: string; timestamp: number };
      try {
        event = JSON.parse(e.data as string);
      } catch {
        return;
      }

      if (event.type === "log") {
        setLogLines((prev) => [
          ...prev,
          {
            id: ++lineIdRef.current,
            message: event.message,
            severity: event.severity as LogLine["severity"],
            timestamp: event.timestamp,
          },
        ]);
        if (event.step !== undefined) {
          setCurrentStep(event.step);
          setCompletedSteps(Array.from({ length: event.step }, (_, i) => i));
        }
      }

      if (event.type === "complete") {
        setLogLines((prev) => [
          ...prev,
          {
            id: ++lineIdRef.current,
            message: event.message,
            severity: "success",
            timestamp: event.timestamp,
          },
        ]);
        setCompletedSteps([0, 1, 2, 3, 4]);
        setCurrentStep(5);
        es.close();
        setTimeout(() => router.push(`/report/${leaseId}`), 1000);
      }

      if (event.type === "error") {
        es.close();
        // error message may be plain text or JSON-encoded LeaseValidationError
        let parsedCode = "analysis_failed";
        let parsedMsg = event.message;
        let parsedDetectedAs: string | null = null;
        if (event.message.startsWith("{")) {
          try {
            const p = JSON.parse(event.message) as {
              code?: string;
              message?: string;
              detected_as?: string | null;
            };
            parsedCode = p.code ?? "analysis_failed";
            parsedMsg = p.message ?? event.message;
            parsedDetectedAs = p.detected_as ?? null;
          } catch { /* use raw message */ }
        }
        setFailed(true);
        setErrorCode(parsedCode);
        setErrorMsg(parsedMsg);
        setDetectedAs(parsedDetectedAs);
      }
    };

    es.onerror = () => {
      es.close();
      setUsePollingFallback(true);
    };

    // Fallback: if no events after 12s, switch to polling.
    // Use lineIdRef (not logLines state) to avoid stale closure.
    const fallbackTimer = setTimeout(() => {
      if (lineIdRef.current === 0) {
        es.close();
        setUsePollingFallback(true);
      }
    }, 12_000);

    return () => {
      clearTimeout(fallbackTimer);
      es.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseId, router, usePollingFallback]);

  // Polling fallback (used only if SSE fails or times out)
  useEffect(() => {
    if (!usePollingFallback) return;
    let cancelled = false;
    let lastLoggedStep = -1;

    const STEP_START_MESSAGES = [
      "Reading your document and extracting text…",
      "Document parsed — confirming Ontario jurisdiction…",
      "Jurisdiction confirmed — identifying lease clauses…",
      "Clauses found — looking up relevant RTA statutes…",
      "Research complete — writing your risk report…",
    ];

    function addLog(message: string, severity: LogLine["severity"]) {
      if (cancelled) return;
      setLogLines((prev) => [
        ...prev,
        { id: ++lineIdRef.current, message, severity, timestamp: Date.now() },
      ]);
    }

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/job/${leaseId}`);
        const job = await res.json() as {
          status: string;
          progress_pct?: number;
          error_code?: string;
          error_message?: string;
          detected_as?: string | null;
        };
        if (cancelled) return;
        if (job.status === "complete") {
          if (lastLoggedStep >= 0 && lastLoggedStep < PROCESSING_STEPS.length) {
            addLog(`✓ ${PROCESSING_STEPS[lastLoggedStep].label}`, "success");
          }
          addLog("✓ Analysis complete — your report is ready", "success");
          setCompletedSteps([0, 1, 2, 3, 4]);
          setCurrentStep(5);
          setTimeout(() => router.push(`/report/${leaseId}`), 600);
          return;
        }
        if (job.status === "failed") {
          setFailed(true);
          setErrorCode(job.error_code ?? "analysis_failed");
          setDetectedAs(job.detected_as ?? null);
          setErrorMsg(job.error_message ?? "Analysis failed. Please try again.");
          return;
        }
        const step = pctToStep(job.progress_pct ?? 0);

        if (step !== lastLoggedStep) {
          // Mark the previous step done before announcing the next
          if (lastLoggedStep >= 0 && lastLoggedStep < PROCESSING_STEPS.length) {
            addLog(`✓ ${PROCESSING_STEPS[lastLoggedStep].label}`, "success");
          }
          if (step < STEP_START_MESSAGES.length) {
            addLog(STEP_START_MESSAGES[step], "info");
          }
          lastLoggedStep = step;
        }

        setCurrentStep(step);
        setCompletedSteps(Array.from({ length: step }, (_, i) => i));
      } catch { /* Network hiccup — keep polling */ }
      if (!cancelled) setTimeout(poll, 2000);
    }

    poll();
    return () => { cancelled = true; };
  }, [leaseId, router, usePollingFallback]);

  const totalExpected = 90;
  const remaining = Math.max(0, totalExpected - elapsed);
  const complete = currentStep >= PROCESSING_STEPS.length;

  if (failed) {
    // ── not_a_lease ─────────────────────────────────────────────────────────
    if (errorCode === "not_a_lease") {
      const detectedLabels: Record<string, string> = {
        resume: "a resume or CV",
        invoice: "an invoice or bill",
        other_contract: "a non-residential contract",
        unknown: "a non-lease document",
      };
      const detectedLabel = detectedLabels[detectedAs ?? ""] ?? "a non-lease document";

      return (
        <ErrorCard
          tag="Error"
          tagBg="#e8e2d2"
          tagColor="#4a4438"
          code="not_a_lease"
          icon={
            <svg width="48" height="56" viewBox="0 0 48 56" fill="none" style={{ display: "inline-block" }}>
              <rect x="1" y="1" width="38" height="46" rx="0" fill="#fffdfa" stroke="#17140f" strokeWidth="1.5" />
              <path d="M27 1l11 10H28a1 1 0 01-1-1V1z" fill="#f7f4ee" stroke="#17140f" strokeWidth="1.5" />
              <circle cx="38" cy="45" r="10" fill="#9c2b23" />
              <path d="M34.5 45l3.5-3.5m0 3.5l-3.5-3.5" stroke="#fffdfa" strokeWidth="2" strokeLinecap="round" />
              <rect x="8" y="20" width="14" height="2" fill="#cfc6ab" />
              <rect x="8" y="26" width="22" height="2" fill="#cfc6ab" />
              <rect x="8" y="32" width="18" height="2" fill="#cfc6ab" />
            </svg>
          }
          title="This doesn't look like a lease."
          body={
            <>
              We detected {detectedLabel}, not an Ontario residential lease. LeaseGuard only
              analyzes residential tenancy agreements — such as the Ontario Standard Form of Lease
              or a custom rental agreement.
            </>
          }
          checklist={[
            "Ontario Standard Form of Lease",
            "Custom residential rental agreements",
            "Month-to-month or fixed-term tenancies",
            "Ontario lease renewals or addendums",
          ]}
        >
          <button
            onClick={() => onReset()}
            style={{
              width: "100%",
              padding: "14px 24px",
              border: "1px solid #17140f",
              background: "#151209",
              color: "#f4efe4",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Upload a lease instead
          </button>
        </ErrorCard>
      );
    }

    // ── wrong_jurisdiction ──────────────────────────────────────────────────
    if (errorCode === "wrong_jurisdiction") {
      return (
        <ErrorCard
          tag="Error"
          tagBg="#e8e2d2"
          tagColor="#4a4438"
          code="wrong_jurisdiction"
          icon={
            <svg width="44" height="52" viewBox="0 0 48 56" fill="none" style={{ display: "inline-block" }}>
              <circle cx="24" cy="22" r="20" fill="#fffdfa" stroke="#e3cd8f" strokeWidth="1.5" />
              <path d="M24 12c-5.5 0-10 4.5-10 10 0 7.5 10 18 10 18s10-10.5 10-18c0-5.5-4.5-10-10-10z" fill="#f7f0dc" stroke="#8a4a17" strokeWidth="1.5" />
              <circle cx="24" cy="22" r="3.5" fill="#8a4a17" />
            </svg>
          }
          title="Ontario leases only."
          body={errorMsg}
          note={
            <>
              LeaseGuard uses the Ontario Residential Tenancies Act, 2006 and LTB case law.
              Analysis for other provinces is not yet supported.
            </>
          }
        >
          <button
            onClick={() => onReset()}
            style={{
              width: "100%",
              padding: "14px 24px",
              border: "1px solid #17140f",
              background: "#151209",
              color: "#f4efe4",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Try another document
          </button>
        </ErrorCard>
      );
    }

    // ── generic analysis_failed ─────────────────────────────────────────────
    return (
      <ErrorCard
        tag="Error"
        tagBg="#f4d9d6"
        tagColor="#9c2b23"
        code="analysis_failed"
        icon={
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#9c2b23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block" }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        }
        title="The analysis stopped early."
        body={errorMsg ?? "Something went wrong during analysis. Please try again."}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              padding: "14px 24px",
              border: "1px solid #17140f",
              background: retrying ? "#4a4438" : "#151209",
              color: "#f4efe4",
              fontSize: 15,
              fontWeight: 600,
              cursor: retrying ? "not-allowed" : "pointer",
              fontFamily: "'Public Sans', sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {retrying ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity="0.25" />
                  <path d="M21 12a9 9 0 01-9 9" />
                </svg>
                Retrying…
              </>
            ) : (
              "Try again"
            )}
          </button>
          <button
            onClick={() => onReset()}
            style={{
              padding: "12px 24px",
              border: "1px solid #cfc6ab",
              background: "transparent",
              fontSize: 14,
              cursor: "pointer",
              color: "#4a4438",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Upload a different file
          </button>
        </div>
      </ErrorCard>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f4ee",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Public Sans', sans-serif",
        color: "#17140f",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 clamp(20px,4vw,56px)",
          height: 66,
          borderBottom: "1px solid #17140f",
          background: "#f7f4ee",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 22, letterSpacing: "-0.01em" }}>
          LeaseGuard
        </span>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 24px" }}>
        <div style={{ width: "100%", maxWidth: 640 }}>
          {/* File status bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 18px",
              border: "1px solid #17140f",
              background: "#fffdfa",
              marginBottom: 40,
              flexWrap: "wrap",
            }}
          >
            <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
              <rect x="0.75" y="0.75" width="12.5" height="16.5" rx="0" fill="#fffdfa" stroke="#cfc6ab" strokeWidth="1.5" />
              <rect x="3" y="8" width="5" height="1.5" fill="#cfc6ab" />
              <rect x="3" y="11" width="8" height="1.5" fill="#cfc6ab" />
              <rect x="3" y="14" width="6" height="1.5" fill="#cfc6ab" />
            </svg>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {filename}
            </span>
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                background: "#e8e2d2",
                color: "#4a4438",
                padding: "3px 9px",
                flexShrink: 0,
              }}
            >
              Ontario · {complete ? "complete" : "processing"}
            </span>
          </div>

          {/* Title */}
          <h2 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: "clamp(34px,4.6vw,44px)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            {complete ? "Your report is ready." : "Analysing your lease"}
          </h2>
          <p style={{ fontSize: 16, color: "#6f6857", margin: "0 0 36px" }}>
            {complete ? "Opening it now — this takes a second." : "Usually 60–90 seconds. Please keep this tab open."}
          </p>

          {/* Step timeline */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {PROCESSING_STEPS.map((step, i) => {
              const done = completedSteps.includes(i);
              const active = currentStep === i;

              return (
                <div key={step.id} style={{ display: "flex" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
                    <div
                      style={{
                        width: 1,
                        flex: "0 0 10px",
                        background: i === 0 ? "transparent" : done || active ? "#17140f" : "#e0d9c6",
                      }}
                    />
                    <div
                      style={{
                        width: done || active ? 18 : 13,
                        height: done || active ? 18 : 13,
                        borderRadius: "50%",
                        background: done ? "#17140f" : "transparent",
                        border: active ? "2px solid #9c2b23" : done ? "none" : "1px solid #cfc6ab",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.3s",
                      }}
                    >
                      {done && (
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.2 2.2L8 3" stroke="#fffdfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {active && (
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#9c2b23", animation: "lg-pulse 1.2s ease-in-out infinite" }} />
                      )}
                    </div>
                    <div
                      style={{
                        width: 1,
                        flex: 1,
                        minHeight: 10,
                        background: i === PROCESSING_STEPS.length - 1 ? "transparent" : done ? "#17140f" : "#e0d9c6",
                      }}
                    />
                  </div>

                  <div style={{ paddingLeft: 14, paddingBottom: 24, paddingTop: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: active ? 600 : 400,
                          color: done ? "#4a4438" : active ? "#17140f" : "#b5ac98",
                        }}
                      >
                        {step.label}
                      </span>
                      {active && (
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9c2b23", fontWeight: 500 }}>
                          In progress
                        </span>
                      )}
                      {done && (
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#2f6b3a", fontWeight: 500 }}>
                          Done
                        </span>
                      )}
                    </div>
                    {(active || done) && (
                      <div style={{ marginTop: 3, fontSize: 12, color: active ? "#4a4438" : "#a8a08c", lineHeight: 1.4 }}>
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Streaming agent log */}
          <div style={{ marginTop: 24, background: "#131110", border: "1px solid #17140f" }}>
            <div style={{ padding: "9px 14px", borderBottom: "1px solid #2b2720", display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: complete ? "#7ec98f" : "#2f6b3a",
                  flexShrink: 0,
                  animation: complete ? "none" : "lg-pulse 1.4s ease-in-out infinite",
                }}
              />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#a8a08c", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
                Agent log
              </span>
              <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#6f6857" }}>
                {logLines.length} events
              </span>
            </div>

            <div
              ref={logContainerRef}
              style={{
                padding: "10px 14px",
                height: 196,
                overflowY: "auto",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                lineHeight: 1.85,
                scrollBehavior: "smooth",
              }}
            >
              {logLines.length === 0 ? (
                <span style={{ color: "#6f6857", fontStyle: "italic" }}>Connecting to analysis pipeline...</span>
              ) : (
                logLines.map((line) => (
                  <div key={line.id} style={{ display: "flex", gap: 12, animation: "log-fadein 0.25s ease" }}>
                    <span style={{ color: "#8a8272", flexShrink: 0, userSelect: "none" }}>{formatLogTime(line.timestamp)}</span>
                    <span style={{ color: severityColor(line.severity) }}>{line.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Progress rule */}
          <div style={{ marginTop: 12, height: 3, background: "#e0d9c6" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (elapsed / totalExpected) * 100)}%`,
                background: "#9c2b23",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          {/* Time display */}
          <div
            style={{
              marginTop: 10,
              padding: "12px 16px",
              background: "#fffdfa",
              border: "1px solid #e0d9c6",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            <span style={{ fontSize: 12, color: "#6f6857" }}>
              {complete ? "Analysis complete" : `Elapsed: ${elapsed}s`}
            </span>
            {!complete && <span style={{ fontSize: 12, color: "#4a4438", fontWeight: 500 }}>~{remaining}s remaining</span>}
          </div>

          <style>{`
            @keyframes log-fadein {
              from { opacity: 0; transform: translateY(4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      </main>
    </div>
  );
}

// ── Root page (screen router) ─────────────────────────────────────────────────

// Tiny component that owns useSearchParams so only it suspends during hydration,
// not the entire page (which would leave the upload UI with a dead callback).
function SearchParamsRedirect({
  onLeaseParam,
}: {
  onLeaseParam: (id: string) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const paramId = searchParams.get("leaseId");
    if (paramId) onLeaseParam(paramId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

function HomePageInner() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [leaseId, setLeaseId] = useState("");
  const [filename, setFilename] = useState("");

  // Called by SearchParamsRedirect when ?leaseId=xxx is present in the URL
  // (e.g. from dashboard "View progress →" link).
  function handleLeaseParam(id: string) {
    setLeaseId(id);
    setFilename("");
    setScreen("processing");
  }

  function handleUploadSuccess(id: string, name: string) {
    setLeaseId(id);
    setFilename(name);
    setScreen("processing");
  }

  function handleReset() {
    setLeaseId("");
    setFilename("");
    setScreen("landing");
    // Clear the ?leaseId param so a fresh upload doesn't re-enter processing
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/");
    }
  }

  if (screen === "processing") {
    return <ProcessingPage leaseId={leaseId} filename={filename} onReset={handleReset} />;
  }

  return (
    <>
      {/* Suspense wraps only the searchParams hook — not the upload UI */}
      <Suspense fallback={null}>
        <SearchParamsRedirect onLeaseParam={handleLeaseParam} />
      </Suspense>
      <LandingPage onUploadSuccess={handleUploadSuccess} />
    </>
  );
}

export default function HomePage() {
  return <HomePageInner />;
}
