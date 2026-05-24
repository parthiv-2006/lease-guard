"use client";

import {
  RiskArc,
  RiskBadge,
  ClauseTypeTag,
  SectionHeader,
  StatCard,
  Icon,
  riskColor,
  CLAUSE_TYPE_LABELS,
} from "./shared";
import type { Report, PanelId } from "./types";

interface OverviewPanelProps {
  report: Report;
  onNavigate: (panel: PanelId) => void;
}

export function OverviewPanel({ report, onNavigate }: OverviewPanelProps) {
  const { lease, overall, clauses } = report;

  return (
    <div>
      <SectionHeader
        title="Overview"
        subtitle={`Analysis of ${lease.address}, ${lease.city}${lease.term ? `  ·  ${lease.term}` : ""}`}
      />

      {/* Main grid: gauge + summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: "32px",
          marginBottom: "32px",
          alignItems: "start",
        }}
      >
        {/* Arc gauge card */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "10px",
            padding: "28px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 1px 3px rgba(24,22,20,0.07), 0 1px 2px rgba(24,22,20,0.04)",
          }}
        >
          <RiskArc score={overall.risk_score} size={140} />
          <div
            style={{
              fontSize: "11px",
              color: "#9a9590",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Overall Risk
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#b0aaa4",
              fontFamily: "'DM Sans', sans-serif",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            Corpus: {overall.corpus_version}
            {overall.corpus_date && (
              <>
                <br />
                Updated {overall.corpus_date}
              </>
            )}
          </div>
        </div>

        {/* Executive summary */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "10px",
            padding: "28px",
            boxShadow: "0 1px 3px rgba(24,22,20,0.07), 0 1px 2px rgba(24,22,20,0.04)",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#9a9590",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              marginBottom: "12px",
            }}
          >
            Executive Summary
          </div>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "14px",
              color: "#181614",
              lineHeight: 1.7,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {overall.executive_summary}
          </p>
          <div
            style={{
              fontSize: "11px",
              color: "#9a9590",
              fontFamily: "'DM Sans', sans-serif",
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {overall.analysis_time_s > 0 && (
              <span>Analysis time: {overall.analysis_time_s}s</span>
            )}
            {lease.extraction_method && (
              <span>
                {lease.extraction_method === "ocr"
                  ? "Scanned PDF (OCR)"
                  : lease.extraction_method === "text"
                  ? "Digital PDF"
                  : lease.extraction_method}
              </span>
            )}
            {lease.page_count > 0 && (
              <span>{lease.page_count} {lease.page_count === 1 ? "page" : "pages"}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "14px",
          marginBottom: "32px",
        }}
      >
        <StatCard
          value={overall.red_flag_count}
          label="Red Flags"
          color="#c2410c"
          onClick={() => onNavigate("redflags")}
        />
        <StatCard
          value={overall.negotiation_count}
          label="Negotiation Points"
          color="#181614"
          onClick={() => onNavigate("negotiation")}
        />
        <StatCard
          value={overall.missing_count}
          label="Missing Protections"
          color="#b45309"
          onClick={() => onNavigate("missing")}
        />
        <StatCard
          value={overall.contradiction_count}
          label="Contradictions"
          color="#6b6560"
          onClick={() => onNavigate("contradictions")}
        />
      </div>

      {/* Clean lease celebration — only shown for low-risk leases */}
      {overall.risk_score < 3 && overall.red_flag_count === 0 && (
        <div
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
            border: "1px solid #86efac",
            borderRadius: "10px",
            marginBottom: "28px",
            display: "flex",
            alignItems: "flex-start",
            gap: "16px",
            boxShadow: "0 1px 3px rgba(21,128,61,0.08)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#dcfce7",
              border: "1.5px solid #86efac",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 2l5 2.5v4C13 11.5 10.5 14 8 15 5.5 14 3 11.5 3 8.5v-4L8 2z"
                stroke="#15803d" strokeWidth="1.5" fill="#bbf7d0" />
              <path d="M5.5 8.5l1.8 1.8 3.2-3.6"
                stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontSize: "17px",
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 600,
                color: "#14532d",
                marginBottom: "4px",
                letterSpacing: "-0.01em",
              }}
            >
              This lease looks clean
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "#166534",
                lineHeight: 1.55,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              No major red flags found. Your lease appears largely compliant with Ontario's
              Residential Tenancies Act. Still worth reviewing the full clause breakdown below —
              you have all the details.
            </p>
          </div>
        </div>
      )}

      {/* Clause breakdown */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e8e4dc",
          borderRadius: "10px",
          overflow: "hidden",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #e8e4dc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "#181614",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Clause Breakdown — {overall.clause_count} clauses analysed
          </span>
          <button
            onClick={() => onNavigate("clauses")}
            style={{
              fontSize: "12px",
              color: "#6b6560",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            View all <Icon name="chevronRight" size={13} color="#9a9590" />
          </button>
        </div>

        {/* Risk bar */}
        <div style={{ padding: "20px 24px 12px" }}>
          <div
            style={{
              display: "flex",
              gap: "2px",
              height: "8px",
              borderRadius: "4px",
              overflow: "hidden",
              marginBottom: "10px",
            }}
          >
            {(["critical", "high", "medium", "low"] as const).map((level) => {
              const count = clauses.filter((c) => c.risk_level === level).length;
              const pct = (count / overall.clause_count) * 100;
              return pct > 0 ? (
                <div
                  key={level}
                  style={{
                    flex: pct,
                    background: riskColor(level),
                    minWidth: 0,
                  }}
                  title={`${count} ${level}`}
                />
              ) : null;
            })}
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {(["critical", "high", "medium", "low"] as const).map((level) => {
              const count = clauses.filter((c) => c.risk_level === level).length;
              return (
                <div
                  key={level}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "2px",
                      background: riskColor(level),
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#6b6560",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {count} {level.charAt(0).toUpperCase() + level.slice(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clause list */}
        <div>
          {clauses.map((clause) => (
            <div
              key={clause.id}
              onClick={() => onNavigate("clauses")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "12px 24px",
                borderTop: "1px solid #f0ede6",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#faf9f6")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#181614",
                    fontFamily: "'DM Sans', sans-serif",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {clause.heading}
                </div>
                <div
                  style={{ fontSize: "11px", color: "#9a9590", marginTop: "2px" }}
                >
                  {CLAUSE_TYPE_LABELS[clause.primary_type] ?? clause.primary_type}
                  {clause.is_potentially_unenforceable && (
                    <span style={{ color: "#b91c1c", marginLeft: "8px" }}>
                      · Potentially unenforceable
                    </span>
                  )}
                </div>
              </div>
              <RiskBadge
                level={clause.risk_level}
                score={clause.risk_score}
                small
              />
            </div>
          ))}
        </div>
      </div>

      {/* Walk-away alert */}
      {report.negotiation_points.some((n) => n.walk_away_threshold) && (
        <div
          style={{
            padding: "16px 20px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            display: "flex",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            style={{ flexShrink: 0, marginTop: "1px" }}
          >
            <circle cx="8" cy="8" r="6.5" stroke="#b91c1c" strokeWidth="1.5" />
            <path
              d="M8 5v3.5M8 11v.5"
              stroke="#b91c1c"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#b91c1c",
                marginBottom: "4px",
              }}
            >
              Walk-away clauses identified
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#6b6560",
                lineHeight: 1.5,
              }}
            >
              {report.negotiation_points
                .filter((n) => n.walk_away_threshold)
                .map((n) => n.clause_label)
                .join(" and ")}{" "}
              are flagged as potential walk-away concerns. If the landlord
              refuses to remove or substantially revise these clauses, consider
              whether this tenancy is right for you.{" "}
              <button
                onClick={() => onNavigate("negotiation")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#b91c1c",
                  cursor: "pointer",
                  fontSize: "13px",
                  padding: 0,
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                }}
              >
                View negotiation guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal disclaimer */}
      <div
        style={{
          marginTop: "8px",
          padding: "14px 18px",
          background: "#f6f3ee",
          border: "1px solid #e8e4dc",
          borderRadius: "8px",
          fontSize: "11px",
          color: "#9a9590",
          lineHeight: 1.5,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <strong style={{ color: "#6b6560" }}>Legal disclaimer:</strong>{" "}
        LeaseGuard provides educational information only and does not constitute
        legal advice. Every legal claim in this report is grounded in retrieved
        statute text (corpus version {overall.corpus_version}
        {overall.corpus_date && `, updated ${overall.corpus_date}`}). For
        professional legal judgment, consult a licensed paralegal or lawyer.
        Community Legal Clinics in Ontario offer free tenant legal help.
      </div>
    </div>
  );
}
