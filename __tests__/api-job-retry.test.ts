/**
 * Retry endpoint tests: POST /api/job/[id]/retry
 * Supabase is mocked — no real credentials needed.
 */

import { NextRequest } from "next/server";

// ── UUID constants ────────────────────────────────────────────────────────────

const USER_ID         = "11111111-2222-3333-4444-555555555555";
const OTHER_USER_ID   = "99999999-2222-3333-4444-555555555555";
const LEASE_FAILED    = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const LEASE_PROCESSING= "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
const LEASE_NOT_FOUND = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";
const LEASE_INVALID   = "dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee";
const LEASE_BC        = "eeeeeeee-bbbb-cccc-dddd-eeeeeeeeeeee";
const LEASE_TIMEOUT   = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee";
const LEASE_OTHER     = "12345678-bbbb-cccc-dddd-eeeeeeeeeeee";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRetryRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/job/${id}/retry`, {
    method: "POST",
  });
}

// ── Shared mock factory ───────────────────────────────────────────────────────

function makeMockSupabase(overrides: {
  lease?: Record<string, unknown> | null;
  fetchError?: boolean;
  resetError?: boolean;
}) {
  const lease = overrides.lease ?? {
    id: LEASE_FAILED,
    status: "failed",
    error_message: null,
    file_path: "leases/lease-abc/file.pdf",
    user_id: USER_ID,
  };

  return {
    from: jest.fn((table: string) => {
      if (table === "leases") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: overrides.fetchError ? null : lease,
                error: overrides.fetchError ? { message: "not found" } : null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              error: overrides.resetError ? { message: "db error" } : null,
            }),
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      // All other tables (clauses, reports, etc.) — delete succeeds
      return {
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      };
    }),
  };
}

// ── Mock setup ────────────────────────────────────────────────────────────────

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

jest.mock("../lib/agent", () => ({
  runLeaseAnalysis: jest.fn().mockResolvedValue(undefined),
}));

// Rate limiter always allows in unit tests — rate-limiter.test.ts covers its own behaviour
jest.mock("../lib/rate-limiter-db", () => ({
  checkDbRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date(Date.now() + 3600000) }),
  dbRateLimitExceededResponse: jest.fn(),
}));

// Mock auth: returns authenticated user by default
const mockGetUser = jest.fn().mockResolvedValue({
  data: { user: { id: USER_ID } },
});
jest.mock("../lib/supabase-server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

import { POST } from "../app/api/job/[id]/retry/route";
import { createClient } from "@supabase/supabase-js";

const mockCreateClient = createClient as jest.Mock;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/job/[id]/retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default: authenticated as USER_ID
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("returns 400 for an invalid lease ID format", async () => {
    const res = await POST(makeRetryRequest("not-a-uuid"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockCreateClient.mockReturnValue(makeMockSupabase({}));

    const res = await POST(makeRetryRequest(LEASE_FAILED), {
      params: Promise.resolve({ id: LEASE_FAILED }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthenticated");
  });

  it("returns 403 when the authenticated user does not own the lease", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: LEASE_OTHER,
          status: "failed",
          error_message: null,
          file_path: "leases/lease-other/file.pdf",
          user_id: OTHER_USER_ID,
        },
      })
    );

    const res = await POST(makeRetryRequest(LEASE_OTHER), {
      params: Promise.resolve({ id: LEASE_OTHER }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 202 and resets a genuinely failed lease", async () => {
    mockCreateClient.mockReturnValue(makeMockSupabase({}));

    const res = await POST(makeRetryRequest(LEASE_FAILED), {
      params: Promise.resolve({ id: LEASE_FAILED }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("processing");
    expect(body.lease_id).toBe(LEASE_FAILED);
  });

  it("returns 404 when the lease does not exist", async () => {
    mockCreateClient.mockReturnValue(makeMockSupabase({ fetchError: true }));

    const res = await POST(makeRetryRequest(LEASE_NOT_FOUND), {
      params: Promise.resolve({ id: LEASE_NOT_FOUND }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 409 when the lease is not in failed status", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: LEASE_PROCESSING,
          status: "processing",
          error_message: null,
          file_path: "leases/lease-processing/file.pdf",
          user_id: USER_ID,
        },
      })
    );

    const res = await POST(makeRetryRequest(LEASE_PROCESSING), {
      params: Promise.resolve({ id: LEASE_PROCESSING }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("not_retryable");
  });

  it("returns 422 when the failure was not_a_lease (file deleted)", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: LEASE_INVALID,
          status: "failed",
          error_message: JSON.stringify({
            code: "not_a_lease",
            message: "Not a lease",
            detected_as: "resume",
          }),
          file_path: "leases/lease-invalid/file.pdf",
          user_id: USER_ID,
        },
      })
    );

    const res = await POST(makeRetryRequest(LEASE_INVALID), {
      params: Promise.resolve({ id: LEASE_INVALID }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("not_retryable");
    expect(body.error_code).toBe("not_a_lease");
  });

  it("returns 422 when the failure was wrong_jurisdiction (file deleted)", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: LEASE_BC,
          status: "failed",
          error_message: JSON.stringify({
            code: "wrong_jurisdiction",
            message: "BC lease",
            detected_as: "CA-BC",
          }),
          file_path: "leases/lease-bc/file.pdf",
          user_id: USER_ID,
        },
      })
    );

    const res = await POST(makeRetryRequest(LEASE_BC), {
      params: Promise.resolve({ id: LEASE_BC }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe("wrong_jurisdiction");
  });

  it("allows retry for a plain-text (non-JSON) error_message", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: LEASE_TIMEOUT,
          status: "failed",
          error_message: "Analysis timed out after 3 minutes. Please try again.",
          file_path: "leases/lease-timeout/file.pdf",
          user_id: USER_ID,
        },
      })
    );

    const res = await POST(makeRetryRequest(LEASE_TIMEOUT), {
      params: Promise.resolve({ id: LEASE_TIMEOUT }),
    });

    expect(res.status).toBe(202);
  });

  it("returns 500 when the DB reset fails", async () => {
    mockCreateClient.mockReturnValue(makeMockSupabase({ resetError: true }));

    const res = await POST(makeRetryRequest(LEASE_FAILED), {
      params: Promise.resolve({ id: LEASE_FAILED }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("reset_failed");
  });
});
