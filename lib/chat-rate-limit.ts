/**
 * DB-backed chat rate limiter.
 *
 * Counts rows in the `chat_requests` table within sliding windows,
 * keyed by user_id (authenticated) or IP address (guest).
 * Works correctly across all Vercel serverless instances — unlike the
 * in-memory rate-limiter which resets on every cold start.
 *
 * Three independent limits (all must pass):
 *   1. Daily user/IP limit  — prevents quota exhaustion over 24 hours
 *   2. Hourly burst limit   — prevents flooding within a single session
 *   3. Per-lease daily limit — prevents one lease monopolising the quota
 *
 * Limits (Gemini 2.0 Flash free tier: 1,500 RPD globally):
 *   Authenticated users : 50 messages/day  ·  15 messages/hour
 *   Guest users (IP)    : 10 messages/day  ·   5 messages/hour
 *   Per-lease (any)     : 30 messages/day
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ── Limits ─────────────────────────────────────────────────────────────────────

const AUTH_DAILY_LIMIT   = 50;
const AUTH_HOURLY_LIMIT  = 15;

const GUEST_DAILY_LIMIT  = 10;
const GUEST_HOURLY_LIMIT =  5;

const LEASE_DAILY_LIMIT  = 30;

const DAY_MS  = 24 * 60 * 60 * 1000;
const HOUR_MS =      60 * 60 * 1000;

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChatRateLimitReason =
  | "daily_user_limit"
  | "hourly_user_limit"
  | "daily_ip_limit"
  | "hourly_ip_limit"
  | "per_lease_limit";

export interface ChatRateLimitResult {
  allowed:    boolean;
  reason?:    ChatRateLimitReason;
  remaining:  number;
  resetAt:    Date;
  limit:      number;
}

// ── Checker ────────────────────────────────────────────────────────────────────

/**
 * Check whether a user/IP is within their chat quota for a specific lease.
 * All three DB counts run in parallel.
 *
 * @param userId   Supabase auth user ID, or null for guest.
 * @param ip       Client IP address (used for guest quota and as fallback identity).
 * @param leaseId  The lease being queried — enforces the per-lease daily cap.
 * @param supabase Service-role Supabase client (needs read access to chat_requests).
 */
export async function checkDbChatRateLimit(
  userId:   string | null,
  ip:       string,
  leaseId:  string,
  supabase: SupabaseClient
): Promise<ChatRateLimitResult> {
  const now       = Date.now();
  const dayStart  = new Date(now - DAY_MS).toISOString();
  const hourStart = new Date(now - HOUR_MS).toISOString();
  const dayReset  = new Date(now + DAY_MS);
  const hourReset = new Date(now + HOUR_MS);

  if (userId) {
    // ── Authenticated: quota keyed by user_id ──────────────────────────────
    const [dailyRes, hourlyRes, leaseRes] = await Promise.all([
      supabase
        .from("chat_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayStart),
      supabase
        .from("chat_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", hourStart),
      supabase
        .from("chat_requests")
        .select("id", { count: "exact", head: true })
        .eq("lease_id", leaseId)
        .gte("created_at", dayStart),
    ]);

    const dailyUsed  = dailyRes.count  ?? 0;
    const hourlyUsed = hourlyRes.count ?? 0;
    const leaseUsed  = leaseRes.count  ?? 0;

    if (dailyUsed >= AUTH_DAILY_LIMIT) {
      return { allowed: false, reason: "daily_user_limit",   remaining: 0, resetAt: dayReset,  limit: AUTH_DAILY_LIMIT };
    }
    if (hourlyUsed >= AUTH_HOURLY_LIMIT) {
      return { allowed: false, reason: "hourly_user_limit",  remaining: 0, resetAt: hourReset, limit: AUTH_HOURLY_LIMIT };
    }
    if (leaseUsed >= LEASE_DAILY_LIMIT) {
      return { allowed: false, reason: "per_lease_limit",    remaining: 0, resetAt: dayReset,  limit: LEASE_DAILY_LIMIT };
    }

    const remaining = Math.max(0, Math.min(
      AUTH_DAILY_LIMIT   - dailyUsed  - 1,
      AUTH_HOURLY_LIMIT  - hourlyUsed - 1,
      LEASE_DAILY_LIMIT  - leaseUsed  - 1,
    ));
    return { allowed: true, remaining, resetAt: hourReset, limit: AUTH_HOURLY_LIMIT };

  } else {
    // ── Guest: quota keyed by IP address ──────────────────────────────────
    const [dailyRes, hourlyRes, leaseRes] = await Promise.all([
      supabase
        .from("chat_requests")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", dayStart),
      supabase
        .from("chat_requests")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", hourStart),
      supabase
        .from("chat_requests")
        .select("id", { count: "exact", head: true })
        .eq("lease_id", leaseId)
        .gte("created_at", dayStart),
    ]);

    const dailyUsed  = dailyRes.count  ?? 0;
    const hourlyUsed = hourlyRes.count ?? 0;
    const leaseUsed  = leaseRes.count  ?? 0;

    if (dailyUsed >= GUEST_DAILY_LIMIT) {
      return { allowed: false, reason: "daily_ip_limit",     remaining: 0, resetAt: dayReset,  limit: GUEST_DAILY_LIMIT };
    }
    if (hourlyUsed >= GUEST_HOURLY_LIMIT) {
      return { allowed: false, reason: "hourly_ip_limit",    remaining: 0, resetAt: hourReset, limit: GUEST_HOURLY_LIMIT };
    }
    if (leaseUsed >= LEASE_DAILY_LIMIT) {
      return { allowed: false, reason: "per_lease_limit",    remaining: 0, resetAt: dayReset,  limit: LEASE_DAILY_LIMIT };
    }

    const remaining = Math.max(0, Math.min(
      GUEST_DAILY_LIMIT  - dailyUsed  - 1,
      GUEST_HOURLY_LIMIT - hourlyUsed - 1,
      LEASE_DAILY_LIMIT  - leaseUsed  - 1,
    ));
    return { allowed: true, remaining, resetAt: hourReset, limit: GUEST_HOURLY_LIMIT };
  }
}
