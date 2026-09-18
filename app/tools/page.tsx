import Link from "next/link";
import type { Metadata } from "next";
import { AuthButton } from "../components/auth-button";
import { NAV_LINKS, isNavLinkActive } from "../components/site-nav";
import { TENANT_TOOLS } from "@/lib/tenant-tools";

export const metadata: Metadata = {
  title: "Tenant Tools — LeaseGuard",
  description:
    "Free Ontario tenant tools: check a rent increase, an eviction notice, or your deposit and fees against the Residential Tenancies Act, 2006 — no lease upload required.",
};

export default function TenantToolsPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f4ee",
        color: "#17140f",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Public Sans', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "0 clamp(20px,4vw,56px)",
          height: 66,
          borderBottom: "1px solid #17140f",
          background: "rgba(247,244,238,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: "-0.01em",
            color: "#17140f",
            textDecoration: "none",
          }}
        >
          LeaseGuard
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <nav style={{ display: "flex", gap: "clamp(14px,2.4vw,28px)", alignItems: "center" }}>
            {NAV_LINKS.map((link) => {
              const { label, href, external } = link;
              const isActive = isNavLinkActive(link, "/tools");
              return (
                <a
                  key={label}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  style={{
                    fontSize: 14,
                    color: isActive ? "#17140f" : "#4a4438",
                    fontWeight: isActive ? 600 : 400,
                    textDecoration: "none",
                    borderBottom: isActive ? "1px solid #17140f" : "1px solid transparent",
                    paddingBottom: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </a>
              );
            })}
          </nav>
          <AuthButton />
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 820, width: "100%", margin: "0 auto", padding: "clamp(40px,6vw,64px) clamp(20px,4vw,24px) 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#6f6857",
              marginBottom: 20,
            }}
          >
            Tools · Residential Tenancies Act, 2006
          </div>
          <h1
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "clamp(38px,5vw,58px)",
              lineHeight: 1.05,
              margin: "0 0 20px",
              letterSpacing: "-0.02em",
            }}
          >
            Check one thing, fast.
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            Not every question needs a full lease review. These tools apply the RTA&rsquo;s rules
            deterministically to a single notice, increase, or fee — no upload, no account, and
            every result cites the section it came from.
          </p>
        </div>

        {/* Tool cards */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 64 }} data-testid="tenant-tools-list">
          {TENANT_TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={tool.href}
              data-testid="tenant-tool-card"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px 24px",
                alignItems: "flex-start",
                padding: "28px 0",
                borderTop: "1px solid #e0d9c6",
                textDecoration: "none",
                color: "#17140f",
              }}
            >
              <div style={{ flex: "0 1 200px" }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#9c2b23", marginBottom: 6, lineHeight: 1.6 }}>
                  RTA{" "}
                  {tool.statuteRefs.map((ref, i) => (
                    <span key={ref} style={{ whiteSpace: "nowrap" }}>
                      {i > 0 && " · "}
                      {ref}
                    </span>
                  ))}
                </div>
                <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 20 }}>
                  {tool.title}
                </div>
              </div>
              <div style={{ flex: "1 1 300px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{tool.question}</div>
                <p style={{ margin: 0, fontSize: 14, color: "#4a4438", lineHeight: 1.7 }}>{tool.blurb}</p>
              </div>
              <span style={{ fontSize: 15, color: "#9c2b23" }} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div
          style={{
            border: "1px solid #17140f",
            borderLeft: "3px solid #2f6b3a",
            padding: "18px 22px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, maxWidth: 520 }}>
            <strong>Have the whole lease?</strong> Upload it for a full clause-by-clause review
            that flags terms which may not be enforceable under the RTA.
          </p>
          <Link
            href="/"
            style={{
              padding: "12px 24px",
              border: "1px solid #17140f",
              background: "#151209",
              color: "#f4efe4",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Analyse your lease
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "26px clamp(20px,4vw,56px)",
          borderTop: "1px solid #17140f",
          fontSize: 13,
          color: "#6f6857",
          textAlign: "center",
          lineHeight: 1.6,
          flexShrink: 0,
        }}
      >
        LeaseGuard provides educational information only and does not constitute legal advice.
        For matters requiring professional legal judgment, consult a licensed paralegal or
        lawyer. Analysis is grounded in the Ontario Residential Tenancies Act, 2006.
      </footer>
    </div>
  );
}
