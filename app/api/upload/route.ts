import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkDbUploadRateLimit } from "@/lib/upload-rate-limit";
import { runLeaseAnalysis } from "@/lib/agent";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // ── Parse multipart body first (needed before auth check) ─────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Expected multipart/form-data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: "missing_file",
        message: "No file provided. Include a 'file' field in your form.",
      },
      { status: 400 }
    );
  }

  // ── Validate file ──────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: "file_too_large",
        message: `File exceeds 25 MB limit (received ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
      },
      { status: 413 }
    );
  }

  const bytes = await file.arrayBuffer();
  const header = Buffer.from(bytes.slice(0, 4));
  if (!header.equals(PDF_MAGIC)) {
    return NextResponse.json(
      {
        error: "invalid_file_type",
        message: "Only PDF files are supported.",
      },
      { status: 415 }
    );
  }

  // ── Auth (needed before rate limit check) ─────────────────────────────────
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // ── DB-backed rate limiting (reliable across serverless instances) ─────────
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const rateCheck = await checkDbUploadRateLimit(user?.id ?? null, ip, supabase);

  if (!rateCheck.allowed) {
    const limit = rateCheck.limit;
    const who = user ? "Your account has" : "This IP address has";
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: `${who} reached the limit of ${limit} analyses per 24 hours. Please try again tomorrow.`,
        reset_at: rateCheck.resetAt.toISOString(),
        limit,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  // ── Upload to Supabase Storage ─────────────────────────────────────────────
  const leaseId = uuidv4();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `leases/${leaseId}/${safeFilename}`;

  const { error: storageError } = await supabase.storage
    .from("leases")
    .upload(storagePath, Buffer.from(bytes), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (storageError) {
    console.error("[upload] Storage upload failed:", storageError);
    return NextResponse.json(
      {
        error: "storage_failed",
        message: "Failed to store the file. Please try again.",
      },
      { status: 500 }
    );
  }

  // ── Create lease row ───────────────────────────────────────────────────────
  const { error: dbError } = await supabase.from("leases").insert({
    id: leaseId,
    status: "pending",
    file_path: storagePath,
    user_id: user?.id ?? null,
    upload_ip: ip,
  });

  if (dbError) {
    console.error("[upload] DB insert failed:", dbError);
    // Roll back the storage upload
    await supabase.storage.from("leases").remove([storagePath]);
    return NextResponse.json(
      {
        error: "db_failed",
        message: "Failed to create analysis job. Please try again.",
      },
      { status: 500 }
    );
  }

  // ── Kick off analysis (fire-and-forget) ────────────────────────────────────
  // runLeaseAnalysis updates the lease row's status to "processing" → "complete"
  // or "failed". The client polls /api/job/[id] to track progress.
  runLeaseAnalysis(leaseId, storagePath).catch((err: unknown) => {
    // Error is already written to the DB inside runLeaseAnalysis.
    // Log here for server-side observability.
    console.error(
      `[upload] Background analysis error for lease ${leaseId}:`,
      err instanceof Error ? err.message : String(err)
    );
  });

  return NextResponse.json(
    { lease_id: leaseId, status: "processing" },
    { status: 202 }
  );
}
