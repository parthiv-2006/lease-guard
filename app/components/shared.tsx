"use client";

// LeaseGuard — Shared UI components (v2 "case-file" editorial system)
// RiskArc, RiskBadge, ClauseTypeTag, SectionHeader, CopyButton,
// FeedbackBar, Icon, StatCard, Collapsible

import { useState, useCallback, useEffect } from "react";
import type { RiskLevel } from "./types";

// ── Risk colour utilities ─────────────────────────────────────────────────────

export function riskColor(level: RiskLevel | string): string {
  const map: Record<string, string> = {
    critical: "#9c2b23",
    high: "#a15a1f",
    medium: "#93690f",
    low: "#2f6b3a",
  };
  return map[level] ?? "#6f6857";
}

export function riskBg(level: RiskLevel | string): string {
  const map: Record<string, string> = {
    critical: "#f4d9d6",
    high: "#f3e2c9",
    medium: "#f3ecd3",
    low: "#e3efe0",
  };
  return map[level] ?? "#f0ebdf";
}

export function riskBorder(level: RiskLevel | string): string {
  const map: Record<string, string> = {
    critical: "#e3b0a8",
    high: "#e3cd8f",
    medium: "#dfd0a0",
    low: "#b8d4bb",
  };
  return map[level] ?? "#e0d9c6";
}

export function scoreToLevel(score: number): RiskLevel {
  if (score >= 8) return "critical";
  if (score >= 6) return "high";
  if (score >= 4) return "medium";
  return "low";
}

export const CLAUSE_TYPE_LABELS: Record<string, string> = {
  rent_payment: "Rent Payment",
  rent_increase: "Rent Increase",
  security_deposit: "Security Deposit",
  entry_rights: "Entry Rights",
  maintenance_repairs: "Maintenance",
  subletting_assignment: "Subletting",
  early_termination: "Early Termination",
  renewal_terms: "Renewal",
  utilities: "Utilities",
  pets: "Pets",
  alterations: "Alterations",
  quiet_enjoyment: "Quiet Enjoyment",
  liability_indemnification: "Liability",
  dispute_resolution: "Dispute Resolution",
  parking_storage: "Parking",
  guest_policy: "Guest Policy",
  standard_boilerplate: "Boilerplate",
  unknown: "General",
};

// ── SVG Arc Gauge ─────────────────────────────────────────────────────────────

interface RiskArcProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export function RiskArc({ score, size = 140, strokeWidth = 9 }: RiskArcProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // Short delay so the arc animates in after mount
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [score]);

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  function polar(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x: +(cx + r * Math.cos(rad)).toFixed(3),
      y: +(cy + r * Math.sin(rad)).toFixed(3),
    };
  }

  function arcPath(
    startDeg: number,
    endDeg: number,
    large: number,
    sweep: number
  ) {
    const s = polar(startDeg);
    const e = polar(endDeg);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
  }

  const trackPath = arcPath(225, 135, 1, 1);
  const fillSweep = (score / 10) * 270;
  const fillEnd = 225 + fillSweep;
  const fillLarge = fillSweep > 180 ? 1 : 0;
  const fillPath = score > 0 ? arcPath(225, fillEnd, fillLarge, 1) : null;
  const col = riskColor(scoreToLevel(score));
  const level = scoreToLevel(score);
  const levelLabel = { critical: "Critical", high: "High", medium: "Medium", low: "Low" }[level];

  // Arc length for the fill stroke — used for the dasharray animation
  const fillArcLen = Math.ceil((fillSweep / 360) * 2 * Math.PI * r) + 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
    >
      <path
        d={trackPath}
        fill="none"
        stroke="#e0d9c6"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {fillPath && (
        <path
          d={fillPath}
          fill="none"
          stroke={col}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={fillArcLen}
          style={{
            strokeDashoffset: animated ? 0 : fillArcLen,
            transition: "stroke-dashoffset 0.9s cubic-bezier(0.34, 1.0, 0.64, 1)",
            filter: `drop-shadow(0 0 8px ${col}50)`,
          }}
        />
      )}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={col}
        fontSize={size * 0.26}
        fontFamily="'Newsreader', serif"
        fontStyle="italic"
        fontWeight="600"
        style={{
          opacity: animated ? 1 : 0,
          transition: "opacity 0.4s ease 0.5s",
        }}
      >
        {score.toFixed(1)}
      </text>
      <text
        x={cx}
        y={cy + size * 0.18}
        textAnchor="middle"
        fill="#6f6857"
        fontSize={size * 0.09}
        fontFamily="'IBM Plex Mono', monospace"
        letterSpacing="0.08em"
        style={{
          opacity: animated ? 1 : 0,
          transition: "opacity 0.3s ease 0.7s",
        }}
      >
        {levelLabel?.toUpperCase()}
      </text>
    </svg>
  );
}

// ── Risk Badge ────────────────────────────────────────────────────────────────

