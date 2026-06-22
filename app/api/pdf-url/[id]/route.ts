import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getClientIp } from "@/lib/client-ip";

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

  // If share_token is present on the report, validate that the client provided it and it matches
  if (reportData.share_token && shareToken !== reportData.share_token) {
    return NextResponse.json(
      { error: "invalid_token", message: "Invalid share token." },
      { status: 403 }
    );
  }

  // Fetch the lease to get the file_path (+ owner for the ownership guard)
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

  // Ownership guard: if an authenticated user requests a PDF whose lease belongs
  // to a *different* authenticated user, deny. Mirrors /api/report/[id]. Guest
  // leases (user_id IS NULL) and guest callers fall through — the UUID (and the
  // share-token check above) act as the access token for the guest/share flow.
  const authClient = await createSupabaseServerClient();
  const { data: { user: authUser } } = await authClient.auth.getUser();
  if (authUser && leaseData.user_id && leaseData.user_id !== authUser.id) {
    return NextResponse.json(
      { error: "forbidden", message: "Access denied." },
      { status: 403 }
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
