import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
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
          justifyContent: "space-between",
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
        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          {/* 404 badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: "#fff",
              border: "1px solid #e8e4dc",
              marginBottom: "24px",
            }}
          >
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "11px",
                fontWeight: 600,
                color: "#9a9590",
                letterSpacing: "0.08em",
              }}
            >
              404
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "36px",
              color: "#181614",
              letterSpacing: "-0.02em",
              margin: "0 0 12px",
              lineHeight: 1.15,
            }}
          >
            Page not found
          </h1>

          <p
            style={{
              fontSize: "14px",
              color: "#6b6560",
              margin: "0 0 32px",
              lineHeight: 1.65,
            }}
          >
            The page you&rsquo;re looking for doesn&rsquo;t exist or has been
            moved. Try going back to the home page.
          </p>

          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              borderRadius: "7px",
              background: "#181614",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.01em",
            }}
          >
            ← Back to home
          </Link>
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
        <span style={{ color: "#ddd8cf" }}>·</span>
        <Link href="/terms" style={{ color: "#b0aaa4", textDecoration: "underline" }}>
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
