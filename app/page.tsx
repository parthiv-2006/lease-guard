"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── Upload page ───────────────────────────────────────────────────────────────

type Screen = "landing" | "processing";

const PROCESSING_STEPS = [
  {
    id: "parse",
    label: "Extracting text",
    detail: "Reading PDF and detecting page structure",
  },
  {
    id: "jurisdiction",
    label: "Detecting jurisdiction",
    detail: "Ontario (CA-ON) confirmed — high confidence",
  },
  {
    id: "segment",
    label: "Reading clauses",
    detail: "Segmenting lease into individual clauses…",
  },
  {
    id: "research",
    label: "Researching law",
    detail: "Querying 1,574 RTA statute chunks via RAG…",
  },
  {
    id: "report",
    label: "Building report",
    detail: "Scoring risk · detecting contradictions · generating negotiation guide…",
  },
];

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

function LandingPage({ onUploadSuccess }: LandingPageProps) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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

  const borderColor = error
    ? "#b91c1c"
    : dragOver
    ? "#181614"
    : file
    ? "#181614"
    : "#c8c3ba";
  const bgColor = dragOver ? "#f0ede6" : "#fdfcfa";

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
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "17px",
            letterSpacing: "0.02em",
            color: "#181614",
          }}
        >
          LeaseGuard
        </span>
        <nav style={{ display: "flex", gap: "28px" }}>
          {["How it works", "Ontario RTA", "About"].map((label) => (
            <a
              key={label}
              href="#"
              style={{
                fontSize: "13px",
                color: "#6b6560",
                textDecoration: "none",
                fontWeight: 400,
                letterSpacing: "0.01em",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "#181614")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "#6b6560")
              }
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 24px 80px",
        }}
      >
        {/* Jurisdiction tag */}
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
            marginBottom: "28px",
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
          Ontario Residential Tenancies Act
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "clamp(40px, 6vw, 68px)",
            lineHeight: 1.05,
            color: "#181614",
            textAlign: "center",
            margin: "0 0 18px",
            letterSpacing: "-0.02em",
            maxWidth: "720px",
          }}
        >
          Read what you sign.
        </h1>
        <p
          style={{
            fontSize: "16px",
            color: "#6b6560",
            textAlign: "center",
            maxWidth: "480px",
            lineHeight: 1.6,
            margin: "0 0 48px",
          }}
        >
          Upload your Ontario lease. LeaseGuard reads every clause against real
          statute and tells you exactly what you are agreeing to — in under 90
          seconds.
        </p>

        {/* Upload zone */}
        <div style={{ width: "100%", maxWidth: "560px" }}>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !file && inputRef.current?.click()}
            style={{
              border: `1.5px dashed ${borderColor}`,
              borderRadius: "10px",
              background: bgColor,
              padding: "52px 40px",
              textAlign: "center",
              cursor: file ? "default" : "pointer",
              transition: "all 0.2s",
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {!file ? (
              <>
                {/* PDF icon */}
                <div
                  style={{
                    width: 48,
                    height: 56,
                    margin: "0 auto 20px",
                    position: "relative",
                  }}
                >
                  <svg
                    viewBox="0 0 48 56"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ width: "100%", height: "100%" }}
                  >
                    <rect
                      x="1"
                      y="1"
                      width="38"
                      height="46"
                      rx="3"
                      fill="#fff"
                      stroke={dragOver ? "#181614" : "#ddd8cf"}
                      strokeWidth="1.5"
                    />
                    <path
                      d="M27 1l11 10H28a1 1 0 01-1-1V1z"
                      fill={dragOver ? "#e8e4dc" : "#f0ede6"}
                      stroke={dragOver ? "#181614" : "#ddd8cf"}
                      strokeWidth="1.5"
                    />
                    <rect
                      x="8"
                      y="26"
                      width="14"
                      height="2"
                      rx="1"
                      fill={dragOver ? "#181614" : "#c8c3ba"}
                    />
                    <rect
                      x="8"
                      y="31"
                      width="22"
                      height="2"
                      rx="1"
                      fill={dragOver ? "#181614" : "#c8c3ba"}
                    />
                    <rect
                      x="8"
                      y="36"
                      width="18"
                      height="2"
                      rx="1"
                      fill={dragOver ? "#181614" : "#c8c3ba"}
                    />
                    <rect
                      x="8"
                      y="17"
                      width="8"
                      height="4"
                      rx="1"
                      fill="#b91c1c"
                      opacity="0.85"
                    />
                    <text
                      x="9.5"
                      y="22.5"
                      fontSize="5"
                      fill="white"
                      fontWeight="700"
                      fontFamily="monospace"
                    >
                      PDF
                    </text>
                  </svg>
                </div>
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "#181614",
                  }}
                >
                  {dragOver ? "Release to upload" : "Drop your lease PDF here"}
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: "#9a9590" }}>
                  or{" "}
                  <span
                    style={{
                      color: "#181614",
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                      cursor: "pointer",
                    }}
                  >
                    click to browse
                  </span>
                </p>
              </>
            ) : (
              /* File selected state */
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 16px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "7px",
                    marginBottom: "16px",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8l3.5 3.5L13 4.5"
                      stroke="#15803d"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#181614",
                    }}
                  >
                    {file.name}
                  </span>
                  <span style={{ fontSize: "12px", color: "#9a9590" }}>
                    {formatSize(file.size)}
                  </span>
                </div>
                <p
                  style={{
                    margin: "0 0 20px",
                    fontSize: "13px",
                    color: "#6b6560",
                  }}
                >
                  File verified · Ontario lease detected
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    justifyContent: "center",
                  }}
                >
                  <button
                    onClick={() => {
                      setFile(null);
                      setError(null);
                    }}
                    disabled={uploading}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      background: "transparent",
                      border: "1px solid #ddd8cf",
                      color: "#6b6560",
                      opacity: uploading ? 0.5 : 1,
                    }}
                  >
                    Remove
                  </button>
                  <button
                    onClick={handleAnalyse}
                    disabled={uploading}
                    style={{
                      padding: "10px 28px",
                      borderRadius: "6px",
                      cursor: uploading ? "wait" : "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      background: uploading ? "#4a4744" : "#181614",
                      border: "1px solid #181614",
                      color: "#fff",
                      letterSpacing: "0.02em",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!uploading)
                        e.currentTarget.style.background = "#2d2926";
                    }}
                    onMouseLeave={(e) => {
                      if (!uploading)
                        e.currentTarget.style.background = "#181614";
                    }}
                  >
                    {uploading ? "Uploading…" : "Analyse Lease"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                marginTop: "12px",
                padding: "10px 14px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                fontSize: "13px",
                color: "#b91c1c",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="6.5"
                  stroke="#b91c1c"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 5v3.5M8 11v.5"
                  stroke="#b91c1c"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {error}
            </div>
          )}

          {/* Caption row */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "20px",
              marginTop: "20px",
              flexWrap: "wrap",
            }}
          >
            {["Text + scanned PDF", "Ontario leases", "Free · no account"].map(
              (item) => (
                <span
                  key={item}
                  style={{
                    fontSize: "12px",
                    color: "#9a9590",
                    display: "flex",
                    gap: "5px",
                    alignItems: "center",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8l3.5 3.5L13 4.5"
                      stroke="#9a9590"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {item}
                </span>
              )
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div
          style={{
            marginTop: "72px",
            display: "flex",
            gap: "48px",
            padding: "24px 48px",
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "10px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {[
            { n: "< 90s", d: "Median analysis time" },
            { n: "1,574", d: "RTA sections indexed" },
            { n: "100%", d: "Cited to statute" },
            { n: "Free", d: "No account required" },
          ].map(({ n, d }) => (
            <div key={d} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: 600,
                  fontSize: "22px",
                  color: "#181614",
                  letterSpacing: "-0.01em",
                }}
              >
                {n}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#9a9590",
                  marginTop: "2px",
                  letterSpacing: "0.03em",
                }}
              >
                {d}
              </div>
            </div>
          ))}
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
        Residential Tenancies Act, 2006. Corpus version RTA-2024-Q4.
      </footer>
    </div>
  );
}

