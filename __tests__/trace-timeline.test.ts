/**
 * __tests__/trace-timeline.test.ts
 *
 * Unit tests for all pure computation helpers exported from
 * app/components/trace-timeline.utils.ts.
 *
 * No React rendering — pure function tests only.
 */

import {
  computeGeometry,
  buildRows,
  rulerTicks,
  formatDuration,
  formatOffset,
  laneCount,
  toolCategory,
  leftPct,
  widthPct,
} from "../app/components/trace-timeline.utils";
import type { TraceStep } from "../app/components/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_TIME = new Date("2026-05-20T10:00:00.000Z").getTime();

function makeStep(
  overrides: Partial<TraceStep> & { id: string; sequence: number }
): TraceStep {
  return {
    tool_name: "parse_document",
    called_at: new Date(BASE_TIME).toISOString(),
    duration_ms: 1000,
    success: true,
    input_summary: {},
    output_summary: {},
    ...overrides,
  };
}

/** Two sequential (non-overlapping) steps: 0–1000ms, 1000–2000ms */
const SEQUENTIAL_STEPS: TraceStep[] = [
  makeStep({ id: "s1", sequence: 1, called_at: new Date(BASE_TIME).toISOString(), duration_ms: 1000 }),
  makeStep({ id: "s2", sequence: 2, called_at: new Date(BASE_TIME + 1000).toISOString(), duration_ms: 1000 }),
];

/** Two overlapping (parallel) steps: both start at BASE_TIME, each 1000ms */
const PARALLEL_STEPS: TraceStep[] = [
  makeStep({ id: "p1", sequence: 1, tool_name: "lookup_statute", called_at: new Date(BASE_TIME).toISOString(), duration_ms: 1000 }),
  makeStep({ id: "p2", sequence: 2, tool_name: "lookup_tribunal", called_at: new Date(BASE_TIME).toISOString(), duration_ms: 1000 }),
];

// ─── computeGeometry ─────────────────────────────────────────────────────────

describe("computeGeometry", () => {
  it("computes t0 as the minimum called_at timestamp", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    expect(geo.t0).toBe(BASE_TIME);
  });

  it("computes tEnd as max(called_at + duration_ms)", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    expect(geo.tEnd).toBe(BASE_TIME + 2000);
  });

  it("computes totalSpanMs correctly for sequential steps", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    expect(geo.totalSpanMs).toBe(2000);
  });

  it("computes totalSpanMs correctly for parallel steps (not sum of durations)", () => {
    const geo = computeGeometry(PARALLEL_STEPS);
    // Both start at BASE_TIME and take 1000ms, so total span = 1000, not 2000
    expect(geo.totalSpanMs).toBe(1000);
  });

  it("sets hasTimestamps=true when all steps have called_at", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    expect(geo.hasTimestamps).toBe(true);
  });

  it("sets hasTimestamps=false when called_at is empty/missing", () => {
    const steps = [
      makeStep({ id: "x1", sequence: 1, called_at: "" }),
      makeStep({ id: "x2", sequence: 2, called_at: "" }),
    ];
    const geo = computeGeometry(steps);
    expect(geo.hasTimestamps).toBe(false);
  });

  it("falls back to sequential virtual timeline when called_at is missing", () => {
    const steps = [
      makeStep({ id: "x1", sequence: 1, called_at: "", duration_ms: 500 }),
      makeStep({ id: "x2", sequence: 2, called_at: "", duration_ms: 300 }),
    ];
    const geo = computeGeometry(steps);
    expect(geo.totalSpanMs).toBe(800);
  });

  it("never returns totalSpanMs of 0 (prevents division-by-zero)", () => {
    const steps = [makeStep({ id: "z", sequence: 1, duration_ms: 0 })];
    const geo = computeGeometry(steps);
    expect(geo.totalSpanMs).toBeGreaterThan(0);
  });
});

// ─── leftPct ─────────────────────────────────────────────────────────────────

