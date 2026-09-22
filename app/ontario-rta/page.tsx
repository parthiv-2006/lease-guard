import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "../components/site-header";
import { TENANT_TOOLS } from "@/lib/tenant-tools";

export const metadata: Metadata = {
  title: "Ontario RTA — LeaseGuard",
  description:
    "Key tenant rights under the Ontario Residential Tenancies Act, 2006. What landlords can and cannot put in a lease.",
};

const KEY_SECTIONS: Array<{ section: string; title: string; summary: string; voiding: string; toolSlug?: string }> = [
  {
    section: "s. 20",
    title: "Maintenance obligation",
    summary:
      "The landlord must maintain the rental unit and the residential complex in a good state of repair and fit for habitation. This obligation exists regardless of what the lease says — a clause shifting all repairs to the tenant is void.",
    voiding:
      "Clauses requiring tenants to pay for all repairs or waive the landlord’s maintenance duty.",
    toolSlug: "maintenance-repairs-checker",
  },
  {
    section: "s. 25–27",
    title: "Landlord’s right of entry",
    summary:
      "A landlord may enter a rental unit only for the reasons the Act lists. Most entries — repairs, inspections, showing the unit to a buyer — need written notice at least 24 hours ahead, stating the reason, the day, and a time between 8 am and 8 pm. Entry without notice is limited to emergencies, entry the tenant agrees to at the door, cleaning the lease requires, and showings once the tenancy is ending.",
    voiding:
      "Clauses granting landlord unrestricted entry, entry without notice, or entry at any hour.",
    toolSlug: "landlord-entry-checker",
  },
  {
    section: "s. 97",
    title: "Subletting & assignment",
    summary:
      "A tenant may assign or sublet the unit with the landlord’s consent. The landlord cannot arbitrarily or unreasonably withhold consent. If consent is refused without a valid reason, the tenant may apply to the LTB.",
    voiding:
      "Absolute prohibitions on subletting or assignment — these cannot override the RTA.",
  },
  {
    section: "s. 105–106",
    title: "Rent deposits",
    summary:
      "The only deposit a landlord may collect is a last month’s rent (LMR) deposit. Security deposits, key deposits above key replacement cost, and pet deposits are prohibited. The LMR must be applied to the last rental period.",
    voiding:
      "Any clause requiring a security deposit, damage deposit, or pet deposit beyond the LMR.",
    toolSlug: "deposit-fees-checker",
  },
  {
    section: "s. 116",
    title: "Rent increases",
    summary:
      "A landlord must give at least 90 days’ written notice before a rent increase. Increases may occur no more than once every 12 months. The increase must not exceed the provincial rent increase guideline (unless an LTB order permits otherwise).",
    voiding:
      "Clauses allowing rent increases on less than 90 days notice or more frequently than annually.",
    toolSlug: "rent-increase-checker",
  },
  {
    section: "s. 14",
    title: "No pets clauses",
    summary:
      "A provision in a tenancy agreement that prohibits or restricts the presence of animals in or about the residential complex is void. Landlords cannot evict a tenant solely for having a pet, though damage caused by pets is the tenant’s responsibility.",
    voiding:
      "Any no-pet clause — these are void under s. 14 of the RTA regardless of what the lease states.",
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

const RESOURCES = [
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
];

export default function OntarioRtaPage() {
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
      <SiteHeader currentPath="/ontario-rta" />

      <main style={{ flex: 1, maxWidth: 820, width: "100%", margin: "0 auto", padding: "clamp(40px,6vw,64px) clamp(20px,4vw,24px) 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 56 }}>
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
            Reference · Residential Tenancies Act, 2006
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
            The law your lease answers to.
          </h1>
          <p style={{ fontSize: 17, color: "#4a4438", lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            The Residential Tenancies Act, 2006 governs almost every residential tenancy in
            Ontario. Many of its protections are mandatory — a landlord cannot contract out of
            them, and any lease clause that tries to is void and unenforceable.
          </p>
        </div>

        {/* Key callout */}
        <div
          style={{
            background: "#f7f4ee",
            border: "1px solid #17140f",
            borderLeft: "3px solid #2f6b3a",
            padding: "18px 22px",
            marginBottom: 56,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: "#17140f", lineHeight: 1.65 }}>
            <strong>The RTA overrides the lease.</strong> If your lease says one thing and the
            RTA says another, the RTA wins. You cannot sign away rights that the Act grants you —
            even if you agreed to at the time of signing.
          </p>
        </div>

        {/* Key sections */}
        <h2
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 30,
            margin: "0 0 32px",
            letterSpacing: "-0.01em",
          }}
        >
          Key sections LeaseGuard checks
        </h2>

        <div style={{ display: "flex", flexDirection: "column", marginBottom: 64 }}>
          {KEY_SECTIONS.map((s) => {
            const tool = TENANT_TOOLS.find((t) => t.slug === s.toolSlug);
            return (
              <div
                key={s.section}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px,180px) 1fr",
                  gap: 24,
                  padding: "26px 0",
                  borderTop: "1px solid #e0d9c6",
                }}
              >
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#9c2b23", marginBottom: 6 }}>
                    RTA {s.section}
                  </div>
                  <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 600, fontSize: 19 }}>
                    {s.title}
                  </div>
                </div>
                <div>
                  <p style={{ margin: "0 0 14px", fontSize: 14, color: "#4a4438", lineHeight: 1.7 }}>{s.summary}</p>
                  <div style={{ borderLeft: "2px solid #9c2b23", paddingLeft: 12, fontSize: 13, color: "#9c2b23", lineHeight: 1.6 }}>
                    <strong>Void if lease says:</strong> {s.voiding}
                  </div>
                  {tool && (
                    <Link
                      href={tool.href}
                      data-testid="rta-section-tool-link"
                      style={{ display: "inline-block", marginTop: 14, fontSize: 14, fontWeight: 600, color: "#17140f" }}
                    >
                      {tool.question} Try the {tool.title} →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Common void clauses — dark full-bleed */}
      <div style={{ borderTop: "1px solid #17140f", borderBottom: "1px solid #17140f", background: "#151209", color: "#f4efe4" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(48px,6vw,64px) clamp(20px,4vw,24px)" }}>
          <h2
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: 28,
              margin: "0 0 8px",
              letterSpacing: "-0.01em",
            }}
          >
            Clauses that are already void
          </h2>
          <p style={{ margin: "0 0 30px", fontSize: 13, color: "#a8a08c" }}>
            These phrases appear in Ontario leases but are unenforceable under the RTA.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1px", background: "#2b2720", border: "1px solid #2b2720" }}>
            {VOID_EXAMPLES.map((ex) => (
              <div key={ex} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "16px 18px", background: "#151209" }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#ff9d94", flexShrink: 0 }}>✕</span>
                <span style={{ fontSize: 13, color: "#e9e4d5", lineHeight: 1.55 }}>&ldquo;{ex}&rdquo;</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 820, width: "100%", margin: "0 auto", padding: "clamp(48px,6vw,64px) clamp(20px,4vw,24px) 0" }}>
        {/* Resources */}
        <h2
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 26,
            margin: "0 0 24px",
            letterSpacing: "-0.01em",
          }}
        >
          Official resources
        </h2>
        <div style={{ marginBottom: 64 }}>
          {RESOURCES.map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 16,
                padding: "16px 0",
                borderTop: "1px solid #e0d9c6",
                textDecoration: "none",
                color: "#17140f",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>{r.title}</div>
                <div style={{ fontSize: 13, color: "#6f6857" }}>{r.desc}</div>
              </div>
              <span style={{ fontSize: 13, color: "#9c2b23", flexShrink: 0 }}>→</span>
            </a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", paddingBottom: 64 }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "14px 32px",
              border: "1px solid #17140f",
              background: "#151209",
              color: "#f4efe4",
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Analyse your lease
          </Link>
          <p style={{ marginTop: 14, fontSize: 13, color: "#6f6857" }}>
            Free · no account required · Ontario leases only
          </p>
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
