const mockCheckDbRateLimit = jest.fn();

jest.mock("../lib/rate-limiter-db", () => ({
  checkDbRateLimit: (...args: unknown[]) => mockCheckDbRateLimit(...args),
  dbRateLimitExceededResponse: jest.fn().mockReturnValue({
    body: { error: "rate_limited" },
    headers: { "Retry-After": "60" },
    status: 429,
  }),
}));

import { NextRequest } from "next/server";
import { POST } from "../app/api/maintenance-repairs-check/route";

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/maintenance-repairs-check", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BODY = {
  issueType: "no_heat",
  reportedDate: "2026-01-05",
  reportedInWriting: true,
  asOfDate: "2026-01-12",
  measuredTempC: 17,
};

beforeEach(() => {
  mockCheckDbRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
});

describe("POST /api/maintenance-repairs-check", () => {
  it("returns the checker result for a valid request", async () => {
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.issueType).toBe("no_heat");
    expect(data.status).toBe("follow_up_overdue");
    expect(data.heat).toEqual({ inHeatSeason: true, belowMinimum: true, minimumC: 20 });
    expect(data.disclaimer).toMatch(/not constitute legal advice/);
  });

  it("accepts a null reportedDate as not yet reported", async () => {
    const res = await POST(makePost({ ...VALID_BODY, reportedDate: null }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("not_yet_reported");
  });

  it("rejects an unknown issue type", async () => {
    const res = await POST(makePost({ ...VALID_BODY, issueType: "flooding" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_issue_type");
  });

  it("rejects a missing asOfDate", async () => {
    const res = await POST(makePost({ ...VALID_BODY, asOfDate: undefined }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_dates");
  });

  it("rejects a reportedDate after asOfDate", async () => {
    const res = await POST(makePost({ ...VALID_BODY, reportedDate: "2026-02-01" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_date_order");
  });

  it("rejects an out-of-range temperature", async () => {
    const res = await POST(makePost({ ...VALID_BODY, measuredTempC: 400 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_temperature");
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(makePost("not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    mockCheckDbRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(429);
  });
});
