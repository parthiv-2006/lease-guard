import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "../components/site-header";
import { TENANT_TOOLS } from "@/lib/tenant-tools";
import { LETTER_CATALOG } from "@/lib/tenant-letters/catalog";

export const metadata: Metadata = {
  title: "Tenant Letters — LeaseGuard",
  description:
    "Free letters for Ontario tenants: request a repair, dispute a rent increase, claim deposit interest, or respond to an eviction notice — each one citing the Residential Tenancies Act, 2006.",
};

const STEPS = [
  "Run the checker for your situation.",
  "Under the result, choose “Write a letter to my landlord” and add your names and address.",
  "Copy the letter into an email, print it, or download it as a PDF. Keep a dated copy.",
];

export default function TenantLettersPage() {
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
      <SiteHeader currentPath="/letters" />

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
            Letters · Residential Tenancies Act, 2006
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
            Put it in writing.
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            A dated letter is the best record you can have if a problem ends up at the Landlord and
            Tenant Board. Each letter is built from a checker result, so every point it makes cites
            the section of the RTA it comes from. Nothing you type is saved or sent to LeaseGuard.
          </p>
        </div>

        {/* How it works */}
        <ol
          style={{
            margin: "0 0 48px",
            padding: "20px 24px 20px 44px",
            border: "1px solid #17140f",
            background: "#fff",
            fontSize: 15,
            color: "#4a4438",
            lineHeight: 1.7,
          }}
        >
          {STEPS.map((step) => (
            <li key={step} style={{ marginBottom: 4 }}>{step}</li>
          ))}
        </ol>

        {/* Letter cards */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 48 }} data-testid="tenant-letters-list">
          {LETTER_CATALOG.map((entry) => {
            const checker = TENANT_TOOLS.find((tool) => tool.slug === entry.checkerSlug);
            if (!checker) return null;
            return (
              <Link
                key={entry.kind}
                href={checker.href}
                data-testid="tenant-letter-card"
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
                    RTA {entry.statuteRefs.join(" · ")}
                  </div>
                  <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 20 }}>
                    {entry.title}
                  </div>
                </div>
                <div style={{ flex: "1 1 300px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 14, color: "#4a4438", lineHeight: 1.7 }}>{entry.whenToUse}</p>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Start with the {checker.title} →</div>
                </div>
              </Link>
            );
          })}
        </div>

        <p style={{ fontSize: 12, color: "#6f6857", lineHeight: 1.6 }}>
          LeaseGuard provides educational information only and does not constitute legal advice.
          A letter does not start a Board application. For matters requiring professional legal
          judgment, consult a licensed paralegal, lawyer, or the Landlord and Tenant Board.
        </p>
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
