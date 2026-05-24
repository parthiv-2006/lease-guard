import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — LeaseGuard",
  description:
    "How LeaseGuard collects, uses, and protects your personal information under PIPEDA.",
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
            textTransform: "uppercase",
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

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p style={{ fontSize: "14px", color: "#6b6560", margin: 0 }}>
            Last updated: {LAST_UPDATED}. This policy applies to all users of
            LeaseGuard, a service provided by Parthiv Paul (&ldquo;we&rdquo;,
            &ldquo;our&rdquo;, &ldquo;us&rdquo;).
          </p>
        </div>

        {/* PIPEDA notice */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e4dc",
            borderRadius: "10px",
            padding: "20px 24px",
            marginBottom: "40px",
          }}
        >
          <p style={{ fontSize: "13px", color: "#5c5751", margin: 0, lineHeight: 1.65 }}>
            LeaseGuard is subject to Canada&rsquo;s{" "}
            <strong>Personal Information Protection and Electronic Documents Act (PIPEDA)</strong>.
            We are committed to responsible handling of your personal
            information. This policy explains what we collect, why, and how you
            can exercise your rights.
          </p>
        </div>

        {/* Sections */}

        <Section number="1" title="Accountability">
          <P>
            Parthiv Paul is responsible for personal information collected and
            held by LeaseGuard. Questions or complaints about our privacy
            practices may be directed to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#181614" }}>
              {CONTACT_EMAIL}
            </a>
            .
          </P>
        </Section>

        <Section number="2" title="What We Collect and Why">
          <P>
            We collect only the personal information necessary to provide the
            LeaseGuard service. Specifically:
          </P>
          <Ul
            items={[
              "Lease PDF files you upload — processed to identify clauses and assess risk under Ontario law. These files may contain personal information including names, addresses, unit numbers, and financial terms.",
              "Email address — collected only if you create an account, used solely to authenticate you and associate your analyses with your account.",
              "IP address — collected automatically for rate-limiting (max 5 analyses per hour) and security purposes. Not linked to your identity.",
            ]}
          />
          <P>
            We do <strong>not</strong> collect payment information, government
            identification, or any information beyond what is described above.
            We do <strong>not</strong> use tracking cookies, analytics scripts,
            or advertising technologies.
          </P>
        </Section>

        <Section number="3" title="Consent">
          <P>
            We obtain your consent before processing your lease PDF. The upload
            form displays a clear consent notice that you must acknowledge
            before submitting. By ticking the consent checkbox, you confirm that
            you understand the PDF will be processed and temporarily stored.
          </P>
          <P>
            If you create an account, you consent to us storing your email
            address and associating your analyses with your account. You may
            withdraw consent at any time by deleting your analyses and
            requesting account deletion (see Section 9).
          </P>
          <P>
            Guest uploads (without an account) are processed with your
            in-session consent. No account is created and no email is stored.
          </P>
        </Section>

        <Section number="4" title="Limiting Collection">
          <P>
            We collect personal information only by fair and lawful means, and
            only to the extent necessary for the stated purposes. We do not
            read, store, or index the names, addresses, or identifying details
            within your lease PDF — the AI analysis processes clause text for
            legal risk patterns only.
          </P>
          <P>
            Clause text stored in our database is used for risk scoring and
            benchmarking. Any personally identifying details within clause text
            (e.g., a name appearing in a lease clause) are incidental and are
            not extracted, indexed, or used for any other purpose.
          </P>
        </Section>

        <Section number="5" title="Retention and Deletion">
          <P>
            <strong>Reports</strong> — automatically expire and are deleted
            after <strong>90 days</strong> from the date of upload. This
            includes the full analysis, clause breakdown, and all associated
            data.
          </P>
          <P>
            <strong>Lease PDF files</strong> — stored in encrypted cloud
            storage (Supabase Storage) for the duration of the 90-day report
            period. Deleted with the report or immediately upon your request.
          </P>
          <P>
            <strong>Account email</strong> — retained for as long as your
            account exists. Deleted immediately upon account deletion.
          </P>
          <P>
            Authenticated users can delete individual analyses at any time from
            the Dashboard. To request deletion of your account and all
            associated data, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#181614" }}>
              {CONTACT_EMAIL}
            </a>
            . We will complete the deletion within 30 days.
          </P>
        </Section>

        <Section number="6" title="Use and Disclosure">
          <P>
            Your personal information is used exclusively to provide the
            LeaseGuard service. We do <strong>not</strong>:
          </P>
          <Ul
            items={[
              "Sell, rent, or trade your personal information to any third party.",
              "Share your lease content with other users or organizations.",
              "Use your lease data to train AI models.",
              "Send marketing emails or share your email with mailing lists.",
            ]}
          />
          <P>
            We may disclose information only if required by law (e.g., a valid
            court order) or to protect the safety of users or the public. We
            will notify you of any such disclosure to the extent permitted by
            law.
          </P>
        </Section>

        <Section number="7" title="Accuracy">
          <P>
            We do not modify the content of uploaded lease PDFs. The AI
            analysis may contain errors — it is educational information, not
            legal advice. If you believe our analysis contains a material error,
            you may use the feedback mechanism on the report page to flag it.
          </P>
        </Section>

        <Section number="8" title="Safeguards">
          <P>
            We use the following technical safeguards to protect your
            information:
          </P>
          <Ul
            items={[
              "TLS encryption for all data in transit between your browser and our servers.",
              "Supabase (our database and storage provider) encrypts data at rest using AES-256.",
              "Lease PDFs are stored in a private Supabase Storage bucket — not publicly accessible. Access requires a time-limited signed URL (valid 1 hour).",
              "Database access is restricted to service-role credentials held server-side. No client-side access to raw data.",
              "Rate limiting (5 analyses per hour per IP) reduces abuse risk.",
            ]}
          />
          <P>
            <strong>Cross-border transfer:</strong> Our database and storage
            provider, Supabase, operates servers in the United States. By using
            LeaseGuard, you consent to your information being stored and
            processed in the United States, subject to US law. Supabase is SOC
            2 Type II certified.
          </P>
        </Section>

        <Section number="9" title="Your Rights — Access and Erasure">
          <P>
            Under PIPEDA, you have the right to:
          </P>
          <Ul
            items={[
              "Access the personal information we hold about you.",
              "Challenge the accuracy of your personal information.",
              "Request deletion of your personal information.",
            ]}
          />
          <P>
            <strong>To delete a specific analysis:</strong> Sign in to your
            Dashboard and click the delete button on any lease row.
          </P>
          <P>
            <strong>To delete your account and all data:</strong> Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#181614" }}>
              {CONTACT_EMAIL}
            </a>{" "}
            from the email address associated with your account, with the
            subject line &ldquo;Delete my account&rdquo;. We will confirm
            deletion within 30 days.
          </P>
          <P>
            <strong>Guest analyses:</strong> If you uploaded without an
            account, your report will auto-delete after 90 days. For earlier
            deletion, email us with your report URL.
          </P>
        </Section>

        <Section number="10" title="Challenging Compliance">
          <P>
            If you have a complaint about our privacy practices, please contact
            us first at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#181614" }}>
              {CONTACT_EMAIL}
            </a>
            . We will respond within 30 days.
          </P>
          <P>
            If you are not satisfied with our response, you may escalate to the
            Office of the Privacy Commissioner of Canada at{" "}
            <a
              href="https://www.priv.gc.ca"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#181614" }}
            >
              www.priv.gc.ca
            </a>
            .
          </P>
        </Section>

        <Section number="11" title="Changes to This Policy">
          <P>
            We may update this policy from time to time. Material changes will
            be noted at the top of this page with a new &ldquo;Last
            updated&rdquo; date. Continued use of LeaseGuard after a change
            constitutes acceptance of the updated policy.
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