describe("leftPct", () => {
  it("returns 0 for the first step (starts at t0)", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const pct = leftPct(SEQUENTIAL_STEPS[0], geo);
    expect(pct).toBe(0);
  });

  it("returns 50 for a step starting halfway through the span", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const pct = leftPct(SEQUENTIAL_STEPS[1], geo);
    expect(pct).toBeCloseTo(50, 5);
  });

  it("never returns a negative value", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const pct = leftPct(SEQUENTIAL_STEPS[0], geo);
    expect(pct).toBeGreaterThanOrEqual(0);
  });
});

// ─── widthPct ─────────────────────────────────────────────────────────────────

describe("widthPct", () => {
  it("returns 50% for a step occupying half the span", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const pct = widthPct(SEQUENTIAL_STEPS[0], geo);
    expect(pct).toBeCloseTo(50, 5);
  });

  it("enforces minimum 0.8% width for a very short step", () => {
    const tiny = makeStep({ id: "tiny", sequence: 1, duration_ms: 1 });
    const long = makeStep({ id: "long", sequence: 2, called_at: new Date(BASE_TIME + 1).toISOString(), duration_ms: 100000 });
    const geo = computeGeometry([tiny, long]);
    const pct = widthPct(tiny, geo);
    expect(pct).toBeGreaterThanOrEqual(0.8);
  });

  it("sum of widths ≤ 100% for sequential non-overlapping steps", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const totalWidth = SEQUENTIAL_STEPS.reduce((sum, s) => sum + widthPct(s, geo), 0);
    // Each is 50% so sum = 100
    expect(totalWidth).toBeCloseTo(100, 1);
  });
});

// ─── buildRows (lane packing) ────────────────────────────────────────────────

describe("buildRows", () => {
  it("assigns lane 0 to all sequential (non-overlapping) steps", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const rows = buildRows(SEQUENTIAL_STEPS, geo);
    expect(rows.every((r) => r.lane === 0)).toBe(true);
  });

  it("assigns different lanes to two overlapping (parallel) steps", () => {
    const geo = computeGeometry(PARALLEL_STEPS);
    const rows = buildRows(PARALLEL_STEPS, geo);
    const lanes = rows.map((r) => r.lane);
    expect(new Set(lanes).size).toBe(2);
  });

  it("excludes benchmark_clause steps from the chart", () => {
    const withBenchmark = [
      ...SEQUENTIAL_STEPS,
      makeStep({ id: "b1", sequence: 3, tool_name: "benchmark_clause", called_at: new Date(BASE_TIME + 2000).toISOString(), duration_ms: 500 }),
    ];
    const geo = computeGeometry(withBenchmark);
    const rows = buildRows(withBenchmark, geo);
    expect(rows.some((r) => r.step.tool_name === "benchmark_clause")).toBe(false);
  });

  it("handles empty input without throwing", () => {
    const geo = computeGeometry([]);
    expect(() => buildRows([], geo)).not.toThrow();
  });
});

// ─── laneCount ───────────────────────────────────────────────────────────────

describe("laneCount", () => {
  it("returns 1 for purely sequential steps", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const rows = buildRows(SEQUENTIAL_STEPS, geo);
    expect(laneCount(rows)).toBe(1);
  });

  it("returns 2 for two fully overlapping parallel steps", () => {
    const geo = computeGeometry(PARALLEL_STEPS);
    const rows = buildRows(PARALLEL_STEPS, geo);
    expect(laneCount(rows)).toBe(2);
  });

  it("returns 1 for empty rows", () => {
    expect(laneCount([])).toBe(1);
  });
});

// ─── rulerTicks ──────────────────────────────────────────────────────────────

