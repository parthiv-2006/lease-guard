import Link from "next/link";
import type { Metadata } from "next";
import { AuthButton } from "../components/auth-button";

export const metadata: Metadata = {
  title: "Ontario RTA — LeaseGuard",
  description:
    "Key tenant rights under the Ontario Residential Tenancies Act, 2006. What landlords can and cannot put in a lease.",
};

const KEY_SECTIONS = [
  {
    section: "s. 20",
    title: "Maintenance obligation",
    summary:
      "The landlord must maintain the rental unit and the residential complex in a good state of repair and fit for habitation. This obligation exists regardless of what the lease says — a clause shifting all repairs to the tenant is void.",
    voiding:
      "Clauses requiring tenants to pay for all repairs or waive the landlord’s maintenance duty.",
  },
  {
    section: "s. 27",
    title: "Landlord’s right of entry",
    summary:
      "A landlord may enter a rental unit only in specific circumstances and must give written notice at least 24 hours before entering — stating the reason and a time between 8 am and 8 pm. Emergency entry is permitted without notice.",
    voiding:
      "Clauses granting landlord unrestricted entry, entry without notice, or entry at any hour.",
  },
  {
    section: "s. 97",
    title: "Subletting & assignment",
    summary:
      "A tenant may assign or sublet the unit with the landlord’s consent. The landlord cannot arbitrarily or unreasonably withhold consent. If consent is refused without a valid reason, the tenant may apply to the LTB.",
    voiding:
      "Absolute prohibitions on subletting or assignment — these cannot override the RTA.",
  },
  {
    section: "s. 105–106",
    title: "Rent deposits",
    summary:
      "The only deposit a landlord may collect is a last month’s rent (LMR) deposit. Security deposits, key deposits above key replacement cost, and pet deposits are prohibited. The LMR must be applied to the last rental period.",
    voiding:
      "Any clause requiring a security deposit, damage deposit, or pet deposit beyond the LMR.",
  },
  {
    section: "s. 116",
    title: "Rent increases",
    summary:
      "A landlord must give at least 90 days’ written notice before a rent increase. Increases may occur no more than once every 12 months. The increase must not exceed the provincial rent increase guideline (unless an LTB order permits otherwise).",
    voiding:
      "Clauses allowing rent increases on less than 90 days notice or more frequently than annually.",
  },
  {
    section: "s. 82",
    title: "No pets clauses",
    summary:
      "A provision in a tenancy agreement that prohibits or restricts the presence of animals in or about the residential complex is void. Landlords cannot evict a tenant solely for having a pet, though damage caused by pets is the tenant’s responsibility.",
    voiding:
      "Any no-pet clause — these are void under s. 82 of the RTA regardless of what the lease states.",
  },
];

const VOID_EXAMPLES = [
  "Tenant waives right to habitable premises",
  "Landlord may enter at any time without notice",
  "Tenant responsible for all repairs regardless of cause",
  "Security deposit of [X] months required",
  "Rent may be increased with 30 days notice",
  "No pets allowed under any circumstances",
  "Tenant forfeits LMR deposit if they break the lease early",
  "Landlord not responsible for damage caused by flooding or leaks",
];

