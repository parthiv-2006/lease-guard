"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROCESSING_STEPS } from "./processing-steps";

export interface TopFinding {
  citation: string;
  text: string;
}

export interface LeaseCardData {
  id: string;
  status: "pending" | "processing" | "complete" | "failed";
  uploaded_at: string;
  overall_risk_score: number | null;
  overall_risk_level: "low" | "medium" | "high" | "critical" | null;
  title: string;
  subtitle: string;
  error_message: string | null;
  topFinding: TopFinding | null;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#9c2b23",
  high: "#a15a1f",
  medium: "#93690f",
  low: "#2f6b3a",
};

type Filter = "all" | "critical" | "high" | "medium" | "low";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

const listStyles = `
  .lg-card { transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease; }
  .lg-card:hover { border-color: #17140f; box-shadow: 0 12px 28px rgba(23,20,15,0.10); transform: translateY(-2px); }
  .lg-card:hover .lg-peek { max-height: 110px; opacity: 1; }
  .lg-peek { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.28s ease, opacity 0.28s ease; }
  .lg-chip:not(:disabled):hover { border-color: #17140f; color: #17140f; }
  .lg-focus:focus-visible { outline: 2px solid #9c2b23; outline-offset: 2px; }
`;

export function DashboardList({ rows }: { rows: LeaseCardData[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of rows) {
      if (r.status === "complete" && r.overall_risk_level) c[r.overall_risk_level]++;
    }
    return c;
  }, [rows]);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.overall_risk_level === filter);

  if (rows.length === 0) {
    return (
      <EmptyState
        heading="Your docket is empty."
        body="Upload a lease and you will have a clause-by-clause report, cited to the Act, in about ninety seconds."
        cta="Analyse your first lease"
        ctaHref="/"
      />
    );
  }

  return (
    <div>
      <style>{listStyles}</style>

      {/* Filter chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {(["all", "critical", "high", "medium", "low"] as Filter[]).map((f) => {
          const n = counts[f];
          const active = filter === f;
          const disabled = f !== "all" && n === 0;
          return (
            <button
              key={f}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setFilter(f)}
              className="lg-chip lg-focus"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "9px 15px",
                border: active ? "1px solid #151209" : disabled ? "1px solid #e8e2d2" : "1px solid #cfc6ab",
                background: active ? "#151209" : "transparent",
                color: active ? "#f4efe4" : disabled ? "#c2bba6" : "#4a4438",
                cursor: disabled ? "default" : "pointer",
              }}
            >
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} {n}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6f6857" }}>
          Showing {filtered.length} of {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          heading="Nothing at this severity."
          body="No lease on file scored in this band. Clear the filter to see everything."
          cta="Show all analyses"
          onCta={() => setFilter("all")}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((lease) => (
            <LeaseCard
              key={lease.id}
              lease={lease}
              menuOpen={openMenuId === lease.id}
              onToggleMenu={() => setOpenMenuId(openMenuId === lease.id ? null : lease.id)}
              onCloseMenu={() => setOpenMenuId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  heading,
  body,
  cta,
  ctaHref,
  onCta,
}: {
  heading: string;
  body: string;
  cta: string;
  ctaHref?: string;
  onCta?: () => void;
}) {
  const button = (
    <button
      type="button"
      onClick={onCta}
      className="lg-focus"
      style={{
        display: "inline-block",
        padding: "14px 26px",
        border: "1px solid #17140f",
        background: "#151209",
        color: "#f4efe4",
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'Public Sans', sans-serif",
        textDecoration: "none",
      }}
    >
      {cta}
    </button>
  );
  return (
    <div style={{ border: "1.5px dashed #cfc6ab", padding: "64px 36px", textAlign: "center" }}>
      <style>{listStyles}</style>
      <h2 style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 26, margin: "0 0 10px" }}>
        {heading}
      </h2>
      <p style={{ fontSize: 15, color: "#4a4438", margin: "0 auto 26px", lineHeight: 1.6, maxWidth: 390 }}>{body}</p>
      {ctaHref ? <Link href={ctaHref} className="lg-focus" style={{ display: "inline-block", padding: "14px 26px", border: "1px solid #17140f", background: "#151209", color: "#f4efe4", fontSize: 15, fontWeight: 600, textDecoration: "none", fontFamily: "'Public Sans', sans-serif" }}>{cta}</Link> : button}
    </div>
  );
}

function LeaseCard({
  lease,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
}: {
  lease: LeaseCardData;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}) {
  const router = useRouter();
  const isComplete = lease.status === "complete";
  const isFailed = lease.status === "failed";
  const isProcessing = lease.status === "pending" || lease.status === "processing";
  const color = lease.overall_risk_level ? SEVERITY_COLOR[lease.overall_risk_level] : "#cfc6ab";
  const accent = isProcessing ? "#1f3a52" : isFailed ? "#9c2b23" : color;

  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onCloseMenu();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, onCloseMenu]);

  const href = isComplete ? `/report/${lease.id}` : isProcessing ? `/?leaseId=${lease.id}` : null;

  return (
    <div
      ref={cardRef}
      className="lg-card"
      style={{
        position: "relative",
        zIndex: menuOpen ? 30 : "auto",
        display: "flex",
        background: "#fffdfa",
        border: "1px solid #e0d9c6",
        borderLeft: `4px solid ${accent}`,
      }}
    >
      {/* Score rail */}
      <div
        style={{
          flexShrink: 0,
          width: "clamp(84px,10vw,108px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid #f0ebdf",
          padding: "16px 8px",
        }}
      >
        {isComplete ? (
          <>
            <span style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 700, fontSize: 42, lineHeight: 1, color }}>
              {lease.overall_risk_score?.toFixed(1) ?? "–"}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, textTransform: "uppercase", color, marginTop: 4 }}>
              {lease.overall_risk_level ?? "—"}
            </span>
          </>
        ) : isFailed ? (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: "uppercase", color: "#9c2b23" }}>Failed</span>
        ) : (
          <TickBars />
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {lease.title}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8a8272", flexShrink: 0 }}>
            {formatDate(lease.uploaded_at)}
          </span>
        </div>
        <div style={{ fontSize: 14, color: isFailed ? "#9c2b23" : isProcessing ? "#1f3a52" : "#6f6857", marginTop: 3 }}>
          {isFailed ? (lease.error_message ?? "Analysis failed") : isProcessing ? "Analysing…" : lease.subtitle}
        </div>

        {isProcessing && <LiveTrace leaseId={lease.id} />}

        {isComplete && lease.topFinding && (
          <div className="lg-peek">
            <div style={{ borderTop: "1px solid #f0ebdf", marginTop: 12, paddingTop: 12 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color, marginRight: 8 }}>
                {lease.topFinding.citation}
              </span>
              <span style={{ fontSize: 14, color: "#4a4438" }}>{lease.topFinding.text}</span>
            </div>
          </div>
        )}
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "20px 22px 20px 8px", flexShrink: 0 }}>
        {href && (
          <Link
            href={href}
            className="lg-focus"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: isFailed ? "#9c2b23" : isProcessing ? "#1f3a52" : "#17140f",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {isProcessing ? "Watch live →" : "View report →"}
          </Link>
        )}
        {isFailed && (
          <Link href="/" className="lg-focus" style={{ fontSize: 13, fontWeight: 500, color: "#9c2b23", textDecoration: "none", whiteSpace: "nowrap" }}>
            Retry →
          </Link>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          title="More actions"
          className="lg-focus"
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 15,
            color: "#b5ac98",
            background: "transparent",
            border: "1px solid transparent",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#17140f"; e.currentTarget.style.borderColor = "#e0d9c6"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#b5ac98"; e.currentTarget.style.borderColor = "transparent"; }}
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <RowMenu lease={lease} onClose={onCloseMenu} onDeleted={() => router.refresh()} onRenamed={() => router.refresh()} />
      )}
    </div>
  );
}

