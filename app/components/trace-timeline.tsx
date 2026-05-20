"use client";

/**
 * trace-timeline.tsx
 *
 * Gantt-chart timeline visualisation of the LeaseGuard agent pipeline.
 *
 * Features:
 *  - Pure CSS % bars — no external charting library
 *  - Swim-lane row packing (greedy interval scheduling)
 *  - RAG step colour coding + badge
 *  - Time ruler with nice tick intervals
 *  - Hover tooltip with offset, duration, and output summary
 *  - Click-to-expand inline Input/Output drawer
 *  - Responsive: falls back to list view at <680px
 *  - Graceful fallback when called_at is missing (sequential reconstruction)
 */

import { useState, useRef, useCallback } from "react";
import type { TraceStep } from "./types";
import {
  computeGeometry,
  buildRows,
  rulerTicks,
  formatDuration,
  formatOffset,
  laneCount,
  toolCategory,
  CATEGORY_COLOR,
  CATEGORY_BG,
  CATEGORY_BORDER,
  type PositionedStep,
} from "./trace-timeline.utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 32; // px per swim lane
const LABEL_COL_WIDTH = 160; // px for the left tool-name column
const RULER_HEIGHT = 28; // px for the bottom time ruler
const ROW_GAP = 3; // px gap between swim lanes

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipState {
  item: PositionedStep;
  x: number;
  y: number;
}

