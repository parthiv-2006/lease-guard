import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { getClientIp } from "@/lib/client-ip";
import { checkLeaseAccess } from "@/lib/lease-access";

const DISCLAIMER =
  "This analysis is not legal advice. Consult a licensed paralegal or lawyer before making decisions about your lease. Community Legal Clinics in Ontario offer free legal help for tenants.";

// PDF signed URLs expire in 15 minutes — short window limits PII exposure if a
// URL leaks via browser history or referrer headers.
const PDF_SIGNED_URL_TTL_SECONDS = 900;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkDbRateLimit(getClientIp(req), { storeKey: "report-get", maxRequests: 60 });
  if (!rl.allowed) {
    const { body, headers, status } = dbRateLimitExceededResponse(rl.resetAt);
    return NextResponse.json(body, { status, headers });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const shareToken = searchParams.get("token");

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "invalid_id", message: "Invalid report ID format." },
      { status: 400 }
    );
  }

  // Get the authenticated user (if any) in parallel with DB fetches.
  // We use getUser() here (server-validated) not getSession() because we make
  // an ownership decision based on the result.
  const authClient = await createSupabaseServerClient();

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch auth user + report + lease metadata + clauses + agent trace in parallel
  const [userResult, reportResult, leaseResult, clausesResult, traceResult] =
    await Promise.all([
      authClient.auth.getUser(),
      supabase
        .from("reports")
        .select("*")
        .eq("lease_id", id)
        .gt("expires_at", new Date().toISOString())
        .single(),
      supabase
        .from("leases")
        .select(
          "id, user_id, uploaded_at, jurisdiction, jurisdiction_code, page_count, extraction_method, file_path, " +
          "property_address, property_unit, property_city, property_postal_code"
        )
        .eq("id", id)
        .single(),
      supabase
        .from("clauses")
        .select(
          "id, clause_number, heading, raw_text, primary_type, risk_score, risk_level, " +
          "is_potentially_unenforceable, is_unusual, is_standard, " +
          "plain_english_explanation, risk_reasoning, statutory_violations, has_negotiation_point, " +
          "analysis_confidence"
        )
        .eq("lease_id", id)
        .order("clause_number"),
      supabase
        .from("tool_call_logs")
        .select(
          "id, tool_name, sequence_num, duration_ms, success, error_message, input_summary, output_summary, called_at"
        )
        .eq("lease_id", id)
        .order("sequence_num"),
    ]);

  const { data, error } = reportResult;

  if (error || !data) {
    return NextResponse.json(
      { error: "not_found", message: "Report not found or has expired." },
      { status: 404 }
    );
  }

  // Authorisation: owner, valid share token, or guest lease. An owned lease is
  // NOT readable by an anonymous caller who merely knows the UUID.
  const authUser = userResult.data?.user ?? null;
  const leaseRow = leaseResult.data as Record<string, unknown> | null;
  const access = checkLeaseAccess({
    leaseUserId: leaseRow?.user_id as string | null | undefined,
    authUserId: authUser?.id,
    providedToken: shareToken,
    reportShareToken: data.share_token as string | null | undefined,
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.error, message: access.message },
      { status: access.status }
    );
  }

  // Generate a short-lived signed URL so the browser can render the PDF.
  let pdfSignedUrl: string | null = null;
  if (leaseRow && typeof leaseRow.file_path === "string") {
    const { data: signedData } = await supabase.storage
      .from("leases")
      .createSignedUrl(leaseRow.file_path, PDF_SIGNED_URL_TTL_SECONDS);
    pdfSignedUrl = signedData?.signedUrl ?? null;
  }

  // Strip user_id from the lease row before returning — it's an internal FK
  // and should not be exposed in the API response.
  const { user_id: _uid, ...safeLeaseRow } = (leaseRow as Record<string, unknown> & { user_id?: unknown }) ?? {};

  const report = {
    ...(data.full_report_json as object),
    disclaimer: DISCLAIMER,
    corpus_version: data.full_report_json
      ? (data.full_report_json as Record<string, unknown>).corpus_version
      : null,
    share_url: data.share_token
      ? `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/report/${id}?token=${data.share_token}`
      : null,
    expires_at: data.expires_at,
    pdf_url: pdfSignedUrl,
    _lease: safeLeaseRow ?? {},
    _clauses: clausesResult.data ?? [],
    _tool_call_logs: traceResult.data ?? [],
  };

  return NextResponse.json(report);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkDbRateLimit(getClientIp(req), { storeKey: "report-post", maxRequests: 20 });
  if (!rl.allowed) {
    const { body, headers, status } = dbRateLimitExceededResponse(rl.resetAt);
    return NextResponse.json(body, { status, headers });
  }

  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "invalid_id", message: "Invalid report ID format." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action !== "share") {
    return NextResponse.json(
      { error: "invalid_action", message: "Supported actions: share" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Authorisation: only the owner may mint a share link for an owned lease.
  // Guest leases (user_id IS NULL) may be shared by any holder of the UUID.
  const { data: leaseRow } = await supabase
    .from("leases")
    .select("user_id")
    .eq("id", id)
    .single();
  const authClient = await createSupabaseServerClient();
  const { data: { user: authUser } } = await authClient.auth.getUser();
  if (leaseRow?.user_id && leaseRow.user_id !== authUser?.id) {
    return NextResponse.json(
      { error: "forbidden", message: "Only the owner can share this report." },
      { status: 403 }
    );
  }

  const { v4: uuidv4 } = await import("uuid");
  const shareToken = uuidv4().replace(/-/g, "");

  const { error } = await supabase
    .from("reports")
    .update({ share_token: shareToken })
    .eq("lease_id", id);

  if (error) {
    return NextResponse.json(
      { error: "update_failed", message: "Could not generate share link." },
      { status: 500 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return NextResponse.json({
    share_url: `${baseUrl}/report/${id}?token=${shareToken}`,
    expires_in_days: 90,
    consent_notice:
      "Anyone with this link can view your report for 90 days. The report contains excerpts from your lease.",
  });
}

// ── DELETE /api/report/[id] ───────────────────────────────────────────────────
// PIPEDA right of erasure. Authenticated users only; must own the lease.
// Cascades: tool_call_logs → clauses → reports → storage → leases.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await checkDbRateLimit(getClientIp(req), { storeKey: "report-delete", maxRequests: 20 });
  if (!rl.allowed) {
    const { body, headers, status } = dbRateLimitExceededResponse(rl.resetAt);
    return NextResponse.json(body, { status, headers });
  }

  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "invalid_id", message: "Invalid report ID format." },
      { status: 400 }
    );
  }

  // Require authentication
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Sign in to delete your analyses." },
      { status: 401 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify ownership
  const { data: lease, error: leaseErr } = await supabase
    .from("leases")
    .select("id, user_id, file_path")
    .eq("id", id)
    .single();

  if (leaseErr || !lease) {
    return NextResponse.json(
      { error: "not_found", message: "Analysis not found." },
      { status: 404 }
    );
  }

  if (lease.user_id !== user.id) {
    return NextResponse.json(
      { error: "forbidden", message: "You do not own this analysis." },
      { status: 403 }
    );
  }

  // Cascade delete — order matters (FK constraints)
  await supabase.from("tool_call_logs").delete().eq("lease_id", id);
  await supabase.from("clauses").delete().eq("lease_id", id);
  await supabase.from("reports").delete().eq("lease_id", id);

  // Delete PDF from Storage
  if (typeof lease.file_path === "string" && lease.file_path.length > 0) {
    await supabase.storage.from("leases").remove([lease.file_path]);
  }

  // Delete lease row last
  const { error: deleteErr } = await supabase
    .from("leases")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return NextResponse.json(
      { error: "delete_failed", message: "Could not delete analysis. Please try again." },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
