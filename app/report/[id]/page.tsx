"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon, RiskBadge } from "../../components/shared";
import { AuthButton } from "../../components/auth-button";
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
import { PDFViewer } from "../../components/pdf-viewer";
import { exportReportPDF } from "../../../lib/pdf-export";
import { LeaseChat } from "../../components/lease-chat";
import { ReportSidebar, useSidebarCollapsedState } from "../../components/sidebar";

// â”€â”€ Share Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const [hideAddress, setHideAddress] = useState(false);
  const [hideAddressSynced, setHideAddressSynced] = useState(false);

  // Always POSTs â€” the server reuses the existing token and only updates
  // hide_address, so this is safe to call again after the link already exists
  // (e.g. when the checkbox is toggled post-generation).
  async function mintOrUpdateShareLink(hide: boolean) {
    setGenerating(true);
    try {
      const res = await fetch(`/api/report/${report.lease.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share", hide_address: hide }),
      });
      const data = await res.json();
      const url = data.share_url ?? `${window.location.origin}/report/${report.lease.id}`;
      setShareUrl(url);
      setHideAddressSynced(true);
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
    const needsSync = !shareUrl || !hideAddressSynced;
    const urlPromise = needsSync ? mintOrUpdateShareLink(hideAddress) : Promise.resolve(shareUrl!);
    urlPromise.then((url) => {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function onToggleHideAddress(checked: boolean) {
    setHideAddress(checked);
    setHideAddressSynced(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fffdfa",
          borderRadius: "0",
          padding: "0",
          width: "540px",
          maxWidth: "94vw",
          border: "1px solid #e0d9c6",
          boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
          overflow: "hidden",
        }}
      >
        {/* OG image preview */}
        <div style={{ position: "relative", background: "#151209" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/report/${report.lease.id}/opengraph-image`}
            alt="Report preview"
            style={{ width: "100%", display: "block", aspectRatio: "1200/630", objectFit: "cover" }}
          />
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: "absolute",
              bottom: "12px",
              right: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(246,243,238,0.95)",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: "0",
              padding: "7px 14px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#17140f",
              textDecoration: "none",
              backdropFilter: "blur(4px)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
            }}
          >
            View full report â†’
          </a>
        </div>

        {/* Modal body */}
        <div style={{ padding: "24px 24px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "17px",
                fontFamily: "'Newsreader', serif",
                fontStyle: "italic",
                fontWeight: 600,
                color: "#17140f",
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
              <Icon name="close" size={16} color="#a8a08c" />
            </button>
          </div>

          <div
            style={{
              padding: "10px 14px",
              background: "#f7f4ee",
              border: "1px solid #e0d9c6",
              borderRadius: "0",
              marginBottom: "10px",
              display: "flex",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: "12px",
                fontFamily: "'IBM Plex Mono', monospace",
                color: "#4a4438",
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
                borderRadius: "0",
                cursor: generating ? "wait" : "pointer",
                fontSize: "12px",
                fontWeight: 500,
                flexShrink: 0,
                background: copied ? "#e3efe0" : "#17140f",
                border: `1px solid ${copied ? "#b8d4bb" : "#17140f"}`,
                color: copied ? "#2f6b3a" : "#fffdfa",
                transition: "all 0.15s",
              }}
            >
              {generating ? "â€¦" : copied ? "Copied!" : "Copy link"}
            </button>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              marginBottom: "10px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={hideAddress}
              onChange={(e) => onToggleHideAddress(e.target.checked)}
              style={{ marginTop: "2px", width: "14px", height: "14px", accentColor: "#9c2b23", cursor: "pointer" }}
            />
            <span style={{ fontSize: "12px", color: "#4a4438", lineHeight: 1.5 }}>
              Hide the unit address from anyone with this link
              {hideAddress && !hideAddressSynced && (
                <span style={{ color: "#8a4a17" }}> â€” click Copy link to save this</span>
              )}
            </span>
          </label>

          <div
            style={{
              padding: "10px 12px",
              background: "#f7f4ee",
              border: "1px solid #e0d9c6",
              borderRadius: "0",
              fontSize: "11px",
              color: "#a8a08c",
              lineHeight: 1.5,
            }}
          >
            Anyone with this link can view your report for 90 days. No personal information is shared.
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Export preview modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// A confirmation step before generating the PDF. exportReportPDF always
// includes the same fixed sections (cover, high/medium-risk clauses, missing
// protections, contradictions) â€” there's no partial-section export today, so
// this lists what's included rather than offering toggles that don't exist.

function ExportPreviewModal({
  report,
  onClose,
  onConfirm,
}: {
  report: Report;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const highRiskCount = report.clauses.filter((c) => c.risk_level === "critical" || c.risk_level === "high").length;
  const medRiskCount = report.clauses.filter((c) => c.risk_level === "medium").length;

  const sections = [
    "Cover page â€” property, risk score, executive summary",
    `Clause analysis â€” ${highRiskCount + medRiskCount} clause${highRiskCount + medRiskCount !== 1 ? "s" : ""} (high/medium risk)`,
    `Missing protections â€” ${report.missing_protections.length}`,
    `Contradictions â€” ${report.contradictions.length}`,
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fffdfa",
          width: "460px",
          maxWidth: "94vw",
          border: "1px solid #17140f",
          boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
          padding: "24px 24px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "17px",
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              color: "#17140f",
            }}
          >
            Export PDF
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex" }}
          >
            <Icon name="close" size={16} color="#a8a08c" />
          </button>
        </div>

        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#a8a08c",
            marginBottom: "10px",
          }}
        >
          Included in this export
        </div>
        <div style={{ border: "1px solid #e0d9c6", marginBottom: "18px" }}>
          {sections.map((s, i) => (
            <div
              key={s}
              style={{
                padding: "10px 14px",
                fontSize: "13px",
                color: "#4a4438",
                borderTop: i > 0 ? "1px solid #e0d9c6" : "none",
              }}
            >
              {s}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "1px solid #17140f",
              background: "#151209",
              color: "#f4efe4",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Download PDF
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "10px 18px",
              border: "1px solid #cfc6ab",
              background: "transparent",
              color: "#4a4438",
              fontSize: "13px",
              cursor: "pointer",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Report shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReportShell({ report, reportId }: { report: Report; reportId: string }) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<PanelId>("overview");
  const [showShare, setShowShare] = useState(false);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const [splitScreen, setSplitScreen] = useState(false);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [pdfWidthPct, setPdfWidthPct] = useState(48);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsedState();
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-widen PDF pane so the grounding drawer (340px) doesn't overlap the PDF canvas.
  useEffect(() => {
    if (activeClauseId && splitScreen) {
      setPdfWidthPct((p) => Math.max(p, 58));
    }
  }, [activeClauseId, splitScreen]);

  const onClauseActivate = (id: string) => setActiveClauseId(id);

  const panels: Record<PanelId, React.ReactNode> = {
    overview: (
      <OverviewPanel report={report} onNavigate={setActivePanel} />
    ),
    redflags: <RedFlagsPanel report={report} onClauseActivate={onClauseActivate} />,
    clauses: <ClauseExplorerPanel report={report} onClauseActivate={onClauseActivate} />,
    negotiation: <NegotiationPanel report={report} onLaunchCopilot={() => setShowCopilot(true)} onClauseActivate={onClauseActivate} />,
    missing: <MissingPanel report={report} />,
    contradictions: <ContradictionsPanel report={report} onClauseActivate={onClauseActivate} />,
    sources: <SourcesPanel report={report} onClauseActivate={onClauseActivate} />,
    trace: <AgentTracePanel report={report} />,
  };

  function handleDividerDrag(e: React.MouseEvent) {
    e.preventDefault();
    const main = mainRef.current;
    if (!main) return;
    const startX = e.clientX;
    const startPct = pdfWidthPct;
    const mainW = main.offsetWidth;

    function onMove(ev: MouseEvent) {
      const delta = ((ev.clientX - startX) / mainW) * 100;
      setPdfWidthPct(Math.max(25, Math.min(70, startPct + delta)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#f7f4ee",
      }}
    >
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 99,
          }}
        />
      )}

      <ReportSidebar
        activePanel={activePanel}
        onNavigate={setActivePanel}
        report={report}
        onShare={() => setShowShare(true)}
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onExportClick={() => setShowExportPreview(true)}
        shortcutsDisabled={showShare || showExportPreview || showCopilot}
      />

      {/* Right column */}
      <div
        ref={mainRef}
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: "52px",
            borderBottom: "1px solid #e0d9c6",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            background: "#f7f4ee",
            gap: "14px",
            flexShrink: 0,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          {isMobile && (
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                background: "none",
                border: "1px solid #e0d9c6",
                borderRadius: "0",
                cursor: "pointer",
                padding: "5px 10px",
                fontSize: "12px",
                color: "#17140f",
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="#17140f" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Menu
            </button>
          )}
          <Link
            href="/dashboard"
            style={{
              fontSize: "12px",
              color: "#a8a08c",
              textDecoration: "none",
              flexShrink: 0,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "#17140f")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "#a8a08c")
            }
          >
            Dashboard
          </Link>
          <span style={{ fontSize: "12px", color: "#cfc6ab" }}>Â·</span>
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
              color: "#a8a08c",
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 4L6 8l4 4"
                stroke="#a8a08c"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            New analysis
          </button>
          <span style={{ fontSize: "12px", color: "#cfc6ab" }}>/</span>
          <span
            style={{
              fontSize: "12px",
              color: "#6f6857",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {report.lease.filename}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "11px", color: "#a8a08c", flexShrink: 0 }}>
            Corpus: {report.overall.corpus_version}
            {report.overall.corpus_date && ` Â· ${report.overall.corpus_date}`}
          </span>

          {/* Split-view toggle */}
          <button
            onClick={() => setSplitScreen((s) => !s)}
            title={splitScreen ? "Close PDF view" : "View lease PDF alongside report"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "0",
              cursor: "pointer",
              fontSize: "11px",
              fontFamily: "'Public Sans', sans-serif",
              fontWeight: 500,
              background: splitScreen ? "#17140f" : "transparent",
              border: `1px solid ${splitScreen ? "#17140f" : "#cfc6ab"}`,
              color: splitScreen ? "#fffdfa" : "#6f6857",
              transition: "all 0.15s",
              letterSpacing: "0.02em",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!splitScreen) {
                e.currentTarget.style.borderColor = "#a8a08c";
                e.currentTarget.style.color = "#17140f";
              }
            }}
            onMouseLeave={(e) => {
              if (!splitScreen) {
                e.currentTarget.style.borderColor = "#cfc6ab";
                e.currentTarget.style.color = "#6f6857";
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke={splitScreen ? "#fffdfa" : "#6f6857"}
              strokeWidth="1.5"
            >
              <rect x="1" y="2" width="5.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="5.5" height="12" rx="1" />
            </svg>
            {splitScreen ? "Close PDF" : "View PDF"}
          </button>

          <AuthButton />
        </div>

        {/* Content area â€” split or normal */}
        {splitScreen ? (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* PDF pane */}
            <div
              style={{
                flexShrink: 0,
                width: `${pdfWidthPct}%`,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <PDFViewer
                clauses={report.clauses}
                activeClauseId={activeClauseId}
                pdfUrl={report.lease.pdf_url}
                filename={report.lease.filename}
                leaseId={reportId}
                sources={report.sources}
                onCloseActiveClause={() => setActiveClauseId(null)}
              />
            </div>

            {/* Drag handle */}
            <div
              onMouseDown={handleDividerDrag}
              style={{
                width: "5px",
                flexShrink: 0,
                cursor: "ew-resize",
                background: "transparent",
                transition: "background 0.15s",
                zIndex: 5,
                position: "relative",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#cfc6ab")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {/* Grip dots */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                  pointerEvents: "none",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: "50%",
                      background: "#cfc6ab",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Panels pane */}
            <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
              {/* Active clause callout strip */}
              {activeClauseId && (() => {
                const c = report.clauses.find((cl) => cl.id === activeClauseId);
                return c ? (
                  <div
                    style={{
                      padding: "7px 24px",
                      background: "#eef3f6",
                      borderBottom: "1px solid #c7d9e6",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="#1f3a52"
                      strokeWidth="1.5"
                    >
                      <rect x="1" y="2" width="5.5" height="12" rx="1" />
                      <rect x="9.5" y="2" width="5.5" height="12" rx="1" />
                    </svg>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#1f3a52",
                        fontFamily: "'Public Sans', sans-serif",
                      }}
                    >
                      Clause {c.number}: {c.heading} highlighted in PDF
                    </span>
                    <button
                      onClick={() => setActiveClauseId(null)}
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#a8a08c",
                        fontSize: "11px",
                        fontFamily: "'Public Sans', sans-serif",
                        padding: "0 2px",
                      }}
                    >
                      âœ•
                    </button>
                  </div>
                ) : null;
              })()}
              <div style={{ padding: "28px 28px 60px" }}>
                {panels[activePanel]}
              </div>
            </div>
          </div>
        ) : (
          /* Normal single-column layout */
          <div style={{ flex: 1, overflow: "auto" }}>
            <div
              style={{
                padding: "36px 40px 60px",
                maxWidth: "1400px",
                width: "100%",
                margin: "0 auto",
              }}
            >
              {panels[activePanel]}
            </div>
          </div>
        )}

        {/* Slim privacy footer â€” inside the right column so it sits at the bottom */}
        <footer
          style={{
            padding: "10px 24px",
            borderTop: "1px solid #e0d9c6",
            fontSize: "11px",
            color: "#a8a08c",
            textAlign: "center",
            flexShrink: 0,
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
            background: "#f7f4ee",
          }}
        >
          <span>Educational information only â€” not legal advice.</span>
          <span style={{ color: "#cfc6ab" }}>Â·</span>
          <Link
            href="/privacy"
            style={{ color: "#a8a08c", textDecoration: "underline" }}
          >
            Privacy Policy
          </Link>
        </footer>
      </div>

      {showShare && (
        <ShareModal
          onClose={() => setShowShare(false)}
          report={report}
        />
      )}

      {showExportPreview && (
        <ExportPreviewModal
          report={report}
          onClose={() => setShowExportPreview(false)}
          onConfirm={() => {
            exportReportPDF(report);
            setShowExportPreview(false);
          }}
        />
      )}

      <NegotiationCopilot
        isOpen={showCopilot}
        onClose={() => setShowCopilot(false)}
        leaseId={reportId}
        negotiationPoints={report.negotiation_points}
        propertyAddress={report.lease.address || "the rental unit"}
      />

      <LeaseChat leaseId={reportId} report={report} />
    </div>
  );
}

// â”€â”€ Loading / error states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function LoadingState() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#f7f4ee",
        fontFamily: "'Public Sans', sans-serif",
      }}
    >
      {/* Sidebar skeleton */}
      <div
        style={{
          width: "256px",
          minWidth: "256px",
          background: "#151209",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          borderRight: "1px solid #1c1811",
          padding: "20px",
          gap: "16px",
        }}
      >
        {/* Brand */}
        <div style={{ width: "100px", height: "18px", background: "#1c1811", borderRadius: "0", marginBottom: "8px" }} />
        {/* Address lines */}
        <div style={{ width: "80%", height: "14px", background: "#1c1811", borderRadius: "0" }} />
        <div style={{ width: "50%", height: "12px", background: "#1c1811", borderRadius: "0" }} />
        {/* Risk badge */}
        <div style={{ width: "90px", height: "24px", background: "#1c1811", borderRadius: "0" }} />
        <div style={{ height: "1px", background: "#1c1811", margin: "4px 0" }} />
        {/* Nav items */}
        {[90, 70, 80, 75, 65, 55, 60, 50].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: 15, height: 15, background: "#1c1811", borderRadius: "0", flexShrink: 0 }} />
            <div style={{ width: `${w}%`, height: "12px", background: "#1c1811", borderRadius: "0" }} />
          </div>
        ))}
      </div>

      {/* Main area skeleton */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top bar skeleton */}
        <div
          style={{
            height: "52px",
            borderBottom: "1px solid #e0d9c6",
            background: "#f7f4ee",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            gap: "12px",
          }}
        >
          <div className="skeleton" style={{ width: "70px", height: "12px" }} />
          <div style={{ width: "1px", height: "16px", background: "#e0d9c6" }} />
          <div className="skeleton" style={{ width: "90px", height: "12px" }} />
          <div style={{ flex: 1 }} />
          <div className="skeleton" style={{ width: "80px", height: "28px", borderRadius: "0" }} />
        </div>

        {/* Content skeleton */}
        <div style={{ flex: 1, padding: "36px 40px", maxWidth: "1400px", width: "100%", margin: "0 auto" }}>
          {/* Panel header */}
          <div className="skeleton" style={{ width: "160px", height: "28px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ width: "340px", height: "13px", marginBottom: "28px" }} />
          <div style={{ height: "1px", background: "#e0d9c6", marginBottom: "28px" }} />

          {/* Overview arc placeholder */}
          <div style={{ display: "flex", gap: "32px", marginBottom: "36px" }}>
            <div className="skeleton" style={{ width: "140px", height: "140px", borderRadius: "50%" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", justifyContent: "center" }}>
              <div className="skeleton" style={{ width: "90%", height: "13px" }} />
              <div className="skeleton" style={{ width: "80%", height: "13px" }} />
              <div className="skeleton" style={{ width: "70%", height: "13px" }} />
              <div className="skeleton" style={{ width: "85%", height: "13px" }} />
            </div>
          </div>

          {/* Stat cards placeholder */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "32px" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: "80px", borderRadius: "0" }} />
            ))}
          </div>

          {/* Card list placeholders */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: "64px", borderRadius: "0", marginBottom: "10px" }}
            />
          ))}
        </div>
      </div>
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
        background: "#f7f4ee",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Public Sans', sans-serif",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          padding: "24px 32px",
          background: "#f4d9d6",
          border: "1px solid #e3b0a8",
          borderRadius: "0",
          maxWidth: "480px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#9c2b23",
            marginBottom: "8px",
          }}
        >
          Could not load report
        </div>
        <div style={{ fontSize: "13px", color: "#6f6857" }}>{message}</div>
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={onRetry}
          style={{
            padding: "10px 20px",
            borderRadius: "0",
            border: "1px solid #17140f",
            background: "#17140f",
            color: "#fffdfa",
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
            borderRadius: "0",
            border: "1px solid #cfc6ab",
            background: "#fffdfa",
            color: "#17140f",
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

// â”€â”€ Page component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      // Normalise API response â†’ Report shape expected by components
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

// â”€â”€ API response normaliser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The API may return data in the nested lg-data.js shape OR a flat shape from
// the DB row. This function coerces either into the Report interface.

// â”€â”€ Field-name helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** "rent payment" â†’ "Rent Payment" */
function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map RTA section number â†’ compliant language template.
 *  Used as a fallback when the DB column is null (pre-migration data).
 *  Keyed by the most specific section substring to avoid false matches. */
const SECTION_TO_COMPLIANT: Record<string, string> = {
  "s.26": "The Landlord may enter the rental unit only in accordance with sections 26 and 27 of the Residential Tenancies Act, 2006. The Landlord shall provide at least 24 hours' written notice specifying the reason for entry and the time of entry (between 8:00 a.m. and 8:00 p.m.). Entry without notice is permitted only in the case of an emergency as defined in s.26(3) of the Act.",
  "s.27": "The Landlord may enter the rental unit only in accordance with sections 26 and 27 of the Residential Tenancies Act, 2006. The Landlord shall provide at least 24 hours' written notice specifying the reason for entry and the time of entry (between 8:00 a.m. and 8:00 p.m.). Entry without notice is permitted only in the case of an emergency as defined in s.26(3) of the Act.",
  "s.105": "The Tenant shall provide a last month's rent deposit equal to one month's rent, as permitted by section 105 of the Residential Tenancies Act, 2006. No additional security deposit, damage deposit, or non-refundable deposit of any kind may be collected.",
  "s.106": "The Tenant shall pay a last month's rent deposit equal to one month's rent, applied to the final period of the tenancy, in accordance with section 106 of the Residential Tenancies Act, 2006. This deposit is refundable and shall be returned with accrued interest if not applied to the last rent period.",
  "s.14": "Note: Any provision restricting pets is void under section 14 of the Residential Tenancies Act, 2006, and no fine, fee, or penalty may be imposed for keeping a pet, nor may a tenancy be terminated solely on the basis of having a pet.",
  "s.20": "The Landlord shall maintain the rental unit and residential complex in a good state of repair and fit for habitation, and shall comply with all applicable health, safety, housing, and maintenance standards, as required by section 20 of the Residential Tenancies Act, 2006. The Tenant is responsible for ordinary cleanliness of the rental unit only.",
  "s.120": "The Landlord may increase the rent only once per 12-month period and only in accordance with the annual rent increase guideline established by the Province of Ontario under section 120 of the Residential Tenancies Act, 2006. The Landlord shall provide at least 90 days' written notice using the prescribed Form N1 before any increase takes effect.",
  "s.116": "The Landlord may increase the rent only once per 12-month period and only in accordance with the annual rent increase guideline established by the Province of Ontario under section 116 of the Residential Tenancies Act, 2006. The Landlord shall provide at least 90 days' written notice using the prescribed Form N1 before any increase takes effect.",
  "s.108": "Rent shall be paid on the first day of each month. Post-dated cheques and pre-authorized payment are not required. The Tenant may pay by any mutually agreed lawful method. Pre-authorized debit or cheques may be provided voluntarily but cannot be demanded as a condition of the tenancy, in accordance with section 108 of the Residential Tenancies Act, 2006.",
  "s.59": "Rent is due on the first day of each month. If rent is not paid when due, the Landlord's remedy is to serve a Notice to End a Tenancy Early for Non-payment of Rent (Form N4) in accordance with section 59 of the Residential Tenancies Act, 2006. No additional charges, daily fees, interest, or penalties for late payment may be imposed.",
  "s.134": "Rent is due on the first day of each month. If rent is not paid when due, the Landlord's remedy is to serve a Notice to End a Tenancy Early for Non-payment of Rent (Form N4) in accordance with section 59 of the Residential Tenancies Act, 2006. No additional charges, daily fees, interest, or penalties for late payment may be imposed.",
  "s.19": "A tenancy may only be terminated in accordance with the Residential Tenancies Act, 2006. The Landlord shall not change the locks, seize belongings, or otherwise interfere with the Tenant's access to the rental unit. Eviction may only be carried out by a Sheriff acting on a valid order of the Landlord and Tenant Board, as required by section 19 of the Act.",
  "s.44": "Either party may terminate this tenancy only in accordance with the Residential Tenancies Act, 2006. Termination notices must be in writing on a prescribed LTB form. The Landlord shall provide at least 60 days' written notice for most terminations. Verbal notice and notice periods shorter than the statutory minimum are void and of no effect.",
  "s.3": "This agreement is governed by the Residential Tenancies Act, 2006. No provision of this agreement limits the rights or remedies of either party under that Act. Any term that purports to contract out of or limit the Act's protections is void, pursuant to section 3(1) of the Residential Tenancies Act, 2006.",
};

/** Derive compliant language from statutory violations when DB column is absent.
 *  Tries each violation's section number in specificity order (longer section first). */
function deriveCompliantLanguage(
  violations: Array<{ statute_section?: string; violation_description?: string }>
): string | undefined {
  for (const v of violations) {
    if (!v.statute_section) continue;
    const section = v.statute_section.toLowerCase();
    // Try longest (most specific) key match first
    const key = Object.keys(SECTION_TO_COMPLIANT)
      .sort((a, b) => b.length - a.length)
      .find((k) => section.includes(k.toLowerCase()));
    if (key) return SECTION_TO_COMPLIANT[key];
  }
  return undefined;
}

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

  // â”€â”€ Clauses â€” from DB rows fetched by the report API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    grounding_confidence: (c.analysis_confidence as number) ?? undefined,
    suggested_compliant_language:
      (c.suggested_compliant_language as string) ||
      deriveCompliantLanguage(
        (c.statutory_violations as Array<{ statute_section?: string; violation_description?: string }>) ?? []
      ),
  }));

  // â”€â”€ Negotiation points â€” add synthetic id + clause_label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rawNeg = (data.negotiation_points as Array<Record<string, unknown>>) ?? [];
  const negotiation_points: Report["negotiation_points"] = rawNeg.map((n, i) => ({
    id: (n.clause_id as string) ?? `neg-${i}`,
    clause_id: (n.clause_id as string) ?? "",
    clause_label: n.clause_type
      ? toTitleCase((n.clause_type as string).replace(/_/g, " "))
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

  // â”€â”€ Missing protections â€” map generate_report field names â†’ UI shape â”€â”€â”€â”€â”€â”€
  const rawMissing = (data.missing_protections as Array<Record<string, unknown>>) ?? [];
  const missing_protections: Report["missing_protections"] = rawMissing.map((m, i) => ({
    id: `missing-${i}`,
    protection_name: toTitleCase(
      ((m.clause_type as string) ?? (m.protection_name as string) ?? "missing protection")
        .replace(/_/g, " ")
    ),
    rta_section: (m.statute_section as string) ?? (m.rta_section as string) ?? "",
    severity: mapMissingSeverity((m.severity as string) ?? "low"),
    explanation: (m.description as string) ?? (m.explanation as string) ?? "",
    risk_if_missing: (m.risk_if_missing as string) ?? "",
    suggested_addition:
      (m.suggested_addition as string) ??
      `Include a clause addressing ${((m.clause_type as string) ?? "this protection").replace(/_/g, " ")}.`,
  }));

  // â”€â”€ Contradictions â€” add synthetic id + labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rawContradictions = (data.contradictions as Array<Record<string, unknown>>) ?? [];
  const contradictions: Report["contradictions"] = rawContradictions.map((c, i) => {
    // Try DB UUID lookup first (new analyses store db_clause_id).
    // For older analyses that stored the internal pipeline id, fall back to
    // a label derived from contradiction_type (e.g. "entry_vs_quiet_enjoyment"
    // â†’ "Entry Rights" / "Quiet Enjoyment") rather than a garbled UUID.
    const foundA = clauses.find((cl) => cl.id === (c.clause_a_id as string));
    const foundB = clauses.find((cl) => cl.id === (c.clause_b_id as string));
    const ctType = (c.contradiction_type as string) ?? "";
    const [typeA, typeB] = ctType.includes("_vs_")
      ? ctType.split("_vs_").map((t: string) =>
          t.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
        )
      : ["Clause A", "Clause B"];
    return {
      id: `contra-${i}`,
      clause_a_id: (c.clause_a_id as string) ?? "",
      clause_b_id: (c.clause_b_id as string) ?? "",
      clause_a_label: foundA ? (foundA.heading || `Clause ${foundA.number}`) : typeA,
      clause_b_label: foundB ? (foundB.heading || `Clause ${foundB.number}`) : typeB,
      contradiction_type: ctType || "direct_conflict",
      severity: (c.severity as Report["contradictions"][0]["severity"]) ?? "medium",
      explanation: (c.explanation as string) ?? "",
      which_governs: (c.which_governs as string) ?? "",
      legal_basis: (c.legal_basis as string) ?? "",
    };
  });

  // â”€â”€ Sources â€” parse reference string â†’ Source shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rawSources = (data.sources as Array<Record<string, unknown>>) ?? [];
  const sources: Report["sources"] = rawSources.map((s, i) => {
    const ref = (s.reference as string) ?? "";
    // e.g. "Residential Tenancies Act, 2006 s.22 â€” Quiet enjoyment"
    const sectionMatch = ref.match(/s\.(\S+)\s*[â€”â€“-]\s*(.+)/);
    const sectionNum = sectionMatch?.[1] ?? "";

    // Dynamically match sources to clauses based on RTA section numbers and text references
    const rawRelevant = (s.relevant_clauses as string[]) ?? (s.relevantClauses as string[]) ?? [];
    const resolvedClauses = clauses
      .filter((c) => {
        // Match by section number in statutory violations
        const cleanSectionNum = sectionNum.toLowerCase().trim();
        const matchesViolation = cleanSectionNum && c.statutory_violations?.some((v) => {
          const vSec = String(v.statute_section ?? "").toLowerCase().replace(/\s+/g, "");
          return vSec.includes(`s.${cleanSectionNum}`) || vSec.includes(`section${cleanSectionNum}`);
        });

        // Match by citation references in plain English explanations or risk reasoning
        const explanationText = `${c.plain_english_explanation} ${c.risk_reasoning}`.toLowerCase();
        const matchesText = cleanSectionNum && (
          explanationText.includes(`s. ${cleanSectionNum}`) ||
          explanationText.includes(`s.${cleanSectionNum}`) ||
          explanationText.includes(`section ${cleanSectionNum}`)
        );

        return matchesViolation || matchesText;
      })
      .map((c) => c.id);

    const relevant_clauses = [...new Set([...rawRelevant, ...resolvedClauses])];

    return {
      id: `source-${i}`,
      act_name: ref.split(/\ss\.\d/)[0]?.trim() ?? ref,
      section_number: sectionNum,
      section_title: sectionMatch?.[2]?.trim() ?? ref,
      full_text: (s.full_text as string) ?? "",
      url: (s.url as string) ?? "",
      relevance_score: typeof s.relevance_score === "number" ? s.relevance_score : 0,
      corpus_version: (data.corpus_version as string) ?? "",
      relevant_clauses,
    };
  });

  // â”€â”€ Lease â€” from DB lease row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const leaseRow = (data._lease as Record<string, unknown>) ?? {};
  const filePath = (leaseRow.file_path as string) ?? "";
  const filename = filePath.split("/").pop() ?? "lease.pdf";

  // Build display address: prefer extracted property_address; fall back to filename stub
  const propertyAddress = (leaseRow.property_address as string) ?? "";
  const propertyUnit    = (leaseRow.property_unit    as string) ?? "";
  const propertyCity    = (leaseRow.property_city    as string) ?? "";

  const displayAddress = propertyAddress
    ? (propertyUnit ? `${propertyUnit} â€“ ${propertyAddress}` : propertyAddress)
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
    pdf_url: (data.pdf_url as string) ?? null,
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
