const mockSingle = jest.fn();
const mockIn = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: mockFrom,
  },
}));

import { NextRequest } from "next/server";
import { POST } from "../app/api/negotiation/generate/route";

const mockCreate = jest.fn();
jest.mock("@/lib/anthropic", () => ({
  getAnthropicClient: jest.fn(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

const VALID_LEASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const VALID_CLAUSE_ID = "11111111-2222-3333-4444-555555555555";

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/negotiation/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/negotiation/generate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it("returns 200 with generated proposal when inputs are valid", async () => {
    // 1. Mock lease fetch
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

    // 2. Mock clauses & negotiation points fetch
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
          legal_argument: "Section 14 of RTA void no-pet provisions.",
        },
      ],
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "leases") {
        return { select: () => ({ eq: mockEq }) };
      }
      if (table === "clauses") {
        return { select: () => ({ in: mockClausesIn }) };
      }
      if (table === "negotiation_points") {
        return { select: () => ({ in: mockNegPointsIn }) };
      }
      return { select: () => ({ in: jest.fn().mockResolvedValue({ data: [], error: null }) }) };
    });

    // 3. Mock Anthropic Client response
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "output_negotiation_proposal",
          input: {
            email_subject: "Negotiation Proposal for Apt 4 - 123 Main St",
            email_body: "Dear Landlord, I would like to propose some updates to our lease...",
            addendum_title: "LEASE AMENDMENT ADDENDUM",
            addendum_intro: "This agreement modifies the lease between Tenant and Landlord...",
            addendum_clauses: [
              {
                original_number: "12",
                heading: "Pets",
                proposed_text: "Tenants may keep pets.",
              },
            ],
          },
        },
      ],
    });

    const res = await POST(makePost({
      leaseId: VALID_LEASE_ID,
      tenantName: "Jane Doe",
      landlordName: "John Smith",
      tone: "cooperative",
      selectedClauseIds: [VALID_CLAUSE_ID],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email_subject).toBe("Negotiation Proposal for Apt 4 - 123 Main St");
    expect(body.addendum_clauses[0].heading).toBe("Pets");
    expect(mockCreate).toHaveBeenCalled();
  });
});
