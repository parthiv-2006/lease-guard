/**
 * trace-timeline.utils.ts
 *
 * Pure computation helpers for the Gantt-chart trace timeline.
 * All functions are side-effect-free and exported for unit testing.
 */

import type { TraceStep } from "./types";

// ─── Tool category classification ────────────────────────────────────────────

export type ToolCategory =
  | "parse"
  | "classify"
  | "rag"
  | "score"
  | "analyse"
  | "generate"
  | "unknown";

const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  parse_document: "parse",
  detect_jurisdiction: "classify",
  segment_clauses: "classify",
  classify_clause: "classify",
  lookup_statute: "rag",
  lookup_tribunal: "rag",
  score_risk: "score",
  detect_contradiction: "analyse",
  check_missing: "analyse",
  generate_negotiation: "generate",
  generate_report: "generate",
  benchmark_clause: "unknown", // fire-and-forget, excluded from chart
};

export function toolCategory(toolName: string): ToolCategory {
  return TOOL_CATEGORY_MAP[toolName] ?? "unknown";
}

export const CATEGORY_COLOR: Record<ToolCategory, string> = {
  parse: "#1d4ed8",
  classify: "#0369a1",
  rag: "#b45309",
  score: "#c2410c",
  analyse: "#7c3aed",
  generate: "#374151",
  unknown: "#6b7280",
};

export const CATEGORY_BG: Record<ToolCategory, string> = {
  parse: "#eff6ff",
  classify: "#f0f9ff",
  rag: "#fffbeb",
  score: "#fff7ed",
  analyse: "#f5f3ff",
  generate: "#f9fafb",
  unknown: "#f3f4f6",
};

export const CATEGORY_BORDER: Record<ToolCategory, string> = {
  parse: "#bfdbfe",
  classify: "#bae6fd",
  rag: "#fde68a",
  score: "#fed7aa",
  analyse: "#ddd6fe",
  generate: "#e5e7eb",
  unknown: "#e5e7eb",
};

// ─── Timeline geometry ────────────────────────────────────────────────────────

export interface TimelineGeometry {
  /** Wall-clock start of the earliest call (ms since epoch). */
  t0: number;
  /** Wall-clock end of the latest call (ms since epoch). */
  tEnd: number;
  /** True wall-clock span of the whole pipeline in ms. */
  totalSpanMs: number;
  /** Whether called_at data is available (vs. reconstructed from sequence). */
  hasTimestamps: boolean;
}

/**
 * Compute the timeline bounding box.
 * Falls back to reconstructing a virtual sequential timeline from sequence_num
 * and duration_ms when called_at is missing (old reports).
 */
export function computeGeometry(steps: TraceStep[]): TimelineGeometry {
  const validSteps = steps.filter((s) => s.called_at && s.called_at.length > 0);
  const hasTimestamps = validSteps.length === steps.length && steps.length > 0;

  if (hasTimestamps) {
    const starts = steps.map((s) => new Date(s.called_at).getTime());
    const ends = steps.map(
      (s) => new Date(s.called_at).getTime() + (s.duration_ms ?? 0)
    );
    const t0 = Math.min(...starts);
    const tEnd = Math.max(...ends);
    return { t0, tEnd, totalSpanMs: Math.max(tEnd - t0, 1), hasTimestamps: true };
  }

  // Fallback: reconstruct a sequential virtual timeline
  let cursor = 0;
  const sortedBySeq = [...steps].sort((a, b) => a.sequence - b.sequence);
  const virtualEnd = sortedBySeq.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);
  void cursor;
  return {
    t0: 0,
    tEnd: virtualEnd,
    totalSpanMs: Math.max(virtualEnd, 1),
    hasTimestamps: false,
  };
}

/** Left offset as a percentage [0, 100] of the total span. */
export function leftPct(step: TraceStep, geo: TimelineGeometry): number {
  if (!geo.hasTimestamps) {
    // Virtual sequential: accumulate durations of earlier steps
    return 0; // caller must use virtual offsets (see buildRows)
  }
  const start = new Date(step.called_at).getTime();
  return Math.max(0, ((start - geo.t0) / geo.totalSpanMs) * 100);
}

