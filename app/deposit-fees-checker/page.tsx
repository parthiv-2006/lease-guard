"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthButton } from "../components/auth-button";
import { checkFeeLegality, allFeeTypes, type FeeType, type FeeVerdict } from "@/lib/deposit-fees-checker";
import type { DepositInterestResult } from "@/lib/deposit-fees-checker";

const DEMO_LEASE_ID = "ebf8bf97-563d-4b7d-859f-8ecf76905335";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sample Report", href: `/report/${DEMO_LEASE_ID}` },
  { label: "Ontario RTA", href: "/ontario-rta" },
  { label: "Rent Increase Checker", href: "/rent-increase-checker" },
  { label: "Eviction Notice Checker", href: "/eviction-notice-checker" },
  { label: "Deposit & Fees Checker", href: "/deposit-fees-checker" },
  { label: "GitHub", href: "https://github.com/parthiv-2006/lease-guard", external: true },
  { label: "Privacy", href: "/privacy" },
];

function todayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "'Newsreader', serif",
  fontStyle: "italic",
  fontWeight: 600,
  fontSize: 24,
  margin: "0 0 16px",
};

const VERDICT_COLOR: Record<FeeVerdict, string> = {
  legal: "#2f6b3a",
  conditional: "#9c7a1f",
  illegal: "#9c2b23",
};

const VERDICT_LABEL: Record<FeeVerdict, string> = {
  legal: "Legal",
  conditional: "Conditional",
  illegal: "Not permitted",
};

interface DepositFormState {
  depositAmount: string;
  monthlyRent: string;
  depositPaidDate: string;
  asOfDate: string;
}

const INITIAL_DEPOSIT_FORM: DepositFormState = {
  depositAmount: "",
  monthlyRent: "",
  depositPaidDate: "",
  asOfDate: todayIso(),
};

