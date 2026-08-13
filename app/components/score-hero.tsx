"use client";

// The score treated as a brand object: a large typographic number on a
// severity ruler. Meant to be reused identically wherever a score needs to
// be the visual focal point (landing, dashboard verdict header, report).

const MONO = "'IBM Plex Mono', monospace";
const SERIF = "'Newsreader', serif";

const LEVEL_COLOR: Record<string, string> = {
  low: "#2f6b3a",
  medium: "#93690f",
  high: "#a15a1f",
  critical: "#9c2b23",
};

const LEVEL_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

interface ScoreHeroProps {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  size?: number;
}

// The severity ruler bands: Low (0–3), Medium (3–5.5), High (5.5–8), Critical (8–10).
const BANDS: Array<{ level: string; flex: number; from: number; to: number }> = [
  { level: "low", flex: 3, from: 0, to: 3 },
  { level: "medium", flex: 2.5, from: 3, to: 5.5 },
  { level: "high", flex: 2.5, from: 5.5, to: 8 },
  { level: "critical", flex: 2, from: 8, to: 10 },
];

export function ScoreHero({ score, level, size = 220 }: ScoreHeroProps) {
  const color = LEVEL_COLOR[level] ?? LEVEL_COLOR.critical;
  const band = BANDS.find((b) => level === b.level) ?? BANDS[BANDS.length - 1];
  const tickPct = Math.min(100, Math.max(0, ((score - band.from) / (band.to - band.from)) * 100));

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: SERIF,
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: `clamp(${Math.round(size * 0.55)}px, 17vw, ${size}px)`,
          lineHeight: 0.82,
          color,
          letterSpacing: "-0.03em",
        }}
      >
        {score.toFixed(1)}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 12,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color,
          marginTop: 10,
        }}
      >
        {LEVEL_LABEL[level] ?? level}
      </div>
    </div>
  );
}

export function SeverityRuler({ score, level }: { score: number; level: string }) {
  const band = BANDS.find((b) => level === b.level) ?? BANDS[BANDS.length - 1];
  const tickPct = Math.min(100, Math.max(0, ((score - band.from) / (band.to - band.from)) * 100));

  return (
    <div>
      <div style={{ display: "flex", height: 14, border: "1px solid #17140f" }}>
        {BANDS.map((b) => (
          <div
            key={b.level}
            style={{ flex: b.flex, background: LEVEL_COLOR[b.level], position: "relative" }}
          >
            {b.level === level && (
              <div
                style={{
                  position: "absolute",
                  top: -9,
                  bottom: -9,
                  left: `${tickPct}%`,
                  width: 2,
                  background: "#17140f",
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 10,
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#6f6857",
        }}
      >
        <div style={{ flex: 3 }}>0 · Low</div>
        <div style={{ flex: 2.5 }}>3 · Medium</div>
        <div style={{ flex: 2.5 }}>5.5 · High</div>
        <div style={{ flex: 2, textAlign: "right" }}>8 · Critical</div>
      </div>
    </div>
  );
}