interface RiskBadgeProps {
  level: RiskLevel | string;
  score?: number;
  small?: boolean;
}

export function RiskBadge({ level, score, small }: RiskBadgeProps) {
  const col = riskColor(level);
  const bg = riskBg(level);
  const border = riskBorder(level);
  const label =
    { critical: "Critical", high: "High", medium: "Medium", low: "Low" }[
      level
    ] ?? level;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: small ? "2px 8px" : "3px 10px",
        background: bg,
        border: `1px solid ${border}`,
        fontSize: small ? "10px" : "11px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 500,
        textTransform: "uppercase",
        color: col,
        whiteSpace: "nowrap",
        letterSpacing: "0.06em",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: col,
          flexShrink: 0,
        }}
      />
      {score !== undefined ? `${score.toFixed(1)} — ` : ""}
      {label}
    </span>
  );
}

// ── Clause type tag ───────────────────────────────────────────────────────────

export function ClauseTypeTag({ type }: { type: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        background: "#f0ebdf",
        border: "1px solid #cfc6ab",
        fontSize: "10px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 500,
        color: "#4a4438",
        letterSpacing: "0.05em",
      }}
    >
      {CLAUSE_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  action?: React.ReactNode;
  accentColor?: string;
}

export function SectionHeader({
  title,
  subtitle,
  count,
  action,
  accentColor,
}: SectionHeaderProps) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "10px" }}
        >
          {accentColor && (
            <span
              style={{
                width: 3,
                height: 22,
                background: accentColor,
                flexShrink: 0,
                alignSelf: "center",
              }}
            />
          )}
          <h2
            style={{
              margin: 0,
              fontSize: "30px",
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              color: "#17140f",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h2>
          {count !== undefined && (
            <span
              style={{
                fontSize: "12px",
                fontFamily: "'IBM Plex Mono', monospace",
                color: "#a8a08c",
                fontWeight: 400,
              }}
            >
              {count} item{count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {action}
      </div>
      {subtitle && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "13px",
            color: "#6f6857",
            fontFamily: "'Public Sans', sans-serif",
            lineHeight: 1.5,
            paddingLeft: accentColor ? "13px" : 0,
          }}
        >
          {subtitle}
        </p>
      )}
      <div
        style={{
          height: accentColor ? "2px" : "1px",
          background: accentColor ?? "#e0d9c6",
          marginTop: "16px",
          opacity: accentColor ? 0.4 : 1,
        }}
      />
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const doCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [text]);

  return (
    <button
      onClick={doCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "5px 12px",
        cursor: "pointer",
        fontSize: "11px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 500,
        background: copied ? "#e3efe0" : "#f7f4ee",
        border: `1px solid ${copied ? "#b8d4bb" : "#cfc6ab"}`,
        color: copied ? "#2f6b3a" : "#4a4438",
        transition: "all 0.15s",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 8l3.5 3.5L13 4.5"
            stroke="#2f6b3a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="9" height="9" rx="1" stroke="#6f6857" strokeWidth="1.5" />
          <path
            d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5"
            stroke="#6f6857"
            strokeWidth="1.5"
          />
        </svg>
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

// ── Feedback bar ──────────────────────────────────────────────────────────────

export function FeedbackBar({ leaseId, clauseId }: { leaseId: string; clauseId: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [reasonSelected, setReasonSelected] = useState<string | null>(null);

  function handleVote(v: "up" | "down") {
    setVote(v);
    if (v === "up") {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lease_id: leaseId,
          accurate: true,
          comment: `Clause: ${clauseId}`,
        }),
      }).catch(() => {});
    }
  }

  function handleReasonSelect(reason: string) {
    setReasonSelected(reason);
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lease_id: leaseId,
        accurate: false,
        comment: `Clause: ${clauseId} | Reason: ${reason}`,
      }),
    }).catch(() => {});
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 0 0",
        borderTop: "1px solid #e0d9c6",
        marginTop: "12px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          color: "#a8a08c",
          fontFamily: "'Public Sans', sans-serif",
        }}
      >
        Was this analysis accurate?
      </span>
      {(
        [
          { v: "up" as const, label: "Yes" },
          { v: "down" as const, label: "No" },
        ] as const
      ).map(({ v, label }) => (
        <button
          key={v}
          onClick={() => handleVote(v)}
          style={{
            padding: "3px 10px",
            cursor: "pointer",
            fontSize: "11px",
            fontFamily: "'Public Sans', sans-serif",
            fontWeight: 500,
            background:
              vote === v
                ? v === "up"
                  ? "#e3efe0"
                  : "#f4d9d6"
                : "transparent",
            border: `1px solid ${
              vote === v
                ? v === "up"
                  ? "#b8d4bb"
                  : "#e3b0a8"
                : "#cfc6ab"
            }`,
            color:
              vote === v
                ? v === "up"
                  ? "#2f6b3a"
                  : "#9c2b23"
                : "#4a4438",
            transition: "all 0.15s",
          }}
        >
          {label}
        </button>
      ))}

      {vote === "down" && !reasonSelected && (
        <select
          onChange={(e) => handleReasonSelect(e.target.value)}
          style={{
            padding: "3px 8px",
            border: "1px solid #cfc6ab",
            fontSize: "11px",
            fontFamily: "'Public Sans', sans-serif",
            background: "#fffdfa",
            color: "#4a4438",
            cursor: "pointer",
          }}
          defaultValue=""
        >
          <option value="" disabled>Select reason...</option>
          <option value="Clause is actually compliant">Clause is actually compliant</option>
          <option value="Wrong statute cited">Wrong statute cited</option>
          <option value="Missing context">Missing context</option>
          <option value="Other">Other</option>
        </select>
      )}

      {(vote === "up" || (vote === "down" && reasonSelected)) && (
        <span
          style={{
            fontSize: "11px",
            color: "#2f6b3a",
            fontFamily: "'Public Sans', sans-serif",
            fontWeight: 500,
          }}
        >
          Thank you for your feedback!
        </span>
      )}
    </div>
  );
}

