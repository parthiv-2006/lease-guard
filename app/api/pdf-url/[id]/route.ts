import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getClientIp } from "@/lib/client-ip";
import { checkLeaseAccess } from "@/lib/lease-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 60 requests/hour per IP (PDF viewer auto-retries on expiry)
  const rl = await checkDbRateLimit(getClientIp(req), { storeKey: "pdf-url", maxRequests: 60 });
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

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch report to check share token and expires_at
  const { data: reportData, error: reportError } = await supabase
    .from("reports")
    .select("share_token, expires_at")
    .eq("lease_id", id)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (reportError || !reportData) {
    return NextResponse.json(
      { error: "not_found", message: "Report not found or has expired." },
      { status: 404 }
    );
  }

  // Fetch the lease to get the file_path (+ owner for the access check)
  const { data: leaseData, error: leaseError } = await supabase
    .from("leases")
    .select("file_path, user_id")
    .eq("id", id)
    .single();

  if (leaseError || !leaseData || !leaseData.file_path) {
    return NextResponse.json(
      { error: "not_found", message: "Lease file not found." },
      { status: 404 }
    );
  }

  // Authorisation: owner, valid share token, or guest lease. Mirrors
  // /api/report/[id] exactly — an owned lease's PDF is NOT served to an
  // anonymous caller who merely knows the UUID.
  const authClient = await createSupabaseServerClient();
  const { data: { user: authUser } } = await authClient.auth.getUser();
  const access = checkLeaseAccess({
    leaseUserId: leaseData.user_id as string | null | undefined,
    authUserId: authUser?.id,
    providedToken: shareToken,
    reportShareToken: reportData.share_token as string | null | undefined,
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.error, message: access.message },
      { status: access.status }
    );
  }

  // Generate a fresh 15-minute signed URL — shorter TTL limits PII exposure
  // if a URL leaks via browser history or referrer headers.
  const { data: signedData, error: signedError } = await supabase.storage
    .from("leases")
    .createSignedUrl(leaseData.file_path, 900);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: "signed_url_failed", message: "Failed to generate signed URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({ pdf_url: signedData.signedUrl });
}
