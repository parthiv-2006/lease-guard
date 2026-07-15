import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Node runtime + force-dynamic: this route must execute a real Supabase query
// on every hit. UptimeRobot pings it every 5 minutes — that query is what
// counts as "activity" and prevents the free-tier project from auto-pausing
// after 7 idle days. A static response here lets the database go dark while
// the monitor still reports green (this happened on 2026-07-15).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { status: "misconfigured", db: "missing env vars" },
      { status: 503 }
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Cheapest query that still reaches Postgres: HEAD request for a count,
    // no rows transferred. Aborts after 8s so a paused/unreachable project
    // returns 503 (alerting UptimeRobot) instead of hanging the function.
    const { error } = await supabase
      .from("statutes")
      .select("id", { count: "exact", head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(8000));

    if (error) {
      return NextResponse.json(
        { status: "degraded", db: error.message },
        { status: 503 }
      );
    }

    return NextResponse.json({ status: "ok", db: "reachable" });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: err instanceof Error ? err.message : "unreachable",
      },
      { status: 503 }
    );
  }
}
