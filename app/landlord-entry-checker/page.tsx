"use client";

import { useCallback, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { LetterBuilder } from "../components/letter-builder";
import {
  allEntryReasons,
  entryReasonRule,
  type EntryCheckResult,
  type EntryCheckStatus,
  type EntryReason,
  toEntryDateTime,
} from "@/lib/landlord-entry-checker";
import type { LetterParties } from "@/lib/tenant-letters/core";
import { buildEntryObjectionLetter } from "@/lib/tenant-letters/entry-objection";

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

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 15,
  marginBottom: 14,
  cursor: "pointer",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "'Newsreader', serif",
  fontStyle: "italic",
  fontWeight: 600,
  fontSize: 24,
  margin: "0 0 16px",
};

const STATUS_COLOR: Record<EntryCheckStatus, string> = {
  pass: "#2f6b3a",
  fail: "#9c2b23",
  not_applicable: "#6f6857",
};

const STATUS_LABEL: Record<EntryCheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  not_applicable: "Info",
};

interface EntryFormState {
  reason: EntryReason;
  entryDate: string;
  entryTime: string;
  gotWrittenNotice: boolean;
  noticeDate: string;
  noticeTime: string;
  noticeStatedReason: boolean;
  noticeStatedTime: boolean;
  leaseRequiresCleaning: boolean;
  atLeaseSpecifiedCleaningTime: boolean;
  tenancyEnding: boolean;
  tenantInformedBeforehand: boolean;
}

const INITIAL_FORM: EntryFormState = {
  reason: "repairs_or_work",
  entryDate: todayIso(),
  entryTime: "",
  gotWrittenNotice: false,
  noticeDate: "",
  noticeTime: "",
  noticeStatedReason: false,
  noticeStatedTime: false,
  leaseRequiresCleaning: false,
  atLeaseSpecifiedCleaningTime: false,
  tenancyEnding: false,
  tenantInformedBeforehand: false,
};

