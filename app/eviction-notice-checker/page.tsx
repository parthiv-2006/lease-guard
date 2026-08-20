"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthButton } from "../components/auth-button";
import type {
  EvictionCheckResult,
  CheckStatus,
  NoticeType,
  TenancyType,
  N5Ground,
  N13Ground,
  N12ServedBy,
} from "@/lib/eviction-notice-checker";

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

const NOTICE_TYPE_OPTIONS: { value: NoticeType; label: string; description: string }[] = [
  { value: "N4", label: "N4 — Non-payment of rent", description: "Tenant fell behind on rent." },
  {
    value: "N5",
    label: "N5 — Damage, interference, or overcrowding",
    description: "Behaviour-based notice with a possible right to correct the issue.",
  },
  {
    value: "N8",
    label: "N8 — Persistent late payment or other end-of-term ground",
    description: "Notice given at the end of a period or term.",
  },
  {
    value: "N12",
    label: "N12 — Landlord or purchaser wants the unit",
    description: "Landlord, a family member, or a purchaser will move in.",
  },
  {
    value: "N13",
    label: "N13 — Demolition, conversion, or major repairs",
    description: "Landlord needs to demolish, convert, or extensively repair the unit.",
  },
];

const N5_GROUND_OPTIONS: { value: N5Ground; label: string }[] = [
  { value: "interference", label: "Interference with reasonable enjoyment" },
  { value: "damage_ordinary", label: "Undue damage (ordinary)" },
  { value: "damage_wilful_severe", label: "Wilful or severe damage" },
  { value: "overcrowding", label: "Overcrowding" },
];

const N13_GROUND_OPTIONS: { value: N13Ground; label: string }[] = [
  { value: "demolition", label: "Demolition" },
  { value: "conversion", label: "Conversion to non-residential use" },
  { value: "repairs", label: "Repairs or renovations requiring vacant possession" },
];

interface FormState {
  noticeType: NoticeType;
  noticeGivenDate: string;
  terminationDate: string;
  tenancyType: TenancyType;
  ground: N5Ground;
  n13Ground: N13Ground;
  servedBy: N12ServedBy;
  landlordIsIndividual: boolean;
  unitIndividuallyOwned: boolean;
  compensationOffered: boolean;
  buildingUnitCount: string;
}

const INITIAL_FORM: FormState = {
  noticeType: "N4",
  noticeGivenDate: todayIso(),
  terminationDate: "",
  tenancyType: "other",
  ground: "interference",
  n13Ground: "demolition",
  servedBy: "landlord",
  landlordIsIndividual: true,
  unitIndividuallyOwned: true,
  compensationOffered: false,
  buildingUnitCount: "",
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "#2f6b3a",
  fail: "#9c2b23",
  not_applicable: "#6f6857",
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  not_applicable: "Info",
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

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 14,
  color: "#4a4438",
  cursor: "pointer",
};

export default function EvictionNoticeCheckerPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<EvictionCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!form.noticeGivenDate || !form.terminationDate) {
      setError("Fill in both dates.");
      return;
    }
    if (new Date(form.terminationDate).getTime() <= new Date(form.noticeGivenDate).getTime()) {
      setError("The termination date must be after the date the notice was given.");
      return;
    }

    let payload: Record<string, unknown> = {
      noticeType: form.noticeType,
      noticeGivenDate: form.noticeGivenDate,
      terminationDate: form.terminationDate,
    };

    if (form.noticeType === "N4" || form.noticeType === "N8") {
      payload = { ...payload, tenancyType: form.tenancyType };
    } else if (form.noticeType === "N5") {
      payload = { ...payload, ground: form.ground };
    } else if (form.noticeType === "N12") {
      payload = {
        ...payload,
        servedBy: form.servedBy,
        landlordIsIndividual: form.landlordIsIndividual,
        unitIndividuallyOwned: form.unitIndividuallyOwned,
        compensationOffered: form.compensationOffered,
      };
    } else if (form.noticeType === "N13") {
      const buildingUnitCount = Number(form.buildingUnitCount);
      if (!Number.isFinite(buildingUnitCount) || buildingUnitCount < 1) {
        setError("Enter how many units are in the building.");
        return;
      }
      payload = {
        ...payload,
        ground: form.n13Ground,
        buildingUnitCount,
        compensationOffered: form.compensationOffered,
      };
    }

    setLoading(true);
    try {
      const res = await fetch("/api/eviction-notice-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Please check your inputs and try again.");
        return;
      }
      setResult(data as EvictionCheckResult);
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
              const isActive = href === "/eviction-notice-checker";
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
            Is your eviction notice valid?
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            Enter the details from your N4, N5, N8, N12, or N13 notice. LeaseGuard checks the notice
            period, compensation, and eligibility rules the RTA requires for that notice type —
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
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="noticeType">Notice type</label>
            <select
              id="noticeType"
              style={{ ...inputStyle, cursor: "pointer" }}
              value={form.noticeType}
              onChange={(e) => update("noticeType", e.target.value as NoticeType)}
            >
              {NOTICE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6f6857" }}>
              {NOTICE_TYPE_OPTIONS.find((o) => o.value === form.noticeType)?.description}
            </p>
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
              <label style={labelStyle} htmlFor="terminationDate">Termination date on the notice</label>
              <input
                id="terminationDate"
                type="date"
                style={inputStyle}
                value={form.terminationDate}
                onChange={(e) => update("terminationDate", e.target.value)}
                required
              />
            </div>
          </div>

          {(form.noticeType === "N4" || form.noticeType === "N8") && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle} htmlFor="tenancyType">Tenancy type</label>
              <select
                id="tenancyType"
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.tenancyType}
                onChange={(e) => update("tenancyType", e.target.value as TenancyType)}
              >
                <option value="other">Monthly, yearly, or fixed-term</option>
                <option value="daily_weekly">Daily or weekly</option>
              </select>
            </div>
          )}

          {form.noticeType === "N5" && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle} htmlFor="ground">Ground stated on the notice</label>
              <select
                id="ground"
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.ground}
                onChange={(e) => update("ground", e.target.value as N5Ground)}
              >
                {N5_GROUND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.noticeType === "N12" && (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle} htmlFor="servedBy">Notice given on behalf of</label>
                <select
                  id="servedBy"
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={form.servedBy}
                  onChange={(e) => update("servedBy", e.target.value as N12ServedBy)}
                >
                  <option value="landlord">The landlord (or their family member/caregiver)</option>
                  <option value="purchaser">A purchaser of the property</option>
                </select>
              </div>
              {form.servedBy === "landlord" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={form.landlordIsIndividual}
                      onChange={(e) => update("landlordIsIndividual", e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    The landlord is an individual person, not a corporation
                  </label>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={form.unitIndividuallyOwned}
                      onChange={(e) => update("unitIndividuallyOwned", e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    The rental unit is owned in whole or part by an individual
                  </label>
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={form.compensationOffered}
                    onChange={(e) => update("compensationOffered", e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  The landlord has paid one month&rsquo;s rent, or offered another acceptable unit, by the termination date
                </label>
              </div>
            </>
          )}

          {form.noticeType === "N13" && (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle} htmlFor="n13Ground">Reason stated on the notice</label>
                <select
                  id="n13Ground"
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={form.n13Ground}
                  onChange={(e) => update("n13Ground", e.target.value as N13Ground)}
                >
                  {N13_GROUND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle} htmlFor="buildingUnitCount">Number of units in the building</label>
                <input
                  id="buildingUnitCount"
                  type="number"
                  min="1"
                  step="1"
                  style={inputStyle}
                  value={form.buildingUnitCount}
                  onChange={(e) => update("buildingUnitCount", e.target.value)}
                  required
                />
              </div>
              {form.n13Ground !== "repairs" && (
                <div style={{ marginBottom: 20 }}>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={form.compensationOffered}
                      onChange={(e) => update("compensationOffered", e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    The landlord has paid the required compensation, or offered another acceptable unit, by the termination date
                  </label>
                </div>
              )}
            </>
          )}

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
            {loading ? "Checking…" : "Check this notice"}
          </button>
        </form>

        {/* Results */}
        {result && (
          <div style={{ marginBottom: 40 }} data-testid="eviction-notice-result">
            <div
              style={{
                padding: "20px 24px",
                marginBottom: 24,
                border: "1px solid #17140f",
                borderLeft: `4px solid ${result.verdict === "appears_valid" ? "#2f6b3a" : "#9c2b23"}`,
                background: result.verdict === "appears_valid" ? "#f2f7f2" : "#fdf1ef",
              }}
            >
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: result.verdict === "appears_valid" ? "#2f6b3a" : "#9c2b23",
                  marginBottom: 8,
                }}
              >
                {result.verdict === "appears_valid" ? "Appears valid" : "Not valid"}
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{result.summary}</p>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#4a4438" }}>
                Notice given: {result.actualNoticeDays} days before termination · Minimum required: {result.requiredNoticeDays} days
              </p>
            </div>

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
