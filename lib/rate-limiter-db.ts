/**
 * DB-backed rate limiter — survives serverless cold starts.
 *
 * Uses the api_rate_limits table + check_and_increment_rate_limit RPC
 * (migration 012).  Replaces the in-memory rate-limiter for sensitive routes
 * so that limits are enforced consistently across all concurrent Vercel
 * instances.
 *
 * Fails open on DB error to avoid blocking legitimate users when Supabase is
 * temporarily unreachable.
 */

import { createClient } from "@supabase/supabase-js";

interface DbRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkDbRateLimit(
  ip: string,
  config: { storeKey: string; maxRequests: number; windowMs?: number }
): Promise<DbRateLimitResult> {
  const { storeKey, maxRequests, windowMs = 60 * 60 * 1000 } = config;
  const key = `${ip}::${storeKey}`;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc("check_and_increment_rate_limit", {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_ms: windowMs,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    console.error("[rate-limiter-db] DB error — failing open:", error?.message);
    return { allowed: true, remaining: 1, resetAt: new Date(Date.now() + windowMs) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const resetAt = new Date(row.window_reset_at as string);

  return {
    allowed: row.is_allowed as boolean,
    remaining: Math.max(0, maxRequests - (row.current_count as number)),
    resetAt,
  };
}

export function dbRateLimitExceededResponse(resetAt: Date): {
  body: { error: string; message: string; reset_at: string };
  headers: Record<string, string>;
  status: 429;
} {
  return {
    body: {
      error: "rate_limit_exceeded",
      message: "Too many requests. Please try again later.",
      reset_at: resetAt.toISOString(),
    },
    headers: {
      "Retry-After": String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
    },
    status: 429,
  };
}
