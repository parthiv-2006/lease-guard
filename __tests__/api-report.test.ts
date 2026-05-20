/**
 * Tests for GET /api/report/[id] and POST /api/report/[id]
 *
 * Supabase is fully mocked — no real credentials required.
 */

// ─── Mocks (must be before any imports that touch Supabase) ─────────────────

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockGt = jest.fn();
const mockUpdate = jest.fn();
const mockFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/report/[id]/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SHARE_TOKEN = "abc123def456abc123def456abc123de";

const MOCK_REPORT_JSON = {
  lease_id: VALID_ID,
  overall_risk_score: 6.5,
  overall_risk_level: "medium",
  executive_summary: "This lease contains several provisions worth reviewing.",
  risk_distribution: { low: 5, medium: 3, high: 2, critical: 0 },
  red_flags: [],
  contradictions: [],
  missing_protections: [],
  implicit_protections: [],
  negotiation_points: [],
  sources: [],
  corpus_version: "2026-05-16",
  disclaimer: "This analysis is not legal advice.",
};

const MOCK_REPORT_ROW: {
  id: string;
  lease_id: string;
  created_at: string;
  expires_at: string;
  share_token: string | null;
  overall_risk_score: number;
  overall_risk_level: string;
  executive_summary: string;
  full_report_json: typeof MOCK_REPORT_JSON;
} = {
  id: "report-uuid",
  lease_id: VALID_ID,
  created_at: "2026-05-16T10:00:00Z",
  expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  share_token: null,
  overall_risk_score: 6.5,
  overall_risk_level: "medium",
  executive_summary: "This lease contains several provisions worth reviewing.",
  full_report_json: MOCK_REPORT_JSON,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGet(id: string, token?: string): NextRequest {
  const url = token
    ? `http://localhost/api/report/${id}?token=${token}`
    : `http://localhost/api/report/${id}`;
  return new NextRequest(url);
}

function makePost(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/report/${id}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ─── Setup helpers ────────────────────────────────────────────────────────────

function mockFoundReport(overrides: Partial<typeof MOCK_REPORT_ROW> = {}) {
  const row = { ...MOCK_REPORT_ROW, ...overrides };
  mockSingle.mockResolvedValue({ data: row, error: null });
  mockGt.mockReturnValue({ single: mockSingle });
  
  const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
  mockEq.mockReturnValue({
    gt: mockGt,
    single: mockSingle,
    order: mockOrder,
  });

  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({ eq: mockEq }),
    update: mockUpdate,
  });
}

function mockNotFound() {
  mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });
  mockGt.mockReturnValue({ single: mockSingle });
  
  const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
  mockEq.mockReturnValue({
    gt: mockGt,
    single: mockSingle,
    order: mockOrder,
  });

  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({ eq: mockEq }),
  });
}

// ─── GET tests ────────────────────────────────────────────────────────────────

describe("GET /api/report/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 for a malformed ID", async () => {
    const res = await GET(makeGet("not-a-uuid"), makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("returns 404 when report is not found", async () => {
    mockNotFound();
    const res = await GET(makeGet(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 200 with report data for a valid ID", async () => {
    mockFoundReport();
    const res = await GET(makeGet(VALID_ID), makeParams(VALID_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall_risk_score).toBe(6.5);
    expect(body.overall_risk_level).toBe("medium");
  });

  it("injects the legal disclaimer into every response", async () => {
    mockFoundReport();
    const res = await GET(makeGet(VALID_ID), makeParams(VALID_ID));
    const body = await res.json();
    expect(typeof body.disclaimer).toBe("string");
    expect(body.disclaimer.length).toBeGreaterThan(20);
  });

  it("includes expires_at in the response", async () => {
    mockFoundReport();
    const res = await GET(makeGet(VALID_ID), makeParams(VALID_ID));
    const body = await res.json();
    expect(body.expires_at).toBeTruthy();
  });

  it("returns share_url when share_token is set on the row", async () => {
    mockFoundReport({ share_token: SHARE_TOKEN });
    const res = await GET(makeGet(VALID_ID), makeParams(VALID_ID));
    const body = await res.json();
    expect(body.share_url).toContain(SHARE_TOKEN);
    expect(body.share_url).toContain(VALID_ID);
  });

  it("returns null share_url when no share_token exists", async () => {
    mockFoundReport({ share_token: null });
    const res = await GET(makeGet(VALID_ID), makeParams(VALID_ID));
    const body = await res.json();
    expect(body.share_url).toBeNull();
  });

  it("returns 403 when an incorrect share token is supplied", async () => {
    mockFoundReport({ share_token: SHARE_TOKEN });
    const res = await GET(
      makeGet(VALID_ID, "wrongtoken"),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });

  it("accepts the correct share token without error", async () => {
    mockFoundReport({ share_token: SHARE_TOKEN });
    const res = await GET(
      makeGet(VALID_ID, SHARE_TOKEN),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(200);
  });

  it("includes corpus_version from the report JSON", async () => {
    mockFoundReport();
    const res = await GET(makeGet(VALID_ID), makeParams(VALID_ID));
    const body = await res.json();
    expect(body.corpus_version).toBe("2026-05-16");
  });
});

// ─── POST tests (share link generation) ──────────────────────────────────────

describe("POST /api/report/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 for a malformed ID", async () => {
    const res = await POST(
      makePost("not-a-uuid", { action: "share" }),
      makeParams("not-a-uuid")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("returns 400 for an unknown action", async () => {
    const res = await POST(
      makePost(VALID_ID, { action: "delete" }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_action");
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest(`http://localhost/api/report/${VALID_ID}`, {
      method: "POST",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, makeParams(VALID_ID));
    expect(res.status).toBe(400);
  });

  it("generates a share link for action=share", async () => {
    // Mock the update chain
    mockUpdate.mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const res = await POST(
      makePost(VALID_ID, { action: "share" }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share_url).toContain(VALID_ID);
    expect(typeof body.share_url).toBe("string");
    expect(body.expires_in_days).toBe(90);
    expect(typeof body.consent_notice).toBe("string");
  });

  it("returns 500 when the DB update fails", async () => {
    mockUpdate.mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: { message: "DB error" } }),
    });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const res = await POST(
      makePost(VALID_ID, { action: "share" }),
      makeParams(VALID_ID)
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("update_failed");
  });
});