function Tooltip({ state }: { state: TooltipState }) {
  const { item, x, y } = state;
  const { step } = item;
  const geo = computeGeometry([step]); // single-step geometry for formatting only
  const cat = toolCategory(step.tool_name);
  const col = CATEGORY_COLOR[cat];

  // Pick a couple of interesting output fields to surface
  const outKeys = Object.keys(step.output_summary ?? {}).slice(0, 3);

  return (
    <div
      style={{
        position: "fixed",
        left: x + 12,
        top: y - 8,
        zIndex: 9999,
        background: "#1a1916",
        border: `1px solid ${col}`,
        borderRadius: "8px",
        padding: "10px 14px",
        minWidth: "220px",
        maxWidth: "300px",
        pointerEvents: "none",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "12px",
          fontWeight: 600,
          color: col,
          marginBottom: "6px",
        }}
      >
        {step.tool_name}
      </div>
      <div
        style={{
          display: "flex",
          gap: "12px",
          fontSize: "11px",
          color: "#c5bfb5",
          marginBottom: "6px",
        }}
      >
        <span>⏱ {formatDuration(step.duration_ms)}</span>
        <span>📍 {formatOffset(step, computeGeometry([step]))}</span>
        <span
          style={{
            color: step.success ? "#86efac" : "#fca5a5",
            fontWeight: 600,
          }}
        >
          {step.success ? "✓ OK" : "✗ ERR"}
        </span>
      </div>
      {outKeys.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #333",
            paddingTop: "6px",
            display: "flex",
            flexDirection: "column",
            gap: "3px",
          }}
        >
          {outKeys.map((k) => (
            <div key={k} style={{ fontSize: "10px", color: "#9a9590" }}>
              <span style={{ color: "#c5bfb5" }}>{k}: </span>
              {String(step.output_summary[k])}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Gantt bar ────────────────────────────────────────────────────────────────

interface GanttBarProps {
  item: PositionedStep;
  isExpanded: boolean;
  onHover: (state: TooltipState | null) => void;
  onToggle: () => void;
}

function GanttBar({ item, isExpanded, onHover, onToggle }: GanttBarProps) {
  const { step, leftPct: left, widthPct: width } = item;
  const cat = toolCategory(step.tool_name);
  const col = CATEGORY_COLOR[cat];
  const bg = CATEGORY_BG[cat];
  const border = CATEGORY_BORDER[cat];
  const isRag = cat === "rag";

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      onHover({ item, x: e.clientX, y: e.clientY });
    },
    [item, onHover]
  );

  return (
    <div
      onClick={onToggle}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHover(null)}
      title={`${step.tool_name} — ${formatDuration(step.duration_ms)}`}
      style={{
        position: "absolute",
        left: `${left}%`,
        width: `${width}%`,
        top: 4,
        height: ROW_HEIGHT - 8,
        background: isExpanded ? col : bg,
        border: `1px solid ${isExpanded ? col : border}`,
        borderRadius: "5px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        paddingLeft: "6px",
        overflow: "hidden",
        transition: "background 0.15s, border-color 0.15s",
        boxShadow: isExpanded ? `0 0 0 2px ${col}40` : "none",
        minWidth: "8px",
      }}
    >
      {/* Only show label if bar is wide enough */}
      {width > 4 && (
        <span
          style={{
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            color: isExpanded ? "#fff" : col,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            userSelect: "none",
          }}
        >
          {isRag && (
            <span
              style={{
                background: col,
                color: "#fff",
                padding: "0 3px",
                borderRadius: "2px",
                marginRight: "4px",
                fontSize: "8px",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              RAG
            </span>
          )}
          {step.tool_name}
        </span>
      )}
    </div>
  );
}

// ─── Detail drawer (shown below the chart for the selected step) ──────────────

function DetailDrawer({ step }: { step: TraceStep }) {
  const cat = toolCategory(step.tool_name);
  const col = CATEGORY_COLOR[cat];

  return (
    <div
      style={{
        border: `1px solid ${CATEGORY_BORDER[cat]}`,
        borderTop: `3px solid ${col}`,
        borderRadius: "8px",
        overflow: "hidden",
        marginTop: "12px",
        background: "#fff",
        animation: "fadeSlideDown 0.18s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          background: CATEGORY_BG[cat],
          borderBottom: `1px solid ${CATEGORY_BORDER[cat]}`,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <code
          style={{
            fontSize: "13px",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            color: col,
          }}
        >
          #{step.sequence} {step.tool_name}
        </code>
        <span
          style={{
            fontSize: "12px",
            color: "#9a9590",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {formatDuration(step.duration_ms)}
        </span>
        {step.called_at && (
          <span style={{ fontSize: "11px", color: "#9a9590" }}>
            started {new Date(step.called_at).toLocaleTimeString()}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            padding: "2px 8px",
            borderRadius: "3px",
            background: step.success ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${step.success ? "#bbf7d0" : "#fecaca"}`,
            color: step.success ? "#15803d" : "#b91c1c",
            fontWeight: 600,
          }}
        >
          {step.success ? "OK" : "ERR"}
        </span>
      </div>

      {/* Input / Output side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0",
        }}
      >
        {(
          [
            { label: "Input", data: step.input_summary, dim: true },
            { label: "Output", data: step.output_summary, dim: false },
          ] as const
        ).map(({ label, data, dim }) => (
          <div
            key={label}
            style={{
              padding: "14px 16px",
              borderRight: label === "Input" ? "1px solid #f0ede6" : "none",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "#9a9590",
                fontWeight: 500,
                marginBottom: "8px",
              }}
            >
              {label}
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                color: dim ? "#5c5751" : "#181614",
                background: "#f6f3ee",
                padding: "10px",
                borderRadius: "5px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "180px",
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TraceTimelineProps {
  steps: TraceStep[];
}

export function TraceTimeline({ steps }: TraceTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const geo = computeGeometry(steps);
  const rows = buildRows(steps, geo);
  const lanes = laneCount(rows);
  const ticks = rulerTicks(geo);

  const chartHeight = lanes * ROW_HEIGHT + (lanes - 1) * ROW_GAP;
  const expandedStep = expandedId
    ? steps.find((s) => s.id === expandedId) ?? null
    : null;

  const parallelCount = rows.reduce((acc, r) => Math.max(acc, r.lane + 1), 0);
  const peakMs = rows.reduce((acc, r) => Math.max(acc, r.step.duration_ms ?? 0), 0);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── Fallback banner for reconstructed timelines ── */}
      {!geo.hasTimestamps && steps.length > 0 && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 14px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#b45309",
          }}
        >
          ⚠ Timing data unavailable for this report — showing sequential duration estimate.
          Parallelism is not reflected.
        </div>
      )}

      {/* ── Stats bar ── */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        {[
          { label: `${rows.length} tool calls`, col: "#374151" },
          {
            label: `${(geo.totalSpanMs / 1000).toFixed(1)}s wall clock`,
            col: "#1d4ed8",
          },
          { label: `${parallelCount} parallel lanes`, col: "#7c3aed" },
          { label: `peak ${formatDuration(peakMs)}`, col: "#c2410c" },
        ].map(({ label, col }) => (
          <span
            key={label}
            style={{
              padding: "4px 10px",
              borderRadius: "100px",
              background: "#f6f3ee",
              border: "1px solid #e8e4dc",
              fontSize: "12px",
              color: col,
              fontWeight: 500,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* ── Category legend ── */}
      <div
        style={{
          display: "flex",
          gap: "14px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        {(
          [
            ["parse", "Parse"],
            ["classify", "Classify"],
            ["rag", "RAG Retrieval"],
            ["score", "Score Risk"],
            ["analyse", "Analyse"],
            ["generate", "Generate"],
          ] as const
        ).map(([cat, label]) => (
          <div
            key={cat}
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "2px",
                background: CATEGORY_COLOR[cat],
              }}
            />
            <span style={{ fontSize: "11px", color: "#6b6560" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Gantt chart ── */}
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          border: "1px solid #e8e4dc",
          borderRadius: "10px",
          overflow: "hidden",
          background: "#faf9f6",
        }}
      >
        {/* Column headers */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e8e4dc",
            background: "#f6f3ee",
          }}
        >
          <div
            style={{
              width: LABEL_COL_WIDTH,
              flexShrink: 0,
              padding: "8px 14px",
              fontSize: "10px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "#9a9590",
              fontWeight: 500,
              borderRight: "1px solid #e8e4dc",
            }}
          >
            Tool
          </div>
          <div
            style={{
              flex: 1,
              padding: "8px 14px",
              fontSize: "10px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "#9a9590",
              fontWeight: 500,
            }}
          >
            Timeline ({(geo.totalSpanMs / 1000).toFixed(1)}s span)
          </div>
        </div>

        {/* Swim lanes — one per unique tool_name group */}
        {buildLaneGroups(rows).map((group) => {
          const cat = toolCategory(group.toolName);
          const col = CATEGORY_COLOR[cat];
          const maxLane = Math.max(...group.items.map((r) => r.lane)) + 1;
          const groupHeight = maxLane * ROW_HEIGHT + (maxLane - 1) * ROW_GAP;

          return (
            <div
              key={group.toolName}
              style={{
                display: "flex",
                borderBottom: "1px solid #edeae3",
              }}
            >
              {/* Tool label */}
              <div
                style={{
                  width: LABEL_COL_WIDTH,
                  flexShrink: 0,
                  padding: "0 14px",
                  display: "flex",
                  alignItems: "center",
                  borderRight: "1px solid #e8e4dc",
                  minHeight: groupHeight + 8,
                  background: "#fff",
                }}
              >
                <code
                  style={{
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: col,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={group.toolName}
                >
                  {group.toolName}
                </code>
              </div>

              {/* Bar area */}
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  height: groupHeight + 8,
                  padding: "4px 0",
                  background: "#faf9f6",
                }}
              >
                {/* Background grid lines at ruler tick positions */}
                {ticks.slice(1).map((tick) => (
                  <div
                    key={tick.pct}
                    style={{
                      position: "absolute",
                      left: `${tick.pct}%`,
                      top: 0,
                      bottom: 0,
                      width: "1px",
                      background: "#e8e4dc",
                      pointerEvents: "none",
                    }}
                  />
                ))}

                {group.items.map((item) => (
                  <div
                    key={item.step.id}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: item.lane * (ROW_HEIGHT + ROW_GAP),
                      height: ROW_HEIGHT,
                    }}
                  >
                    <GanttBar
                      item={item}
                      isExpanded={expandedId === item.step.id}
                      onHover={setTooltip}
                      onToggle={() => toggleExpand(item.step.id)}
                    />
                  </div>
                ))}
              </div>

              {/* Duration badge (rightmost) */}
              <div
                style={{
                  width: "68px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: "10px",
                  borderLeft: "1px solid #e8e4dc",
                  background: "#fff",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: "#9a9590",
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.items.length > 1
                    ? `${group.items.length}×`
                    : formatDuration(group.items[0].step.duration_ms)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Time ruler */}
        <div
          style={{
            display: "flex",
            borderTop: "1px solid #e8e4dc",
            background: "#f6f3ee",
            height: RULER_HEIGHT,
          }}
        >
          <div
            style={{
              width: LABEL_COL_WIDTH,
              flexShrink: 0,
              borderRight: "1px solid #e8e4dc",
            }}
          />
          <div style={{ flex: 1, position: "relative" }}>
            {ticks.map((tick) => (
              <div
                key={tick.pct}
                style={{
                  position: "absolute",
                  left: `${tick.pct}%`,
                  top: 0,
                  bottom: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: tick.pct === 0 ? "flex-start" : "center",
                }}
              >
                <div
                  style={{
                    width: "1px",
                    height: "6px",
                    background: "#c5bfb5",
                    marginLeft: tick.pct === 0 ? "0" : undefined,
                  }}
                />
                <span
                  style={{
                    fontSize: "9px",
                    color: "#9a9590",
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: "nowrap",
                    transform: tick.pct === 0 ? "none" : "translateX(-50%)",
                    paddingTop: "2px",
                  }}
                >
                  {tick.label}
                </span>
              </div>
            ))}
          </div>
          <div style={{ width: "68px", flexShrink: 0, borderLeft: "1px solid #e8e4dc" }} />
        </div>
      </div>

      {/* ── Detail drawer ── */}
      {expandedStep && <DetailDrawer step={expandedStep} />}

      {/* ── Floating tooltip ── */}
      {tooltip && <Tooltip state={tooltip} />}

      {/* ── Hint ── */}
      <div
        style={{
          marginTop: "12px",
          fontSize: "11px",
          color: "#b0aaa4",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Click any bar to inspect inputs &amp; outputs · Amber bars are RAG retrieval calls
        (pgvector semantic search) · Parallel bars share the same time window
      </div>
    </div>
  );
}

// ─── Lane group builder ───────────────────────────────────────────────────────

interface LaneGroup {
  toolName: string;
  items: PositionedStep[];
}

/**
 * Group positioned steps by tool_name while preserving order of first
 * appearance. This gives each unique tool a single row-group in the chart.
 */
function buildLaneGroups(rows: PositionedStep[]): LaneGroup[] {
  const order: string[] = [];
  const map = new Map<string, PositionedStep[]>();

  for (const r of rows) {
    if (!map.has(r.step.tool_name)) {
      order.push(r.step.tool_name);
      map.set(r.step.tool_name, []);
    }
    map.get(r.step.tool_name)!.push(r);
  }

  return order.map((name) => ({
    toolName: name,
    items: map.get(name)!,
  }));
}
