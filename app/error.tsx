"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to server-side observability (console captured by Vercel runtime logs)
    console.error("[GlobalError]", error.digest ?? "(no digest)", error.message);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f3ee",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 48px",
          height: "56px",
          borderBottom: "1px solid #e8e4dc",
          background: "#f6f3ee",
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "17px",
            letterSpacing: "0.02em",
            color: "#181614",
            textDecoration: "none",
          }}
        >
          LeaseGuard
        </Link>
      </header>

      {/* Centre content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "420px" }}>
          {/* Icon */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              marginBottom: "24px",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#b91c1c"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "32px",
              color: "#181614",
              letterSpacing: "-0.02em",
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: "14px",
              color: "#6b6560",
              margin: "0 0 8px",
              lineHeight: 1.65,
            }}
          >
            An unexpected error occurred. You can try again or go back to the
            home page.
          </p>

          {/* Error reference — safe to show (opaque digest, not raw message) */}
          {error.digest && (
            <p
              style={{
                fontSize: "11px",
                color: "#9a9590",
                margin: "0 0 28px",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                padding: "10px 24px",
                borderRadius: "7px",
                background: "#181614",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                letterSpacing: "0.01em",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: "10px 24px",
                borderRadius: "7px",
                background: "#fff",
                color: "#181614",
                fontSize: "13px",
                fontWeight: 500,
                border: "1px solid #e8e4dc",
                textDecoration: "none",
                letterSpacing: "0.01em",
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "16px 48px",
          borderTop: "1px solid #e8e4dc",
          fontSize: "11px",
          color: "#b0aaa4",
          textAlign: "center",
          flexShrink: 0,
          display: "flex",
          gap: "16px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span>Educational information only — not legal advice.</span>
        <span style={{ color: "#ddd8cf" }}>·</span>
        <Link href="/privacy" style={{ color: "#b0aaa4", textDecoration: "underline" }}>
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
