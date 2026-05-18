// LeaseGuard — Report Page (sidebar + shell + share modal)

const { useState } = React;

const NAV_ITEMS = [
  { id: "overview",       label: "Overview",            icon: "overview" },
  { id: "redflags",       label: "Red Flags",           icon: "flag",    countKey: "red_flag_count",     color: "#c2410c" },
  { id: "clauses",        label: "Clause Explorer",     icon: "clauses" },
  { id: "negotiation",    label: "Negotiation Guide",   icon: "negotiate", countKey: "negotiation_count" },
  { id: "missing",        label: "Missing Protections", icon: "shield",  countKey: "missing_count",      color: "#b45309" },
  { id: "contradictions", label: "Contradictions",      icon: "conflict", countKey: "contradiction_count" },
  { id: "sources",        label: "Sources",             icon: "source" },
  { id: "trace",          label: "Agent Trace",         icon: "trace" },
];

// ── Share modal ──────────────────────────────────────────────────────────────
function ShareModal({ onClose, leaseId }) {
  const [copied, setCopied] = useState(false);
  const url = `https://leaseguard.app/report/${leaseId}`;

  function copy() {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(2px)",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "10px", padding: "28px",
        width: "440px", maxWidth: "90vw",
        border: "1px solid #e8e4dc",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h3 style={{
            margin: 0, fontSize: "18px", fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600, color: "#181614",
          }}>Share this report</h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer", padding: "4px",
            color: "#9a9590", display: "flex",
          }}>
            <Icon name="close" size={16} color="#9a9590" />
          </button>
        </div>

        <div style={{
          padding: "12px 16px", background: "#f6f3ee",
          border: "1px solid #e8e4dc", borderRadius: "7px", marginBottom: "14px",
          display: "flex", gap: "10px", alignItems: "center",
        }}>
          <span style={{
            flex: 1, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace",
            color: "#5c5751", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{url}</span>
          <button onClick={copy} style={{
            padding: "5px 14px", borderRadius: "5px", cursor: "pointer",
            fontSize: "12px", fontWeight: 500, flexShrink: 0,
            background: copied ? "#f0fdf4" : "#181614",
            border: `1px solid ${copied ? "#bbf7d0" : "#181614"}`,
            color: copied ? "#15803d" : "#fff", transition: "all 0.15s",
          }}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        <div style={{
          padding: "12px 14px", background: "#fff7ed",
          border: "1px solid #fed7aa", borderRadius: "7px",
          fontSize: "12px", color: "#6b6560", lineHeight: 1.5,
        }}>
          Anyone with this link can view your report for 90 days.
          The report does not include your uploaded PDF.
          No personal information is shared.
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function ReportSidebar({ activePanel, onNavigate, report, onShare }) {
  const { lease, overall } = report;

  return (
    <div style={{
      width: "256px", minWidth: "256px", background: "#131110",
      display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0, overflow: "auto",
      borderRight: "1px solid #252220",
    }}>
      {/* Brand */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #252220" }}>
        <div style={{
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
          fontSize: "17px", color: "#ebe8e2", letterSpacing: "0.02em",
        }}>LeaseGuard</div>
      </div>

      {/* Lease info */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #252220" }}>
        <div style={{ fontSize: "13px", fontWeight: 500, color: "#ebe8e2", lineHeight: 1.4, marginBottom: "2px" }}>
          {lease.address}
        </div>
        <div style={{ fontSize: "12px", color: "#7a7570", lineHeight: 1.4, marginBottom: "10px" }}>
          {lease.city}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <RiskBadge level={overall.risk_level} score={overall.risk_score} small />
        </div>
        <div style={{ marginTop: "8px", fontSize: "11px", color: "#4a4744" }}>
          {lease.page_count}pp · {lease.jurisdiction} · {lease.extraction_method}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 0", overflow: "auto" }}>
        <div style={{
          padding: "0 20px 8px",
          fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase",
          color: "#4a4744", fontWeight: 500,
        }}>Analysis</div>
        {NAV_ITEMS.map(item => {
          const active = activePanel === item.id;
          const count = item.countKey ? overall[item.countKey] : null;
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 20px", background: active ? "#252220" : "transparent",
              border: "none", cursor: "pointer", textAlign: "left",
              borderLeft: active ? "2px solid #ebe8e2" : "2px solid transparent",
              transition: "all 0.12s",
            }}
              onMouseEnter={e => !active && (e.currentTarget.style.background = "#1a1816")}
              onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}>
              <Icon name={item.icon} size={15}
                color={active ? "#ebe8e2" : "#7a7570"} />
              <span style={{
                fontSize: "13px", color: active ? "#ebe8e2" : "#7a7570",
                fontFamily: "'DM Sans', sans-serif", flex: 1, fontWeight: active ? 500 : 400,
              }}>
                {item.label}
              </span>
              {count > 0 && (
                <span style={{
                  fontSize: "11px", padding: "1px 7px", borderRadius: "100px",
                  background: active ? "#3a3532" : "#252220",
                  color: item.color || "#7a7570", fontWeight: 500,
                  border: "1px solid #3a3532",
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Actions */}
      <div style={{ padding: "12px", borderTop: "1px solid #252220", display: "flex", flexDirection: "column", gap: "6px" }}>
        <button onClick={onShare} style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 12px", borderRadius: "6px", cursor: "pointer",
          background: "transparent", border: "1px solid #3a3532",
          color: "#ebe8e2", fontSize: "12px", fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500, width: "100%", justifyContent: "center",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#1a1816"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <Icon name="share" size={14} color="#ebe8e2" />
          Share Report
        </button>
        <button style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 12px", borderRadius: "6px", cursor: "pointer",
          background: "transparent", border: "1px solid #3a3532",
          color: "#7a7570", fontSize: "12px", fontFamily: "'DM Sans', sans-serif",
          fontWeight: 400, width: "100%", justifyContent: "center",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#1a1816"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <Icon name="export" size={14} color="#7a7570" />
          Export PDF
        </button>
      </div>
    </div>
  );
}

// ── Report Page ──────────────────────────────────────────────────────────────
function ReportPage({ report, onBack }) {
  const [activePanel, setActivePanel] = useState("overview");
  const [showShare, setShowShare] = useState(false);

  const panels = {
    overview:       <OverviewPanel report={report} onNavigate={setActivePanel} />,
    redflags:       <RedFlagsPanel report={report} />,
    clauses:        <ClauseExplorerPanel report={report} />,
    negotiation:    <NegotiationPanel report={report} />,
    missing:        <MissingPanel report={report} />,
    contradictions: <ContradictionsPanel report={report} />,
    sources:        <SourcesPanel report={report} />,
    trace:          <AgentTracePanel report={report} />,
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#f6f3ee" }}>
      <ReportSidebar
        activePanel={activePanel}
        onNavigate={setActivePanel}
        report={report}
        onShare={() => setShowShare(true)}
      />

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{
          height: "52px", borderBottom: "1px solid #e8e4dc",
          display: "flex", alignItems: "center", padding: "0 32px",
          background: "#f6f3ee", gap: "16px", flexShrink: 0,
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <button onClick={onBack} style={{
            display: "flex", alignItems: "center", gap: "5px",
            background: "none", border: "none", cursor: "pointer",
            fontSize: "12px", color: "#9a9590", padding: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8l4 4" stroke="#9a9590" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            New analysis
          </button>
          <span style={{ fontSize: "12px", color: "#ddd8cf" }}>/</span>
          <span style={{ fontSize: "12px", color: "#6b6560" }}>{report.lease.filename}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "11px", color: "#b0aaa4" }}>
            Corpus: {report.overall.corpus_version} · {report.overall.corpus_date}
          </span>
        </div>

        {/* Panel content */}
        <div style={{ flex: 1, padding: "36px 40px 60px", maxWidth: "860px", width: "100%" }}>
          {panels[activePanel]}
        </div>
      </div>

      {showShare && (
        <ShareModal onClose={() => setShowShare(false)} leaseId={report.lease.id} />
      )}
    </div>
  );
}

window.ReportPage = ReportPage;
window.ShareModal = ShareModal;
