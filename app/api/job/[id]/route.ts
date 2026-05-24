import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rate-limiter";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Polling route — allow generous limit (120/hour) to not break status polling
  const rl = checkRateLimit(getClientIp(_req), {
    storeKey: "job",
    maxRequests: 120,
  });
  if (!rl.allowed) {
    const { body, headers, status } = rateLimitExceededResponse(rl.resetAt);
    return NextResponse.json(body, { status, headers });
  }

  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "invalid_id", message: "Invalid lease ID format." },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("leases")
    .select(
      "id, status, uploaded_at, jurisdiction, jurisdiction_confidence, overall_risk_score, overall_risk_level, analysis_completed_at, error_message, corpus_version"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "not_found", message: "Lease not found." },
      { status: 404 }
    );
  }

  const steps: Record<string, string> = {
    pending: "Queued for analysis",
    processing: "Analysis in progress",
    complete: "Analysis complete",
    failed: "Analysis failed",
  };

  return NextResponse.json({
    lease_id: data.id,
    status: data.status,
    status_label: steps[data.status] ?? data.status,
    uploaded_at: data.uploaded_at,
    analysis_completed_at: data.analysis_completed_at,
    jurisdiction: data.jurisdiction,
    jurisdiction_confidence: data.jurisdiction_confidence,
    overall_risk_score: data.overall_risk_score,
    overall_risk_level: data.overall_risk_level,
    corpus_version: data.corpus_version,
    ...(data.status === "failed" && (() => {
      // error_message may be plain text OR structured JSON (from LeaseValidationError)
      const raw = data.error_message as string | null;
      if (raw?.startsWith("{")) {
        try {
          const parsed = JSON.parse(raw) as {
            code?: string;
            message?: string;
            detected_as?: string;
          };
          return {
            error_message: parsed.message ?? raw,
            error_code: parsed.code ?? "analysis_failed",
            detected_as: parsed.detected_as ?? null,
          };
        } catch {
          // fall through to plain text
        }
      }
      return { error_message: raw, error_code: "analysis_failed", detected_as: null };
    })()),
  });
}
