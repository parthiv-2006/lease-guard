import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limiter";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
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
  const rateCheck = checkRateLimit(ip);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: "You have exceeded 5 analyses per hour. Please try again later.",
        reset_at: new Date(rateCheck.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", message: "No file provided. Include a 'file' field." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: "file_too_large",
        message: `File exceeds 25MB limit (received ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      },
      { status: 413 }
    );
  }

  const bytes = await file.arrayBuffer();
  const header = Buffer.from(bytes.slice(0, 4));
  if (!header.equals(PDF_MAGIC)) {
    return NextResponse.json(
      { error: "invalid_file_type", message: "Only PDF files are supported." },
      { status: 415 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const leaseId = uuidv4();
  const filePath = `leases/${leaseId}/${file.name}`;

  const { error: storageError } = await supabase.storage
    .from("leases")
    .upload(filePath, bytes, { contentType: "application/pdf", upsert: false });

  if (storageError) {
    console.error("Storage upload failed:", storageError);
    return NextResponse.json(
      { error: "storage_failed", message: "Failed to store the file. Please try again." },
      { status: 500 }
    );
  }

  const { error: dbError } = await supabase.from("leases").insert({
    id: leaseId,
    status: "pending",
    file_path: filePath,
  });

  if (dbError) {
    console.error("DB insert failed:", dbError);
    await supabase.storage.from("leases").remove([filePath]);
    return NextResponse.json(
      { error: "db_failed", message: "Failed to create analysis job. Please try again." },
      { status: 500 }
    );
  }

  // Kick off analysis asynchronously (fire-and-forget)
  triggerAnalysis(leaseId, filePath).catch((err) => {
    console.error(`Analysis failed for lease ${leaseId}:`, err);
    supabase
      .from("leases")
      .update({ status: "failed", error_message: String(err) })
      .eq("id", leaseId)
      .then(() => {});
  });

  return NextResponse.json(
    { lease_id: leaseId, status: "processing" },
    { status: 202 }
  );
}

async function triggerAnalysis(leaseId: string, filePath: string): Promise<void> {
  const mcpServerUrl = process.env.MCP_SERVER_URL ?? "http://localhost:3001";
  const response = await fetch(`${mcpServerUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lease_id: leaseId, file_path: filePath }),
  });

  if (!response.ok) {
    throw new Error(`MCP server returned ${response.status}`);
  }
}
