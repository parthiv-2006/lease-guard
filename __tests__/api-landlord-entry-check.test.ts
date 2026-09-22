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
import { POST } from "../app/api/landlord-entry-check/route";

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/landlord-entry-check", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BODY = {
  reason: "repairs_or_work",
  entryDate: "2026-03-10",
  entryTime: "10:00",
  writtenNotice: { date: "2026-03-09", time: "10:00", statedReason: true, statedTime: true },
};

beforeEach(() => {
  mockCheckDbRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
});

describe("POST /api/landlord-entry-check", () => {
  it("returns the checker result for a valid request", async () => {
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reason).toBe("repairs_or_work");
    expect(data.verdict).toBe("appears_permitted");
    expect(data.noticeHours).toBe(24);
    expect(data.disclaimer).toMatch(/not constitute legal advice/);
  });

  it("treats a null writtenNotice as no notice given", async () => {
    const res = await POST(makePost({ ...VALID_BODY, writtenNotice: null }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verdict).toBe("may_not_be_permitted");
    expect(data.noticeHours).toBeNull();
  });

  it("passes the s.26(3) flags through to the engine", async () => {
    const res = await POST(
      makePost({ reason: "showing_to_prospective_tenant", entryDate: "2026-03-10", entryTime: "12:00", tenancyEnding: true, tenantInformedBeforehand: true })
    );
    expect((await res.json()).verdict).toBe("appears_permitted");
  });

  it("rejects an unknown reason", async () => {
    const res = await POST(makePost({ ...VALID_BODY, reason: "snooping" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_reason");
  });

  it("rejects a malformed entry time", async () => {
    const res = await POST(makePost({ ...VALID_BODY, entryTime: "10am" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_datetime");
  });

  it("rejects a malformed notice date", async () => {
    const res = await POST(makePost({ ...VALID_BODY, writtenNotice: { ...VALID_BODY.writtenNotice, date: "yesterday" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_datetime");
  });

  it("rejects a non-object writtenNotice", async () => {
    const res = await POST(makePost({ ...VALID_BODY, writtenNotice: "yes" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_notice");
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(makePost("not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckDbRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(429);
  });
});