// ── Icon ──────────────────────────────────────────────────────────────────────

const ICON_PATHS: Record<string, React.ReactNode> = {
  overview: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  flag: (
    <path
      d="M4 3v13M4 3h9l-2 4.5L15 12H4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  clauses: (
    <path d="M4 6h8M4 10h6M4 14h4" strokeLinecap="round" />
  ),
  negotiate: (
    <path
      d="M8 2L14 8M14 8L8 14M14 8H2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  shield: (
    <path d="M8 2l5 2.5v4C13 11.5 10.5 14 8 15 5.5 14 3 11.5 3 8.5v-4L8 2z" />
  ),
  conflict: (
    <path
      d="M8 4v4M8 12v.5M4 2l8 12M12 2L4 14"
      strokeLinecap="round"
    />
  ),
  source: (
    <path
      d="M4 4h8v2H4zM4 8h6M4 11h8M14 6v8H2V2h8"
      strokeLinecap="round"
    />
  ),
  trace: (
    <>
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="12" cy="8" r="1.5" />
      <path
        d="M5.5 4.5L10.5 7.5M5.5 11.5L10.5 8.5"
        strokeLinecap="round"
      />
    </>
  ),
  share: (
    <>
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <path
        d="M10.5 4.8L5.5 7.2M5.5 8.8L10.5 11.2"
        strokeLinecap="round"
      />
    </>
  ),
  export: (
    <path
      d="M8 3v8M5 8l3 3 3-3M3 13h10"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  chevronRight: (
    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  chevronDown: (
    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  external: (
    <path
      d="M7 3H3v10h10V9M9 3h4v4M13 3L7 9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  check: (
    <path
      d="M3 8l3.5 3.5L13 4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  close: (
    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
  ),
  link: (
    <path
      d="M7 9a3 3 0 004.5.4l1.5-1.5A3 3 0 009 3.5L7.5 5M9 7a3 3 0 00-4.5-.4L3 8a3 3 0 004.5 4.5L9 11"
      strokeLinecap="round"
    />
  ),
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      style={{ flexShrink: 0 }}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  value: string | number;
  label: string;
  color?: string;
  onClick?: () => void;
}

export function StatCard({ value, label, color, onClick }: StatCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fffdfa",
        border: `1px solid ${hovered ? "#17140f" : "#e0d9c6"}`,
        padding: "16px 20px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.12s ease",
        boxShadow: hovered ? "0 8px 20px rgba(23,20,15,0.10)" : "none",
        transform: hovered && onClick ? "translateY(-1px)" : "translateY(0)",
      }}
    >
      <div
        style={{
          fontSize: "30px",
          fontFamily: "'Newsreader', serif",
          fontStyle: "italic",
          fontWeight: 600,
          color: color ?? "#17140f",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "11px",
          fontFamily: "'IBM Plex Mono', monospace",
          color: "#a8a08c",
          marginTop: "6px",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Collapsible ───────────────────────────────────────────────────────────────

interface CollapsibleProps {
  header: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
}

export function Collapsible({
  header,
  children,
  defaultOpen = false,
  accentColor,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        border: "1px solid #e0d9c6",
        overflow: "hidden",
        borderLeft: accentColor ? `3px solid ${accentColor}` : "1px solid #e0d9c6",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          background: open ? "#f7f4ee" : "#fffdfa",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: "12px",
          borderBottom: open ? "1px solid #e0d9c6" : "none",
          transition: "background 0.15s",
        }}
      >
        {header}
        <span
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            flexShrink: 0,
          }}
        >
          <Icon name="chevronDown" size={14} color="#a8a08c" />
        </span>
      </button>
      {open && <div style={{ padding: "18px" }}>{children}</div>}
    </div>
  );
}