/** Width as a percentage [0, 100] of the total span. Enforces a minimum of 0.8%. */
export function widthPct(step: TraceStep, geo: TimelineGeometry): number {
  const raw = ((step.duration_ms ?? 0) / geo.totalSpanMs) * 100;
  return Math.max(raw, 0.8); // never invisible
}

// ─── Row packing (greedy interval scheduling) ─────────────────────────────────

export interface PositionedStep {
  step: TraceStep;
  leftPct: number;
  widthPct: number;
  lane: number; // 0-indexed row within the swim-lane group
}

/**
 * Assigns each step a swim lane using a greedy interval-scheduling algorithm.
 * Steps that overlap horizontally are placed on different lanes.
 * Benchmark_clause calls are excluded (they're fire-and-forget noise).
 */
export function buildRows(
  steps: TraceStep[],
  geo: TimelineGeometry
): PositionedStep[] {
  // Filter out benchmark_clause calls
  const visible = steps.filter((s) => s.tool_name !== "benchmark_clause");

  // Compute virtual sequential offsets for fallback mode
  const virtualOffsets = new Map<string, number>();
  if (!geo.hasTimestamps) {
    const sorted = [...visible].sort((a, b) => a.sequence - b.sequence);
    let cursor = 0;
    for (const s of sorted) {
      virtualOffsets.set(s.id, cursor);
      cursor += s.duration_ms ?? 0;
    }
  }

  const positioned: PositionedStep[] = visible.map((step) => {
    const left = geo.hasTimestamps
      ? leftPct(step, geo)
      : ((virtualOffsets.get(step.id) ?? 0) / geo.totalSpanMs) * 100;
    const width = widthPct(step, geo);
    return { step, leftPct: left, widthPct: width, lane: 0 };
  });

  // Sort by start position for greedy assignment
  positioned.sort((a, b) => a.leftPct - b.leftPct);

  // Track the right edge of the last step placed in each lane
  const laneEnds: number[] = [];

  for (const item of positioned) {
    const itemEnd = item.leftPct + item.widthPct;
    let placed = false;
    for (let lane = 0; lane < laneEnds.length; lane++) {
      if (item.leftPct >= laneEnds[lane] - 0.1) {
        // Fits in this lane (0.1% tolerance for floating-point)
        item.lane = lane;
        laneEnds[lane] = itemEnd;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.lane = laneEnds.length;
      laneEnds.push(itemEnd);
    }
  }

  return positioned;
}

// ─── Ruler ticks ─────────────────────────────────────────────────────────────

export interface RulerTick {
  /** Position as percentage of total span. */
  pct: number;
  /** Display label, e.g. "+1.5s" */
  label: string;
}

/**
 * Compute 5–7 evenly spaced ruler ticks across the total span.
 */
export function rulerTicks(geo: TimelineGeometry): RulerTick[] {
  const spanMs = geo.totalSpanMs;
  const targetTicks = 6;
  const rawInterval = spanMs / targetTicks;

  // Round to a nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const niceFactor = [1, 2, 2.5, 5, 10].find(
    (f) => f * magnitude >= rawInterval
  ) ?? 10;
  const interval = niceFactor * magnitude;

  const ticks: RulerTick[] = [];
  // Always include 0
  ticks.push({ pct: 0, label: "0" });

  for (let t = interval; t < spanMs; t += interval) {
    const pct = (t / spanMs) * 100;
    if (pct > 99) break;
    const label =
      t >= 1000 ? `+${(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}s` : `+${Math.round(t)}ms`;
    ticks.push({ pct, label });
  }

  return ticks;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Format duration_ms as a human-readable string. */
export function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

/** Format a step's offset from t0 as "+X.XXs". */
export function formatOffset(step: TraceStep, geo: TimelineGeometry): string {
  if (!geo.hasTimestamps || !step.called_at) return "-";
  const offsetMs = new Date(step.called_at).getTime() - geo.t0;
  if (offsetMs < 1000) return `+${offsetMs}ms`;
  return `+${(offsetMs / 1000).toFixed(2)}s`;
}

/** Total lane count needed (= max lane index + 1). */
export function laneCount(rows: PositionedStep[]): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((r) => r.lane)) + 1;
}
