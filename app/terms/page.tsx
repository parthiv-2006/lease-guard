import Link from "next/link";

export const metadata = {
  title: "Terms of Service — LeaseGuard",
  description:
    "Terms governing your use of LeaseGuard. This is an educational service, not legal advice.",
};

const LAST_UPDATED = "May 23, 2026";
const CONTACT_EMAIL = "parthiv.paul5545@gmail.com";

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "40px" }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 600,
          fontSize: "22px",
          color: "#181614",
          letterSpacing: "-0.01em",
          margin: "0 0 12px",
          display: "flex",
          gap: "12px",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 600,
            color: "#9a9590",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            flexShrink: 0,
          }}
        >
          {number}
        </span>
        {title}
      </h2>
      <div
        style={{
          fontSize: "14px",
          color: "#3d3935",
          lineHeight: 1.75,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul
      style={{
        margin: "0 0 12px",
        paddingLeft: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {items.map((item, i) => (
        <li key={i} style={{ lineHeight: 1.65 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
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
        <Link
          href="/"
          style={{
            fontSize: "13px",
            color: "#6b6560",
            textDecoration: "none",
          }}
        >
          ← Back to home
        </Link>
      </header>

      {/* Content */}
      <main
        style={{
          flex: 1,
          maxWidth: "720px",
          width: "100%",
          margin: "0 auto",
          padding: "56px 24px 80px",
        }}
      >
        {/* Title block */}
        <div style={{ marginBottom: "48px" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#9a9590",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 10px",
            }}
          >
            Legal
          </p>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "42px",
              color: "#181614",
              letterSpacing: "-0.02em",
              margin: "0 0 14px",
              lineHeight: 1.1,
            }}
          >
            Terms of Service
          </h1>
          <p style={{ fontSize: "14px", color: "#6b6560", margin: 0 }}>
            Last updated: {LAST_UPDATED}. These terms apply to all users of
            LeaseGuard, a service provided by Parthiv Paul (&ldquo;we&rdquo;,
            &ldquo;our&rdquo;, &ldquo;us&rdquo;). By using LeaseGuard, you
            agree to these terms.
          </p>
        </div>

        {/* Disclaimer callout */}
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "10px",
            padding: "20px 24px",
            marginBottom: "40px",
          }}
        >
          <p style={{ fontSize: "13px", color: "#92400e", margin: 0, lineHeight: 1.65 }}>
            <strong>LeaseGuard is an educational tool, not a law firm.</strong>{" "}
            Nothing on this site constitutes legal advice, creates a
            lawyer-client relationship, or should be relied upon as a substitute
            for professional legal counsel. Always consult a licensed lawyer or
            paralegal for advice about your specific situation.
          </p>
        </div>

        <Section number="1" title="Who May Use This Service">
          <P>
            LeaseGuard is available to any person who can form a binding
            contract under applicable law. By creating an account or submitting
            a lease for analysis, you represent that:
          </P>
          <Ul
            items={[
              "You are at least 18 years of age or the age of majority in your jurisdiction.",
              "You are using the service for personal, non-commercial purposes.",
              "You have the right to upload the document you submit (e.g., you are a party to the lease or have obtained the other party's consent).",
              "Your use of LeaseGuard will not violate any applicable law or regulation.",
            ]}
          />
        </Section>

        <Section number="2" title="What LeaseGuard Does">
          <P>
            LeaseGuard uses artificial intelligence to analyse Ontario
            residential lease PDFs and identify clauses that may be
            inconsistent with the{" "}
            <em>Residential Tenancies Act, 2006</em> (Ontario). It provides
            plain-language summaries, risk ratings, and suggested negotiation
            language.
          </P>
          <P>
            All legal references are grounded in retrieved statute and tribunal
            text from our database. However, AI analysis can contain errors,
            miss context, or become outdated as law changes. Output from
            LeaseGuard should be treated as a starting point for your own
            research, not a definitive legal opinion.
          </P>
        </Section>

        <Section number="3" title="Not Legal Advice">
          <P>
            LeaseGuard is an <strong>educational information service</strong>.
            It is not a law firm, and no portion of this service constitutes
            legal advice. No lawyer-client or paralegal-client relationship is
            formed by your use of LeaseGuard.
          </P>
          <P>
            Reliance on any information provided by LeaseGuard is solely at
            your own risk. For advice tailored to your situation, consult a
            licensed Ontario lawyer, paralegal, or a Community Legal Clinic
            (free for eligible tenants).
          </P>
        </Section>

        <Section number="4" title="Acceptable Use">
          <P>You agree not to use LeaseGuard to:</P>
          <Ul
            items={[
              "Upload documents you do not have the right to submit.",
              "Attempt to reverse-engineer, scrape, or systematically extract data from the service.",
              "Submit malicious files, or attempt to disrupt or compromise the service.",
              "Use analysis results for commercial resale, redistribution, or as a component of another product without our written permission.",
              "Impersonate another person or misrepresent your identity.",
              "Violate any applicable law, including privacy law, in connection with your use.",
            ]}
          />
          <P>
            We reserve the right to suspend or terminate access for any
            violation of these terms, without notice.
          </P>
        </Section>

        <Section number="5" title="User Accounts">
          <P>
            You may use LeaseGuard as a guest (without an account) or by
            creating an account with an email address. If you create an
            account:
          </P>
          <Ul
            items={[
              "You are responsible for maintaining the confidentiality of your credentials.",
              "You are responsible for all activity that occurs under your account.",
              "You must notify us immediately of any unauthorized access at " + CONTACT_EMAIL + ".",
            ]}
          />
          <P>
            We reserve the right to terminate accounts that violate these
            terms or are inactive for more than 24 months.
          </P>
        </Section>

        <Section number="6" title="Intellectual Property">
          <P>
            The LeaseGuard service, including its design, software, prompts,
            scoring models, and corpus, is owned by Parthiv Paul. You may not
            copy, reproduce, or create derivative works from the service or its
            outputs for commercial purposes.
          </P>
          <P>
            You retain ownership of any lease documents you upload. By
            uploading, you grant us a limited, non-exclusive licence to process
            the document for the purpose of providing the analysis. We do not
            claim ownership of your content.
          </P>
          <P>
            Anonymised clause text may be retained in our benchmark database
            to improve comparison accuracy for future users. All personally
            identifiable information is removed before retention (see our{" "}
            <Link href="/privacy" style={{ color: "#181614" }}>
              Privacy Policy
            </Link>
            ).
          </P>
        </Section>

        <Section number="7" title="Disclaimer of Warranties">
          <P>
            LeaseGuard is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind, express or
            implied. We do not warrant that:
          </P>
          <Ul
            items={[
              "The service will be uninterrupted, error-free, or free of harmful components.",
              "Analysis results are accurate, complete, current, or applicable to your situation.",
              "The service will identify all problematic clauses or risks in a lease.",
            ]}
          />
        </Section>

        <Section number="8" title="Limitation of Liability">
          <P>
            To the maximum extent permitted by applicable law, Parthiv Paul
            shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages arising from your use of
            LeaseGuard — including but not limited to damages for lost profits,
            data loss, or harm resulting from reliance on analysis output.
          </P>
          <P>
            Our total liability for any claim arising from your use of
            LeaseGuard shall not exceed the amount you paid to us in the
            twelve months preceding the claim (or $0 if you used the service
            for free).
          </P>
        </Section>

        <Section number="9" title="Privacy">
          <P>
            Your use of LeaseGuard is also governed by our{" "}
            <Link href="/privacy" style={{ color: "#181614" }}>
              Privacy Policy
            </Link>
            , which is incorporated into these terms by reference. By using
            LeaseGuard, you consent to the data practices described in the
            Privacy Policy.
          </P>
        </Section>

        <Section number="10" title="Changes to These Terms">
          <P>
            We may update these terms from time to time. Material changes will
            be reflected by an updated &ldquo;Last updated&rdquo; date at the
            top of this page. Continued use of LeaseGuard after a change
            constitutes acceptance of the updated terms.
          </P>
        </Section>

        <Section number="11" title="Governing Law">
          <P>
            These terms are governed by the laws of the Province of Ontario and
            the federal laws of Canada applicable therein. Any dispute arising
            from your use of LeaseGuard shall be subject to the exclusive
            jurisdiction of the courts of Ontario.
          </P>
        </Section>

        <Section number="12" title="Contact">
          <P>
            Questions about these terms may be directed to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#181614" }}>
              {CONTACT_EMAIL}
            </a>
            .
          </P>
        </Section>
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
        <span>
          LeaseGuard provides educational information only — not legal advice.
        </span>
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
