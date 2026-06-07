import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const alt = "LeaseGuard lease risk analysis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RISK_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
};

function fallbackCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0e0d",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 80,
            height: 80,
            borderRadius: 16,
            background: "#f6f3ee",
            marginBottom: 40,
          }}
        >
          <span style={{ color: "#181614", fontSize: 28, fontWeight: 700, fontFamily: "sans-serif" }}>
            LG
          </span>
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, color: "#ebe8e2", letterSpacing: "-1px", marginBottom: 20 }}>
          LeaseGuard
        </div>
        <div style={{ fontSize: 28, color: "#4a4643", fontFamily: "sans-serif", fontWeight: 400 }}>
          Read what you sign.
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "#3a3733" }} />
      </div>
    ),
    { ...size }
  );
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [leaseRes, topClausesRes, allClausesRes] = await Promise.all([
      supabase
        .from("leases")
        .select("overall_risk_score, overall_risk_level, property_address, property_city")
        .eq("id", id)
        .single(),
      supabase
        .from("clauses")
        .select("heading, risk_level, risk_score")
        .eq("lease_id", id)
        .in("risk_level", ["critical", "high"])
        .order("risk_score", { ascending: false })
        .limit(3),
      supabase
        .from("clauses")
        .select("risk_level")
        .eq("lease_id", id),
    ]);

    if (!leaseRes.data) return fallbackCard();

    const score: number  = leaseRes.data.overall_risk_score ?? 0;
    const level: string  = leaseRes.data.overall_risk_level ?? "low";
    const address: string = leaseRes.data.property_address ?? "";
    const city: string    = leaseRes.data.property_city ?? "Ontario";

    const topClauses = (topClausesRes.data ?? []).slice(0, 3);

    const allClauses  = allClausesRes.data ?? [];
    const counts      = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const c of allClauses) {
      const rl = c.risk_level as keyof typeof counts;
      if (rl in counts) counts[rl]++;
    }
    const total    = allClauses.length || 1;
    const redFlags = counts.critical + counts.high;

    const accentColor = RISK_COLOR[level] ?? "#6b7280";
    const levelLabel  = level.charAt(0).toUpperCase() + level.slice(1) + " Risk";
    const scoreStr    = String(score);
    const totalStr    = String(total);
    const redFlagsStr = String(redFlags);
    const locationStr = address ? address + ", " + city : city;

    // Bar segment widths as percentages (string, for Satori)
    const pct = (n: number) => String(Math.round((n / total) * 100)) + "%";

    // Clause heading truncation
    function truncate(s: string, n: number) {
      return s.length > n ? s.slice(0, n) + "…" : s;
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            background: "#0f0e0d",
            fontFamily: "Georgia, serif",
            position: "relative",
          }}
        >
          {/* ── Left panel ─────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "520px",
              padding: "52px 52px 44px",
              borderRight: "1px solid #1e1c1a",
            }}
          >
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 44 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 42,
                  height: 42,
                  borderRadius: 9,
                  background: "#f6f3ee",
                }}
              >
                <span style={{ color: "#181614", fontSize: 17, fontWeight: 700, fontFamily: "sans-serif" }}>LG</span>
              </div>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#ebe8e2", letterSpacing: "-0.3px" }}>
                LeaseGuard
              </span>
            </div>

            {/* Score hero */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginBottom: 28 }}>
              <span
                style={{
                  fontSize: 112,
                  fontWeight: 700,
                  color: accentColor,
                  lineHeight: 1,
                  letterSpacing: "-3px",
                }}
              >
                {scoreStr}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#1a1816",
                    border: "1.5px solid " + accentColor,
                    borderRadius: 24,
                    padding: "5px 18px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: accentColor,
                      fontFamily: "sans-serif",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {levelLabel.toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: 17, color: "#3a3733", fontFamily: "sans-serif" }}>
                  out of 10
                </span>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 36, marginBottom: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: accentColor, fontFamily: "sans-serif", lineHeight: 1 }}>
                  {redFlagsStr}
                </span>
                <span style={{ fontSize: 11, color: "#3a3733", fontFamily: "sans-serif", letterSpacing: "0.1em" }}>
                  RED FLAGS
                </span>
              </div>
              <div style={{ width: 1, background: "#1e1c1a" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: "#ebe8e2", fontFamily: "sans-serif", lineHeight: 1 }}>
                  {totalStr}
                </span>
                <span style={{ fontSize: 11, color: "#3a3733", fontFamily: "sans-serif", letterSpacing: "0.1em" }}>
                  CLAUSES ANALYSED
                </span>
              </div>
            </div>

            {/* Breakdown bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 36 }}>
              <span style={{ fontSize: 10, color: "#2a2725", fontFamily: "sans-serif", letterSpacing: "0.12em" }}>
                RISK BREAKDOWN
              </span>
              <div
                style={{
                  display: "flex",
                  height: 8,
                  borderRadius: 4,
                  overflow: "hidden",
                  background: "#1a1816",
                }}
              >
                {counts.critical > 0 && (
                  <div style={{ display: "flex", width: pct(counts.critical), background: RISK_COLOR.critical }} />
                )}
                {counts.high > 0 && (
                  <div style={{ display: "flex", width: pct(counts.high), background: RISK_COLOR.high }} />
                )}
                {counts.medium > 0 && (
                  <div style={{ display: "flex", width: pct(counts.medium), background: RISK_COLOR.medium }} />
                )}
                {counts.low > 0 && (
                  <div style={{ display: "flex", width: pct(counts.low), background: RISK_COLOR.low }} />
                )}
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {counts.critical > 0 && (
                  <span style={{ fontSize: 10, color: RISK_COLOR.critical, fontFamily: "sans-serif" }}>
                    {String(counts.critical)} critical
                  </span>
                )}
                {counts.high > 0 && (
                  <span style={{ fontSize: 10, color: RISK_COLOR.high, fontFamily: "sans-serif" }}>
                    {String(counts.high)} high
                  </span>
                )}
                {counts.medium > 0 && (
                  <span style={{ fontSize: 10, color: RISK_COLOR.medium, fontFamily: "sans-serif" }}>
                    {String(counts.medium)} medium
                  </span>
                )}
                {counts.low > 0 && (
                  <span style={{ fontSize: 10, color: RISK_COLOR.low, fontFamily: "sans-serif" }}>
                    {String(counts.low)} low
                  </span>
                )}
              </div>
            </div>

            {/* CTA pill */}
            <div style={{ display: "flex", marginTop: "auto" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#f6f3ee",
                  borderRadius: 8,
                  padding: "11px 22px",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: "#181614", fontFamily: "sans-serif" }}>
                  View full report
                </span>
                <span style={{ fontSize: 15, color: "#181614", fontFamily: "sans-serif" }}>
                  →
                </span>
              </div>
            </div>
          </div>

          {/* ── Right panel ────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "52px 48px 44px",
              background: "#13120f",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "#2a2725",
                fontFamily: "sans-serif",
                letterSpacing: "0.14em",
                marginBottom: 24,
              }}
            >
              TOP CONCERNS
            </span>

            {topClauses.length === 0 ? (
              <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 18, color: "#2a2725", fontFamily: "sans-serif" }}>
                  No critical clauses found
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {topClauses.map((clause, i) => {
                  const riskCol = RISK_COLOR[clause.risk_level] ?? "#6b7280";
                  const heading = truncate(clause.heading ?? "Unnamed clause", 55);
                  const riskLabel = (clause.risk_level ?? "").toUpperCase() + " RISK";
                  return (
                    <div
                      key={String(i)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        background: "#0f0e0d",
                        borderRadius: 8,
                        padding: "16px 18px",
                        borderLeft: "3px solid " + riskCol,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: "#d4cfc8",
                          fontFamily: "sans-serif",
                          lineHeight: 1.3,
                        }}
                      >
                        {heading}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: riskCol,
                          fontFamily: "sans-serif",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {riskLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Address + domain */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
              {locationStr && (
                <span style={{ fontSize: 13, color: "#2a2725", fontFamily: "sans-serif" }}>
                  {locationStr}
                </span>
              )}
              <span style={{ fontSize: 13, color: "#2a2725", fontFamily: "sans-serif" }}>
                leaseguard-sigma.vercel.app
              </span>
            </div>
          </div>

          {/* Bottom accent */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 4,
              background: accentColor,
            }}
          />
        </div>
      ),
      { ...size }
    );
  } catch {
    return fallbackCard();
  }
}
