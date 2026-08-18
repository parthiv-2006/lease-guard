"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthButton } from "../components/auth-button";
import type { RentIncreaseCheckResult, CheckStatus } from "@/lib/rent-increase-checker";

const DEMO_LEASE_ID = "ebf8bf97-563d-4b7d-859f-8ecf76905335";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sample Report", href: `/report/${DEMO_LEASE_ID}` },
  { label: "Ontario RTA", href: "/ontario-rta" },
  { label: "Rent Increase Checker", href: "/rent-increase-checker" },
  { label: "GitHub", href: "https://github.com/parthiv-2006/lease-guard", external: true },
  { label: "Privacy", href: "/privacy" },
];

function todayIso(): string {
  // Use local date components, not toISOString() (UTC) — for users west of
  // UTC (all of Canada), the UTC date rolls over to tomorrow several hours
  // before local midnight, defaulting this field to the wrong day for a
  // large chunk of the evening.
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface FormState {
  currentRent: string;
  proposedRent: string;
  noticeGivenDate: string;
  effectiveDate: string;
  lastIncreaseDate: string;
  isNewBuildingExempt: boolean;
  hasAgiApproval: boolean;
}

const INITIAL_FORM: FormState = {
  currentRent: "",
  proposedRent: "",
  noticeGivenDate: todayIso(),
  effectiveDate: "",
  lastIncreaseDate: "",
  isNewBuildingExempt: false,
  hasAgiApproval: false,
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "#2f6b3a",
  fail: "#9c2b23",
  not_applicable: "#6f6857",
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  not_applicable: "N/A",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "'Public Sans', sans-serif",
  fontSize: 15,
  padding: "10px 12px",
  border: "1px solid #cfc7b3",
  background: "#fff",
  color: "#17140f",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6f6857",
  marginBottom: 6,
};

export default function RentIncreaseCheckerPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<RentIncreaseCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const currentRent = Number(form.currentRent);
    const proposedRent = Number(form.proposedRent);

    if (!Number.isFinite(currentRent) || currentRent <= 0) {
      setError("Enter a valid current rent amount.");
      return;
    }
    if (!Number.isFinite(proposedRent) || proposedRent <= 0) {
      setError("Enter a valid proposed rent amount.");
      return;
    }
    if (!form.noticeGivenDate || !form.effectiveDate || !form.lastIncreaseDate) {
      setError("Fill in all three dates.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/rent-increase-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentRent,
          proposedRent,
          noticeGivenDate: form.noticeGivenDate,
          effectiveDate: form.effectiveDate,
          lastIncreaseDate: form.lastIncreaseDate,
          isNewBuildingExempt: form.isNewBuildingExempt,
          hasAgiApproval: form.hasAgiApproval,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Please check your inputs and try again.");
        return;
      }
      setResult(data as RentIncreaseCheckResult);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f4ee",
        color: "#17140f",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Public Sans', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "0 clamp(20px,4vw,56px)",
          height: 66,
          borderBottom: "1px solid #17140f",
          background: "rgba(247,244,238,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: "-0.01em",
            color: "#17140f",
            textDecoration: "none",
          }}
        >
          LeaseGuard
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <nav style={{ display: "flex", gap: "clamp(14px,2.4vw,28px)", alignItems: "center" }}>
            {navLinks.map(({ label, href, external }) => {
              const isActive = href === "/rent-increase-checker";
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
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </a>
              );
            })}
          </nav>
          <AuthButton />
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 820, width: "100%", margin: "0 auto", padding: "clamp(40px,6vw,64px) clamp(20px,4vw,24px) 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#6f6857",
              marginBottom: 20,
            }}
          >
            Tool · Residential Tenancies Act, 2006
          </div>
          <h1
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "clamp(34px,5vw,52px)",
              lineHeight: 1.05,
              margin: "0 0 20px",
              letterSpacing: "-0.02em",
            }}
          >
            Is your rent increase legal?
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            Enter the numbers and dates from your rent increase notice. LeaseGuard checks them
            against the RTA&rsquo;s 90-day notice rule, 12-month rule, and annual guideline cap —
            instantly, with no upload and no account required.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            border: "1px solid #17140f",
            background: "#fff",
            padding: "clamp(24px,4vw,36px)",
            marginBottom: 40,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginBottom: 20 }}>
            <div>
              <label style={labelStyle} htmlFor="currentRent">Current monthly rent ($)</label>
              <input
                id="currentRent"
                type="number"
                min="0"
                step="0.01"
                style={inputStyle}
                value={form.currentRent}
                onChange={(e) => update("currentRent", e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="proposedRent">Proposed new rent ($)</label>
              <input
                id="proposedRent"
                type="number"
                min="0"
                step="0.01"
                style={inputStyle}
                value={form.proposedRent}
                onChange={(e) => update("proposedRent", e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginBottom: 20 }}>
            <div>
              <label style={labelStyle} htmlFor="noticeGivenDate">Date notice was given</label>
              <input
                id="noticeGivenDate"
                type="date"
                style={inputStyle}
                value={form.noticeGivenDate}
                onChange={(e) => update("noticeGivenDate", e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="effectiveDate">Effective date of new rent</label>
              <input
                id="effectiveDate"
                type="date"
                style={inputStyle}
                value={form.effectiveDate}
                onChange={(e) => update("effectiveDate", e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="lastIncreaseDate">Date of last increase (or move-in date)</label>
              <input
                id="lastIncreaseDate"
                type="date"
                style={inputStyle}
                value={form.lastIncreaseDate}
                onChange={(e) => update("lastIncreaseDate", e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "#4a4438", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.isNewBuildingExempt}
                onChange={(e) => update("isNewBuildingExempt", e.target.checked)}
                style={{ marginTop: 3 }}
              />
              This unit was first occupied for residential purposes after November 15, 2018 (new-construction exemption)
            </label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "#4a4438", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.hasAgiApproval}
                onChange={(e) => update("hasAgiApproval", e.target.checked)}
                style={{ marginTop: 3 }}
              />
              The landlord has a signed above-guideline agreement (s.121) or an LTB order (s.126)
            </label>
          </div>

          {error && (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "#fdf1ef", border: "1px solid #9c2b23", color: "#9c2b23", fontSize: 14 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px 32px",
              border: "1px solid #17140f",
              background: loading ? "#4a4438" : "#151209",
              color: "#f4efe4",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            {loading ? "Checking…" : "Check compliance"}
          </button>
        </form>

        {/* Results */}
        {result && (
          <div style={{ marginBottom: 40 }} data-testid="rent-increase-result">
            <div
              style={{
                padding: "20px 24px",
                marginBottom: 24,
                border: "1px solid #17140f",
                borderLeft: `4px solid ${result.verdict === "compliant" ? "#2f6b3a" : "#9c2b23"}`,
                background: result.verdict === "compliant" ? "#f2f7f2" : "#fdf1ef",
              }}
            >
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: result.verdict === "compliant" ? "#2f6b3a" : "#9c2b23",
                  marginBottom: 8,
                }}
              >
                {result.verdict === "compliant" ? "Appears compliant" : "Not compliant"}
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{result.summary}</p>
              {result.checks.length > 0 && (
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "#4a4438" }}>
                  Requested increase: {result.percentRequested.toFixed(2)}% · {result.guidelineYear} guideline:{" "}
                  {result.guidelinePercent}%
                  {result.guidelineIsEstimate && " (estimated — not yet officially published)"}
                </p>
              )}
            </div>

            {result.checks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {result.checks.map((check) => (
                  <div
                    key={check.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr",
                      gap: 20,
                      padding: "20px 0",
                      borderTop: "1px solid #e0d9c6",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "inline-block",
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 12,
                          fontWeight: 600,
                          color: STATUS_COLOR[check.status],
                          border: `1px solid ${STATUS_COLOR[check.status]}`,
                          padding: "3px 8px",
                        }}
                      >
                        {STATUS_LABEL[check.status]}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{check.label}</div>
                      <p style={{ margin: "0 0 8px", fontSize: 14, color: "#4a4438", lineHeight: 1.6 }}>{check.detail}</p>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6f6857" }}>
                        {check.citation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p style={{ marginTop: 24, fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>{result.disclaimer}</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "26px clamp(20px,4vw,56px)",
          borderTop: "1px solid #17140f",
          fontSize: 13,
          color: "#6f6857",
          textAlign: "center",
          lineHeight: 1.6,
          flexShrink: 0,
        }}
      >
        LeaseGuard provides educational information only and does not constitute legal advice.
        For matters requiring professional legal judgment, consult a licensed paralegal or
        lawyer. Analysis is grounded in the Ontario Residential Tenancies Act, 2006.
      </footer>
    </div>
  );
}
