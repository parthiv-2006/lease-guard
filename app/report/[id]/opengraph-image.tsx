import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const alt = "LeaseGuard lease risk analysis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RISK_COLOR: Record<string, string> = {
  critical: "#b91c1c",
  high: "#c2410c",
  medium: "#b45309",
  low: "#15803d",
};

const RISK_BG: Record<string, string> = {
  critical: "#fef2f2",
  high: "#fff7ed",
  medium: "#fffbeb",
  low: "#f0fdf4",
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
          background: "#f6f3ee",
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
            background: "#181614",
            marginBottom: 40,
          }}
        >
          <span style={{ color: "#f6f3ee", fontSize: 28, fontWeight: 700 }}>
            LG
          </span>
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#181614",
            letterSpacing: "-1px",
            marginBottom: 20,
          }}
        >
          LeaseGuard
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#6b6560",
            fontFamily: "sans-serif",
            fontWeight: 400,
          }}
        >
          Read what you sign.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "#181614",
          }}
        />
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

    const [leaseRes, flagRes] = await Promise.all([
      supabase
        .from("leases")
        .select("overall_risk_score, overall_risk_level")
        .eq("id", id)
        .single(),
      supabase
        .from("clauses")
        .select("id", { count: "exact", head: true })
        .eq("lease_id", id)
        .in("risk_level", ["critical", "high"]),
    ]);

    if (!leaseRes.data) return fallbackCard();

    const score: number = leaseRes.data.overall_risk_score ?? 0;
    const level: string = leaseRes.data.overall_risk_level ?? "low";
    const redFlags: number = flagRes.count ?? 0;

    const accentColor = RISK_COLOR[level] ?? "#6b7280";
    const chipBg = RISK_BG[level] ?? "#f9fafb";
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "#f6f3ee",
            fontFamily: "Georgia, serif",
            padding: "64px 80px",
            position: "relative",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 56,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 56,
                height: 56,
                borderRadius: 12,
                background: "#181614",
              }}
            >
              <span
                style={{ color: "#f6f3ee", fontSize: 22, fontWeight: 700 }}
              >
                LG
              </span>
            </div>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "#181614",
                letterSpacing: "-0.5px",
              }}
            >
              LeaseGuard
            </span>
          </div>

          {/* Main content */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 40 }}>
            {/* Score */}
            <span
              style={{
                fontSize: 148,
                fontWeight: 700,
                color: accentColor,
                lineHeight: 1,
                letterSpacing: "-4px",
              }}
            >
              {score}
            </span>

            {/* Level + flags */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                paddingBottom: 12,
              }}
            >
              {/* Level chip */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: chipBg,
                  border: `2px solid ${accentColor}`,
                  borderRadius: 40,
                  padding: "8px 28px",
                  width: "fit-content",
                }}
              >
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: accentColor,
                    fontFamily: "sans-serif",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {levelLabel}
                </span>
              </div>

              {/* Red flags */}
              <span
                style={{
                  fontSize: 28,
                  color: "#6b6560",
                  fontFamily: "sans-serif",
                  fontWeight: 400,
                }}
              >
                {redFlags} red flag{redFlags !== 1 ? "s" : ""} found
              </span>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: 1,
              background: "#d6d0c8",
              marginTop: 40,
              marginBottom: 32,
            }}
          />

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 22,
                color: "#9a9590",
                fontFamily: "sans-serif",
              }}
            >
              Ontario lease · Analysed by LeaseGuard
            </span>
            <span
              style={{
                fontSize: 22,
                color: "#9a9590",
                fontFamily: "sans-serif",
              }}
            >
              leaseguard-sigma.vercel.app
            </span>
          </div>

          {/* Bottom rule */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 6,
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
