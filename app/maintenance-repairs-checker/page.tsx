"use client";

import { useState } from "react";
import { SiteHeader } from "../components/site-header";
import {
  allRepairIssueTypes,
  repairIssueRule,
  type RepairIssueType,
  type RepairStatus,
  type RepairCheckResult,
} from "@/lib/maintenance-repairs-checker";

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

const STATUS_COLOR: Record<RepairStatus, string> = {
  not_yet_reported: "#6f6857",
  within_follow_up_window: "#2f6b3a",
  follow_up_overdue: "#9c2b23",
};

const STATUS_BG: Record<RepairStatus, string> = {
  not_yet_reported: "#f7f4ee",
  within_follow_up_window: "#f2f7f2",
  follow_up_overdue: "#fdf1ef",
};

const STATUS_LABEL: Record<RepairStatus, string> = {
  not_yet_reported: "Not yet reported",
  within_follow_up_window: "Give your landlord time to respond",
  follow_up_overdue: "Time to escalate",
};

interface RepairFormState {
  issueType: RepairIssueType;
  alreadyReported: boolean;
  reportedDate: string;
  reportedInWriting: boolean;
  asOfDate: string;
  measuredTempC: string;
}

const INITIAL_FORM: RepairFormState = {
  issueType: "no_heat",
  alreadyReported: false,
  reportedDate: "",
  reportedInWriting: false,
  asOfDate: todayIso(),
  measuredTempC: "",
};

function statusSummary(result: RepairCheckResult): string {
  if (result.status === "not_yet_reported") {
    return "Your landlord's obligation applies once they know about the problem, so the first step is to report it in writing.";
  }
  const days = result.daysSinceReported ?? 0;
  const dayWord = days === 1 ? "day" : "days";
  if (result.status === "follow_up_overdue") {
    return `You reported this ${days} ${dayWord} ago. For a${result.urgency === "urgent" ? "n urgent" : ""} problem like this, that is long enough to escalate if it hasn't been fixed.`;
  }
  return `You reported this ${days} ${dayWord} ago. Give your landlord a reasonable chance to arrange the repair, and keep records while you wait.`;
}

