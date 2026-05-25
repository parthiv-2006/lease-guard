/**
 * Tests for POST /api/chat/[leaseId]
 *
 * Supabase, Gemini fetch, and Anthropic are fully mocked.
 * No real credentials required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Must be defined before imports that touch these modules.

// Supabase mock
const mockRpc = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

// Anthropic mock — stream that emits one token then done
const mockStream = {
  [Symbol.asyncIterator]: jest.fn(),
};
const mockMessages = {
  stream: jest.fn().mockResolvedValue(mockStream),
};
const mockAnthropicInstance = { messages: mockMessages };
jest.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = jest.fn(() => mockAnthropicInstance);
  return { default: MockAnthropic, __esModule: true };
});

// Global fetch mock (for Gemini embed)
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Rate limiter — allow by default
jest.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 19, resetAt: Date.now() + 3600000 })),
  rateLimitExceededResponse: jest.fn(() => ({
    body: { error: "rate_limit_exceeded", message: "Too many requests.", reset_at: "" },
    headers: { "Retry-After": "3600" },
    status: 429,
  })),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { POST } from "../app/api/chat/[leaseId]/route";
import { checkRateLimit } from "@/lib/rate-limiter";

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

/** Set up Supabase to return clauses, lease, and report data */
function setupSupabaseMocks() {
  mockLimit.mockReturnValue({ single: mockSingle });
  mockOrder.mockReturnValue({ limit: mockLimit, single: mockSingle });
  mockEq.mockReturnValue({
    order: mockOrder,
    single: mockSingle,
    limit: mockLimit,
  });

  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({ eq: mockEq }),
    rpc: mockRpc,
  });

  // clauses fetch
  mockSingle
    .mockResolvedValueOnce({ data: MOCK_CLAUSES, error: null })
    // lease fetch
    .mockResolvedValueOnce({
      data: { property_address: "123 King St", property_city: "Toronto", jurisdiction: "Ontario" },
      error: null,
    })
    // report fetch
    .mockResolvedValueOnce({
      data: { overall_risk_score: 7.5, overall_risk_level: "high" },
      error: null,
    });

  // Override mockFrom to return different data per table using order→limit chain
  mockOrder.mockImplementation(() => ({
    limit: jest.fn().mockReturnValue({
      single: jest.fn()
        .mockResolvedValueOnce({ data: { overall_risk_score: 7.5, overall_risk_level: "high" }, error: null }),
    }),
    single: jest.fn()
      .mockResolvedValueOnce({ data: { property_address: "123 King St", property_city: "Toronto" }, error: null }),
  }));
}

/** Set up Gemini embed to return mock 768-dim embedding */
function setupGeminiMock() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ embedding: { values: MOCK_EMBEDDING } }),
    text: async () => "",
  });
}

/** Set up Anthropic stream with one token event then done */
function setupAnthropicStream(tokens: string[] = ["Based ", "on ", "your ", "lease..."]) {
  const events = [
    ...tokens.map((text) => ({
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    })),
    { type: "message_stop" },
  ];

  mockStream[Symbol.asyncIterator].mockImplementation(function* () {
    yield* events;
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
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
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

  it("returns 429 when rate limit is exceeded", async () => {
    (checkRateLimit as jest.Mock).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 3600000,
    });

    const res = await POST(makePost(VALID_LEASE_ID, { message: "Hi" }), makeParams(VALID_LEASE_ID));
    expect(res.status).toBe(429);
  });

  // ── Successful streaming ────────────────────────────────────────────────────

  /**
   * Build a Supabase from() mock that handles the 3-way parallel query in the route:
   *   clauses:  from("clauses").select(...).eq(...).order(...)  → {data, error}
   *   lease:    from("leases").select(...).eq(...).single()     → {data, error}
   *   report:   from("reports").select(...).eq(...).order(...).limit(...).single() → {data, error}
   */
  function buildParallelSupabaseMock() {
    let callCount = 0;

    return jest.fn(() => {
      callCount++;
      const call = callCount;

      if (call === 1) {
        // clauses query: .select().eq().order()
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: MOCK_CLAUSES, error: null }),
            }),
          }),
        };
      }

      if (call === 2) {
        // leases query: .select().eq().single()
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

      // reports query: .select().eq().order().limit().single()
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

  it("returns text/event-stream content-type on valid request", async () => {
    setupGeminiMock();
    setupAnthropicStream();
    mockFrom.mockImplementation(buildParallelSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "Can my landlord enter without notice?" }),
      makeParams(VALID_LEASE_ID)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("streams token events followed by sources and done", async () => {
    setupGeminiMock();
    setupAnthropicStream(["Hello ", "world"]);
    mockFrom.mockImplementation(buildParallelSupabaseMock());
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      makePost(VALID_LEASE_ID, { message: "What is my risk level?" }),
      makeParams(VALID_LEASE_ID)
    );

    const events = await collectSSE(res);
    const types = events.map((e) => e.type);

    // Must have at least one token, sources, and done in order
    expect(types).toContain("token");
    expect(types).toContain("sources");
    expect(types).toContain("done");

    const tokenIdx = types.indexOf("token");
    const sourcesIdx = types.indexOf("sources");
    const doneIdx = types.indexOf("done");
    expect(tokenIdx).toBeLessThan(sourcesIdx);
    expect(sourcesIdx).toBeLessThan(doneIdx);
  });
});

