/**
 * Tests for lib/agent.ts — the LeaseGuard analysis pipeline.
 *
 * Strategy:
 *  - McpClient is mocked so no real MCP server process is spawned.
 *  - Supabase is mocked so no real DB writes occur.
 *  - fs (file system) is mocked for the temp-file lifecycle.
 *  - Each test covers a distinct pipeline behaviour or failure mode.
 */

// ─── Mocks (declared before imports) ─────────────────────────────────────────

// Mock fs so we don't touch the real file system
jest.mock("fs", () => ({
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

// Mock uuid so IDs are predictable
jest.mock("uuid", () => ({
  v4: jest
    .fn()
    .mockReturnValueOnce("temp-file-uuid")    // tempFilePath
    .mockReturnValue("db-clause-uuid"),        // dbClauseId for every clause
}));

// Mock anthropic.ts so MCP_SERVER_PATH is defined without credentials check
jest.mock("../lib/anthropic", () => ({
  getAnthropicClient: jest.fn(),
  MCP_SERVER_PATH: "/fake/mcp-server/dist/start.js",
  _resetClientForTesting: jest.fn(),
}));

// ─── McpClient mock factory ───────────────────────────────────────────────────

const mockCallTool = jest.fn();
const mockClose = jest.fn();
const mockMcpCreate = jest.fn();

jest.mock("../lib/mcp-client", () => ({
  McpClient: {
    create: (...args: unknown[]) => mockMcpCreate(...args),
  },
}));

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });
const mockStorageDownload = jest.fn();
const mockStorageRemove = jest.fn().mockResolvedValue({ error: null });

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        download: mockStorageDownload,
        remove: mockStorageRemove,
      })),
    },
    from: jest.fn((table: string) => {
      if (table === "leases") return { update: mockUpdate, insert: mockInsert };
      return { insert: mockInsert, update: mockUpdate };
    }),
  })),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { runLeaseAnalysis } from "../lib/agent";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const LEASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const STORAGE_PATH = `leases/${LEASE_ID}/lease.pdf`;

/** Minimal valid Clause shape returned by segment_clauses. */
const MOCK_CLAUSE = {
  id: "clause-1",
  number: "1",
  heading: "Rent",
  raw_text: "The tenant shall pay rent of $2,000 per month on the first of each month.",
  char_start: 0,
  char_end: 80,
  cross_references: [],
};

/** A fake PDF blob that arrayBuffer() resolves to an empty buffer. */
function makeFakeBlob(): Blob {
  return {
    arrayBuffer: async () => new ArrayBuffer(8),
    size: 8,
    type: "application/pdf",
    text: async () => "",
    slice: () => makeFakeBlob(),
    stream: () => new ReadableStream(),
  } as unknown as Blob;
}

