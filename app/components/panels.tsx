"use client";

// LeaseGuard — Report Panels
// ClauseCard, RedFlagsPanel, ClauseExplorerPanel, NegotiationPanel,
// MissingPanel, ContradictionsPanel, SourcesPanel, AgentTracePanel

import { useState, useMemo, useEffect } from "react";
import { TraceTimeline } from "./trace-timeline";
import {
  RiskBadge,
  ClauseTypeTag,
  SectionHeader,
  CopyButton,
  FeedbackBar,
  Collapsible,
  Icon,
  riskColor,
  riskBg,
  riskBorder,
} from "./shared";
import type { Report, Clause, NegotiationPoint, RiskLevel } from "./types";

// ── Clause detail card ────────────────────────────────────────────────────────

interface ClauseCardProps {
  clause: Clause;
  leaseId: string;
  negotiation?: NegotiationPoint;
  defaultOpen?: boolean;
  onClauseActivate?: (clauseId: string) => void;
}

function ClauseCard({ clause, leaseId, negotiation, defaultOpen, onClauseActivate }: ClauseCardProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const col = riskColor(clause.risk_level);
  const bg = riskBg(clause.risk_level);
  const border = riskBorder(clause.risk_level);

  useEffect(() => {
    if (defaultOpen) onClauseActivate?.(clause.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) onClauseActivate?.(clause.id);
  }

  return (
    <div
      style={{
        border: "1px solid #e8e4dc",
        borderRadius: "8px",
        overflow: "hidden",
        borderLeft: `3px solid ${col}`,
      }}
    >
      {/* Header */}
      <button
        onClick={handleToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 18px",
          background: open ? "#faf9f6" : "#fff",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          borderBottom: open ? "1px solid #e8e4dc" : "none",
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "#f6f3ee",
            border: "1px solid #e8e4dc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 600,
            color: "#6b6560",
            fontFamily: "'DM Sans', sans-serif",
            flexShrink: 0,
          }}
        >
          {clause.number}
        </span>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#181614",
              marginBottom: "3px",
            }}
          >
            {clause.heading}
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <ClauseTypeTag type={clause.primary_type} />
            {clause.is_potentially_unenforceable && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 7px",
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: "3px",
                  color: col,
                  fontWeight: 500,
                  letterSpacing: "0.03em",
                }}
              >
                Potentially Unenforceable
              </span>
            )}
            {clause.is_standard && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 7px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "3px",
                  color: "#15803d",
                  fontWeight: 500,
                }}
              >
                Standard
              </span>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <RiskBadge level={clause.risk_level} score={clause.risk_score} small />
        </div>
        <span
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            flexShrink: 0,
          }}
        >
          <Icon name="chevronDown" size={14} color="#9a9590" />
        </span>
      </button>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: "20px 20px 16px", background: "#fff" }}>
          {/* Original clause text */}
          <div style={{ marginBottom: "18px" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9a9590",
                fontWeight: 500,
                marginBottom: "8px",
              }}
            >
              Original clause text
            </div>
            <div
              style={{
                fontSize: "12px",
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.7,
                color: "#5c5751",
                background: "#f6f3ee",
                padding: "12px 14px",
                borderRadius: "6px",
                borderLeft: "2px solid #ddd8cf",
              }}
            >
              {clause.raw_text}
            </div>
          </div>

          {/* Plain English */}
          <div style={{ marginBottom: "18px" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9a9590",
                fontWeight: 500,
                marginBottom: "8px",
              }}
            >
              What this means
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "#181614",
                lineHeight: 1.65,
              }}
            >
              {clause.plain_english_explanation}
            </p>
          </div>

          {/* Risk reasoning */}
          {clause.risk_reasoning && (
            <div style={{ marginBottom: "18px" }}>
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9a9590",
                  fontWeight: 500,
                  marginBottom: "8px",
                }}
              >
                Risk reasoning
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#5c5751",
                  lineHeight: 1.65,
                }}
              >
                {clause.risk_reasoning}
              </p>
            </div>
          )}

          {/* Statutory violations */}
          {clause.statutory_violations?.length > 0 && (
            <div style={{ marginBottom: "18px" }}>
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9a9590",
                  fontWeight: 500,
                  marginBottom: "8px",
                }}
              >
                Statutory conflicts
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {clause.statutory_violations.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px 12px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-start",
                    }}
                  >
                    <code
                      style={{
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#b91c1c",
                        background: "#fee2e2",
                        padding: "1px 6px",
                        borderRadius: "3px",
                        flexShrink: 0,
                      }}
                    >
                      {v.statute_section}
                    </code>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#6b6560",
                        lineHeight: 1.4,
                      }}
                    >
                      {v.violation_description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Negotiation hint */}
          {negotiation && (
            <div
              style={{
                padding: "12px 14px",
                background: "#f6f9ff",
                border: "1px solid #dbeafe",
                borderRadius: "6px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#1d4ed8",
                  marginBottom: "4px",
                }}
              >
                Negotiation point available — {negotiation.priority} priority
                {negotiation.walk_away_threshold && (
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "10px",
                      padding: "1px 6px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "3px",
                      color: "#b91c1c",
                    }}
                  >
                    Walk-away threshold
                  </span>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5751" }}>
                {negotiation.ask}
              </div>
            </div>
          )}

          <FeedbackBar leaseId={leaseId} clauseId={clause.id} />
        </div>
      )}
    </div>
  );
}

