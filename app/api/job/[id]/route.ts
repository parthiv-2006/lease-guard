import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    ...(data.status === "failed" && { error_message: data.error_message }),
  });
}