export default function DepositFeesCheckerPage() {
  const [form, setForm] = useState<DepositFormState>(INITIAL_DEPOSIT_FORM);
  const [result, setResult] = useState<DepositInterestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedFees, setCheckedFees] = useState<Set<FeeType>>(new Set());

  function update<K extends keyof DepositFormState>(key: K, value: DepositFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleFee(feeType: FeeType) {
    setCheckedFees((prev) => {
      const next = new Set(prev);
      if (next.has(feeType)) {
        next.delete(feeType);
      } else {
        next.add(feeType);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const depositAmount = Number(form.depositAmount);
    const monthlyRent = Number(form.monthlyRent);

    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      setError("Enter a valid deposit amount.");
      return;
    }
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      setError("Enter a valid monthly rent amount.");
      return;
    }
    if (!form.depositPaidDate || !form.asOfDate) {
      setError("Fill in both dates.");
      return;
    }
    if (new Date(form.asOfDate).getTime() < new Date(form.depositPaidDate).getTime()) {
      setError("The 'as of' date must be on or after the date the deposit was paid.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/deposit-fees-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositAmount,
          monthlyRent,
          depositPaidDate: form.depositPaidDate,
          asOfDate: form.asOfDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Please check your inputs and try again.");
        return;
      }
      setResult(data as DepositInterestResult);
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
              const isActive = href === "/deposit-fees-checker";
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
            Are your deposit and fees legal?
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            Landlords owe annual interest on your last month&rsquo;s rent deposit, and most other
            deposits and fees aren&rsquo;t permitted at all. Calculate what you&rsquo;re owed and
            check any charge against the RTA — instantly, with no upload and no account required.
          </p>
        </div>

        {/* Deposit interest calculator */}
        <h2 style={sectionHeadingStyle}>Deposit interest calculator</h2>
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
              <label style={labelStyle} htmlFor="depositAmount">Deposit amount paid ($)</label>
              <input
                id="depositAmount"
                type="number"
                min="0"
                step="0.01"
                style={inputStyle}
                value={form.depositAmount}
                onChange={(e) => update("depositAmount", e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="monthlyRent">Current monthly rent ($)</label>
              <input
                id="monthlyRent"
                type="number"
                min="0"
                step="0.01"
                style={inputStyle}
                value={form.monthlyRent}
                onChange={(e) => update("monthlyRent", e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginBottom: 24 }}>
            <div>
              <label style={labelStyle} htmlFor="depositPaidDate">Date the deposit was paid</label>
              <input
                id="depositPaidDate"
                type="date"
                style={inputStyle}
                value={form.depositPaidDate}
                onChange={(e) => update("depositPaidDate", e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="asOfDate">Calculate interest as of</label>
              <input
                id="asOfDate"
                type="date"
                style={inputStyle}
                value={form.asOfDate}
                onChange={(e) => update("asOfDate", e.target.value)}
                required
              />
            </div>
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
            {loading ? "Calculating…" : "Calculate interest owed"}
          </button>
        </form>

        {result && (
          <div style={{ marginBottom: 56 }} data-testid="deposit-interest-result">
            <div
              style={{
                padding: "20px 24px",
                marginBottom: 24,
                border: "1px solid #17140f",
                borderLeft: `4px solid ${result.totalInterestOwed > 0 ? "#9c7a1f" : "#2f6b3a"}`,
                background: result.totalInterestOwed > 0 ? "#fbf5e6" : "#f2f7f2",
              }}
            >
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: result.totalInterestOwed > 0 ? "#9c7a1f" : "#2f6b3a",
                  marginBottom: 8,
                }}
              >
                Interest owed: ${result.totalInterestOwed.toFixed(2)}
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                {result.totalInterestOwed > 0
                  ? "If your landlord hasn't already paid this, RTA s.106(9) lets you deduct it from a future rent payment."
                  : "No interest has accrued yet for the period entered."}
              </p>
              {result.depositExceedsCap && (
                <p style={{ margin: "10px 0 0", fontSize: 14, color: "#9c2b23" }}>
                  Your deposit of more than ${result.capAmount.toFixed(2)} exceeds the legal cap — a rent deposit cannot
                  exceed one month&rsquo;s rent (RTA s.106(2)).
                </p>
              )}
            </div>

            {result.byYear.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {result.byYear.map((y) => (
                  <div
                    key={y.year}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 100px",
                      gap: 20,
                      padding: "14px 0",
                      borderTop: "1px solid #e0d9c6",
                      fontSize: 14,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6f6857" }}>{y.year}</div>
                    <div style={{ color: "#4a4438" }}>
                      {y.guidelinePercent}% guideline rate · {y.daysInYear} days held
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 600 }}>${y.interestOwed.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}

            <p style={{ marginTop: 24, fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>{result.disclaimer}</p>
          </div>
        )}

        {/* Fee legality checklist */}
        <h2 style={sectionHeadingStyle}>Illegal fees checklist</h2>
        <p style={{ fontSize: 15, color: "#4a4438", lineHeight: 1.7, margin: "0 0 20px" }}>
          Check any fee or deposit your landlord has asked for, beyond rent and the last month&rsquo;s
          rent deposit, to see whether the RTA permits it.
        </p>
        <div style={{ border: "1px solid #17140f", background: "#fff" }}>
          {allFeeTypes().map((feeType) => {
            const feeResult = checkFeeLegality(feeType);
            const isChecked = checkedFees.has(feeType);
            return (
              <div key={feeType} style={{ borderTop: "1px solid #e0d9c6" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    padding: "18px 24px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleFee(feeType)}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{feeResult.label}</div>
                    {isChecked && (
                      <>
                        <p style={{ margin: "8px 0", fontSize: 14, color: "#4a4438", lineHeight: 1.6 }}>
                          {feeResult.detail}
                        </p>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6f6857" }}>
                          {feeResult.citation}
                        </div>
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      display: "inline-block",
                      alignSelf: "flex-start",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12,
                      fontWeight: 600,
                      color: VERDICT_COLOR[feeResult.verdict],
                      border: `1px solid ${VERDICT_COLOR[feeResult.verdict]}`,
                      padding: "3px 8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {VERDICT_LABEL[feeResult.verdict]}
                  </div>
                </label>
              </div>
            );
          })}
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>
          LeaseGuard provides educational information only and does not constitute legal advice.
          For matters requiring professional legal judgment, consult a licensed paralegal, lawyer,
          or the Landlord and Tenant Board.
        </p>
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