export default function LandlordEntryCheckerPage() {
  const [form, setForm] = useState<EntryFormState>(INITIAL_FORM);
  const [result, setResult] = useState<EntryCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Entry time as it was when the result was produced.
  const [submittedEntryAt, setSubmittedEntryAt] = useState<Date | null>(null);

  const buildLetter = useCallback(
    (parties: LetterParties, letterDate: Date) =>
      result && submittedEntryAt ? buildEntryObjectionLetter(result, { entryAt: submittedEntryAt }, parties, letterDate) : null,
    [result, submittedEntryAt]
  );

  const basis = entryReasonRule(form.reason).basis;

  function update<K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!form.entryDate || !form.entryTime) {
      setError("Enter the date and time your landlord entered.");
      return;
    }
    const needsNotice = basis === "written_notice";
    if (needsNotice && form.gotWrittenNotice && (!form.noticeDate || !form.noticeTime)) {
      setError("Enter the date and time you received the written notice.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/landlord-entry-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: form.reason,
          entryDate: form.entryDate,
          entryTime: form.entryTime,
          writtenNotice:
            needsNotice && form.gotWrittenNotice
              ? {
                  date: form.noticeDate,
                  time: form.noticeTime,
                  statedReason: form.noticeStatedReason,
                  statedTime: form.noticeStatedTime,
                }
              : null,
          leaseRequiresCleaning: form.leaseRequiresCleaning,
          atLeaseSpecifiedCleaningTime: form.atLeaseSpecifiedCleaningTime,
          tenancyEnding: form.tenancyEnding,
          tenantInformedBeforehand: form.tenantInformedBeforehand,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Please check your inputs and try again.");
        return;
      }
      setResult(data as EntryCheckResult);
      setSubmittedEntryAt(toEntryDateTime(form.entryDate, form.entryTime));
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
      <SiteHeader currentPath="/landlord-entry-checker" />

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
            Was your landlord allowed to come in?
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            Your landlord can only enter your unit for the reasons the RTA lists, and most of them
            need 24 hours&rsquo; written notice. Tell us why and when they came in to check whether
            the entry followed the rules.
          </p>
        </div>

        <h2 style={sectionHeadingStyle}>Check an entry</h2>
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
            <label style={labelStyle} htmlFor="entryReason">Why did they come in?</label>
            <select
              id="entryReason"
              style={inputStyle}
              value={form.reason}
              onChange={(e) => update("reason", e.target.value as EntryReason)}
            >
              {allEntryReasons().map((reason) => (
                <option key={reason} value={reason}>
                  {entryReasonRule(reason).label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 20, marginBottom: 20 }}>
            <div>
              <label style={labelStyle} htmlFor="entryDate">Date they entered</label>
              <input id="entryDate" type="date" style={inputStyle} value={form.entryDate} onChange={(e) => update("entryDate", e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle} htmlFor="entryTime">Time they entered</label>
              <input id="entryTime" type="time" style={inputStyle} value={form.entryTime} onChange={(e) => update("entryTime", e.target.value)} required />
            </div>
          </div>

          {basis === "written_notice" && (
            <div style={{ marginBottom: 8 }}>
              <label style={checkboxLabelStyle}>
                <input id="gotWrittenNotice" type="checkbox" checked={form.gotWrittenNotice} onChange={(e) => update("gotWrittenNotice", e.target.checked)} />
                I got written notice before they came in
              </label>
              {form.gotWrittenNotice && (
                <div style={{ paddingLeft: 26 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 20, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle} htmlFor="noticeDate">Date I got the notice</label>
                      <input id="noticeDate" type="date" style={inputStyle} value={form.noticeDate} onChange={(e) => update("noticeDate", e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor="noticeTime">Time I got the notice</label>
                      <input id="noticeTime" type="time" style={inputStyle} value={form.noticeTime} onChange={(e) => update("noticeTime", e.target.value)} />
                    </div>
                  </div>
                  <label style={checkboxLabelStyle}>
                    <input id="noticeStatedReason" type="checkbox" checked={form.noticeStatedReason} onChange={(e) => update("noticeStatedReason", e.target.checked)} />
                    The notice said why they were coming in
                  </label>
                  <label style={checkboxLabelStyle}>
                    <input id="noticeStatedTime" type="checkbox" checked={form.noticeStatedTime} onChange={(e) => update("noticeStatedTime", e.target.checked)} />
                    The notice gave the day and a time
                  </label>
                </div>
              )}
            </div>
          )}

          {form.reason === "regular_cleaning" && (
            <>
              <label style={checkboxLabelStyle}>
                <input id="leaseRequiresCleaning" type="checkbox" checked={form.leaseRequiresCleaning} onChange={(e) => update("leaseRequiresCleaning", e.target.checked)} />
                My lease says the landlord cleans the unit regularly
              </label>
              {form.leaseRequiresCleaning && (
                <label style={{ ...checkboxLabelStyle, paddingLeft: 26 }}>
                  <input
                    id="atLeaseSpecifiedCleaningTime"
                    type="checkbox"
                    checked={form.atLeaseSpecifiedCleaningTime}
                    onChange={(e) => update("atLeaseSpecifiedCleaningTime", e.target.checked)}
                  />
                  They came at a cleaning time my lease sets out
                </label>
              )}
            </>
          )}

          {form.reason === "showing_to_prospective_tenant" && (
            <>
              <label style={checkboxLabelStyle}>
                <input id="tenancyEnding" type="checkbox" checked={form.tenancyEnding} onChange={(e) => update("tenancyEnding", e.target.checked)} />
                My tenancy is ending (we agreed, or one of us gave notice)
              </label>
              <label style={checkboxLabelStyle}>
                <input id="tenantInformedBeforehand" type="checkbox" checked={form.tenantInformedBeforehand} onChange={(e) => update("tenantInformedBeforehand", e.target.checked)} />
                They told me, or tried to, before coming in
              </label>
            </>
          )}

          {error && (
            <div style={{ margin: "8px 0 20px", padding: "12px 16px", background: "#fdf1ef", border: "1px solid #9c2b23", color: "#9c2b23", fontSize: 14 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
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
            {loading ? "Checking…" : "Check this entry"}
          </button>
        </form>

        {result && (
          <div style={{ marginBottom: 56 }} data-testid="entry-check-result">
            <div
              style={{
                padding: "20px 24px",
                marginBottom: 24,
                border: "1px solid #17140f",
                borderLeft: `4px solid ${result.verdict === "appears_permitted" ? "#2f6b3a" : "#9c2b23"}`,
                background: result.verdict === "appears_permitted" ? "#f2f7f2" : "#fdf1ef",
              }}
            >
              <div
                data-testid="entry-check-verdict"
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: result.verdict === "appears_permitted" ? "#2f6b3a" : "#9c2b23",
                  marginBottom: 8,
                }}
              >
                {result.verdict === "appears_permitted" ? "Entry appears permitted" : "Entry may not have been permitted"}
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{result.summary}</p>
            </div>

            <div data-testid="entry-checks" style={{ border: "1px solid #17140f", background: "#fff", marginBottom: 28 }}>
              {result.checks.map((check) => (
                <div key={check.id} style={{ display: "flex", gap: 16, padding: "16px 20px", borderTop: "1px solid #e0d9c6", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 300px" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{check.label}</div>
                    <p style={{ margin: "0 0 6px", fontSize: 14, color: "#4a4438", lineHeight: 1.6 }}>{check.detail}</p>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6f6857" }}>{check.citation}</div>
                  </div>
                  <div
                    style={{
                      alignSelf: "flex-start",
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
              ))}
            </div>

            <h3 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 20, margin: "0 0 10px" }}>
              What to do next
            </h3>
            <ol data-testid="entry-next-steps" style={{ margin: 0, paddingLeft: 22, fontSize: 15, color: "#4a4438", lineHeight: 1.7 }}>
              {result.nextSteps.map((step) => (
                <li key={step} style={{ marginBottom: 8 }}>{step}</li>
              ))}
            </ol>

            <p style={{ marginTop: 24, fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>{result.disclaimer}</p>

            <LetterBuilder
              build={buildLetter}
              intro="Let your landlord know in writing that this entry didn't follow the Act, and ask that future entries do. A dated letter is strong evidence if it happens again."
            />
          </div>
        )}

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
