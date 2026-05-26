/**
 * Tests for POST /api/chat/[leaseId]
 *
 * Supabase, Gemini fetch (both embed + generate), auth client, and the
 * DB-backed chat rate limiter are all mocked. No real credentials required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Auth client mock — default: guest (null user)
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: null } });
jest.mock("../lib/supabase-server", () => ({
  createSupabaseServerClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

// DB-backed chat rate limiter — default: allowed, 9 remaining
const mockCheckDbChatRateLimit = jest.fn().mockResolvedValue({
  allowed: true,
  remaining: 9,
  resetAt: new Date(Date.now() + 3_600_000),
  limit: 5,
});
jest.mock("../lib/chat-rate-limit", () => ({
  checkDbChatRateLimit: (...args: unknown[]) => mockCheckDbChatRateLimit(...args),
}));

// Supabase service client mock
const mockRpc  = jest.fn();
const mockFrom = jest.fn();
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

// Global fetch mock — handles Gemini embed + generate calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { POST } from "../app/api/chat/[leaseId]/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_LEASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MOCK_EMBEDDING = new Array(768).fill(0.01);

const MOCK_CLAUSES = [
  {
    id: "clause-1",
    clause_number: "3",
    heading: "Entry Rights",
    risk_level: "high",
    plain_english_explanation: "Landlord can enter without notice.",
    statutory_violations: [{ statute_section: "RTA s.26" }],
    is_potentially_unenforceable: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePost(leaseId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/chat/${leaseId}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
  });
}

function makeParams(leaseId: string) {
  return { params: Promise.resolve({ leaseId }) };
}

/**
 * Build a ReadableStream that emits Gemini SSE chunks for the given tokens.
 */
function makeGeminiStreamResponse(tokens: string[] = ["Based ", "on ", "your ", "lease..."]) {
  const encoder = new TextEncoder();
  const sseChunks = tokens.map(
    (text) =>
      `data: ${JSON.stringify({
        candidates: [{ content: { parts: [{ text }], role: "model" } }],
      })}\n\n`
  );
  let idx = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (idx < sseChunks.length) {
        controller.enqueue(encoder.encode(sseChunks[idx++]));
      } else {
        controller.close();
      }
    },
  });
  return { ok: true, body, text: async () => "" };
}

/**
 * Set up global fetch for embed + generate calls.
 */
function setupGeminiMocks(tokens?: string[]) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("embedContent")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ embedding: { values: MOCK_EMBEDDING } }),
        text: async () => "",
      });
    }
    return Promise.resolve(makeGeminiStreamResponse(tokens));
  });
}

/**
 * Build a Supabase from() mock that handles:
 *   - "chat_requests" table inserts (rate limit recording)
 *   - clauses, leases, reports parallel queries
 */
function buildSupabaseMock() {
  let dataCallCount = 0;

  return jest.fn((tableName: string) => {
    // Rate limit recording — always succeeds silently
    if (tableName === "chat_requests") {
      return {
        insert: jest.fn().mockReturnValue(
          Promise.resolve({ error: null })
        ),
      };
    }

    dataCallCount++;
    const call = dataCallCount;

    if (call === 1) {
      // clauses: .select().eq().order()
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: MOCK_CLAUSES, error: null }),
          }),
        }),
      };
    }

    if (call === 2) {
      // leases: .select().eq().single()
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { property_address: "123 King St", property_city: "Toronto", jurisdiction: "Ontario" },
              error: null,
            }),
          }),
        }),
      };
    }

    // reports: .select().eq().order().limit().single()
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { overall_risk_score: 7.5, overall_risk_level: "high" },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
  });
}