function TickBars() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 22 }}>
        {[14, 22, 10, 18].map((h, i) => (
          <div
            key={i}
            style={{
              width: 4,
              height: h,
              background: "#1f3a52",
              animation: `lg-pulse 1.1s ease-in-out infinite`,
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, textTransform: "uppercase", color: "#1f3a52" }}>Working</span>
    </div>
  );
}

function LiveTrace({ leaseId }: { leaseId: string }) {
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("Connecting…");

  useEffect(() => {
    const es = new EventSource(`/api/stream/${leaseId}`);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string; message: string; step?: number };
        if (event.type === "log") {
          setMessage(event.message);
          if (event.step !== undefined) setStep(event.step);
        }
      } catch { /* ignore malformed event */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [leaseId]);

  const n = Math.min(step + 1, PROCESSING_STEPS.length);

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid #f0ebdf", paddingTop: 10 }}>
      <div style={{ fontSize: 12 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", color: "#1f3a52" }}>
          Step {n} / {PROCESSING_STEPS.length}
        </span>{" "}
        <span style={{ color: "#4a4438" }}>{message}</span>
      </div>
      <div style={{ marginTop: 6, height: 3, background: "#e6eef3" }}>
        <div style={{ height: "100%", width: `${Math.round((n / PROCESSING_STEPS.length) * 100)}%`, background: "#1f3a52", transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function RowMenu({
  lease,
  onClose,
  onDeleted,
  onRenamed,
}: {
  lease: LeaseCardData;
  onClose: () => void;
  onDeleted: () => void;
  onRenamed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(lease.title);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    try {
      const res = await fetch(`/api/report/${lease.id}`);
      const data = await res.json();
      if (res.ok && data.pdf_url) {
        window.open(data.pdf_url, "_blank", "noopener,noreferrer");
        onClose();
      } else {
        setError("Could not get the PDF link.");
        setBusy(false);
      }
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  async function handleRename() {
    setBusy(true);
    try {
      const res = await fetch(`/api/report/${lease.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_title: title }),
      });
      if (res.ok) {
        onRenamed();
        onClose();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? "Could not rename.");
        setBusy(false);
      }
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/report/${lease.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        onDeleted();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? "Could not delete.");
        setBusy(false);
      }
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        right: 16,
        top: "calc(100% - 14px)",
        zIndex: 20,
        minWidth: 210,
        background: "#fffdfa",
        border: "1px solid #17140f",
        boxShadow: "0 14px 30px rgba(23,20,15,0.16)",
        padding: 6,
      }}
    >
      {renaming ? (
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
            style={{ fontSize: 13, padding: "6px 8px", border: "1px solid #cfc6ab", fontFamily: "'Public Sans', sans-serif" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={handleRename}
              disabled={busy}
              style={{ flex: 1, fontSize: 12, padding: "6px 0", border: "1px solid #17140f", background: "#151209", color: "#f4efe4", cursor: "pointer" }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              style={{ flex: 1, fontSize: 12, padding: "6px 0", border: "1px solid #cfc6ab", background: "transparent", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <MenuItem label="Download PDF" onClick={handleDownload} disabled={busy} />
          <MenuItem label="Rename" onClick={() => setRenaming(true)} disabled={busy} />
          <div style={{ borderTop: "1px solid #f0ebdf", marginTop: 4, paddingTop: 4 }}>
            {armed ? (
              <MenuItem label="Confirm delete" danger onClick={handleDelete} disabled={busy} />
            ) : (
              <MenuItem label="Delete analysis" danger onClick={() => setArmed(true)} disabled={busy} />
            )}
          </div>
          {error && <div style={{ padding: "6px 10px", fontSize: 11, color: "#9c2b23" }}>{error}</div>}
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        fontSize: 13,
        border: "none",
        background: "transparent",
        color: danger ? "#9c2b23" : "#17140f",
        cursor: disabled ? "wait" : "pointer",
        fontFamily: "'Public Sans', sans-serif",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "#fbeceb" : "#f7f4ee"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}
