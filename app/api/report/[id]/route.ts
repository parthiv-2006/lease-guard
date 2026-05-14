import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DISCLAIMER =
  "This analysis is not legal advice. Consult a licensed paralegal or lawyer before making decisions about your lease. Community Legal Clinics in Ontario offer free legal help for tenants.";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const shareToken = searchParams.get("token");

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "invalid_id", message: "Invalid report ID format." },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up by lease_id; optionally validate share_token for public access
  const query = supabase
    .from("reports")
    .select("*")
    .eq("lease_id", id)
    .gt("expires_at", new Date().toISOString())
    .single();

  const { data, error } = await query;

  if (error || !data) {
    return NextResponse.json(
      { error: "not_found", message: "Report not found or has expired." },
      { status: 404 }
    );
  }

  // If share_token provided, validate it
  if (shareToken && data.share_token !== shareToken) {
    return NextResponse.json(
      { error: "invalid_token", message: "Invalid share token." },
      { status: 403 }
    );
  }

  // Inject disclaimer into every report response
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
  };

  return NextResponse.json(report);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  return NextResponse.json({
    share_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/report/${id}?token=${shareToken}`,
    expires_in_days: 90,
    consent_notice:
      "Anyone with this link can view your report for 90 days. The report contains excerpts from your lease.",
  });
}
