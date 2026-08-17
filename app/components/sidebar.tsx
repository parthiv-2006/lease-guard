"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./shared";
import { exportReportPDF } from "../../lib/pdf-export";
import type { Report, PanelId } from "./types";

// ── Nav config ────────────────────────────────────────────────────────────────
// Grouped by function rather than a flat list: Findings (what's wrong),
// Guidance (what to do about it), Reference (raw material). Overview stands
// alone above the groups since it's the default landing section.

interface NavItem {
  id: PanelId;
  label: string;
  icon: string;
  countKey?: keyof Report["overall"];
  color?: string;
}

interface NavGroup {
  id: string;
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "primary",
    label: null,
    items: [{ id: "overview", label: "Overview", icon: "overview" }],
  },
  {
    id: "findings",
    label: "Findings",
    items: [
      { id: "redflags", label: "Red Flags", icon: "flag", countKey: "red_flag_count", color: "#a15a1f" },
      { id: "contradictions", label: "Contradictions", icon: "conflict", countKey: "contradiction_count", color: "#a85a80" },
      { id: "missing", label: "Missing Protections", icon: "shield", countKey: "missing_count", color: "#93690f" },
    ],
  },
  {
    id: "guidance",
    label: "Guidance",
    items: [
      { id: "negotiation", label: "Negotiation Guide", icon: "negotiate", countKey: "negotiation_count", color: "#5b84ad" },
      { id: "sources", label: "Sources", icon: "source" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    items: [
      { id: "clauses", label: "Clause Explorer", icon: "clauses" },
      { id: "trace", label: "Agent Trace", icon: "trace" },
    ],
  },
];

const FLAT_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// ── Collapse persistence ─────────────────────────────────────────────────────

const COLLAPSE_STORAGE_KEY = "leaseguard.sidebar.collapsed";

export function useSidebarCollapsedState(): [boolean, (updater: boolean | ((c: boolean) => boolean)) => void] {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1") {
        setCollapsedState(true);
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — fall back to expanded
    }
  }, []);

  const setCollapsed = useCallback((updater: boolean | ((c: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof updater === "function" ? (updater as (c: boolean) => boolean)(prev) : updater;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return [collapsed, setCollapsed];
}

// ── Palette ───────────────────────────────────────────────────────────────────
// Local to this file: the sidebar's near-black surface uses its own contrast
// scale, distinct from the cream panel surfaces the rest of the report uses.

const C = {
  bg: "#151209",
  border: "#1c1811",
  chip: "#1c1811",
  chipBorder: "#2a251c",
  cream: "#e9e4d5",
  parchment: "#cfc6ab",
  muted: "#a8a08c",
  faint: "#6f6857",
};

function riskAccentFor(level: string) {
  return level === "critical" ? "#c65950"
    : level === "high" ? "#c17f42"
    : level === "medium" ? "#c99a2e"
    : "#7ec98f";
}

// ── Risk gauge ────────────────────────────────────────────────────────────────
// A 270° arc gauge tuned for the sidebar's dark surface (RiskArc in shared.tsx
// uses a light-panel palette — its cream track color and dark saturated fills
// are tuned for the cream report background, not this near-black one).

function RiskGauge({
  score,
  level,
  size = 148,
  strokeWidth = 10,
  showLabel = true,
}: {
  score: number;
  level: string;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [score]);

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  function polar(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: +(cx + r * Math.cos(rad)).toFixed(3), y: +(cy + r * Math.sin(rad)).toFixed(3) };
  }

  function arcPath(startDeg: number, endDeg: number, large: number, sweep: number) {
    const s = polar(startDeg);
    const e = polar(endDeg);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
  }

  const trackPath = arcPath(225, 135, 1, 1);
  const clampedScore = Math.max(0, Math.min(10, score));
  const fillSweep = (clampedScore / 10) * 270;
  const fillEnd = 225 + fillSweep;
  const fillLarge = fillSweep > 180 ? 1 : 0;
  const fillPath = clampedScore > 0 ? arcPath(225, fillEnd, fillLarge, 1) : null;
  const col = riskAccentFor(level);
  const fillArcLen = Math.ceil((fillSweep / 360) * 2 * Math.PI * r) + 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <path d={trackPath} fill="none" stroke={C.border} strokeWidth={strokeWidth} strokeLinecap="round" />
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
            filter: `drop-shadow(0 0 8px ${col}66)`,
          }}
        />
      )}
      <text
        x={cx}
        y={cy - (showLabel ? 4 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={col}
        fontSize={size * 0.26}
        fontFamily="'Newsreader', serif"
        fontStyle="italic"
        fontWeight="700"
        style={{ opacity: animated ? 1 : 0, transition: "opacity 0.4s ease 0.5s" }}
      >
        {score.toFixed(1)}
      </text>
      {showLabel && (
        <text
          x={cx}
          y={cy + size * 0.19}
          textAnchor="middle"
          fill={C.muted}
          fontSize={size * 0.075}
          fontFamily="'Public Sans', sans-serif"
          fontWeight="700"
          letterSpacing="0.12em"
          style={{ opacity: animated ? 1 : 0, transition: "opacity 0.3s ease 0.7s" }}
        >
          {level.toUpperCase()}
        </text>
      )}
    </svg>
  );
}

