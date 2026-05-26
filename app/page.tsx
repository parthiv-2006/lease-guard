"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthButton } from "./components/auth-button";

// ── Upload page ───────────────────────────────────────────────────────────────

type Screen = "landing" | "processing";

const PROCESSING_STEPS = [
  {
    id: "parse",
    label: "Reading your document",
    detail: "Extracting text from every page of your lease",
  },
  {
    id: "jurisdiction",
    label: "Confirming Ontario jurisdiction",
    detail: "Verifying this is an Ontario residential tenancy agreement",
  },
  {
    id: "segment",
    label: "Finding each clause",
    detail: "Breaking your lease into individual clauses for analysis",
  },
  {
    id: "research",
    label: "Looking up the law",
    detail: "Checking 2,372 RTA sections for relevant rules",
  },
  {
    id: "report",
    label: "Writing your report",
    detail: "Scoring risk, flagging issues, and building your negotiation guide",
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
  const [consentGiven, setConsentGiven] = useState(false);
  const [showNav, setShowNav] = useState(true);

  useEffect(() => {
    function checkWidth() { setShowNav(window.innerWidth >= 640); }
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
          padding: showNav ? "0 48px" : "0 20px",
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
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {showNav && (
            <nav style={{ display: "flex", gap: "28px" }}>
              {[
                { label: "Dashboard", href: "/dashboard" },
                { label: "Ontario RTA", href: "https://www.ontario.ca/laws/statute/06r17", external: true },
                { label: "Privacy", href: "/privacy" },
              ].map(({ label, href, external }) => (
                <a
                  key={label}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  style={{
                    fontSize: "13px",
                    color: "#6b6560",
                    textDecoration: "none",
                    fontWeight: 400,
                    letterSpacing: "0.01em",
                    transition: "color 0.12s ease",
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
          )}
          <AuthButton />
        </div>
      </header>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px 56px",
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

        {/* Example findings preview */}
        <div
          style={{
            width: "100%",
            maxWidth: "560px",
            marginBottom: "36px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#b0aaa4",
              fontWeight: 500,
              marginBottom: "4px",
              textAlign: "left",
              paddingLeft: "2px",
            }}
          >
            Example findings
          </div>
          {[
            {
              level: "critical" as const,
              color: "#b91c1c",
              bg: "#fef2f2",
              border: "#fecaca",
              dot: "#b91c1c",
              text: "Late fee of $100/day — unenforceable under RTA s.134",
              tag: "Rent Payment",
            },
            {
              level: "high" as const,
              color: "#c2410c",
              bg: "#fff7ed",
              border: "#fed7aa",
              dot: "#c2410c",
              text: "24-hour notice requirement waived — void under RTA s.27(1)",
              tag: "Entry Rights",
            },
            {
              level: "low" as const,
              color: "#15803d",
              bg: "#f0fdf4",
              border: "#bbf7d0",
              dot: "#15803d",
              text: "Rent increase procedure follows RTA s.116 — compliant",
              tag: "Rent Increase",
            },
          ].map(({ color, bg, border, dot, text, tag }) => (
            <div
              key={text}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 13px",
                background: "#fff",
                border: "1px solid #e8e4dc",
                borderRadius: "7px",
                boxShadow: "0 1px 3px rgba(24,22,20,0.05)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: dot,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: "12px",
                  color: "#181614",
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.4,
                  textAlign: "left",
                }}
              >
                {text}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 7px",
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: "3px",
                  color: color,
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {tag}
              </span>
            </div>
          ))}
        </div>

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
              padding: "36px 32px",
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
                    margin: "0 0 16px",
                    fontSize: "13px",
                    color: "#6b6560",
                  }}
                >
                  PDF verified · jurisdiction will be confirmed during analysis
                </p>

                {/* PIPEDA consent */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    margin: "0 0 20px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={(e) => setConsentGiven(e.target.checked)}
                    style={{
                      marginTop: "2px",
                      flexShrink: 0,
                      cursor: "pointer",
                      accentColor: "#181614",
                      width: "14px",
                      height: "14px",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#5c5751",
                      lineHeight: 1.55,
                    }}
                  >
                    I understand this PDF may contain personal information
                    (names, addresses, financial details). By uploading, I
                    consent to it being analysed and temporarily stored per
                    the{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#181614",
                        textUnderlineOffset: "2px",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>
                    . Reports are automatically deleted after 90 days.
                  </span>
                </label>

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
                      setConsentGiven(false);
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
                    disabled={uploading || !consentGiven}
                    style={{
                      padding: "10px 28px",
                      borderRadius: "6px",
                      cursor: uploading ? "wait" : !consentGiven ? "not-allowed" : "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      background: uploading ? "#4a4744" : !consentGiven ? "#9a9590" : "#181614",
                      border: `1px solid ${!consentGiven && !uploading ? "#9a9590" : "#181614"}`,
                      color: "#fff",
                      letterSpacing: "0.02em",
                      transition: "background 0.15s, transform 0.12s ease, box-shadow 0.12s ease",
                      opacity: !consentGiven && !uploading ? 0.7 : 1,
                      transform: "translateY(0)",
                      boxShadow: "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!uploading && consentGiven) {
                        e.currentTarget.style.background = "#2d2926";
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(24,22,20,0.20)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!uploading && consentGiven) {
                        e.currentTarget.style.background = "#181614";
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "none";
                      }
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
            marginTop: "48px",
            display: "flex",
            padding: "22px 40px",
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(24,22,20,0.06)",
            flexWrap: "wrap",
            justifyContent: "center",
            width: "100%",
            maxWidth: "560px",
          }}
        >
          {[
            { n: "< 90s", d: "Analysis time" },
            { n: "2,372", d: "RTA sections" },
            { n: "100%", d: "Cited to statute" },
            { n: "Free", d: "No account needed" },
          ].map(({ n, d }, i) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                flex: "1 1 0",
                minWidth: "80px",
                paddingLeft: i > 0 ? "20px" : 0,
                paddingRight: "20px",
                borderLeft: i > 0 ? "1px solid #e8e4dc" : "none",
              }}
            >
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: 600,
                  fontSize: "28px",
                  color: "#181614",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {n}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#9a9590",
                  marginTop: "5px",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontWeight: 500,
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
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <span>
          LeaseGuard provides educational information only and does not
          constitute legal advice. For matters requiring professional legal
          judgment, consult a licensed paralegal or lawyer.
        </span>
        <span>
          <a
            href="/privacy"
            style={{ color: "#b0aaa4", textUnderlineOffset: "2px" }}
          >
            Privacy Policy
          </a>
          {" · "}
          Analysis grounded in the Ontario Residential Tenancies Act, 2006.
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
  if (s === "critical") return "#f87171";
  if (s === "warning") return "#fbbf24";
  if (s === "success") return "#4ade80";
  return "#8c8680";
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

    // Let the user know we switched modes — terminal won't be blank
    setLogLines((prev) => [
      ...prev,
      {
        id: ++lineIdRef.current,
        message: "Live stream unavailable — checking status every 2 seconds…",
        severity: "warning" as const,
        timestamp: Date.now(),
      },
    ]);

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

          {/* Streaming agent log */}
          <div
            style={{
              marginTop: "24px",
              background: "#131110",
              border: "1px solid #2a2623",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            {/* Log header */}
            <div
              style={{
                padding: "9px 14px",
                borderBottom: "1px solid #2a2623",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: currentStep >= PROCESSING_STEPS.length ? "#4ade80" : "#15803d",
                  flexShrink: 0,
                  animation: currentStep < PROCESSING_STEPS.length ? "pulse-dot 1.4s ease-in-out infinite" : "none",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "#4a4744",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  fontFamily: "monospace",
                }}
              >
                Agent Log
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "10px",
                  color: "#3a3532",
                  fontFamily: "monospace",
                }}
              >
                {logLines.length} events
              </span>
            </div>

            {/* Log lines */}
            <div
              ref={logContainerRef}
              style={{
                padding: "10px 14px",
                height: "180px",
                overflowY: "auto",
                fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                fontSize: "11.5px",
                lineHeight: "1.75",
                scrollBehavior: "smooth",
              }}
            >
              {logLines.length === 0 ? (
                <span style={{ color: "#3a3532", fontStyle: "italic" }}>
                  Connecting to analysis pipeline...
                </span>
              ) : (
                logLines.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      display: "flex",
                      gap: "12px",
                      animation: "log-fadein 0.25s ease",
                    }}
                  >
                    <span
                      style={{
                        color: "#3a3532",
                        flexShrink: 0,
                        userSelect: "none",
                      }}
                    >
                      {formatLogTime(line.timestamp)}
                    </span>
                    <span style={{ color: severityColor(line.severity) }}>
                      {line.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Time display */}
          <div
            style={{
              marginTop: "12px",
              padding: "12px 16px",
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