export default function OntarioRtaPage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <nav style={{ display: "flex", gap: "28px" }}>
            {[
              { label: "How it works", href: "/how-it-works" },
              { label: "Ontario RTA", href: "/ontario-rta" },
              { label: "About", href: "/about" },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                style={{
                  fontSize: "13px",
                  color: href === "/ontario-rta" ? "#181614" : "#6b6560",
                  textDecoration: "none",
                  fontWeight: href === "/ontario-rta" ? 500 : 400,
                  letterSpacing: "0.01em",
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <AuthButton />
        </div>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "48px 24px 80px",
        }}
      >
        {/* Hero */}
        <div style={{ marginBottom: "64px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "100px",
              background: "#fff",
              border: "1px solid #e8e4dc",
              fontSize: "11px",
              color: "#6b6560",
              marginBottom: "24px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#15803d",
                display: "inline-block",
              }}
            />
            Residential Tenancies Act, 2006
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "clamp(36px, 5vw, 52px)",
              lineHeight: 1.08,
              color: "#181614",
              margin: "0 0 18px",
              letterSpacing: "-0.02em",
            }}
          >
            Your rights under the Ontario RTA
          </h1>
          <p
            style={{
              fontSize: "16px",
              color: "#6b6560",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "600px",
            }}
          >
            The Residential Tenancies Act, 2006 governs almost every residential
            tenancy in Ontario. Many of its protections are{" "}
            <em>mandatory</em> — a landlord cannot contract out of them, and any
            lease clause that tries to is void and unenforceable.
          </p>
        </div>

        {/* Key callout */}
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "10px",
            padding: "20px 24px",
            marginBottom: "48px",
            display: "flex",
            gap: "14px",
            alignItems: "flex-start",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <circle cx="9" cy="9" r="8" stroke="#15803d" strokeWidth="1.5" />
            <path d="M9 5v4.5M9 12v.5" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ margin: 0, fontSize: "13px", color: "#166534", lineHeight: 1.65 }}>
            <strong>The RTA overrides the lease.</strong> If your lease says one thing and the
            RTA says another, the RTA wins. You cannot sign away rights that the Act grants you
            — even if you agreed to at the time of signing.
          </p>
        </div>

        {/* Key sections */}
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "28px",
            color: "#181614",
            margin: "0 0 32px",
            letterSpacing: "-0.01em",
          }}
        >
          Key sections LeaseGuard checks
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "64px" }}>
          {KEY_SECTIONS.map((s) => (
            <div
              key={s.section}
              style={{
                background: "#fff",
                border: "1px solid #e8e4dc",
                borderRadius: "10px",
                padding: "24px 28px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "11px",
                    fontWeight: 500,
                    color: "#9a9590",
                    background: "#f6f3ee",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    letterSpacing: "0.03em",
                    flexShrink: 0,
                  }}
                >
                  RTA {s.section}
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#181614",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.title}
                </span>
              </div>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: "13px",
                  color: "#6b6560",
                  lineHeight: 1.7,
                }}
              >
                {s.summary}
              </p>
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "#991b1b",
                  lineHeight: 1.5,
                }}
              >
                <strong>Void if lease says:</strong> {s.voiding}
              </div>
            </div>
          ))}
        </div>

        {/* Common void clauses */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "12px",
            padding: "36px",
            marginBottom: "48px",
          }}
        >
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "26px",
              color: "#181614",
              margin: "0 0 6px",
              letterSpacing: "-0.01em",
            }}
          >
            Common void lease clauses
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#9a9590" }}>
            These phrases appear in Ontario leases but are unenforceable under the RTA.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {VOID_EXAMPLES.map((ex) => (
              <div
                key={ex}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  background: "#f6f3ee",
                  borderRadius: "7px",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
                  <circle cx="8" cy="8" r="6.5" stroke="#b91c1c" strokeWidth="1.5" />
                  <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: "13px", color: "#6b6560", lineHeight: 1.5 }}>
                  &ldquo;{ex}&rdquo;
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "12px",
            padding: "36px",
            marginBottom: "48px",
          }}
        >
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "26px",
              color: "#181614",
              margin: "0 0 20px",
              letterSpacing: "-0.01em",
            }}
          >
            Official resources
          </h2>
          {[
            {
              title: "Landlord and Tenant Board (LTB)",
              desc: "File applications, find forms, attend hearings.",
              url: "https://tribunalsontario.ca/ltb/",
            },
            {
              title: "Ontario Residential Tenancies Act, 2006",
              desc: "Full statute text on the Ontario government website.",
              url: "https://www.ontario.ca/laws/statute/06r17",
            },
            {
              title: "Ontario Standard Form of Lease",
              desc: "The mandatory lease form for most residential tenancies.",
              url: "https://www.ontario.ca/page/ontario-standard-lease",
            },
            {
              title: "Community Legal Clinics",
              desc: "Free legal help for tenants who qualify — find your local clinic.",
              url: "https://www.legalaid.on.ca/legal-clinics/",
            },
          ].map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "14px 0",
                borderBottom: "1px solid #e8e4dc",
                textDecoration: "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "2px" }}>
                <path d="M8 3h5v5M13 3l-7 7" stroke="#9a9590" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 4H3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-3" stroke="#9a9590" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#181614", marginBottom: "2px" }}>
                  {r.title}
                </div>
                <div style={{ fontSize: "12px", color: "#9a9590" }}>{r.desc}</div>
              </div>
            </a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 32px",
              borderRadius: "7px",
              background: "#181614",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.02em",
            }}
          >
            Analyse your lease
          </Link>
          <p style={{ marginTop: "12px", fontSize: "12px", color: "#9a9590" }}>
            Free · no account required · Ontario leases only
          </p>
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
          lineHeight: 1.5,
          flexShrink: 0,
        }}
      >
        LeaseGuard provides educational information only and does not constitute
        legal advice. For matters requiring professional legal judgment, consult
        a licensed paralegal or lawyer. Analysis is grounded in the Ontario
        Residential Tenancies Act, 2006.
      </footer>
    </div>
  );
}
