/**
 * Retry endpoint tests: POST /api/job/[id]/retry
 * Supabase is mocked — no real credentials needed.
 */

import { NextRequest } from "next/server";

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
    id: "lease-abc",
    status: "failed",
    error_message: null,
    file_path: "leases/lease-abc/file.pdf",
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

import { POST } from "../app/api/job/[id]/retry/route";
import { createClient } from "@supabase/supabase-js";

const mockCreateClient = createClient as jest.Mock;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/job/[id]/retry", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 202 and resets a genuinely failed lease", async () => {
    mockCreateClient.mockReturnValue(makeMockSupabase({}));

    const res = await POST(makeRetryRequest("lease-abc"), {
      params: Promise.resolve({ id: "lease-abc" }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("processing");
    expect(body.lease_id).toBe("lease-abc");
  });

  it("returns 404 when the lease does not exist", async () => {
    mockCreateClient.mockReturnValue(makeMockSupabase({ fetchError: true }));

    const res = await POST(makeRetryRequest("no-such-lease"), {
      params: Promise.resolve({ id: "no-such-lease" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 409 when the lease is not in failed status", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: "lease-processing",
          status: "processing",
          error_message: null,
          file_path: "leases/lease-processing/file.pdf",
        },
      })
    );

    const res = await POST(makeRetryRequest("lease-processing"), {
      params: Promise.resolve({ id: "lease-processing" }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("not_retryable");
  });

  it("returns 422 when the failure was not_a_lease (file deleted)", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: "lease-invalid",
          status: "failed",
          error_message: JSON.stringify({
            code: "not_a_lease",
            message: "Not a lease",
            detected_as: "resume",
          }),
          file_path: "leases/lease-invalid/file.pdf",
        },
      })
    );

    const res = await POST(makeRetryRequest("lease-invalid"), {
      params: Promise.resolve({ id: "lease-invalid" }),
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
          id: "lease-bc",
          status: "failed",
          error_message: JSON.stringify({
            code: "wrong_jurisdiction",
            message: "BC lease",
            detected_as: "CA-BC",
          }),
          file_path: "leases/lease-bc/file.pdf",
        },
      })
    );

    const res = await POST(makeRetryRequest("lease-bc"), {
      params: Promise.resolve({ id: "lease-bc" }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe("wrong_jurisdiction");
  });

  it("allows retry for a plain-text (non-JSON) error_message", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({
        lease: {
          id: "lease-timeout",
          status: "failed",
          error_message:
            "Analysis timed out after 3 minutes. Please try again.",
          file_path: "leases/lease-timeout/file.pdf",
        },
      })
    );

    const res = await POST(makeRetryRequest("lease-timeout"), {
      params: Promise.resolve({ id: "lease-timeout" }),
    });

    expect(res.status).toBe(202);
  });

  it("returns 500 when the DB reset fails", async () => {
    mockCreateClient.mockReturnValue(
      makeMockSupabase({ resetError: true })
    );

    const res = await POST(makeRetryRequest("lease-abc"), {
      params: Promise.resolve({ id: "lease-abc" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("reset_failed");
  });
});