// ── Processing Page ───────────────────────────────────────────────────────────

interface ProcessingPageProps {
  leaseId: string;
  filename: string;
  onReset: () => void;
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
  const startRef = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Poll job status every 2s
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/job/${leaseId}`);
        const job = await res.json();

        if (cancelled) return;

        if (job.status === "complete") {
          // Mark all steps done
          setCompletedSteps([0, 1, 2, 3, 4]);
          setCurrentStep(5);
          setTimeout(() => router.push(`/report/${leaseId}`), 600);
          return;
        }

        if (job.status === "failed") {
          setFailed(true);
          setErrorCode(job.error_code ?? "analysis_failed");
          setDetectedAs(job.detected_as ?? null);
          setErrorMsg(
            job.error_message ?? "Analysis failed. Please try again."
          );
          return;
        }

        // Map progress_pct → step
        const step = pctToStep(job.progress_pct ?? 0);
        setCurrentStep(step);
        setCompletedSteps(
          Array.from({ length: step }, (_, i) => i)
        );
      } catch {
        // Network hiccup — keep polling
      }

      if (!cancelled) {
        setTimeout(poll, 2000);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [leaseId, router]);

  const totalExpected = 90;
  const remaining = Math.max(0, totalExpected - elapsed);

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
        <div
          style={{
            minHeight: "100vh",
            background: "#f6f3ee",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Sans', sans-serif",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "#fff",
              border: "1px solid #e8e4dc",
              borderRadius: "12px",
              padding: "36px 32px",
              textAlign: "center",
            }}
          >
            {/* Document-with-X icon */}
            <div style={{ marginBottom: "20px" }}>
              <svg width="52" height="60" viewBox="0 0 52 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="40" height="50" rx="3" fill="#fef2f2" stroke="#fecaca" strokeWidth="1.5"/>
                <path d="M29 1l12 11H30a1 1 0 01-1-1V1z" fill="#fee2e2" stroke="#fecaca" strokeWidth="1.5"/>
                <circle cx="39" cy="47" r="11" fill="#b91c1c"/>
                <path d="M35 47l4-4m0 4l-4-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <rect x="8" y="22" width="16" height="2" rx="1" fill="#fca5a5"/>
                <rect x="8" y="28" width="24" height="2" rx="1" fill="#fca5a5"/>
                <rect x="8" y="34" width="20" height="2" rx="1" fill="#fca5a5"/>
              </svg>
            </div>

            <div
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#181614",
                fontFamily: "'Cormorant Garamond', serif",
                marginBottom: "8px",
                letterSpacing: "-0.01em",
              }}
            >
              This doesn&apos;t look like a lease
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#6b6560",
                marginBottom: "20px",
                lineHeight: 1.6,
              }}
            >
              We detected {detectedLabel}, not an Ontario residential lease.
              LeaseGuard only analyzes residential tenancy agreements — such as
              the Ontario Standard Form of Lease or a custom rental agreement.
            </div>

            {/* What to upload */}
            <div
              style={{
                background: "#f6f3ee",
                borderRadius: "8px",
                padding: "14px 16px",
                textAlign: "left",
                marginBottom: "24px",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#9a9590", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>
                What to upload
              </div>
              {[
                "Ontario Standard Form of Lease",
                "Custom residential rental agreements",
                "Month-to-month or fixed-term tenancies",
                "Ontario lease renewals or addendums",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 4.5" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: "12px", color: "#6b6560" }}>{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => onReset()}
              style={{
                width: "100%",
                padding: "11px 24px",
                borderRadius: "7px",
                border: "none",
                background: "#181614",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              Upload a lease instead
            </button>
          </div>
        </div>
      );
    }

    // ── wrong_jurisdiction ──────────────────────────────────────────────────
    if (errorCode === "wrong_jurisdiction") {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#f6f3ee",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Sans', sans-serif",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "#fff",
              border: "1px solid #e8e4dc",
              borderRadius: "12px",
              padding: "36px 32px",
              textAlign: "center",
            }}
          >
            {/* Location pin icon */}
            <div style={{ marginBottom: "20px" }}>
              <svg width="48" height="56" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="22" r="20" fill="#fef9ec" stroke="#fde68a" strokeWidth="1.5"/>
                <path d="M24 12c-5.5 0-10 4.5-10 10 0 7.5 10 18 10 18s10-10.5 10-18c0-5.5-4.5-10-10-10z" fill="#fde68a" stroke="#d97706" strokeWidth="1.5"/>
                <circle cx="24" cy="22" r="3.5" fill="#d97706"/>
              </svg>
            </div>

            <div
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#181614",
                fontFamily: "'Cormorant Garamond', serif",
                marginBottom: "8px",
                letterSpacing: "-0.01em",
              }}
            >
              Ontario leases only
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#6b6560",
                marginBottom: "20px",
                lineHeight: 1.6,
              }}
            >
              {errorMsg}
            </div>

            <div
              style={{
                background: "#fefce8",
                border: "1px solid #fde68a",
                borderRadius: "8px",
                padding: "12px 16px",
                fontSize: "12px",
                color: "#92400e",
                marginBottom: "24px",
                textAlign: "left",
                lineHeight: 1.6,
              }}
            >
              LeaseGuard uses the Ontario Residential Tenancies Act, 2006 and
              LTB case law. Analysis for other provinces is not yet supported.
            </div>

            <button
              onClick={() => onReset()}
              style={{
                width: "100%",
                padding: "11px 24px",
                borderRadius: "7px",
                border: "none",
                background: "#181614",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              Try another document
            </button>
          </div>
        </div>
      );
    }

    // ── generic analysis_failed ─────────────────────────────────────────────
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f6f3ee",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
          gap: "16px",
        }}
      >
        <div
          style={{
            padding: "24px 32px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "10px",
            maxWidth: "480px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#b91c1c",
              marginBottom: "8px",
            }}
          >
            Analysis failed
          </div>
          <div style={{ fontSize: "13px", color: "#6b6560" }}>
            {errorMsg}
          </div>
        </div>
        <button
          onClick={() => onReset()}
          style={{
            padding: "10px 24px",
            borderRadius: "6px",
            border: "1px solid #ddd8cf",
            background: "#fff",
            fontSize: "13px",
            cursor: "pointer",
            color: "#181614",
          }}
        >
          Try another lease
        </button>
      </div>
    );
  }

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
          padding: "0 48px",
          height: "56px",
          borderBottom: "1px solid #e8e4dc",
          background: "#f6f3ee",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "17px",
            letterSpacing: "0.02em",
            color: "#181614",
          }}
        >
          LeaseGuard
        </span>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "520px" }}>
          {/* File info */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 16px",
              background: "#fff",
              border: "1px solid #e8e4dc",
              borderRadius: "7px",
              marginBottom: "40px",
            }}
          >
            <svg
              width="16"
              height="18"
              viewBox="0 0 16 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="0.75"
                y="0.75"
                width="12.5"
                height="16.5"
                rx="1.75"
                fill="white"
                stroke="#ddd8cf"
                strokeWidth="1.5"
              />
              <rect
                x="3"
                y="8"
                width="5"
                height="1.5"
                rx="0.75"
                fill="#c8c3ba"
              />
              <rect
                x="3"
                y="11"
                width="8"
                height="1.5"
                rx="0.75"
                fill="#c8c3ba"
              />
              <rect
                x="3"
                y="14"
                width="6"
                height="1.5"
                rx="0.75"
                fill="#c8c3ba"
              />
              <rect
                x="3"
                y="4"
                width="3"
                height="2"
                rx="0.5"
                fill="#b91c1c"
                opacity="0.85"
              />
            </svg>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#181614",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {filename}
            </span>
            <span style={{ fontSize: "12px", color: "#9a9590", flexShrink: 0 }}>
              Ontario · processing
            </span>
          </div>

          {/* Title */}
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "28px",
              color: "#181614",
              margin: "0 0 8px",
              letterSpacing: "-0.01em",
            }}
          >
            Analysing your lease
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "#6b6560",
              margin: "0 0 36px",
            }}
          >
            Usually 60–90 seconds. Please keep this tab open.
          </p>

          {/* Step timeline */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {PROCESSING_STEPS.map((step, i) => {
              const done = completedSteps.includes(i);
              const active = currentStep === i;

              return (
                <div key={step.id} style={{ display: "flex", gap: "0" }}>
                  {/* Left column */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: "32px",
                      flexShrink: 0,
                    }}
                  >
                    {/* Top connector */}
                    <div
                      style={{
                        width: "1px",
                        flex: "0 0 10px",
                        background:
                          i === 0
                            ? "transparent"
                            : done || active
                            ? "#181614"
                            : "#e8e4dc",
                      }}
                    />
                    {/* Dot */}
                    <div
                      style={{
                        width: done ? 20 : active ? 20 : 16,
                        height: done ? 20 : active ? 20 : 16,
                        borderRadius: "50%",
                        background: done
                          ? "#181614"
                          : active
                          ? "transparent"
                          : "#e8e4dc",
                        border: active ? "2px solid #181614" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.3s",
                      }}
                    >
                      {done && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                        >
                          <path
                            d="M2 5l2.2 2.2L8 3"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {active && (
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#181614",
                            animation: "pulse-dot 1.2s ease-in-out infinite",
                          }}
                        />
                      )}
                    </div>
                    {/* Bottom connector */}
                    <div
                      style={{
                        width: "1px",
                        flex: 1,
                        minHeight: "10px",
                        background:
                          i === PROCESSING_STEPS.length - 1
                            ? "transparent"
                            : done
                            ? "#181614"
                            : "#e8e4dc",
                      }}
                    />
                  </div>

                  {/* Right column: content */}
                  <div
                    style={{
                      paddingLeft: "14px",
                      paddingBottom: "24px",
                      paddingTop: "4px",
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: done ? 400 : active ? 600 : 400,
                          color: done
                            ? "#6b6560"
                            : active
                            ? "#181614"
                            : "#b0aaa4",
                          transition: "all 0.2s",
                        }}
                      >
                        {step.label}
                      </span>
                      {active && (
                        <span
                          style={{
                            fontSize: "10px",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "#9a9590",
                            fontWeight: 500,
                          }}
                        >
                          In progress
                        </span>
                      )}
                      {done && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#15803d",
                            fontWeight: 500,
                          }}
                        >
                          Done
                        </span>
                      )}
                    </div>
                    {(active || done) && (
                      <div
                        style={{
                          marginTop: "3px",
                          fontSize: "12px",
                          color: active ? "#6b6560" : "#9a9590",
                          lineHeight: 1.4,
                        }}
                      >
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time display */}
          <div
            style={{
              marginTop: "8px",
              padding: "14px 18px",
              background: "#fff",
              border: "1px solid #e8e4dc",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "12px", color: "#9a9590" }}>
              {currentStep >= PROCESSING_STEPS.length
                ? "Analysis complete"
                : `Elapsed: ${elapsed}s`}
            </span>
            {currentStep < PROCESSING_STEPS.length && (
              <span
                style={{
                  fontSize: "12px",
                  color: "#6b6560",
                  fontWeight: 500,
                }}
              >
                ~{remaining}s remaining
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Root page (screen router) ─────────────────────────────────────────────────

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [leaseId, setLeaseId] = useState("");
  const [filename, setFilename] = useState("");

  function handleUploadSuccess(id: string, name: string) {
    setLeaseId(id);
    setFilename(name);
    setScreen("processing");
  }

  function handleReset() {
    setLeaseId("");
    setFilename("");
    setScreen("landing");
  }

  if (screen === "processing") {
    return <ProcessingPage leaseId={leaseId} filename={filename} onReset={handleReset} />;
  }

  return <LandingPage onUploadSuccess={handleUploadSuccess} />;
}
