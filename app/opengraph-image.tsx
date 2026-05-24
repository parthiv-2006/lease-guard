import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "LeaseGuard — Read what you sign";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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
        {/* Logo badge */}
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
          <span
            style={{
              color: "#f6f3ee",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            LG
          </span>
        </div>

        {/* Wordmark */}
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

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#6b6560",
            fontFamily: "sans-serif",
            fontWeight: 400,
            letterSpacing: "0.02em",
          }}
        >
          Read what you sign.
        </div>

        {/* Sub-tagline */}
        <div
          style={{
            marginTop: 16,
            fontSize: 20,
            color: "#9a9590",
            fontFamily: "sans-serif",
            fontWeight: 400,
          }}
        >
          AI-powered Ontario lease analysis grounded in real law.
        </div>

        {/* Bottom rule */}
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