export default function MaintenanceRepairsCheckerPage() {
  const [form, setForm] = useState<RepairFormState>(INITIAL_FORM);
  const [result, setResult] = useState<RepairCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof RepairFormState>(key: K, value: RepairFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!form.asOfDate) {
      setError("Enter the date to check as of.");
      return;
    }
    if (form.alreadyReported) {
      if (!form.reportedDate) {
        setError("Enter the date you first told your landlord.");
        return;
      }
      if (new Date(form.reportedDate).getTime() > new Date(form.asOfDate).getTime()) {
        setError("The date you reported the problem can't be after the 'check as of' date.");
        return;
      }
    }

    let measuredTempC: number | null = null;
    if (form.issueType === "no_heat" && form.measuredTempC.trim() !== "") {
      measuredTempC = Number(form.measuredTempC);
      if (!Number.isFinite(measuredTempC) || measuredTempC < -50 || measuredTempC > 60) {
        setError("Enter a temperature between -50 and 60 °C, or leave it blank.");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/maintenance-repairs-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueType: form.issueType,
          reportedDate: form.alreadyReported ? form.reportedDate : null,
          reportedInWriting: form.alreadyReported && form.reportedInWriting,
          asOfDate: form.asOfDate,
          measuredTempC,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Please check your inputs and try again.");
        return;
      }
      setResult(data as RepairCheckResult);
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
      <SiteHeader currentPath="/maintenance-repairs-checker" />

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
            Is your landlord keeping up with repairs?
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            Your landlord must keep your unit in a good state of repair, even if the problem was
            there when you moved in. Pick the problem you&rsquo;re dealing with to see what the RTA
            and Ontario&rsquo;s maintenance standards require, and what to do next.
          </p>
        </div>

        <h2 style={sectionHeadingStyle}>Check a repair problem</h2>
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
            <label style={labelStyle} htmlFor="issueType">What&rsquo;s the problem?</label>
            <select
              id="issueType"
              style={inputStyle}
              value={form.issueType}
              onChange={(e) => update("issueType", e.target.value as RepairIssueType)}
            >
              {allRepairIssueTypes().map((issueType) => (
                <option key={issueType} value={issueType}>
                  {repairIssueRule(issueType).label}
                </option>
              ))}
            </select>
          </div>

          {form.issueType === "no_heat" && (
            <div style={{ marginBottom: 20, maxWidth: 260 }}>
              <label style={labelStyle} htmlFor="measuredTempC">Indoor temperature (°C, optional)</label>
              <input
                id="measuredTempC"
                type="number"
                step="0.5"
                style={inputStyle}
                value={form.measuredTempC}
                onChange={(e) => update("measuredTempC", e.target.value)}
              />
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, marginBottom: 20, cursor: "pointer" }}>
            <input
              id="alreadyReported"
              type="checkbox"
              checked={form.alreadyReported}
              onChange={(e) => update("alreadyReported", e.target.checked)}
            />
            I&rsquo;ve already told my landlord about this
          </label>

          {form.alreadyReported && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginBottom: 20 }}>
              <div>
                <label style={labelStyle} htmlFor="reportedDate">Date you first told them</label>
                <input
                  id="reportedDate"
                  type="date"
                  style={inputStyle}
                  value={form.reportedDate}
                  onChange={(e) => update("reportedDate", e.target.value)}
                  required
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, cursor: "pointer", paddingTop: 20 }}>
                <input
                  id="reportedInWriting"
                  type="checkbox"
                  checked={form.reportedInWriting}
                  onChange={(e) => update("reportedInWriting", e.target.checked)}
                />
                I told them in writing
              </label>
            </div>
          )}

          <div style={{ marginBottom: 24, maxWidth: 260 }}>
            <label style={labelStyle} htmlFor="asOfDate">Check as of</label>
            <input
              id="asOfDate"
              type="date"
              style={inputStyle}
              value={form.asOfDate}
              onChange={(e) => update("asOfDate", e.target.value)}
              required
            />
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
            {loading ? "Checking…" : "Check my repair"}
          </button>
        </form>

        {result && (
          <div style={{ marginBottom: 56 }} data-testid="repair-check-result">
            <div
              style={{
                padding: "20px 24px",
                marginBottom: 24,
                border: "1px solid #17140f",
                borderLeft: `4px solid ${STATUS_COLOR[result.status]}`,
                background: STATUS_BG[result.status],
              }}
            >
              <div
                data-testid="repair-check-status"
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: STATUS_COLOR[result.status],
                  marginBottom: 8,
                }}
              >
                {STATUS_LABEL[result.status]}
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{statusSummary(result)}</p>
              {result.heat && result.heat.belowMinimum === true && (
                <p style={{ margin: "10px 0 0", fontSize: 14, color: "#9c2b23" }}>
                  Your unit is below the {result.heat.minimumC} °C minimum that applies from September 1 to
                  June 15 (O. Reg. 516/06 s.4), unless you control the heat yourself.
                </p>
              )}
              {result.heat && !result.heat.inHeatSeason && (
                <p style={{ margin: "10px 0 0", fontSize: 14, color: "#4a4438" }}>
                  The {result.heat.minimumC} °C minimum applies from September 1 to June 15. Outside that
                  period, your landlord must still keep any heating system in good repair.
                </p>
              )}
            </div>

            <h3 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 20, margin: "0 0 10px" }}>
              What your landlord must do
            </h3>
            <p style={{ margin: "0 0 10px", fontSize: 15, color: "#4a4438", lineHeight: 1.7 }}>{result.obligation}</p>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6f6857", marginBottom: 28 }}>
              {result.citations.join(" · ")}
            </div>

            <h3 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 20, margin: "0 0 10px" }}>
              What to do next
            </h3>
            <ol data-testid="repair-next-steps" style={{ margin: 0, paddingLeft: 22, fontSize: 15, color: "#4a4438", lineHeight: 1.7 }}>
              {result.nextSteps.map((step) => (
                <li key={step} style={{ marginBottom: 8 }}>{step}</li>
              ))}
            </ol>

            <p style={{ marginTop: 24, fontSize: 13, color: "#6f6857", lineHeight: 1.6 }}>
              The RTA doesn&rsquo;t set a fixed repair deadline. LeaseGuard suggests escalating an
              {result.urgency === "urgent" ? " urgent" : ""} problem like this after{" "}
              {result.followUpThresholdDays} {result.followUpThresholdDays === 1 ? "day" : "days"} without a
              fix — the Board decides what was reasonable in each case.
            </p>
            <p style={{ marginTop: 12, fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>{result.disclaimer}</p>
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
