const mockSingle = jest.fn();
const mockIn = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: mockFrom,
  },
}));

// NOTE: @/lib/anthropic is NOT mocked here — the negotiation route uses Groq
// (fetch) directly, not the Anthropic SDK. Any residual import is irrelevant.

import { NextRequest } from "next/server";
import { POST } from "../app/api/negotiation/generate/route";

const VALID_LEASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const VALID_CLAUSE_ID = "11111111-2222-3333-4444-555555555555";

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/negotiation/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Wire up the Supabase mocks for a valid lease + one clause + one negotiation point. */
function setupValidMocks() {
  mockSingle.mockResolvedValue({
    data: {
      id: VALID_LEASE_ID,
      property_address: "123 Main St",
      property_unit: "Apt 4",
      property_city: "Toronto",
      jurisdiction: "CA-ON",
    },
    error: null,
  });
  mockEq.mockReturnValue({ single: mockSingle });

  const mockClausesIn = jest.fn().mockResolvedValue({
    data: [
      {
        id: VALID_CLAUSE_ID,
        clause_number: "12",
        heading: "Pets",
        raw_text: "No pets allowed in the unit.",
        statutory_violations: [],
      },
    ],
    error: null,
  });
  const mockNegPointsIn = jest.fn().mockResolvedValue({
    data: [
      {
        clause_id: VALID_CLAUSE_ID,
        priority: "high",
        ask: "Remove no-pet clause",
        counter_language: "Tenants may keep pets.",
        legal_argument: "Section 14 of RTA voids no-pet provisions.",
        landlord_likely_response: "",
        tenant_rebuttal: "",
        cited_statutes: [],
      },
    ],
    error: null,
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "leases")            return { select: () => ({ eq: mockEq }) };
    if (table === "clauses")           return { select: () => ({ in: () => ({ eq: mockClausesIn }) }) };
    if (table === "negotiation_points") return { select: () => ({ in: mockNegPointsIn }) };
    return { select: () => ({ in: jest.fn().mockResolvedValue({ data: [], error: null }) }) };
  });
}

describe("POST /api/negotiation/generate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure GROQ_API_KEY is unset in tests unless explicitly set per-test
    delete process.env.GROQ_API_KEY;
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it("returns 400 for a malformed leaseId", async () => {
    const res = await POST(makePost({
      leaseId: "not-a-uuid",
      tenantName: "Tenant",
      landlordName: "Landlord",
      tone: "cooperative",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_lease_id");
  });

  it("returns 400 for missing tenantName", async () => {
    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "  ",
      landlordName: "Landlord",
      tone: "cooperative",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_tenant_name");
  });

  it("returns 400 for missing landlordName", async () => {
    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Tenant",
      landlordName: "",
      tone: "cooperative",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_landlord_name");
  });

  it("returns 400 for invalid tone", async () => {
    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Tenant",
      landlordName: "Landlord",
      tone: "aggressive",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_tone");
  });

  it("returns 400 for empty selectedClauseIds", async () => {
    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Tenant",
      landlordName: "Landlord",
      tone: "cooperative",
      selectedClauseIds: [],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_clauses");
  });

  it("returns 404 when lease is not found in database", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Lease not found" } });
    mockEq.mockReturnValue({ single: mockSingle });
    mockFrom.mockReturnValue({ select: () => ({ eq: mockEq }) });

    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Tenant",
      landlordName: "Landlord",
      tone: "cooperative",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("lease_not_found");
  });

  // ── Template fallback (GROQ_API_KEY not set — default in CI) ────────────────

  it("returns 200 with template proposal when GROQ_API_KEY is not set", async () => {
    setupValidMocks();

    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Jane Doe",
      landlordName: "John Smith",
      tone: "cooperative",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();

    // Template format: "Proposed Lease Amendments — <unit> - <address>, <city>"
    expect(body.email_subject).toContain("Proposed Lease Amendments");
    expect(body.email_subject).toContain("123 Main St");
    expect(body.email_subject).toContain("Toronto");
    expect(body.addendum_clauses[0].heading).toBe("Pets");
    expect(typeof body.email_body).toBe("string");
    expect(body.email_body.length).toBeGreaterThan(50);
    expect(typeof body.addendum_intro).toBe("string");
  });

  // ── Groq path (GROQ_API_KEY set, fetch mocked) ───────────────────────────────

  it("returns 200 with Groq-generated proposal when GROQ_API_KEY is set and fetch succeeds", async () => {
    setupValidMocks();
    process.env.GROQ_API_KEY = "test-groq-key";

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                email_subject:    "Negotiation Proposal for Apt 4 - 123 Main St, Toronto",
                email_body:       "Dear John Smith,\n\nI would like to propose amendments...",
                addendum_title:   "LEASE AMENDMENT ADDENDUM",
                addendum_intro:   "This Addendum is entered into between John Smith and Jane Doe...",
                addendum_clauses: [
                  {
                    original_number: "12",
                    heading:         "Pets",
                    proposed_text:   "Tenants may keep pets pursuant to RTA s.14.",
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    global.fetch = mockFetch;

    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Jane Doe",
      landlordName: "John Smith",
      tone: "cooperative",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email_subject).toBe("Negotiation Proposal for Apt 4 - 123 Main St, Toronto");
    expect(body.addendum_clauses[0].heading).toBe("Pets");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );

    delete process.env.GROQ_API_KEY;
  });

  it("falls back to template when Groq returns a non-ok response", async () => {
    setupValidMocks();
    process.env.GROQ_API_KEY = "test-groq-key";

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Jane Doe",
      landlordName: "John Smith",
      tone: "formal",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Falls back to template — subject still contains the address
    expect(body.email_subject).toContain("123 Main St");
    expect(body.addendum_clauses[0].heading).toBe("Pets");

    delete process.env.GROQ_API_KEY;
  });
});