describe("rulerTicks", () => {
  it("always includes a 0 tick at pct=0", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const ticks = rulerTicks(geo);
    expect(ticks[0].pct).toBe(0);
    expect(ticks[0].label).toBe("0");
  });

  it("generates between 2 and 8 ticks", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const ticks = rulerTicks(geo);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });

  it("all tick pct values are within [0, 100)", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS);
    const ticks = rulerTicks(geo);
    for (const tick of ticks) {
      expect(tick.pct).toBeGreaterThanOrEqual(0);
      expect(tick.pct).toBeLessThan(100);
    }
  });

  it("uses ms labels for sub-second spans", () => {
    const tinySteps = [
      makeStep({ id: "t1", sequence: 1, duration_ms: 200 }),
      makeStep({ id: "t2", sequence: 2, called_at: new Date(BASE_TIME + 200).toISOString(), duration_ms: 200 }),
    ];
    const geo = computeGeometry(tinySteps);
    const ticks = rulerTicks(geo);
    const nonZero = ticks.filter((t) => t.pct > 0);
    expect(nonZero.every((t) => t.label.includes("ms"))).toBe(true);
  });

  it("uses second labels for spans ≥ 1s", () => {
    const geo = computeGeometry(SEQUENTIAL_STEPS); // 2000ms span
    const ticks = rulerTicks(geo);
    const nonZero = ticks.filter((t) => t.pct > 0);
    expect(nonZero.every((t) => t.label.includes("s"))).toBe(true);
  });
});

// ─── toolCategory ─────────────────────────────────────────────────────────────

describe("toolCategory", () => {
  const knownTools: Array<[string, string]> = [
    ["parse_document", "parse"],
    ["detect_jurisdiction", "classify"],
    ["segment_clauses", "classify"],
    ["classify_clause", "classify"],
    ["lookup_statute", "rag"],
    ["lookup_tribunal", "rag"],
    ["score_risk", "score"],
    ["detect_contradiction", "analyse"],
    ["check_missing", "analyse"],
    ["generate_negotiation", "generate"],
    ["generate_report", "generate"],
  ];

  test.each(knownTools)("maps %s → %s", (tool, expected) => {
    expect(toolCategory(tool)).toBe(expected);
  });

  it("returns 'unknown' for unrecognised tool names", () => {
    expect(toolCategory("some_future_tool")).toBe("unknown");
    expect(toolCategory("")).toBe("unknown");
  });

  it("benchmark_clause is categorised as unknown (excluded from chart)", () => {
    expect(toolCategory("benchmark_clause")).toBe("unknown");
  });
});

// ─── formatDuration ──────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats sub-second durations as ms", () => {
    expect(formatDuration(312)).toBe("312ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats second-level durations as seconds", () => {
    expect(formatDuration(1000)).toBe("1.00s");
    expect(formatDuration(2500)).toBe("2.50s");
    expect(formatDuration(10000)).toBe("10.00s");
  });
});

// ─── formatOffset ─────────────────────────────────────────────────────────────

describe("formatOffset", () => {
  it("returns '-' when hasTimestamps is false", () => {
    const step = makeStep({ id: "x", sequence: 1, called_at: "" });
    // Geometry with no timestamps
    const geo = { t0: 0, tEnd: 1000, totalSpanMs: 1000, hasTimestamps: false };
    expect(formatOffset(step, geo)).toBe("-");
  });

  it("returns '+Nms' for sub-second offsets", () => {
    const step = makeStep({ id: "x", sequence: 1, called_at: new Date(BASE_TIME + 500).toISOString() });
    const geo = { t0: BASE_TIME, tEnd: BASE_TIME + 2000, totalSpanMs: 2000, hasTimestamps: true };
    expect(formatOffset(step, geo)).toBe("+500ms");
  });

  it("returns '+N.NNs' for second-level offsets", () => {
    const step = makeStep({ id: "x", sequence: 1, called_at: new Date(BASE_TIME + 1500).toISOString() });
    const geo = { t0: BASE_TIME, tEnd: BASE_TIME + 5000, totalSpanMs: 5000, hasTimestamps: true };
    expect(formatOffset(step, geo)).toBe("+1.50s");
  });
});
