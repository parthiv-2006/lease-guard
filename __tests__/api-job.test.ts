jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          status: "complete",
          uploaded_at: "2026-05-14T10:00:00Z",
          jurisdiction: "Ontario, Canada",
          jurisdiction_confidence: "high",
          overall_risk_score: 7.4,
          overall_risk_level: "high",
          analysis_completed_at: "2026-05-14T10:01:30Z",
          error_message: null,
          corpus_version: "2026-05-14",
        },
        error: null,
      }),
    })),
    rpc: jest.fn().mockResolvedValue({
      data: [{ is_allowed: true, current_count: 1, window_reset_at: "2099-01-01T00:00:00Z" }],
      error: null,
    }),
  })),
}));

import { NextRequest } from "next/server";
import { GET } from "../app/api/job/[id]/route";

const VALID_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeGet(id: string) {
  return new NextRequest(`http://localhost/api/job/${id}`);
}

describe("GET /api/job/[id]", () => {
  it("returns job status for a valid ID", async () => {
    const res = await GET(makeGet(VALID_ID), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("complete");
    expect(body.overall_risk_score).toBe(7.4);
  });

  it("returns 400 for a malformed ID", async () => {
    const res = await GET(makeGet("not-a-uuid"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("includes corpus_version in the response", async () => {
    const res = await GET(makeGet(VALID_ID), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    const body = await res.json();
    expect(body.corpus_version).toBe("2026-05-14");
  });
});
