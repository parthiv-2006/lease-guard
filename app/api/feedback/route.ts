import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body." },
      { status: 400 }
    );
  }

  const { lease_id, accurate, comment } = body as Record<string, unknown>;

  if (typeof lease_id !== "string" || !/^[0-9a-f-]{36}$/.test(lease_id)) {
    return NextResponse.json(
      { error: "invalid_lease_id", message: "Valid lease_id UUID is required." },
      { status: 400 }
    );
  }

  if (typeof accurate !== "boolean") {
    return NextResponse.json(
      { error: "invalid_accurate", message: "'accurate' must be a boolean." },
      { status: 400 }
    );
  }

  if (comment !== undefined && (typeof comment !== "string" || comment.length > 1000)) {
    return NextResponse.json(
      { error: "invalid_comment", message: "'comment' must be a string under 1000 characters." },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("report_feedback").insert({
    lease_id,
    accurate,
    comment: comment ?? null,
  });

  if (error) {
    console.error("Feedback insert failed:", error);
    return NextResponse.json(
      { error: "db_failed", message: "Failed to record feedback." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