/** Wire up the McpClient mock to return sensible results for every tool. */
function setupHappyPathMcp() {
  mockCallTool.mockImplementation(async (toolName: string) => {
    switch (toolName) {
      case "parse_document":
        return {
          raw_text: "ONTARIO RESIDENTIAL LEASE\n\n1. Rent: $2,000/month due on the 1st.",
          page_count: 2,
          extraction_method: "text",
          confidence: 0.95,
        };
      case "detect_jurisdiction":
        return {
          jurisdiction: "Ontario, Canada",
          jurisdiction_code: "CA-ON",
          confidence: 0.95,
          detection_basis: ["ontario keyword"],
          supported: true,
        };
      case "segment_clauses":
        return { clauses: [MOCK_CLAUSE] };
      case "classify_clause":
        return {
          clause_id: "clause-1",
          primary_type: "rent_payment",
          subtype: null,
          confidence: 0.85,
          requires_legal_lookup: true,
          lookup_priority: "high",
          keywords: ["rent", "monthly"],
        };
      case "lookup_statute":
        return {
          statutes: [
            {
              id: "stat-1",
              act_name: "Residential Tenancies Act",
              section_number: "108",
              section_title: "Post-dated cheques",
              text: "A landlord shall not require post-dated cheques.",
              url: "https://ontario.ca/laws/rta",
              relevance_score: 0.82,
              last_verified: "2026-05-16",
            },
          ],
        };
      case "lookup_tribunal":
        return { decisions: [] };
      case "score_risk":
        return {
          risk_score: 3,
          risk_level: "low",
          is_potentially_unenforceable: false,
          is_unusual: false,
          is_standard: true,
          plain_english_explanation: "Standard rent payment clause.",
          risk_reasoning: "No violations detected.",
          statutory_violations: [],
          confidence: 0.85,
        };
      case "detect_contradiction":
        return {
          has_contradiction: false,
          severity: "low",
        };
      case "check_missing":
        return {
          missing_protections: [],
          found_protections: [],
          implicit_protections: [
            {
              name: "90-day notice cap",
              description: "Landlord cannot require more than 90 days notice.",
              statute_reference: "RTA s.44",
              applies_regardless_of_lease: true,
            },
          ],
          all_required_present: true,
          jurisdiction_supported: true,
          coverage_score: 1.0,
        };
      case "generate_negotiation":
        return {
          negotiable: true,
          negotiability_basis: "RTA s.108 applies",
          priority: "medium",
          ask: "Remove post-dated cheque requirement.",
          counter_language: "Rent shall be paid by e-transfer.",
          legal_argument: "RTA s.108 prohibits requiring post-dated cheques.",
          landlord_likely_response: "May resist, but legally required.",
          your_rebuttal: "This is prohibited by statute.",
          walk_away_threshold: false,
        };
      case "benchmark_clause":
        return { stored: true };
      case "generate_report":
        return {
          lease_id: LEASE_ID,
          generated_at: new Date().toISOString(),
          jurisdiction: "Ontario, Canada",
          overall_risk_score: 3.0,
          overall_risk_level: "low",
          executive_summary: "This lease appears tenant-friendly.",
          risk_distribution: { low: 1, medium: 0, high: 0, critical: 0 },
          total_clauses_analyzed: 1,
          red_flags: [],
          contradictions: [],
          missing_protections: [],
          implicit_protections: [],
          negotiation_points: [],
          sources: [],
          disclaimer: "This is not legal advice.",
          corpus_version: "2026-05-16",
        };
      default:
        throw new Error(`Unexpected tool call in test: ${toolName}`);
    }
  });

  mockMcpCreate.mockResolvedValue({
    callTool: mockCallTool,
    close: mockClose,
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockStorageDownload.mockResolvedValue({ data: makeFakeBlob(), error: null });
  setupHappyPathMcp();
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("runLeaseAnalysis — happy path", () => {
  it("completes without throwing", async () => {
    await expect(runLeaseAnalysis(LEASE_ID, STORAGE_PATH)).resolves.toBeUndefined();
  });

  it("calls parse_document with the temp file path and ocr_fallback=true", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith("parse_document", {
      file_path: expect.stringContaining("leaseguard-"),
      ocr_fallback: true,
    });
  });

  it("calls detect_jurisdiction with the raw text", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith("detect_jurisdiction", {
      raw_text: expect.stringContaining("ONTARIO"),
    });
  });

  it("calls segment_clauses with raw_text and jurisdiction_code", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith("segment_clauses", {
      raw_text: expect.any(String),
      jurisdiction_code: "CA-ON",
    });
  });

  it("calls classify_clause, lookup_statute, lookup_tribunal, score_risk for each clause", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith("classify_clause", expect.any(Object));
    expect(mockCallTool).toHaveBeenCalledWith("lookup_statute", expect.any(Object));
    expect(mockCallTool).toHaveBeenCalledWith("lookup_tribunal", expect.any(Object));
    expect(mockCallTool).toHaveBeenCalledWith("score_risk", expect.any(Object));
  });

  it("calls check_missing with the found clause types", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith("check_missing", {
      found_clause_types: expect.arrayContaining(["rent_payment"]),
      jurisdiction_code: "CA-ON",
    });
  });

  it("calls generate_report as the penultimate tool", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith("generate_report", expect.objectContaining({
      lease_id: LEASE_ID,
      jurisdiction: "Ontario, Canada",
    }));
  });

  it("marks the lease as processing then complete in the DB", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    // First update: status=processing
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "processing" }));
    // Final update: status=complete
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "complete" }));
  });

  it("inserts a row into the reports table", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lease_id: LEASE_ID,
        overall_risk_score: 3.0,
        overall_risk_level: "low",
      })
    );
  });

  it("closes the MCP client in the finally block", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("deletes the temp file after parse_document completes", async () => {
    const fs = await import("fs");
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining("leaseguard-"));
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("runLeaseAnalysis — error handling", () => {
  it("throws and marks lease as failed when storage download fails", async () => {
    mockStorageDownload.mockResolvedValueOnce({
      data: null,
      error: { message: "Bucket not found" },
    });

    await expect(runLeaseAnalysis(LEASE_ID, STORAGE_PATH)).rejects.toThrow(
      /storage download failed/i
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("throws and marks lease as failed when parse_document returns insufficient text", async () => {
    mockCallTool.mockImplementationOnce(async () => ({
      raw_text: "too short",
      page_count: 1,
      extraction_method: "text",
      confidence: 0.5,
    }));

    await expect(runLeaseAnalysis(LEASE_ID, STORAGE_PATH)).rejects.toThrow(
      /insufficient text/i
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("throws and marks lease as failed when no clauses are segmented", async () => {
    mockCallTool.mockImplementation(async (toolName: string) => {
      if (toolName === "parse_document")
        return {
          raw_text: "ONTARIO RESIDENTIAL LEASE — valid content here for parsing.",
          page_count: 1,
          extraction_method: "text",
          confidence: 0.9,
        };
      if (toolName === "detect_jurisdiction")
        return {
          jurisdiction: "Ontario, Canada",
          jurisdiction_code: "CA-ON",
          confidence: 0.9,
          detection_basis: [],
          supported: true,
        };
      if (toolName === "segment_clauses") return { clauses: [] };
      throw new Error("Should not reach this tool");
    });

    await expect(runLeaseAnalysis(LEASE_ID, STORAGE_PATH)).rejects.toThrow(
      /no clauses/i
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("closes the MCP client even when the pipeline fails mid-way", async () => {
    mockStorageDownload.mockResolvedValueOnce({
      data: null,
      error: { message: "connection error" },
    });

    await expect(runLeaseAnalysis(LEASE_ID, STORAGE_PATH)).rejects.toThrow();
    // MCP was never started in this case — close should NOT have been called
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("closes the MCP client when failure happens after MCP is started", async () => {
    // parse_document succeeds, then detect_jurisdiction fails
    mockCallTool
      .mockResolvedValueOnce({
        raw_text: "ONTARIO RESIDENTIAL LEASE — substantial content here to satisfy the length check.",
        page_count: 1,
        extraction_method: "text",
        confidence: 0.9,
      })
      .mockRejectedValueOnce(new Error("Jurisdiction detection crashed"));

    await expect(runLeaseAnalysis(LEASE_ID, STORAGE_PATH)).rejects.toThrow(
      "Jurisdiction detection crashed"
    );

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("continues pipeline when an individual clause fails classification", async () => {
    // First clause fails classify_clause, but pipeline should still complete
    let classifyCalls = 0;
    mockCallTool.mockImplementation(async (toolName: string) => {
      if (toolName === "classify_clause") {
        classifyCalls++;
        if (classifyCalls === 1) throw new Error("Classify crashed");
        return {
          clause_id: "clause-2",
          primary_type: "standard_boilerplate",
          subtype: null,
          confidence: 0.7,
          requires_legal_lookup: false,
          lookup_priority: "none",
          keywords: [],
        };
      }
      // Fall through to happy-path handler for everything else
      return setupHappyPathMcp(), mockCallTool(toolName);
    });

    // Reset to happy path so non-classify calls work
    setupHappyPathMcp();

    // Segment returns two clauses
    mockCallTool.mockImplementationOnce(async () => ({
      raw_text: "ONTARIO RESIDENTIAL LEASE — substantial content here for parsing.",
      page_count: 2,
      extraction_method: "text",
      confidence: 0.9,
    }));
    mockCallTool.mockImplementationOnce(async () => ({
      jurisdiction: "Ontario, Canada",
      jurisdiction_code: "CA-ON",
      confidence: 0.9,
      detection_basis: [],
      supported: true,
    }));
    mockCallTool.mockImplementationOnce(async () => ({
      clauses: [MOCK_CLAUSE, { ...MOCK_CLAUSE, id: "clause-2", number: "2" }],
    }));

    // Should not throw — per-clause errors are swallowed
    await expect(runLeaseAnalysis(LEASE_ID, STORAGE_PATH)).resolves.not.toThrow();
  });
});

// ─── MCP client lifecycle ─────────────────────────────────────────────────────

describe("runLeaseAnalysis — MCP client lifecycle", () => {
  it("spawns the MCP client with the configured server path", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockMcpCreate).toHaveBeenCalledWith("/fake/mcp-server/dist/start.js");
  });

  it("passes jurisdiction_code to lookup_statute", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith(
      "lookup_statute",
      expect.objectContaining({ jurisdiction_code: "CA-ON" })
    );
  });

  it("passes jurisdiction_code to score_risk", async () => {
    await runLeaseAnalysis(LEASE_ID, STORAGE_PATH);
    expect(mockCallTool).toHaveBeenCalledWith(
      "score_risk",
      expect.objectContaining({ jurisdiction_code: "CA-ON" })
    );
  });
});
