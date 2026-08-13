import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SignOutButton } from "../components/auth-button";
import { DashboardList, type LeaseCardData, type TopFinding } from "../components/dashboard-list";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "View and manage your Ontario lease analyses.",
  robots: { index: false, follow: false },
};

interface LeaseRow {
  id: string;
  status: "pending" | "processing" | "complete" | "failed";
  uploaded_at: string;
  overall_risk_score: number | null;
  overall_risk_level: "low" | "medium" | "high" | "critical" | null;
  file_path: string;
  property_address: string | null;
  property_city: string | null;
  error_message: string | null;
  display_title: string | null;
}

interface ClauseRow {
  lease_id: string;
  clause_number: string;
  heading: string | null;
  risk_score: number | null;
  statutory_violations: Array<{ statute_section: string; violation_description: string }> | null;
}

function filename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function toFinding(c: ClauseRow): TopFinding {
  const violation = c.statutory_violations?.[0];
  return {
    citation: violation?.statute_section ?? c.heading ?? `Clause ${c.clause_number}`,
    text: violation?.violation_description ?? c.heading ?? `Clause ${c.clause_number}`,
  };
}

export default async function DashboardPage() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) redirect("/sign-in?next=/dashboard");

  const adminClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: leases } = await adminClient
    .from("leases")
    .select(
      "id, status, uploaded_at, overall_risk_score, overall_risk_level, file_path, property_address, property_city, error_message, display_title"
    )
    .eq("user_id", user.id)
    .order("uploaded_at", { ascending: false });

  const rows = (leases ?? []) as LeaseRow[];
  const leaseIds = rows.filter((r) => r.status === "complete").map((r) => r.id);

  // Top clause per lease (for hover-peek + verdict header), fetched in one query
  // and grouped client-side — cheap for the realistic size of one user's docket.
  let topFindingByLease = new Map<string, TopFinding>();
  if (leaseIds.length > 0) {
    const { data: clauses } = await adminClient
      .from("clauses")
      .select("lease_id, clause_number, heading, risk_score, statutory_violations")
      .in("lease_id", leaseIds)
      .order("risk_score", { ascending: false, nullsFirst: false });

    for (const c of (clauses ?? []) as ClauseRow[]) {
      if (!topFindingByLease.has(c.lease_id)) {
        topFindingByLease.set(c.lease_id, toFinding(c));
      }
    }
  }

  const cards: LeaseCardData[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    uploaded_at: r.uploaded_at,
    overall_risk_score: r.overall_risk_score,
    overall_risk_level: r.overall_risk_level,
    title: r.display_title ?? r.property_address ?? filename(r.file_path).replace(/\.[^.]+$/, ""),
    subtitle: r.property_city ?? filename(r.file_path),
    error_message: r.error_message,
    topFinding: topFindingByLease.get(r.id) ?? null,
  }));

  const scored = cards.filter((c) => c.status === "complete" && c.overall_risk_score != null);
  const topLease = [...scored].sort((a, b) => (b.overall_risk_score ?? 0) - (a.overall_risk_score ?? 0))[0] ?? null;
  const needsAttention = scored.filter((c) => c.overall_risk_level === "critical" || c.overall_risk_level === "high").length;

  const initial = (user.email ?? user.id)[0].toUpperCase();

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
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
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
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#6f6857",
            }}
          >
            Docket
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#151209",
                color: "#e9e4d5",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initial}
            </span>
            <span style={{ fontSize: 13, color: "#4a4438" }}>{user.email}</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, maxWidth: 1200, width: "100%", margin: "0 auto", padding: "clamp(40px,5vw,48px) clamp(24px,4vw,40px) 80px" }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>
          <div>
            <h1
              style={{
                fontFamily: "'Newsreader', serif",
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: "clamp(38px,5vw,60px)",
                lineHeight: 1,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Your analyses
            </h1>
            <p style={{ fontSize: 15, color: "#6f6857", margin: "8px 0 0" }}>
              {rows.length === 0
                ? "Nothing on file yet."
                : `${rows.length} ${rows.length === 1 ? "lease" : "leases"} on file · ${needsAttention} need${needsAttention === 1 ? "s" : ""} attention`}
            </p>
          </div>
          <Link
            href="/"
            style={{
              padding: "14px 24px",
              border: "1px solid #17140f",
              background: "#151209",
              color: "#f4efe4",
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              flexShrink: 0,
              fontFamily: "'Public Sans', sans-serif",
            }}
          >
            Analyse a new lease
          </Link>
        </div>

        {/* Verdict header */}
        {topLease && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
              gap: 1,
              background: "#151209",
              border: "1px solid #17140f",
              color: "#e9e4d5",
              marginBottom: "clamp(32px,4vw,48px)",
            }}
          >
            <VerdictCell eyebrow="Highest risk on file">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(60px,7vw,86px)", lineHeight: 1, color: "#ff9d94" }}>
                  {topLease.overall_risk_score?.toFixed(1)}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: "uppercase", color: "#ff9d94" }}>
                  {topLease.overall_risk_level}
                </span>
              </div>
              <div style={{ fontSize: 14, color: "#e9e4d5", marginTop: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {topLease.title}
              </div>
            </VerdictCell>

            <VerdictCell eyebrow="Severity spread" border>
              <SeveritySpread scored={scored} />
            </VerdictCell>

            <VerdictCell eyebrow="Act on this first" eyebrowColor="#ff9d94" border>
              {topLease.topFinding ? (
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div style={{ fontFamily: "'Newsreader', serif", fontStyle: "italic", fontSize: 21, lineHeight: 1.4, marginBottom: 10 }}>
                    &ldquo;{topLease.topFinding.text}&rdquo;
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#a8a08c", marginBottom: 16 }}>
                    {topLease.topFinding.citation}
                  </div>
                  <Link
                    href={`/report/${topLease.id}`}
                    style={{ marginTop: "auto", fontSize: 14, fontWeight: 600, color: "#f4efe4", borderBottom: "1px solid #4a4438", textDecoration: "none", alignSelf: "flex-start" }}
                  >
                    Open the finding →
                  </Link>
                </div>
              ) : (
                <Link
                  href={`/report/${topLease.id}`}
                  style={{ fontSize: 14, fontWeight: 600, color: "#f4efe4", borderBottom: "1px solid #4a4438", textDecoration: "none" }}
                >
                  Open the report →
                </Link>
              )}
            </VerdictCell>
          </div>
        )}

        <DashboardList rows={cards} />
      </main>

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
      </footer>
    </div>
  );
}

function VerdictCell({
  eyebrow,
  eyebrowColor = "#a8a08c",
  border,
  children,
}: {
  eyebrow: string;
  eyebrowColor?: string;
  border?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "clamp(24px,2.6vw,32px)", borderLeft: border ? "1px solid #2b2720" : "none", display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: eyebrowColor, marginBottom: 16 }}>
        {eyebrow}
      </div>
      {children}
    </div>
  );
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#9c2b23",
  high: "#a15a1f",
  medium: "#93690f",
  low: "#2f6b3a",
};

function SeveritySpread({ scored }: { scored: LeaseCardData[] }) {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of scored) {
    if (c.overall_risk_level) counts[c.overall_risk_level] = (counts[c.overall_risk_level] ?? 0) + 1;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 12, marginBottom: 14 }}>
        {(["critical", "high", "medium", "low"] as const).map((level) => (
          <div key={level} style={{ flex: Math.max(0.35, counts[level]), background: SEVERITY_COLOR[level] }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(["critical", "high", "medium", "low"] as const).map((level) => (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, background: SEVERITY_COLOR[level], flexShrink: 0 }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#a8a08c", textTransform: "capitalize", flex: 1 }}>{level}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#e9e4d5" }}>{counts[level]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