// ── Red Flags Panel ───────────────────────────────────────────────────────────

export function RedFlagsPanel({
  report,
  onClauseActivate,
}: {
  report: Report;
  onClauseActivate?: (clauseId: string) => void;
}) {
  const redFlags = report.clauses
    .filter((c) => c.risk_level === "high" || c.risk_level === "critical")
    .sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div>
      <SectionHeader
        title="Red Flags"
        count={redFlags.length}
        subtitle="Clauses with risk score ≥ 6.0. These require your attention before signing."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {redFlags.map((clause, i) => {
          const neg = report.negotiation_points.find(
            (n) => n.clause_id === clause.id
          );
          return (
            <ClauseCard
              key={clause.id}
              clause={clause}
              leaseId={report.lease.id}
              negotiation={neg}
              defaultOpen={i === 0}
              onClauseActivate={onClauseActivate}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Clause Explorer Panel ─────────────────────────────────────────────────────

export function ClauseExplorerPanel({
  report,
  onClauseActivate,
}: {
  report: Report;
  onClauseActivate?: (clauseId: string) => void;
}) {
  const [filter, setFilter] = useState<RiskLevel | "all">("all");
  const [sort, setSort] = useState<"risk_desc" | "risk_asc" | "number">(
    "risk_desc"
  );

  const filtered = useMemo(() => {
    let list = [...report.clauses];
    if (filter !== "all") list = list.filter((c) => c.risk_level === filter);
    if (sort === "risk_desc") list.sort((a, b) => b.risk_score - a.risk_score);
    if (sort === "risk_asc") list.sort((a, b) => a.risk_score - b.risk_score);
    if (sort === "number")
      list.sort((a, b) => parseInt(a.number) - parseInt(b.number));
    return list;
  }, [report.clauses, filter, sort]);

  const levels: Array<RiskLevel | "all"> = [
    "all",
    "critical",
    "high",
    "medium",
    "low",
  ];

  return (
    <div>
      <SectionHeader
        title="Clause Explorer"
        count={filtered.length}
        subtitle="Every clause analysed. Click any clause to expand its full analysis."
      />

      {/* Filter + sort controls */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {levels.map((l) => (
            <button
              key={l}
              onClick={() => setFilter(l)}
              style={{
                padding: "5px 12px",
                borderRadius: "5px",
                cursor: "pointer",
                fontSize: "12px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                background: filter === l ? "#181614" : "#fff",
                border: `1px solid ${filter === l ? "#181614" : "#ddd8cf"}`,
                color: filter === l ? "#fff" : "#6b6560",
                transition: "all 0.15s",
              }}
            >
              {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
              {l !== "all" && (
                <span style={{ marginLeft: "5px", opacity: 0.7 }}>
                  {report.clauses.filter((c) => c.risk_level === l).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "12px", color: "#9a9590" }}>Sort:</span>
          <select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "risk_desc" | "risk_asc" | "number")
            }
            style={{
              padding: "5px 10px",
              borderRadius: "5px",
              border: "1px solid #ddd8cf",
              fontSize: "12px",
              color: "#5c5751",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="risk_desc">Highest risk first</option>
            <option value="risk_asc">Lowest risk first</option>
            <option value="number">Clause number</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {filtered.map((clause) => {
          const neg = report.negotiation_points.find(
            (n) => n.clause_id === clause.id
          );
          return (
            <ClauseCard
              key={clause.id}
              clause={clause}
              leaseId={report.lease.id}
              negotiation={neg}
              onClauseActivate={onClauseActivate}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Negotiation Guide Panel ───────────────────────────────────────────────────

function NegotiationCard({
  n,
  report,
  onClauseActivate,
}: {
  n: NegotiationPoint;
  report: Report;
  onClauseActivate?: (clauseId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const priorityColor: Record<string, string> = {
    high: "#b91c1c",
    medium: "#b45309",
    low: "#15803d",
  };
  const col = priorityColor[n.priority] ?? "#6b7280";

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && n.clause_id) onClauseActivate?.(n.clause_id);
  }

  return (
    <div
      style={{
        border: "1px solid #e8e4dc",
        borderRadius: "8px",
        overflow: "hidden",
        borderLeft: `3px solid ${col}`,
      }}
    >
      <button
        onClick={handleToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "16px 18px",
          background: open ? "#faf9f6" : "#fff",
          border: "none",
          borderBottom: open ? "1px solid #e8e4dc" : "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "4px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ fontSize: "14px", fontWeight: 600, color: "#181614" }}
            >
              {n.clause_label}
            </span>
            {n.walk_away_threshold && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 7px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "3px",
                  color: "#b91c1c",
                  fontWeight: 500,
                }}
              >
                Walk-away
              </span>
            )}
          </div>
          <div style={{ fontSize: "12px", color: "#6b6560" }}>{n.ask}</div>
        </div>
        <span
          style={{
            fontSize: "10px",
            padding: "2px 9px",
            borderRadius: "100px",
            background:
              n.priority === "high"
                ? "#fef2f2"
                : n.priority === "medium"
                ? "#fffbeb"
                : "#f0fdf4",
            border: `1px solid ${
              n.priority === "high"
                ? "#fecaca"
                : n.priority === "medium"
                ? "#fde68a"
                : "#bbf7d0"
            }`,
            color: col,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
            flexShrink: 0,
          }}
        >
          {n.priority}
        </span>
        <span
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            flexShrink: 0,
          }}
        >
          <Icon name="chevronDown" size={14} color="#9a9590" />
        </span>
      </button>

      {open && (
        <div style={{ padding: "22px 20px", background: "#fff" }}>
          {/* Ask for */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9a9590",
                fontWeight: 500,
                marginBottom: "8px",
              }}
            >
              Ask for
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "#181614",
                lineHeight: 1.6,
                fontWeight: 500,
              }}
            >
              {n.ask}
            </p>
          </div>

          {/* Proposed wording */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9a9590",
                fontWeight: 500,
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Proposed replacement wording</span>
              <CopyButton text={n.counter_language} label="Copy wording" />
            </div>
            <div
              style={{
                fontSize: "12px",
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.7,
                color: "#181614",
                background: "#f6f9ff",
                padding: "14px 16px",
                borderRadius: "6px",
                border: "1px solid #dbeafe",
                borderLeft: "3px solid #1d4ed8",
              }}
            >
              {n.counter_language}
            </div>
          </div>

          {/* Legal basis */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9a9590",
                fontWeight: 500,
                marginBottom: "8px",
              }}
            >
              Legal basis
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "#5c5751",
                lineHeight: 1.6,
              }}
            >
              {n.legal_argument}
            </p>
          </div>

          {/* If they say / You say */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                padding: "14px",
                background: "#fff7ed",
                borderRadius: "6px",
                border: "1px solid #fed7aa",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "#b45309",
                  fontWeight: 600,
                  marginBottom: "6px",
                }}
              >
                If they say
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "#5c5751",
                  lineHeight: 1.5,
                  fontStyle: "italic",
                }}
              >
                &ldquo;{n.landlord_likely_response}&rdquo;
              </p>
            </div>
            <div
              style={{
                padding: "14px",
                background: "#f0f9ff",
                borderRadius: "6px",
                border: "1px solid #bae6fd",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "#0369a1",
                  fontWeight: 600,
                  marginBottom: "6px",
                }}
              >
                You say
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "#181614",
                  lineHeight: 1.5,
                }}
              >
                {n.your_rebuttal}
              </p>
            </div>
          </div>

          <FeedbackBar leaseId={report.lease.id} clauseId={n.id} />
        </div>
      )}
    </div>
  );
}

export function NegotiationPanel({
  report,
  onLaunchCopilot,
  onClauseActivate,
}: {
  report: Report;
  onLaunchCopilot?: () => void;
  onClauseActivate?: (clauseId: string) => void;
}) {
  const byPriority: Record<string, NegotiationPoint[]> = {
    high: [],
    medium: [],
    low: [],
  };
  report.negotiation_points.forEach((n) => {
    if (byPriority[n.priority]) byPriority[n.priority].push(n);
  });

  return (
    <div>
      <SectionHeader
        title="Negotiation Guide"
        count={report.negotiation_points.length}
        subtitle="Prioritised by impact. Walk-away clauses are flagged separately."
        action={
          <button
            onClick={onLaunchCopilot}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              background: "#181614",
              border: "1px solid #181614",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2825")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#181614")}
          >
            <Icon name="negotiate" size={13} color="#fff" />
            Open Negotiation Copilot
          </button>
        }
      />
      {(["high", "medium", "low"] as const).map((priority) => {
        const items = byPriority[priority];
        if (!items.length) return null;
        const dotColor = {
          high: "#b91c1c",
          medium: "#b45309",
          low: "#15803d",
        }[priority];
        return (
          <div key={priority} style={{ marginBottom: "28px" }}>
            <div
              style={{
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9a9590",
                fontWeight: 500,
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: dotColor,
                }}
              />
              {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {items.map((n) => (
                <NegotiationCard
                  key={n.id}
                  n={n}
                  report={report}
                  onClauseActivate={onClauseActivate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Missing Protections Panel ─────────────────────────────────────────────────

export function MissingPanel({ report }: { report: Report }) {
  const severityOrder: Record<string, number> = {
    critical: 0,
    important: 1,
    minor: 2,
  };
  const sorted = [...report.missing_protections].sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  );

  const sevColor: Record<string, string> = {
    critical: "#b91c1c",
    important: "#b45309",
    minor: "#15803d",
  };
  const sevBg: Record<string, string> = {
    critical: "#fef2f2",
    important: "#fffbeb",
    minor: "#f0fdf4",
  };
  const sevBorder: Record<string, string> = {
    critical: "#fecaca",
    important: "#fde68a",
    minor: "#bbf7d0",
  };

  return (
    <div>
      <SectionHeader
        title="Missing Protections"
        count={sorted.length}
        subtitle="Rights guaranteed by Ontario law that are absent from your lease. You have these rights regardless — but their absence means you may not know to enforce them."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {sorted.map((m) => (
          <Collapsible
            key={m.id}
            accentColor={sevColor[m.severity]}
            header={
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: "3px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#181614",
                      }}
                    >
                      {m.protection_name}
                    </span>
                    <code
                      style={{
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        background: "#f6f3ee",
                        padding: "1px 6px",
                        borderRadius: "3px",
                        color: "#6b6560",
                        border: "1px solid #e8e4dc",
                      }}
                    >
                      {m.rta_section}
                    </code>
                  </div>
                  <div style={{ fontSize: "12px", color: "#6b6560" }}>
                    {m.explanation.substring(0, 90)}…
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 9px",
                    borderRadius: "100px",
                    background: sevBg[m.severity],
                    border: `1px solid ${sevBorder[m.severity]}`,
                    color: sevColor[m.severity],
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    flexShrink: 0,
                  }}
                >
                  {m.severity}
                </span>
              </div>
            }
          >
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9a9590",
                  fontWeight: 500,
                  marginBottom: "8px",
                }}
              >
                Why it matters
              </div>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "13px",
                  color: "#181614",
                  lineHeight: 1.65,
                }}
              >
                {m.explanation}
              </p>
              <div
                style={{
                  padding: "10px 14px",
                  background: "#fff7ed",
                  borderRadius: "6px",
                  border: "1px solid #fed7aa",
                  fontSize: "13px",
                  color: "#6b6560",
                  lineHeight: 1.55,
                }}
              >
                <strong style={{ color: "#b45309" }}>Risk if missing: </strong>
                {m.risk_if_missing}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9a9590",
                  fontWeight: 500,
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Suggested addition</span>
                <CopyButton text={m.suggested_addition} label="Copy text" />
              </div>
              <div
                style={{
                  fontSize: "12px",
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1.7,
                  color: "#181614",
                  background: "#f6f9ff",
                  padding: "12px 14px",
                  borderRadius: "6px",
                  border: "1px solid #dbeafe",
                  borderLeft: "3px solid #1d4ed8",
                }}
              >
                {m.suggested_addition}
              </div>
            </div>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

// ── Contradictions Panel ──────────────────────────────────────────────────────

export function ContradictionsPanel({
  report,
  onClauseActivate,
}: {
  report: Report;
  onClauseActivate?: (clauseId: string) => void;
}) {
  const sevColor: Record<string, string> = {
    high: "#b91c1c",
    medium: "#b45309",
    low: "#15803d",
  };
  const sevBg: Record<string, string> = {
    high: "#fef2f2",
    medium: "#fffbeb",
    low: "#f0fdf4",
  };
  const sevBorder: Record<string, string> = {
    high: "#fecaca",
    medium: "#fde68a",
    low: "#bbf7d0",
  };
  const typeLabel: Record<string, string> = {
    direct_conflict: "Direct Conflict",
    ambiguity: "Ambiguity",
    overlap: "Overlap",
  };

  return (
    <div>
      <SectionHeader
        title="Contradictions"
        count={report.contradictions.length}
        subtitle="Clauses within this lease that conflict with each other. Legal ambiguity in residential leases generally resolves in the tenant's favour, but disputes are costly."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {report.contradictions.map((x) => (
          <div
            key={x.id}
            style={{
              background: "#fff",
              border: "1px solid #e8e4dc",
              borderRadius: "8px",
              overflow: "hidden",
              borderLeft: `3px solid ${sevColor[x.severity] ?? "#6b7280"}`,
            }}
          >
            <div
              style={{ padding: "18px 20px", borderBottom: "1px solid #f0ede6" }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  marginBottom: "12px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#181614",
                      }}
                    >
                      {typeLabel[x.contradiction_type] ?? x.contradiction_type}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "100px",
                        background: sevBg[x.severity] ?? "#f9fafb",
                        border: `1px solid ${sevBorder[x.severity] ?? "#e5e7eb"}`,
                        color: sevColor[x.severity] ?? "#6b7280",
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {x.severity} severity
                    </span>
                  </div>
                  {/* Conflicting clause tags — clickable to highlight in PDF */}
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => onClauseActivate?.(x.clause_a_id)}
                      title="Highlight in PDF"
                      style={{
                        fontSize: "12px",
                        padding: "3px 10px",
                        background: "#f6f3ee",
                        border: "1px solid #e8e4dc",
                        borderRadius: "4px",
                        color: "#5c5751",
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.borderColor = "#c5bfb5")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.borderColor = "#e8e4dc")
                      }
                    >
                      {x.clause_a_label}
                    </button>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        d="M4 8h8M10 5l3 3-3 3M6 5L3 8l3 3"
                        stroke="#c8c3ba"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <button
                      onClick={() => onClauseActivate?.(x.clause_b_id)}
                      title="Highlight in PDF"
                      style={{
                        fontSize: "12px",
                        padding: "3px 10px",
                        background: "#f6f3ee",
                        border: "1px solid #e8e4dc",
                        borderRadius: "4px",
                        color: "#5c5751",
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.borderColor = "#c5bfb5")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.borderColor = "#e8e4dc")
                      }
                    >
                      {x.clause_b_label}
                    </button>
                  </div>
                </div>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#5c5751",
                  lineHeight: 1.65,
                }}
              >
                {x.explanation}
              </p>
            </div>
            <div style={{ padding: "14px 20px", background: "#faf9f6" }}>
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9a9590",
                  fontWeight: 500,
                  marginBottom: "6px",
                }}
              >
                Which governs?
              </div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: "12px",
                  color: "#181614",
                  lineHeight: 1.5,
                }}
              >
                {x.which_governs}
              </p>
              <code
                style={{
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "#6b6560",
                }}
              >
                Legal basis: {x.legal_basis}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sources Panel ─────────────────────────────────────────────────────────────

export function SourcesPanel({
  report,
  onClauseActivate,
}: {
  report: Report;
  onClauseActivate?: (clauseId: string) => void;
}) {
  return (
    <div>
      <SectionHeader
        title="Sources"
        count={report.sources.length}
        subtitle={`All statute sections retrieved during analysis. Corpus version ${report.overall.corpus_version}${report.overall.corpus_date ? ` · Updated ${report.overall.corpus_date}` : ""}`}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {report.sources.map((s) => (
          <div
            key={s.id}
            style={{
              background: "#fff",
              border: "1px solid #e8e4dc",
              borderRadius: "8px",
              padding: "18px 20px",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "baseline",
                  marginBottom: "6px",
                  flexWrap: "wrap",
                }}
              >
                <code
                  style={{
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#1d4ed8",
                    fontWeight: 500,
                  }}
                >
                  {s.section_number}
                </code>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#181614",
                  }}
                >
                  {s.section_title}
                </span>
                <span style={{ fontSize: "11px", color: "#9a9590" }}>
                  {s.act_name}
                </span>
              </div>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "12px",
                  color: "#5c5751",
                  lineHeight: 1.65,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {s.full_text}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "12px",
                    color: "#1d4ed8",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  <Icon name="external" size={13} color="#1d4ed8" /> ontario.ca
                </a>
                <span style={{ fontSize: "11px", color: "#9a9590" }}>
                  Relevance: {(s.relevance_score * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: "11px", color: "#9a9590" }}>
                  {s.corpus_version}
                </span>
                {s.relevant_clauses?.length > 0 && (
                  <span style={{ fontSize: "11px", color: "#9a9590" }}>
                    Used by:{" "}
                    {s.relevant_clauses.map((id, i) => {
                      const c = report.clauses.find((cl) => cl.id === id);
                      return (
                        <button
                          key={id}
                          onClick={() => onClauseActivate?.(id)}
                          title="Highlight in PDF"
                          style={{
                            background: "none",
                            border: "none",
                            padding: "0 2px",
                            cursor: "pointer",
                            fontSize: "11px",
                            color: "#1d4ed8",
                            textDecoration: "underline",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {c ? `Clause ${c.number}` : id}
                          {i < s.relevant_clauses.length - 1 ? "," : ""}
                        </button>
                      );
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: "20px",
          padding: "14px 18px",
          background: "#f6f3ee",
          border: "1px solid #e8e4dc",
          borderRadius: "8px",
          fontSize: "12px",
          color: "#9a9590",
          lineHeight: 1.5,
        }}
      >
        All statute sections are retrieved via semantic search (pgvector,
        cosine similarity ≥ 0.45) from the RTA corpus. Tribunal decisions
        corpus is not yet available — LTB decision retrieval is planned for
        v1.1. Click any ontario.ca link to verify the statute text directly.
      </div>
    </div>
  );
}

// ── Agent Trace Panel ─────────────────────────────────────────────────────────

/** Vertical list view — the original text-based trace, preserved as a fallback. */
function TraceList({ steps }: { steps: Report["agent_trace"] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalMs = steps.reduce((sum, t) => sum + (t.duration_ms || 0), 0);
  const allSucceeded = steps.every((t) => t.success);

  const toolColors: Record<string, string> = {
    parse_document: "#1d4ed8",
    detect_jurisdiction: "#7c3aed",
    segment_clauses: "#0369a1",
    classify_clause: "#0d9488",
    lookup_statute: "#b45309",
    lookup_tribunal: "#9333ea",
    score_risk: "#c2410c",
    detect_contradiction: "#b91c1c",
    check_missing: "#15803d",
    generate_negotiation: "#1d4ed8",
    generate_report: "#374151",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {steps.map((step, i) => {
        const col = toolColors[step.tool_name] ?? "#6b7280";
        const isOpen = expanded === step.id;

        return (
          <div key={step.id} style={{ display: "flex", gap: "0" }}>
            {/* Left rail */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "36px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "1px",
                  flex: "0 0 8px",
                  background: i === 0 ? "transparent" : "#e8e4dc",
                }}
              />
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: step.success ? col : "#b91c1c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {step.sequence}
                </span>
              </div>
              <div
                style={{
                  width: "1px",
                  flex: 1,
                  minHeight: "8px",
                  background:
                    i === steps.length - 1 ? "transparent" : "#e8e4dc",
                }}
              />
            </div>

            {/* Card */}
            <div
              style={{ flex: 1, paddingLeft: "12px", paddingBottom: "8px" }}
            >
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e8e4dc",
                  borderRadius: "8px",
                  overflow: "hidden",
                  marginBottom: "2px",
                }}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : step.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "11px 14px",
                    background: isOpen ? "#faf9f6" : "#fff",
                    border: "none",
                    borderBottom: isOpen ? "1px solid #e8e4dc" : "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <code
                    style={{
                      fontSize: "12px",
                      fontFamily: "'JetBrains Mono', monospace",
                      color: col,
                      fontWeight: 500,
                      flex: 1,
                      textAlign: "left",
                    }}
                  >
                    {step.tool_name}
                  </code>
                  <span style={{ fontSize: "11px", color: "#9a9590" }}>
                    {step.duration_ms >= 1000
                      ? `${(step.duration_ms / 1000).toFixed(2)}s`
                      : `${step.duration_ms}ms`}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "1px 7px",
                      borderRadius: "3px",
                      background: step.success ? "#f0fdf4" : "#fef2f2",
                      border: `1px solid ${step.success ? "#bbf7d0" : "#fecaca"}`,
                      color: step.success ? "#15803d" : "#b91c1c",
                      fontWeight: 500,
                    }}
                  >
                    {step.success ? "OK" : "ERR"}
                  </span>
                  <span
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  >
                    <Icon name="chevronDown" size={13} color="#9a9590" />
                  </span>
                </button>

                {isOpen && (
                  <div
                    style={{
                      padding: "14px",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "10px",
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          color: "#9a9590",
                          fontWeight: 500,
                          marginBottom: "6px",
                        }}
                      >
                        Input
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "11px",
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "#5c5751",
                          background: "#f6f3ee",
                          padding: "10px",
                          borderRadius: "5px",
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(step.input_summary, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "10px",
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          color: "#9a9590",
                          fontWeight: 500,
                          marginBottom: "6px",
                        }}
                      >
                        Output
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "11px",
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "#181614",
                          background: "#f6f3ee",
                          padding: "10px",
                          borderRadius: "5px",
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(step.output_summary, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AgentTracePanel({ report }: { report: Report }) {
  const [view, setView] = useState<"gantt" | "list">("gantt");

  const totalMs = report.agent_trace.reduce(
    (sum, t) => sum + (t.duration_ms || 0),
    0
  );
  const allSucceeded = report.agent_trace.every((t) => t.success);

  return (
    <div>
      <SectionHeader
        title="Agent Reasoning Trace"
        subtitle={`${report.agent_trace.length} tool calls · ${(totalMs / 1000).toFixed(1)}s total · ${
          allSucceeded ? "All calls succeeded" : "Some calls failed"
        }`}
      />

      {/* Grounding explanation */}
      <div
        style={{
          marginBottom: "20px",
          padding: "14px 18px",
          background: "#f6f9ff",
          border: "1px solid #dbeafe",
          borderRadius: "8px",
          fontSize: "13px",
          color: "#1d4ed8",
          lineHeight: 1.55,
        }}
      >
        This trace shows exactly how LeaseGuard analysed your lease — every tool
        called, in order, with its inputs and outputs. This is the evidence that the
        analysis is grounded in retrieved law, not LLM opinion.
      </div>

      {/* View toggle */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "20px",
          background: "#f6f3ee",
          border: "1px solid #e8e4dc",
          borderRadius: "8px",
          padding: "4px",
          width: "fit-content",
        }}
      >
        {(["gantt", "list"] as const).map((v) => (
          <button
            key={v}
            id={`trace-view-${v}`}
            onClick={() => setView(v)}
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              background: view === v ? "#fff" : "transparent",
              color: view === v ? "#181614" : "#9a9590",
              boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s",
            }}
          >
            {v === "gantt" ? "⏱ Timeline" : "≡ List"}
          </button>
        ))}
      </div>

      {view === "gantt" ? (
        <TraceTimeline steps={report.agent_trace} />
      ) : (
        <TraceList steps={report.agent_trace} />
      )}
    </div>
  );
}
