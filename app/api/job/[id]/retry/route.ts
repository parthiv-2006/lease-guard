/**
 * POST /api/job/[id]/retry
 *
 * Retries a failed lease analysis. Only generic failures can be retried —
 * validation errors (not_a_lease, wrong_jurisdiction) delete the storage file
 * on failure, so there is nothing to re-analyse.
 *
 * Steps:
 *   1. Load the lease row; verify it exists
 *   2. Block retry if status is not "failed"
 *   3. Block retry if error_code is a validation error (file was deleted)
 *   4. Delete partial data from the previous attempt
 *   5. Reset lease status to "pending"
 *   6. Re-fire runLeaseAnalysis fire-and-forget
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { runLeaseAnalysis } from "@/lib/agent";

import { getClientIp } from "@/lib/client-ip";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leaseId } = await params;

  if (!leaseId || !/^[0-9a-f-]{36}$/.test(leaseId)) {
    return NextResponse.json({ error: "invalid_id", message: "Invalid lease ID format." }, { status: 400 });
  }

  // ── Rate limit: 5 retries/hour per IP ─────────────────────────────────────
  const rl = await checkDbRateLimit(getClientIp(req), { storeKey: "retry", maxRequests: 5 });
  if (!rl.allowed) {
    const { body, headers, status } = dbRateLimitExceededResponse(rl.resetAt);
    return NextResponse.json(body, { status, headers });
  }

  // ── Require authentication ─────────────────────────────────────────────────
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Sign in to retry an analysis." },
      { status: 401 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── 1. Fetch the lease ─────────────────────────────────────────────────────
  const { data: lease, error: fetchError } = await supabase
    .from("leases")
    .select("id, status, error_message, file_path, user_id")
    .eq("id", leaseId)
    .single();

  if (fetchError || !lease) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ── Verify ownership ───────────────────────────────────────────────────────
  if (lease.user_id !== user.id) {
    return NextResponse.json(
      { error: "forbidden", message: "You do not own this analysis." },
      { status: 403 }
    );
  }

  // ── 2. Only retryable if status is "failed" ────────────────────────────────
  if (lease.status !== "failed") {
    return NextResponse.json(
      {
        error: "not_retryable",
        message: `Lease is in status "${lease.status}", not "failed".`,
      },
      { status: 409 }
    );
  }

  // ── 3. Block retry for validation errors (file was deleted) ───────────────
  const raw = lease.error_message as string | null;
  if (raw?.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { code?: string };
      const code = parsed.code ?? "";
      if (code === "not_a_lease" || code === "wrong_jurisdiction") {
        return NextResponse.json(
          {
            error: "not_retryable",
            message:
              "This file cannot be retried — it was not recognised as an Ontario residential lease and has been deleted.",
            error_code: code,
          },
          { status: 422 }
        );
      }
    } catch {
      // Not valid JSON — treat as generic failure, allow retry
    }
  }

  // ── 4. Delete partial data from previous attempt ──────────────────────────
  // All child tables have ON DELETE CASCADE from leases, but explicit deletes
  // give a clean slate before the retry pipeline runs.
  try {
    await supabase.from("negotiation_points").delete().eq("lease_id", leaseId);
    await supabase.from("contradictions").delete().eq("lease_id", leaseId);
    await supabase.from("tool_call_logs").delete().eq("lease_id", leaseId);
    await supabase.from("reports").delete().eq("lease_id", leaseId);
    await supabase.from("clauses").delete().eq("lease_id", leaseId);
  } catch (err) {
    console.error(`[retry] Partial data cleanup failed for ${leaseId}:`, err);
    // Non-fatal — continue with retry
  }

  // ── 5. Reset lease to pending ──────────────────────────────────────────────
  const { error: resetError } = await supabase
    .from("leases")
    .update({
      status: "pending",
      error_message: null,
      overall_risk_score: null,
      overall_risk_level: null,
      analysis_completed_at: null,
    })
    .eq("id", leaseId);

  if (resetError) {
    console.error(`[retry] Failed to reset lease ${leaseId}:`, resetError);
    return NextResponse.json(
      { error: "reset_failed", message: "Could not reset the analysis job." },
      { status: 500 }
    );
  }

  // ── 6. Re-fire analysis (fire-and-forget) ─────────────────────────────────
  runLeaseAnalysis(leaseId, lease.file_path as string).catch((err: unknown) => {
    console.error(
      `[retry] Background analysis error for lease ${leaseId}:`,
      err instanceof Error ? err.message : String(err)
    );
  });

  return NextResponse.json(
    { lease_id: leaseId, status: "processing" },
    { status: 202 }
  );
}
