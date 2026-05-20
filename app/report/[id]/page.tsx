"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Icon, RiskBadge } from "../../components/shared";
import { OverviewPanel } from "../../components/overview-panel";
import {
  RedFlagsPanel,
  ClauseExplorerPanel,
  NegotiationPanel,
  MissingPanel,
  ContradictionsPanel,
  SourcesPanel,
  AgentTracePanel,
} from "../../components/panels";
import { NegotiationCopilot } from "../../components/negotiation-copilot";
import type { Report, PanelId } from "../../components/types";

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{
  id: PanelId;
  label: string;
  icon: string;
  countKey?: keyof Report["overall"];
  color?: string;
}> = [
  { id: "overview", label: "Overview", icon: "overview" },
  {
    id: "redflags",
    label: "Red Flags",
    icon: "flag",
    countKey: "red_flag_count",
    color: "#c2410c",
  },
  { id: "clauses", label: "Clause Explorer", icon: "clauses" },
  {
    id: "negotiation",
    label: "Negotiation Guide",
    icon: "negotiate",
    countKey: "negotiation_count",
  },
  {
    id: "missing",
    label: "Missing Protections",
    icon: "shield",
    countKey: "missing_count",
    color: "#b45309",
  },
  {
    id: "contradictions",
    label: "Contradictions",
    icon: "conflict",
    countKey: "contradiction_count",
  },
  { id: "sources", label: "Sources", icon: "source" },
  { id: "trace", label: "Agent Trace", icon: "trace" },
];

// ── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({
  onClose,
  report,
}: {
  onClose: () => void;
  report: Report;
}) {
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(
    report.share_url ?? null
  );

  async function getOrCreateShareLink() {
    if (shareUrl) return shareUrl;
    setGenerating(true);
    try {
      const res = await fetch(`/api/report/${report.lease.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share" }),
      });
      const data = await res.json();
      const url = data.share_url ?? `${window.location.origin}/report/${report.lease.id}`;
      setShareUrl(url);
      return url;
    } catch {
      return `${window.location.origin}/report/${report.lease.id}`;
    } finally {
      setGenerating(false);
    }
  }

  const displayUrl =
    shareUrl ??
    `${typeof window !== "undefined" ? window.location.origin : ""}/report/${report.lease.id}`;

  function copy() {
    getOrCreateShareLink().then((url) => {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "10px",
          padding: "28px",
          width: "440px",
          maxWidth: "90vw",
          border: "1px solid #e8e4dc",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              color: "#181614",
            }}
          >
            Share this report
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
            }}
          >
            <Icon name="close" size={16} color="#9a9590" />
          </button>
        </div>

        <div
          style={{
            padding: "12px 16px",
            background: "#f6f3ee",
            border: "1px solid #e8e4dc",
            borderRadius: "7px",
            marginBottom: "14px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: "12px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "#5c5751",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayUrl}
          </span>
          <button
            onClick={copy}
            disabled={generating}
            style={{
              padding: "5px 14px",
              borderRadius: "5px",
              cursor: generating ? "wait" : "pointer",
              fontSize: "12px",
              fontWeight: 500,
              flexShrink: 0,
              background: copied ? "#f0fdf4" : "#181614",
              border: `1px solid ${copied ? "#bbf7d0" : "#181614"}`,
              color: copied ? "#15803d" : "#fff",
              transition: "all 0.15s",
            }}
          >
            {generating ? "…" : copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        <div
          style={{
            padding: "12px 14px",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: "7px",
            fontSize: "12px",
            color: "#6b6560",
            lineHeight: 1.5,
          }}
        >
          Anyone with this link can view your report for 90 days. The report
          does not include your uploaded PDF. No personal information is shared.
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function ReportSidebar({
  activePanel,
  onNavigate,
  report,
  onShare,
}: {
  activePanel: PanelId;
  onNavigate: (panel: PanelId) => void;
  report: Report;
  onShare: () => void;
}) {
  const { lease, overall } = report;

  return (
    <div
      style={{
        width: "256px",
        minWidth: "256px",
        background: "#131110",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflow: "auto",
        borderRight: "1px solid #252220",
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid #252220",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "17px",
            color: "#ebe8e2",
            letterSpacing: "0.02em",
          }}
        >
          LeaseGuard
        </div>
      </div>

      {/* Lease info */}
      <div
        style={{ padding: "16px 20px", borderBottom: "1px solid #252220" }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "#ebe8e2",
            lineHeight: 1.4,
            marginBottom: "2px",
          }}
        >
          {lease.address}
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "#7a7570",
            lineHeight: 1.4,
            marginBottom: "10px",
          }}
        >
          {lease.city}
        </div>
        <RiskBadge
          level={overall.risk_level}
          score={overall.risk_score}
          small
        />
        <div style={{ marginTop: "8px", fontSize: "11px", color: "#4a4744" }}>
          {lease.page_count > 0 && `${lease.page_count}pp · `}
          {lease.jurisdiction} · {lease.extraction_method}
        </div>
      </div>

      {/* Nav */}
      <nav
        style={{ flex: 1, padding: "12px 0", overflow: "auto" }}
        aria-label="Report sections"
      >
        <div
          style={{
            padding: "0 20px 8px",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#4a4744",
            fontWeight: 500,
          }}
        >
          Analysis
        </div>
        {NAV_ITEMS.map((item) => {
          const active = activePanel === item.id;
          const count =
            item.countKey != null
              ? (overall[item.countKey] as number)
              : null;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 20px",
                background: active ? "#252220" : "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                borderLeft: active
                  ? "2px solid #ebe8e2"
                  : "2px solid transparent",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  e.currentTarget.style.background = "#1a1816";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon
                name={item.icon}
                size={15}
                color={active ? "#ebe8e2" : "#7a7570"}
              />
              <span
                style={{
                  fontSize: "13px",
                  color: active ? "#ebe8e2" : "#7a7570",
                  fontFamily: "'DM Sans', sans-serif",
                  flex: 1,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {item.label}
              </span>
              {count != null && count > 0 && (
                <span
                  style={{
                    fontSize: "11px",
                    padding: "1px 7px",
                    borderRadius: "100px",
                    background: active ? "#3a3532" : "#252220",
                    color: item.color ?? "#7a7570",
                    fontWeight: 500,
                    border: "1px solid #3a3532",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Actions */}
      <div
        style={{
          padding: "12px",
          borderTop: "1px solid #252220",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <button
          onClick={onShare}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            background: "transparent",
            border: "1px solid #3a3532",
            color: "#ebe8e2",
            fontSize: "12px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            width: "100%",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#1a1816")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <Icon name="share" size={14} color="#ebe8e2" />
          Share Report
        </button>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            background: "transparent",
            border: "1px solid #3a3532",
            color: "#7a7570",
            fontSize: "12px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            width: "100%",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#1a1816")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
          onClick={() => window.print()}
        >
          <Icon name="export" size={14} color="#7a7570" />
          Export PDF
        </button>
      </div>
    </div>
  );
}

// ── Report shell ──────────────────────────────────────────────────────────────

function ReportShell({ report, reportId }: { report: Report; reportId: string }) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<PanelId>("overview");
  const [showShare, setShowShare] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);

  const panels: Record<PanelId, React.ReactNode> = {
    overview: (
      <OverviewPanel report={report} onNavigate={setActivePanel} />
    ),
    redflags: <RedFlagsPanel report={report} />,
    clauses: <ClauseExplorerPanel report={report} />,
    negotiation: <NegotiationPanel report={report} onLaunchCopilot={() => setShowCopilot(true)} />,
    missing: <MissingPanel report={report} />,
    contradictions: <ContradictionsPanel report={report} />,
    sources: <SourcesPanel report={report} />,
    trace: <AgentTracePanel report={report} />,
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#f6f3ee",
      }}
    >
      <ReportSidebar
        activePanel={activePanel}
        onNavigate={setActivePanel}
        report={report}
        onShare={() => setShowShare(true)}
      />

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: "52px",
            borderBottom: "1px solid #e8e4dc",
            display: "flex",
            alignItems: "center",
            padding: "0 32px",
            background: "#f6f3ee",
            gap: "16px",
            flexShrink: 0,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <button
            onClick={() => router.push("/")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              color: "#9a9590",
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 4L6 8l4 4"
                stroke="#9a9590"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            New analysis
          </button>
          <span style={{ fontSize: "12px", color: "#ddd8cf" }}>/</span>
          <span
            style={{
              fontSize: "12px",
              color: "#6b6560",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {report.lease.filename}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "11px", color: "#b0aaa4", flexShrink: 0 }}>
            Corpus: {report.overall.corpus_version}
            {report.overall.corpus_date && ` · ${report.overall.corpus_date}`}
          </span>
        </div>

        {/* Panel content */}
        <div
          style={{
            flex: 1,
            padding: "36px 40px 60px",
            maxWidth: "860px",
            width: "100%",
          }}
        >
          {panels[activePanel]}
        </div>
      </div>

      {showShare && (
        <ShareModal
          onClose={() => setShowShare(false)}
          report={report}
        />
      )}

      <NegotiationCopilot
        isOpen={showCopilot}
        onClose={() => setShowCopilot(false)}
        leaseId={reportId}
        negotiationPoints={report.negotiation_points}
        propertyAddress={report.lease.address || "the rental unit"}
      />
    </div>
  );
}

// ── Loading / error states ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f3ee",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "2px solid #e8e4dc",
          borderTopColor: "#181614",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: "13px", color: "#9a9590" }}>
        Loading report…
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f3ee",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        flexDirection: "column",
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
            fontSize: "15px",
            fontWeight: 600,
            color: "#b91c1c",
            marginBottom: "8px",
          }}
        >
          Could not load report
        </div>
        <div style={{ fontSize: "13px", color: "#6b6560" }}>{message}</div>
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={onRetry}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "1px solid #181614",
            background: "#181614",
            color: "#fff",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "1px solid #ddd8cf",
            background: "#fff",
            color: "#181614",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          New analysis
        </button>
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

export default function ReportPage() {
  const params = useParams();
  const reportId = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${reportId}`);
      if (res.status === 404) {
        setError("Report not found. It may have expired or the link is invalid.");
        return;
      }
      if (!res.ok) {
        setError(`Failed to load report (status ${res.status}). Please try again.`);
        return;
      }
      const data = await res.json();

      // Normalise API response → Report shape expected by components
      // The API returns full_report_json spread at top-level.
      // If the response already has a nested `lease` + `overall` shape, use it directly.
      // Otherwise build the shape from the flat response.
      const normalised = normaliseApiResponse(data, reportId);
      setReport(normalised);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (reportId) loadReport();
  }, [reportId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={loadReport} />;
  if (!report) return null;

  return <ReportShell report={report} reportId={reportId} />;
}

// ── API response normaliser ───────────────────────────────────────────────────
// The API may return data in the nested lg-data.js shape OR a flat shape from
// the DB row. This function coerces either into the Report interface.

// ── Field-name helpers ────────────────────────────────────────────────────────

function mapMissingSeverity(s: string): "critical" | "important" | "minor" {
  if (s === "critical") return "critical";
  if (s === "high" || s === "important") return "important";
  return "minor";
}

function normaliseApiResponse(data: Record<string, unknown>, id: string): Report {
  // Already in the nested lg-data.js shape (has `lease` + `overall` sub-objects)
  if (
    data.lease &&
    typeof data.lease === "object" &&
    data.overall &&
    typeof data.overall === "object"
  ) {
    return data as unknown as Report;
  }

  // ── Clauses — from DB rows fetched by the report API ──────────────────────
  const rawClauses = (data._clauses as Array<Record<string, unknown>>) ?? [];
  const clauses: Report["clauses"] = rawClauses
    .filter((c) => !String(c.clause_number ?? "").startsWith("synthetic"))
    .map((c) => ({
    id: c.id as string,
    number: (c.clause_number as string) ?? "",
    heading: (c.heading as string) ?? "",
    primary_type: (c.primary_type as string) ?? "unknown",
    raw_text: (c.raw_text as string) ?? "",
    risk_score: (c.risk_score as number) ?? 0,
    risk_level: (c.risk_level as Report["clauses"][0]["risk_level"]) ?? "low",
    is_potentially_unenforceable: (c.is_potentially_unenforceable as boolean) ?? false,
    is_unusual: (c.is_unusual as boolean) ?? false,
    is_standard: (c.is_standard as boolean) ?? false,
    plain_english_explanation: (c.plain_english_explanation as string) ?? "",
    risk_reasoning: (c.risk_reasoning as string) ?? "",
    statutory_violations:
      (c.statutory_violations as Report["clauses"][0]["statutory_violations"]) ?? [],
    has_negotiation_point: (c.has_negotiation_point as boolean) ?? false,
  }));

  // ── Negotiation points — add synthetic id + clause_label ─────────────────
  const rawNeg = (data.negotiation_points as Array<Record<string, unknown>>) ?? [];
  const negotiation_points: Report["negotiation_points"] = rawNeg.map((n, i) => ({
    id: (n.clause_id as string) ?? `neg-${i}`,
    clause_id: (n.clause_id as string) ?? "",
    clause_label: n.clause_type
      ? (n.clause_type as string).replace(/_/g, " ")
      : `Clause ${i + 1}`,
    priority: (n.priority as Report["negotiation_points"][0]["priority"]) ?? "medium",
    negotiable: (n.negotiable as boolean) ?? true,
    walk_away_threshold: (n.walk_away_threshold as boolean) ?? false,
    ask: (n.ask as string) ?? "",
    counter_language: (n.counter_language as string) ?? "",
    legal_argument: (n.legal_argument as string) ?? "",
    landlord_likely_response: (n.landlord_likely_response as string) ?? "",
    your_rebuttal: (n.your_rebuttal as string) ?? "",
  }));

  // ── Missing protections — map generate_report field names → UI shape ──────
  const rawMissing = (data.missing_protections as Array<Record<string, unknown>>) ?? [];
  const missing_protections: Report["missing_protections"] = rawMissing.map((m, i) => ({
    id: `missing-${i}`,
    protection_name:
      ((m.clause_type as string) ?? (m.protection_name as string) ?? "missing protection")
        .replace(/_/g, " "),
    rta_section: (m.statute_section as string) ?? (m.rta_section as string) ?? "",
    severity: mapMissingSeverity((m.severity as string) ?? "low"),
    explanation: (m.description as string) ?? (m.explanation as string) ?? "",
    risk_if_missing: (m.risk_if_missing as string) ?? "",
    suggested_addition:
      (m.suggested_addition as string) ??
      `Include a clause addressing ${((m.clause_type as string) ?? "this protection").replace(/_/g, " ")}.`,
  }));

  // ── Contradictions — add synthetic id + labels ────────────────────────────
  const rawContradictions = (data.contradictions as Array<Record<string, unknown>>) ?? [];
  const contradictions: Report["contradictions"] = rawContradictions.map((c, i) => ({
    id: `contra-${i}`,
    clause_a_id: (c.clause_a_id as string) ?? "",
    clause_b_id: (c.clause_b_id as string) ?? "",
    clause_a_label:
      (c.clause_a_id as string)?.replace(/-/g, " ").slice(0, 20) ?? `Clause A`,
    clause_b_label:
      (c.clause_b_id as string)?.replace(/-/g, " ").slice(0, 20) ?? `Clause B`,
    contradiction_type: (c.contradiction_type as string) ?? "direct_conflict",
    severity: (c.severity as Report["contradictions"][0]["severity"]) ?? "medium",
    explanation: (c.explanation as string) ?? "",
    which_governs: (c.which_governs as string) ?? "",
    legal_basis: (c.legal_basis as string) ?? "",
  }));

  // ── Sources — parse reference string → Source shape ───────────────────────
  const rawSources = (data.sources as Array<Record<string, unknown>>) ?? [];
  const sources: Report["sources"] = rawSources.map((s, i) => {
    const ref = (s.reference as string) ?? "";
    // e.g. "Residential Tenancies Act, 2006 s.22 — Quiet enjoyment"
    const sectionMatch = ref.match(/s\.(\S+)\s*[—–-]\s*(.+)/);
    return {
      id: `source-${i}`,
      act_name: ref.split(/\ss\.\d/)[0]?.trim() ?? ref,
      section_number: sectionMatch?.[1] ?? "",
      section_title: sectionMatch?.[2]?.trim() ?? ref,
      full_text: (s.full_text as string) ?? "",
      url: (s.url as string) ?? "",
      relevance_score: 0,
      corpus_version: (data.corpus_version as string) ?? "",
      relevant_clauses: [],
    };
  });

  // ── Lease — from DB lease row ─────────────────────────────────────────────
  const leaseRow = (data._lease as Record<string, unknown>) ?? {};
  const filePath = (leaseRow.file_path as string) ?? "";
  const filename = filePath.split("/").pop() ?? "lease.pdf";

  // Build display address: prefer extracted property_address; fall back to filename stub
  const propertyAddress = (leaseRow.property_address as string) ?? "";
  const propertyUnit    = (leaseRow.property_unit    as string) ?? "";
  const propertyCity    = (leaseRow.property_city    as string) ?? "";

  const displayAddress = propertyAddress
    ? (propertyUnit ? `${propertyUnit} – ${propertyAddress}` : propertyAddress)
    : "Rental Unit";

  const displayCity = propertyCity
    || (data.jurisdiction as string)
    || (leaseRow.jurisdiction as string)
    || "";

  const lease: Report["lease"] = {
    id,
    address: displayAddress,
    city: displayCity,
    landlord: "",
    term: "",
    monthly_rent: "",
    uploaded_at: (leaseRow.uploaded_at as string) ?? "",
    page_count: (leaseRow.page_count as number) ?? 0,
    extraction_method: (leaseRow.extraction_method as string) ?? "text",
    jurisdiction: (data.jurisdiction as string) ?? (leaseRow.jurisdiction as string) ?? "Ontario",
    filename,
  };

  const overall: Report["overall"] = {
    risk_score: (data.overall_risk_score as number) ?? 0,
    risk_level:
      (data.overall_risk_level as Report["overall"]["risk_level"]) ?? "low",
    executive_summary: (data.executive_summary as string) ?? "",
    clause_count:
      clauses.length || (data.total_clauses_analyzed as number) || 0,
    red_flag_count: ((data.red_flags as unknown[]) ?? []).length,
    contradiction_count: contradictions.length,
    missing_count: missing_protections.length,
    negotiation_count: negotiation_points.length,
    corpus_version: (data.corpus_version as string) ?? "RTA-2024-Q4",
    corpus_date: "",
    analysis_time_s: 0,
  };

  return {
    lease,
    overall,
    clauses,
    contradictions,
    missing_protections,
    negotiation_points,
    sources,
    agent_trace: ((data._tool_call_logs as unknown[]) ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        sequence: r.sequence_num as number,
        tool_name: r.tool_name as string,
        called_at: (r.called_at as string) ?? "",
        duration_ms: (r.duration_ms as number) ?? 0,
        success: (r.success as boolean) ?? true,
        input_summary: (r.input_summary as Record<string, unknown>) ?? {},
        output_summary: (r.output_summary as Record<string, unknown>) ?? {},
      };
    }),
    expires_at: data.expires_at as string | undefined,
    share_url: data.share_url as string | null | undefined,
    disclaimer: data.disclaimer as string | undefined,
  };
}
