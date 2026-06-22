import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Dynamic (not prerendered at build): this route queries Supabase, and
// prerendering would execute that query in environments without Supabase env
// vars (e.g. Vercel Preview), failing the build. CDN caching is still applied
// via the Cache-Control header below (s-maxage=300, stale-while-revalidate).
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("public_stats")
    .select("avg_risk_score, total_clauses_analysed, total_red_flags")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    {
      avg_risk_score: data.avg_risk_score,
      total_clauses_analysed: data.total_clauses_analysed,
      total_red_flags: data.total_red_flags,
    },
    {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