/** Collect all SSE events from a streamed response */
async function collectSSE(res: Response): Promise<Array<{ type: string; [k: string]: unknown }>> {
  const text = await res.text();
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // skip
    }
  }
  return events;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/chat/[leaseId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    delete process.env.ANTHROPIC_API_KEY;

    // Reset to defaults
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockCheckDbChatRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: new Date(Date.now() + 3_600_000),
      limit: 5,
    });
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it("returns 400 for invalid lease ID format", async () => {
    const res = await POST(makePost("not-a-uuid", { message: "Hello" }), makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makePost(VALID_LEASE_ID, {}), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("empty_message");
  });

  it("returns 400 when message is empty string", async () => {
    const res = await POST(makePost(VALID_LEASE_ID, { message: "   " }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("empty_message");
  });

  it("returns 400 when message exceeds 500 characters", async () => {
    const longMsg = "a".repeat(501);
    const res = await POST(makePost(VALID_LEASE_ID, { message: longMsg }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("message_too_long");
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new NextRequest(`http://localhost/api/chat/${VALID_LEASE_ID}`, {
      method: "POST",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    });
    const res = await POST(req, makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  it("returns 429 when auth daily limit is exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    mockCheckDbChatRateLimit.mockResolvedValue({
      allowed: false,
      reason: "daily_user_limit",
      remaining: 0,
      resetAt: new Date(Date.now() + 86_400_000),
      limit: 50,
    });

    const res = await POST(makePost(VALID_LEASE_ID, { message: "Hi" }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.reason).toBe("daily_user_limit");
    expect(body.limit).toBe(50);
  });

  it("returns 429 when auth hourly burst limit is exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    mockCheckDbChatRateLimit.mockResolvedValue({
      allowed: false,
      reason: "hourly_user_limit",
      remaining: 0,
      resetAt: new Date(Date.now() + 3_600_000),
      limit: 15,
    });

    const res = await POST(makePost(VALID_LEASE_ID, { message: "Hi" }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.reason).toBe("hourly_user_limit");
    expect(body.limit).toBe(15);
  });

  it("returns 429 when guest daily limit is exceeded", async () => {
    mockCheckDbChatRateLimit.mockResolvedValue({
      allowed: false,
      reason: "daily_ip_limit",
      remaining: 0,
      resetAt: new Date(Date.now() + 86_400_000),
      limit: 10,
    });

    const res = await POST(makePost(VALID_LEASE_ID, { message: "Hi" }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.reason).toBe("daily_ip_limit");
    expect(body.limit).toBe(10);
  });

  it("returns 429 when guest hourly burst limit is exceeded", async () => {
    mockCheckDbChatRateLimit.mockResolvedValue({
      allowed: false,
      reason: "hourly_ip_limit",
      remaining: 0,
      resetAt: new Date(Date.now() + 3_600_000),
      limit: 5,
    });

    const res = await POST(makePost(VALID_LEASE_ID, { message: "Hi" }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.reason).toBe("hourly_ip_limit");
    expect(body.limit).toBe(5);
  });

  it("returns 429 when per-lease daily limit is exceeded", async () => {
    mockCheckDbChatRateLimit.mockResolvedValue({
      allowed: false,
      reason: "per_lease_limit",
      remaining: 0,
      resetAt: new Date(Date.now() + 86_400_000),
      limit: 30,
    });

    const res = await POST(makePost(VALID_LEASE_ID, { message: "Hi" }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.reason).toBe("per_lease_limit");
    expect(body.limit).toBe(30);
  });

  it("429 response includes Retry-After header and reset_at field", async () => {
    const resetAt = new Date(Date.now() + 3_600_000);
    mockCheckDbChatRateLimit.mockResolvedValue({
      allowed: false,
      reason: "hourly_ip_limit",
      remaining: 0,
      resetAt,
      limit: 5,
    });

    const res = await POST(makePost(VALID_LEASE_ID, { message: "Hi" }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await res.json();
    expect(body.reset_at).toBeDefined();
  });

  it("passes userId to rate limiter when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
    setupGeminiMocks();
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    await POST(makePost(VALID_LEASE_ID, { message: "What are my rights?" }), makeParams(VALID_LEASE_ID));

    expect(mockCheckDbChatRateLimit).toHaveBeenCalledWith(
      "user-abc",
      expect.any(String),
      VALID_LEASE_ID,
      expect.anything()
    );
  });

  it("passes null userId to rate limiter for guest", async () => {
    setupGeminiMocks();
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    await POST(makePost(VALID_LEASE_ID, { message: "What are my rights?" }), makeParams(VALID_LEASE_ID));

    expect(mockCheckDbChatRateLimit).toHaveBeenCalledWith(
      null,
      expect.any(String),
      VALID_LEASE_ID,
      expect.anything()
    );
  });

  // ── Gemini integration ──────────────────────────────────────────────────────

  it("calls Gemini embed endpoint for the user question", async () => {
    setupGeminiMocks();
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "Can my landlord enter without notice?" }),
      makeParams(VALID_LEASE_ID)
    );
    await res.text();

    const embedCall = (mockFetch as jest.Mock).mock.calls.find(([url]: [string]) =>
      url.includes("embedContent")
    );
    expect(embedCall).toBeDefined();
  });

  it("calls Gemini streamGenerateContent endpoint for chat", async () => {
    setupGeminiMocks();
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "What is my risk level?" }),
      makeParams(VALID_LEASE_ID)
    );
    await res.text();

    const generateCall = (mockFetch as jest.Mock).mock.calls.find(([url]: [string]) =>
      url.includes("streamGenerateContent")
    );
    expect(generateCall).toBeDefined();
    expect(generateCall[0]).toContain("alt=sse");
  });

  // ── Successful streaming ────────────────────────────────────────────────────

  it("returns text/event-stream content-type on valid request", async () => {
    setupGeminiMocks();
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "Can my landlord enter without notice?" }),
      makeParams(VALID_LEASE_ID)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("streams token events followed by sources and done", async () => {
    setupGeminiMocks(["Hello ", "world"]);
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "What is my risk level?" }),
      makeParams(VALID_LEASE_ID)
    );

    const events = await collectSSE(res);
    const types = events.map((e) => e.type);

    expect(types).toContain("token");
    expect(types).toContain("sources");
    expect(types).toContain("done");

    const tokenIdx   = types.indexOf("token");
    const sourcesIdx = types.indexOf("sources");
    const doneIdx    = types.indexOf("done");
    expect(tokenIdx).toBeLessThan(sourcesIdx);
    expect(sourcesIdx).toBeLessThan(doneIdx);
  });

  it("reassembles token text correctly from multiple Gemini chunks", async () => {
    setupGeminiMocks(["Based ", "on ", "your ", "lease..."]);
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "Summarise my lease" }),
      makeParams(VALID_LEASE_ID)
    );

    const events = await collectSSE(res);
    const tokens = events.filter((e) => e.type === "token").map((e) => e.text as string);
    expect(tokens.join("")).toBe("Based on your lease...");
  });

  it("gracefully proceeds when embed fails (answers from lease context only)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("embedContent")) {
        return Promise.resolve({ ok: false, status: 503, text: async () => "Service unavailable" });
      }
      return Promise.resolve(makeGeminiStreamResponse(["Fallback answer"]));
    });
    mockFrom.mockImplementation(buildSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "What are my rights?" }),
      makeParams(VALID_LEASE_ID)
    );

    expect(res.status).toBe(200);
    const events = await collectSSE(res);
    expect(events.map((e) => e.type)).toContain("done");
  });
});
