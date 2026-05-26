/**
 * Unit tests for lib/chat-rate-limit.ts
 *
 * The Supabase client is mocked so all three parallel count queries
 * can be controlled independently per test.
 */

import { checkDbChatRateLimit } from "../lib/chat-rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock builder ──────────────────────────────────────────────────────────────

/**
 * Builds a minimal Supabase mock whose .from().select().eq().gte()
 * chain resolves with the given counts in order:
 *   call 1 → dailyCount
 *   call 2 → hourlyCount
 *   call 3 → leaseCount
 */
function makeSupabase(
  dailyCount: number,
  hourlyCount: number,
  leaseCount: number
): SupabaseClient {
  let call = 0;
  const counts = [dailyCount, hourlyCount, leaseCount];

  const from = jest.fn(() => {
    const myCount = counts[call++] ?? 0;
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockResolvedValue({ count: myCount, error: null }),
        }),
      }),
    };
  });

  return { from } as unknown as SupabaseClient;
}

// ── Constants (mirrored from lib/chat-rate-limit.ts for assertions) ───────────

const AUTH_DAILY  = 50;
const AUTH_HOURLY = 15;
const GUEST_DAILY  = 10;
const GUEST_HOURLY =  5;
const LEASE_DAILY  = 30;

const LEASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const USER_ID  = "user-test-123";
const IP       = "1.2.3.4";

// ── Authenticated user tests ──────────────────────────────────────────────────

describe("checkDbChatRateLimit — authenticated user", () => {
  it("allows when all counts are zero", async () => {
    const result = await checkDbChatRateLimit(USER_ID, IP, LEASE_ID, makeSupabase(0, 0, 0));
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("allows when counts are just below all limits", async () => {
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(AUTH_DAILY - 1, AUTH_HOURLY - 1, LEASE_DAILY - 1)
    );
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // exactly at the edge — 0 left
  });

  it("blocks when daily user limit is reached", async () => {
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(AUTH_DAILY, 0, 0)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_user_limit");
    expect(result.limit).toBe(AUTH_DAILY);
    expect(result.remaining).toBe(0);
  });

  it("blocks when daily user limit is exceeded", async () => {
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(AUTH_DAILY + 5, 0, 0)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_user_limit");
  });

  it("blocks when hourly user limit is reached", async () => {
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(0, AUTH_HOURLY, 0)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("hourly_user_limit");
    expect(result.limit).toBe(AUTH_HOURLY);
  });

  it("daily check takes priority over hourly when both exceeded", async () => {
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(AUTH_DAILY, AUTH_HOURLY, 0)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_user_limit");
  });

  it("blocks when per-lease daily limit is reached", async () => {
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(0, 0, LEASE_DAILY)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("per_lease_limit");
    expect(result.limit).toBe(LEASE_DAILY);
  });

  it("remaining reflects the tightest constraint", async () => {
    // daily: 45/50 left (5 remain), hourly: 13/15 left (2 remain), lease: 10/30 left (20 remain)
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(45, 13, 10)
    );
    expect(result.allowed).toBe(true);
    // tightest: hourly — 15 - 13 - 1 = 1
    expect(result.remaining).toBe(1);
  });

  it("resetAt is in the future", async () => {
    const result = await checkDbChatRateLimit(USER_ID, IP, LEASE_ID, makeSupabase(0, 0, 0));
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── Guest (IP-only) tests ─────────────────────────────────────────────────────

describe("checkDbChatRateLimit — guest (IP only)", () => {
  it("allows when all counts are zero", async () => {
    const result = await checkDbChatRateLimit(null, IP, LEASE_ID, makeSupabase(0, 0, 0));
    expect(result.allowed).toBe(true);
  });

  it("blocks when guest daily limit is reached", async () => {
    const result = await checkDbChatRateLimit(
      null, IP, LEASE_ID,
      makeSupabase(GUEST_DAILY, 0, 0)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_ip_limit");
    expect(result.limit).toBe(GUEST_DAILY);
  });

  it("blocks when guest hourly burst limit is reached", async () => {
    const result = await checkDbChatRateLimit(
      null, IP, LEASE_ID,
      makeSupabase(0, GUEST_HOURLY, 0)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("hourly_ip_limit");
    expect(result.limit).toBe(GUEST_HOURLY);
  });

  it("daily check takes priority over hourly for guests too", async () => {
    const result = await checkDbChatRateLimit(
      null, IP, LEASE_ID,
      makeSupabase(GUEST_DAILY, GUEST_HOURLY, 0)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_ip_limit");
  });

  it("blocks when per-lease daily limit is reached (shared with auth users)", async () => {
    const result = await checkDbChatRateLimit(
      null, IP, LEASE_ID,
      makeSupabase(0, 0, LEASE_DAILY)
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("per_lease_limit");
  });

  it("guest daily limit is lower than auth daily limit", () => {
    expect(GUEST_DAILY).toBeLessThan(AUTH_DAILY);
  });

  it("guest hourly limit is lower than auth hourly limit", () => {
    expect(GUEST_HOURLY).toBeLessThan(AUTH_HOURLY);
  });

  it("allows when just under all limits", async () => {
    const result = await checkDbChatRateLimit(
      null, IP, LEASE_ID,
      makeSupabase(GUEST_DAILY - 1, GUEST_HOURLY - 1, LEASE_DAILY - 1)
    );
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });
});

// ── Shared behaviour ──────────────────────────────────────────────────────────

describe("checkDbChatRateLimit — shared behaviour", () => {
  it("per-lease limit applies regardless of auth status (auth)", async () => {
    const authResult = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(0, 0, LEASE_DAILY)
    );
    expect(authResult.reason).toBe("per_lease_limit");
  });

  it("per-lease limit applies regardless of auth status (guest)", async () => {
    const guestResult = await checkDbChatRateLimit(
      null, IP, LEASE_ID,
      makeSupabase(0, 0, LEASE_DAILY)
    );
    expect(guestResult.reason).toBe("per_lease_limit");
  });

  it("remaining is never negative", async () => {
    // All at exact limit edge — remaining should be 0, not negative
    const result = await checkDbChatRateLimit(
      USER_ID, IP, LEASE_ID,
      makeSupabase(AUTH_DAILY - 1, AUTH_HOURLY - 1, LEASE_DAILY - 1)
    );
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });
});
