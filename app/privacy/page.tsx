import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — LeaseGuard",
  description:
    "How LeaseGuard collects, uses, and protects your personal information under PIPEDA.",
};

const LAST_UPDATED = "June 6, 2026";
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
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px,170px) 1fr",
        gap: 24,
        padding: "30px 0",
        borderTop: "1px solid #e0d9c6",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            color: "#9c2b23",
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          {number.padStart(2, "0")}
        </div>
        <h2
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 19,
            color: "#17140f",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ fontSize: 14, color: "#4a4438", lineHeight: 1.75 }}>{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <li key={i} style={{ lineHeight: 1.65 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

const FACTS = [
  { figure: "90 days", label: "Reports and uploaded PDFs expire and are deleted automatically" },
  { figure: "Never trained on", label: "Your lease data is never used to train AI models" },
  { figure: "No tracking", label: "One strictly necessary session cookie. No analytics or ad cookies" },
  { figure: "5 / hour", label: "Maximum analyses per IP address, to limit abuse" },
];

export default function PrivacyPage() {
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
        <Link href="/" style={{ fontSize: 14, color: "#4a4438", textDecoration: "none" }}>
          ← Back to home
        </Link>
      </header>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: 820, width: "100%", margin: "0 auto", padding: "clamp(48px,6vw,64px) clamp(20px,4vw,24px) 0" }}>
        {/* Title block */}
        <div style={{ marginBottom: 40 }}>
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#6f6857",
              margin: "0 0 16px",
            }}
          >
            Privacy · PIPEDA
          </p>
          <h1
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "clamp(38px,5vw,54px)",
              color: "#17140f",
              letterSpacing: "-0.02em",
              margin: "0 0 16px",
              lineHeight: 1.08,
            }}
          >
            Your lease is yours.
          </h1>
          <p style={{ fontSize: 15, color: "#4a4438", margin: 0, lineHeight: 1.6 }}>
            Last updated: {LAST_UPDATED}. This policy applies to all users of LeaseGuard, a
            service provided by Parthiv Paul (&ldquo;we&rdquo;, &ldquo;our&rdquo;,
            &ldquo;us&rdquo;).
          </p>
        </div>

        {/* Facts strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            gap: 24,
            border: "1px solid #e0d9c6",
            borderLeft: "none",
            borderRight: "none",
            padding: "28px 0",
            marginBottom: 40,
          }}
        >
          {FACTS.map((f) => (
            <div key={f.label}>
              <div style={{ fontFamily: "'Newsreader', serif", fontWeight: 600, fontSize: 26, marginBottom: 8, lineHeight: 1.1 }}>
                {f.figure}
              </div>
              <div style={{ fontSize: 12, color: "#6f6857", lineHeight: 1.5 }}>{f.label}</div>
            </div>
          ))}
        </div>

        {/* PIPEDA notice */}
        <div style={{ borderLeft: "3px solid #9c2b23", background: "#f7f4ee", padding: "16px 20px", marginBottom: 8 }}>
          <p style={{ fontSize: 14, color: "#4a4438", margin: 0, lineHeight: 1.65 }}>
            LeaseGuard is subject to Canada&rsquo;s{" "}
            <strong>Personal Information Protection and Electronic Documents Act (PIPEDA)</strong>.
            We are committed to responsible handling of your personal information. This policy
            explains what we collect, why, and how you can exercise your rights.
          </p>
        </div>

        {/* Sections */}

        <Section number="1" title="Accountability">
          <P>
            Parthiv Paul is responsible for personal information collected and
            held by LeaseGuard. Questions or complaints about our privacy
            practices may be directed to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#9c2b23" }}>
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
              "IP address — collected automatically for rate-limiting (max 5 analyses per hour) and security purposes. An IP address may constitute personal information under PIPEDA if it can identify an individual; we do not attempt to identify individuals from IP addresses and do not link them to account records.",
            ]}
          />
          <P>
            <strong>Cookies and session storage:</strong> We use a strictly
            necessary session cookie issued by our authentication provider
            (Supabase Auth) to maintain your logged-in session. We do{" "}
            <strong>not</strong> use tracking cookies, analytics cookies,
            advertising cookies, or any third-party cookie-based tracking.
            The session cookie is deleted when you sign out or after a period
            of inactivity.
          </P>
          <P>
            We do <strong>not</strong> collect payment information, government
            identification, or any information beyond what is described above.
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
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#9c2b23" }}>
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

        <Section number="8" title="Third-Party Processors">
          <P>
            To operate LeaseGuard, we transfer personal information (including
            lease content) to the following third-party data processors located
            outside Canada. Under PIPEDA, we remain accountable for information
            transferred to these processors and require them to provide
            comparable protection.
          </P>
          <Ul
            items={[
              "Anthropic, Inc. (United States) — your lease document text is transmitted to Anthropic's Claude API for AI analysis. Anthropic's commercial API terms prohibit using customer data to train AI models. Privacy policy: anthropic.com/privacy.",
              "Google LLC / Gemini API (United States) — clause text is transmitted to Google's Gemini API to generate embeddings for semantic legal search. Privacy policy: policies.google.com/privacy.",
              "Supabase, Inc. (United States) — your uploaded PDF and analysis results are stored in Supabase's database and encrypted file storage. Supabase is SOC 2 Type II certified.",
              "Vercel, Inc. (United States) — application hosting and serverless functions. All web requests, including file uploads, are routed through Vercel's infrastructure.",
            ]}
          />
          <P>
            By using LeaseGuard, you consent to your personal information being
            transferred to and processed in the United States by these
            providers, subject to US federal and state law including the
            US Cloud Act. If you do not consent to cross-border transfer, do
            not use LeaseGuard.
          </P>
        </Section>

        <Section number="9" title="Safeguards">
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
        </Section>

        <Section number="10" title="Data Breach Notification">
          <P>
            In the event of a breach of security involving personal information
            that creates a real risk of significant harm to individuals, we
            will:
          </P>
          <Ul
            items={[
              "Notify the Office of the Privacy Commissioner of Canada as soon as feasible after determining a reportable breach has occurred.",
              "Notify affected individuals directly as soon as feasible, with information about the breach and steps they can take to protect themselves.",
              "Maintain a record of every breach of security safeguards for a minimum of 24 months.",
            ]}
          />
          <P>
            To report a suspected security vulnerability or data incident,
            contact us immediately at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#9c2b23" }}>
              {CONTACT_EMAIL}
            </a>
            .
          </P>
        </Section>

        <Section number="11" title="Your Rights — Access and Erasure">
          <P>Under PIPEDA, you have the right to:</P>
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
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#9c2b23" }}>
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

        <Section number="12" title="Challenging Compliance">
          <P>
            If you have a complaint about our privacy practices, please contact
            us first at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#9c2b23" }}>
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
              style={{ color: "#9c2b23" }}
            >
              www.priv.gc.ca
            </a>
            .
          </P>
        </Section>

        <Section number="13" title="Changes to This Policy">
          <P>
            We may update this policy from time to time. Material changes will
            be noted at the top of this page with a new &ldquo;Last
            updated&rdquo; date. Continued use of LeaseGuard after a change
            constitutes acceptance of the updated policy.
          </P>
        </Section>
      </main>

      {/* Delete everything CTA */}
      <div style={{ borderTop: "1px solid #17140f", background: "#151209", color: "#f4efe4" }}>
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto",
            padding: "clamp(40px,5vw,56px) clamp(20px,4vw,24px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "'Newsreader', serif",
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: 26,
                margin: "0 0 8px",
                letterSpacing: "-0.01em",
              }}
            >
              Delete everything now.
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "#a8a08c", maxWidth: 440, lineHeight: 1.6 }}>
              Signed-in users can delete any analysis from the Dashboard — PDF, clause text and
              report together, immediately. No account? Email us your report URL and we&rsquo;ll
              remove it early instead of waiting for the 90-day expiry.
            </p>
          </div>
          <Link
            href="/dashboard"
            style={{
              flexShrink: 0,
              padding: "14px 26px",
              border: "1px solid #f4efe4",
              background: "#f4efe4",
              color: "#151209",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Go to Dashboard
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: "20px clamp(20px,4vw,56px)",
          borderTop: "1px solid #17140f",
          fontSize: 12,
          color: "#6f6857",
          textAlign: "center",
          flexShrink: 0,
          display: "flex",
          gap: 16,
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span>LeaseGuard provides educational information only — not legal advice.</span>
        <span style={{ color: "#cfc6ab" }}>·</span>
        <Link href="/privacy" style={{ color: "#6f6857", textDecoration: "underline" }}>
          Privacy Policy
        </Link>
        <span style={{ color: "#cfc6ab" }}>·</span>
        <Link href="/terms" style={{ color: "#6f6857", textDecoration: "underline" }}>
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
