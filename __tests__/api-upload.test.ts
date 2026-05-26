/**
 * Upload route tests. Supabase and storage are mocked so these run without
 * real credentials.
 *
 * Strategy:
 *   - Mock @/lib/supabase-server directly so createSupabaseServerClient()
 *     returns a controllable user mock (bypasses @supabase/ssr entirely).
 *   - Mock @supabase/supabase-js createClient for the service-role client
 *     used by the rate limiter and DB insert.
 */

// ── Mock the SSR auth client ──────────────────────────────────────────────────
// Controls what user the route sees. Default: guest (null user).
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: null } });

jest.mock("../lib/supabase-server", () => ({
  createSupabaseServerClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

// ── Mock the service-role Supabase client ─────────────────────────────────────
// Default: 0 uploads in window (allows), DB insert succeeds.
let mockUploadCount = 0;

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        remove: jest.fn().mockResolvedValue({ error: null }),
      })),
    },
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockResolvedValue({ count: mockUploadCount, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      eq: jest.fn().mockReturnThis(),
    })),
  })),
}));

// ── Prevent fire-and-forget analysis from running ────────────────────────────
jest.mock("../lib/agent", () => ({ runLeaseAnalysis: jest.fn().mockResolvedValue(undefined) }));

import { NextRequest } from "next/server";
import { POST } from "../app/api/upload/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePdfFile(size = 1024): File {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x25; bytes[1] = 0x50; bytes[2] = 0x44; bytes[3] = 0x46; // %PDF
  return new File([bytes], "lease.pdf", { type: "application/pdf" });
}

function makeRequest(file?: File, headers: Record<string, string> = {}): NextRequest {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: fd,
    headers: { "x-forwarded-for": "1.2.3.4", ...headers },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/upload", () => {
  beforeEach(() => {
    mockUploadCount = 0;
    mockGetUser.mockResolvedValue({ data: { user: null } });
    jest.clearAllMocks();
  });

  // ── Basic validation ───────────────────────────────────────────────────────

  it("accepts a valid PDF and returns 202", async () => {
    const res = await POST(makeRequest(makePdfFile()));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("processing");
    expect(body.lease_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_file");
  });

  it("returns 415 for a non-PDF file", async () => {
    const txtFile = new File(["hello world"], "lease.txt", { type: "text/plain" });
    const res = await POST(makeRequest(txtFile));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe("invalid_file_type");
  });

  it("returns 413 for a file exceeding 25MB", async () => {
    const bigFile = makePdfFile(26 * 1024 * 1024);
    const res = await POST(makeRequest(bigFile));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("file_too_large");
  });

  it("returns 400 when body is not form-data", async () => {
    const req = new NextRequest("http://localhost/api/upload", {
      method: "POST",
      body: JSON.stringify({ file: "not-a-file" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── DB-backed rate limiting ────────────────────────────────────────────────

  it("returns 429 when guest IP has reached the 3-upload daily limit", async () => {
    mockUploadCount = 3; // at limit
    const res = await POST(makeRequest(makePdfFile()));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.limit).toBe(3);
    expect(body.reset_at).toBeDefined();
  });

  it("returns 429 when authenticated user has reached the 5-upload daily limit", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "test@example.com" } },
    });
    mockUploadCount = 5; // at limit
    const res = await POST(makeRequest(makePdfFile()));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.limit).toBe(5);
  });

  it("allows upload when guest has 2 uploads in the window (under limit of 3)", async () => {
    mockUploadCount = 2;
    const res = await POST(makeRequest(makePdfFile()));
    expect(res.status).toBe(202);
  });

  it("allows upload when authenticated user has 4 uploads in the window (under limit of 5)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-456", email: "user@example.com" } },
    });
    mockUploadCount = 4;
    const res = await POST(makeRequest(makePdfFile()));
    expect(res.status).toBe(202);
  });

  it("rate limit response includes Retry-After header", async () => {
    mockUploadCount = 3;
    const res = await POST(makeRequest(makePdfFile()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
