import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "View and manage your Ontario lease analyses.",
  robots: { index: false, follow: false },
};
import { SignOutButton } from "../components/auth-button";
import { DeleteLeaseButton } from "../components/delete-lease-button";

interface LeaseRow {
  id: string;
  uploaded_at: string;
  overall_risk_score: number | null;
  overall_risk_level: "low" | "medium" | "high" | "critical" | null;
  file_path: string;
  property_address: string | null;
  property_city: string | null;
}

const RISK_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  critical: { text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  high: { text: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  medium: { text: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  low: { text: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
};

function riskStyle(level: string | null) {
  return RISK_COLORS[level ?? "low"] ?? RISK_COLORS.low;
}

function filename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const dashboardStyles = `
  .dash-new-btn:hover { background: #2a2825 !important; }
  .dash-view-btn:hover { background: #f6f3ee !important; }
`;

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
      "id, uploaded_at, overall_risk_score, overall_risk_level, file_path, property_address, property_city"
    )
    .eq("user_id", user.id)
    .eq("status", "complete")
    .order("uploaded_at", { ascending: false });

  const rows = (leases ?? []) as LeaseRow[];
  const initial = (user.email ?? user.id)[0].toUpperCase();

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
      <style>{dashboardStyles}</style>
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

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* User avatar + email */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                background: "#181614",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initial}
            </span>
            <span style={{ fontSize: "13px", color: "#5c5751" }}>
              {user.email}
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          maxWidth: "800px",
          width: "100%",
          margin: "0 auto",
          padding: "48px 24px 80px",
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 600,
                fontSize: "30px",
                color: "#181614",
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              Your Analyses
            </h1>
            {rows.length > 0 && (
              <p
                style={{
                  fontSize: "13px",
                  color: "#9a9590",
                  margin: "4px 0 0",
                }}
              >
                {rows.length} {rows.length === 1 ? "lease" : "leases"} analysed
              </p>
            )}
          </div>
          <Link
            href="/"
            className="dash-new-btn"
            style={{
              padding: "9px 20px",
              borderRadius: "7px",
              background: "#181614",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.01em",
              flexShrink: 0,
            }}
          >
            + New analysis
          </Link>
        </div>

        {rows.length === 0 ? (
          /* Empty state */
          <div
            style={{
              background: "#fff",
              border: "1px solid #e8e4dc",
              borderRadius: "12px",
              padding: "64px 36px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "#f6f3ee",
                border: "1px solid #e8e4dc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9a9590"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="12" x2="12" y2="16" />
                <line x1="10" y1="14" x2="14" y2="14" />
              </svg>
            </div>
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 600,
                fontSize: "22px",
                color: "#181614",
                margin: "0 0 8px",
              }}
            >
              No analyses yet
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#6b6560",
                margin: "0 0 24px",
                lineHeight: 1.6,
              }}
            >
              Upload an Ontario residential lease and your analysis will appear
              here.
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
              Analyse a lease →
            </Link>
          </div>
        ) : (
          /* Lease list */
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {rows.map((lease, i) => {
              const rs = riskStyle(lease.overall_risk_level);
              const title =
                lease.property_address ??
                filename(lease.file_path).replace(/\.[^.]+$/, "");
              const subtitle =
                lease.property_city ?? filename(lease.file_path);

              return (
                <div
                  key={lease.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #e8e4dc",
                    borderRadius:
                      i === 0 && rows.length === 1
                        ? "10px"
                        : i === 0
                        ? "10px 10px 2px 2px"
                        : i === rows.length - 1
                        ? "2px 2px 10px 10px"
                        : "2px",
                    padding: "18px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  {/* Risk score pill */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: "44px",
                      height: "44px",
                      borderRadius: "8px",
                      background: rs.bg,
                      border: `1px solid ${rs.border}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: rs.text,
                        lineHeight: 1,
                      }}
                    >
                      {lease.overall_risk_score?.toFixed(1) ?? "—"}
                    </span>
                    <span
                      style={{
                        fontSize: "9px",
                        color: rs.text,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        marginTop: "2px",
                      }}
                    >
                      {lease.overall_risk_level ?? "—"}
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#181614",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {title}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "12px",
                        color: "#9a9590",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {subtitle} · {formatDate(lease.uploaded_at)}
                    </p>
                  </div>

                  {/* View report link */}
                  <Link
                    href={`/report/${lease.id}`}
                    className="dash-view-btn"
                    style={{
                      flexShrink: 0,
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "1px solid #e8e4dc",
                      background: "#fff",
                      fontSize: "12px",
                      color: "#5c5751",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    View report →
                  </Link>

                  {/* PIPEDA erasure */}
                  <DeleteLeaseButton leaseId={lease.id} />
                </div>
              );
            })}
          </div>
        )}
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
          flexWrap: "wrap",
        }}
      >
        <span>LeaseGuard provides educational information only — not legal advice.</span>
        <span style={{ color: "#ddd8cf" }}>·</span>
        <Link href="/privacy" style={{ color: "#b0aaa4", textDecoration: "underline" }}>
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
