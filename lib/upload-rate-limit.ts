/**
 * DB-backed upload rate limiter.
 *
 * Counts lease rows created within the last 24 hours, keyed by user_id
 * (authenticated) or IP address (guest). Works correctly across multiple
 * Vercel serverless instances — unlike the in-memory rate-limiter.ts which
 * resets on every cold start.
 *
 * Limits (free tier — generous for real tenants, tight enough to prevent abuse):
 *   Authenticated users : 5 uploads per 24 hours (by user_id)
 *   Guest users         : 3 uploads per 24 hours (by upload_ip)
 */

import { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTH_USER_DAILY_LIMIT = 5;
const GUEST_DAILY_LIMIT = 3;

export interface DbRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

/**
 * Check whether a user/IP is within their daily upload quota.
 *
 * @param userId  Supabase auth user ID, or null for guest uploads.
 * @param ip      Client IP address (used for guest quota only).
 * @param supabase Service-role Supabase client (needs read access to leases).
 */
export async function checkDbUploadRateLimit(
  userId: string | null,
  ip: string,
  supabase: SupabaseClient
): Promise<DbRateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  // Reset time is 24h from the earliest upload in the window; use "now + 24h"
  // as a conservative approximation (always displayed to user, not enforced).
  const resetAt = new Date(Date.now() + WINDOW_MS);

  if (userId) {
    // Authenticated: quota keyed by user_id
    const { count } = await supabase
      .from("leases")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("uploaded_at", windowStart);

    const used = count ?? 0;
    return {
      allowed: used < AUTH_USER_DAILY_LIMIT,
      remaining: Math.max(0, AUTH_USER_DAILY_LIMIT - used - 1),
      resetAt,
      limit: AUTH_USER_DAILY_LIMIT,
    };
  } else {
    // Guest: quota keyed by IP address
    const { count } = await supabase
      .from("leases")
      .select("id", { count: "exact", head: true })
      .eq("upload_ip", ip)
      .gte("uploaded_at", windowStart);

    const used = count ?? 0;
    return {
      allowed: used < GUEST_DAILY_LIMIT,
      remaining: Math.max(0, GUEST_DAILY_LIMIT - used - 1),
      resetAt,
      limit: GUEST_DAILY_LIMIT,
    };
  }
}