// ── Keyboard navigation ───────────────────────────────────────────────────────
// Digit keys 1-8 jump directly to a section (shown as a tooltip hint); arrow
// keys move roving focus within the nav once it has focus. Both are suppressed
// while typing in a field, while a modal is open, or on a closed mobile drawer.

function useNavShortcuts({
  isMobile,
  sidebarOpen,
  disabled,
  onJump,
  onEscape,
}: {
  isMobile?: boolean;
  sidebarOpen?: boolean;
  disabled?: boolean;
  onJump: (index: number) => void;
  onEscape?: () => void;
}) {
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (disabled || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;

      if (e.key === "Escape" && isMobile && sidebarOpen) {
        onEscape?.();
        return;
      }

      if (isMobile && !sidebarOpen) return;

      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= FLAT_NAV_ITEMS.length) {
        e.preventDefault();
        onJump(digit - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, sidebarOpen, disabled, onJump, onEscape]);
}

// ── Nav button ────────────────────────────────────────────────────────────────

function NavButton({
  item,
  shortcutNumber,
  active,
  collapsed,
  count,
  tabIndex,
  buttonRef,
  onNavigate,
}: {
  item: NavItem;
  shortcutNumber: number;
  active: boolean;
  collapsed: boolean;
  count: number | null;
  tabIndex: number;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onNavigate: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const iconColor = active ? C.cream : hovered ? C.parchment : C.faint;
  const textColor = active ? C.cream : hovered ? C.parchment : C.muted;

  return (
    <button
      ref={buttonRef}
      aria-current={active ? "page" : undefined}
      tabIndex={tabIndex}
      onClick={onNavigate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${item.label} (${shortcutNumber})`}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: "9px",
        padding: collapsed ? "11px 0" : "8px 24px",
        background: active ? "rgba(235,232,226,0.06)" : hovered ? "rgba(235,232,226,0.03)" : "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        position: "relative",
        transition: "background 0.12s, color 0.12s",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: "2px",
            height: "18px",
            background: C.cream,
          }}
        />
      )}
      <Icon name={item.icon} size={14} color={iconColor} />
      {!collapsed && (
        <span
          style={{
            fontSize: "13px",
            color: textColor,
            fontFamily: "'Public Sans', sans-serif",
            flex: 1,
            fontWeight: active ? 500 : 400,
            letterSpacing: "0.01em",
            transition: "color 0.12s",
          }}
        >
          {item.label}
        </span>
      )}
      {!collapsed && count != null && count > 0 && (
        <span
          style={{
            fontSize: "10px",
            minWidth: "20px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: C.chip,
            border: `1px solid ${C.chipBorder}`,
            color: item.color ?? C.parchment,
            fontWeight: 600,
            letterSpacing: "0.02em",
            padding: "0 5px",
          }}
        >
          {count}
        </span>
      )}
      {collapsed && count != null && count > 0 && (
        <span
          style={{
            position: "absolute",
            top: "8px",
            right: "16px",
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: item.color ?? C.parchment,
          }}
        />
      )}
    </button>
  );
}

// ── Group heading / divider ──────────────────────────────────────────────────

function GroupHeading({ label, collapsed, first }: { label: string | null; collapsed: boolean; first: boolean }) {
  if (label == null) return null;
  if (collapsed) {
    return <div style={{ height: "1px", background: C.border, margin: first ? "0 16px 10px" : "10px 16px" }} />;
  }
  return (
    <div
      style={{
        fontSize: "9px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: C.faint,
        fontWeight: 700,
        padding: first ? "8px 24px 6px" : "16px 24px 6px",
      }}
    >
      {label}
    </div>
  );
}

// ── Action button (Share / Export) ───────────────────────────────────────────

function ActionButton({
  variant,
  icon,
  label,
  collapsed,
  onClick,
}: {
  variant: "primary" | "ghost";
  icon: string;
  label: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const isPrimary = variant === "primary";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "7px",
        padding: collapsed ? (isPrimary ? "9px 0" : "8px 0") : isPrimary ? "9px 12px" : "8px 12px",
        cursor: "pointer",
        width: "100%",
        fontSize: "12px",
        fontFamily: "'Public Sans', sans-serif",
        letterSpacing: "0.02em",
        transition: "background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s ease",
        ...(isPrimary
          ? {
              border: "none",
              background: hovered ? "#f3efe0" : C.cream,
              color: "#151209",
              fontWeight: 600,
              transform: hovered ? "translateY(-1px)" : "translateY(0)",
            }
          : {
              border: `1px solid ${hovered ? "#3a352a" : C.border}`,
              background: hovered ? "rgba(235,232,226,0.04)" : "transparent",
              color: hovered ? C.muted : "#4a4438",
              fontWeight: 400,
            }),
      }}
    >
      <Icon name={icon} size={13} color={isPrimary ? "#151209" : hovered ? C.muted : "#4a4438"} />
      {!collapsed && label}
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function ReportSidebar({
  activePanel,
  onNavigate,
  report,
  onShare,
  isMobile,
  sidebarOpen,
  onClose,
  collapsed,
  onToggleCollapse,
  onExportClick,
  shortcutsDisabled,
}: {
  activePanel: PanelId;
  onNavigate: (panel: PanelId) => void;
  report: Report;
  onShare: () => void;
  isMobile?: boolean;
  sidebarOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onExportClick?: () => void;
  shortcutsDisabled?: boolean;
}) {
  const { lease, overall } = report;
  const isCollapsed = !isMobile && collapsed;
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sidebarWidth = isCollapsed ? "64px" : "300px";

  const jumpTo = useCallback(
    (index: number) => {
      const item = FLAT_NAV_ITEMS[index];
      if (!item) return;
      onNavigate(item.id);
      itemRefs.current[index]?.focus();
    },
    [onNavigate]
  );

  useNavShortcuts({
    isMobile,
    sidebarOpen,
    disabled: shortcutsDisabled,
    onJump: jumpTo,
    onEscape: onClose,
  });

  function handleNavKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const count = FLAT_NAV_ITEMS.length;
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    let next = current;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % count;
    else if (e.key === "ArrowUp") next = current < 0 ? count - 1 : (current - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    itemRefs.current[next]?.focus();
  }

  let flatIndex = -1;

  return (
    <div
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: isMobile ? "fixed" : "sticky",
        top: 0,
        left: isMobile ? (sidebarOpen ? 0 : -300) : undefined,
        overflow: "auto",
        borderRight: `1px solid ${C.border}`,
        flexShrink: 0,
        zIndex: isMobile ? 100 : undefined,
        transition: isMobile ? "left 0.25s ease" : "width 0.2s ease, min-width 0.2s ease",
        boxShadow: isMobile && sidebarOpen ? "4px 0 32px rgba(0,0,0,0.6)" : undefined,
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: isCollapsed ? "20px 0 18px" : "20px 24px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: isCollapsed ? "center" : "space-between",
        }}
      >
        <div
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: isCollapsed ? "18px" : "16px",
            color: C.cream,
            letterSpacing: "0.04em",
          }}
        >
          {isCollapsed ? "LG" : "LeaseGuard"}
        </div>
        {!isMobile && !isCollapsed && (
          <button
            onClick={onToggleCollapse}
            title="Collapse sidebar"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              color: C.faint,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.cream; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.faint; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      {!isMobile && isCollapsed && (
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            justifyContent: "center",
            width: "100%",
            color: C.faint,
            marginBottom: "10px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.cream; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.faint; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Collapsed: compact risk gauge only */}
      {isCollapsed && (
        <div
          title={`${lease.address} — ${overall.risk_score.toFixed(1)} ${overall.risk_level}`}
          style={{ padding: "0 0 18px", borderBottom: `1px solid ${C.border}`, marginBottom: "10px", display: "flex", justifyContent: "center" }}
        >
          <RiskGauge score={overall.risk_score} level={overall.risk_level} size={40} strokeWidth={5} showLabel={false} />
        </div>
      )}

      {/* Property + Risk hero */}
      {!isCollapsed && (
        <div style={{ padding: "0 24px 22px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, fontWeight: 700, marginBottom: "5px" }}>
            Property
          </div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: C.parchment, lineHeight: 1.4, marginBottom: lease.city ? "2px" : "24px" }}>
            {lease.address}
          </div>
          {lease.city && (
            <div style={{ fontSize: "11px", color: C.muted, marginBottom: "24px", letterSpacing: "0.02em" }}>
              {lease.city}
            </div>
          )}

          <div style={{ fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, fontWeight: 700, marginBottom: "12px" }}>
            Overall Risk
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>
            <RiskGauge score={overall.risk_score} level={overall.risk_level} size={148} strokeWidth={10} />
          </div>
          <div style={{ textAlign: "center", fontSize: "9px", color: C.muted, letterSpacing: "0.04em", marginBottom: "18px" }}>
            out of 10
          </div>

          <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.03em" }}>
            {lease.page_count > 0 && `${lease.page_count} ${lease.page_count === 1 ? "page" : "pages"} · `}
            {lease.extraction_method === "ocr" ? "Scanned PDF" : "Digital PDF"}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav
        style={{ flex: 1, paddingTop: "10px", overflow: "auto" }}
        aria-label="Report sections"
        onKeyDown={handleNavKeyDown}
      >
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.id} role={group.label ? "group" : undefined} aria-label={group.label ?? undefined}>
            <GroupHeading label={group.label} collapsed={!!isCollapsed} first={gi === 0} />
            {group.items.map((item) => {
              flatIndex += 1;
              const idx = flatIndex;
              const active = activePanel === item.id;
              const count = item.countKey != null ? (overall[item.countKey] as number) : null;
              return (
                <NavButton
                  key={item.id}
                  item={item}
                  shortcutNumber={idx + 1}
                  active={active}
                  collapsed={!!isCollapsed}
                  count={count}
                  tabIndex={active ? 0 : -1}
                  buttonRef={(el) => { itemRefs.current[idx] = el; }}
                  onNavigate={() => { onNavigate(item.id); if (isMobile) onClose?.(); }}
                />
              );
            })}
          </div>
        ))}
      </nav>

      {/* Actions */}
      <div
        style={{
          padding: isCollapsed ? "14px 8px" : "14px 16px",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <ActionButton variant="primary" icon="share" label="Share Report" collapsed={!!isCollapsed} onClick={onShare} />
        <ActionButton
          variant="ghost"
          icon="export"
          label="Export PDF"
          collapsed={!!isCollapsed}
          onClick={onExportClick ?? (() => exportReportPDF(report))}
        />
      </div>
    </div>
  );
}
