/**
 * lib/agent.ts — LeaseGuard analysis pipeline.
 *
 * Orchestrates the full 12-tool MCP pipeline for a single lease document:
 *
 *   parse → detect jurisdiction → segment →
 *   (parallel clause batches: classify → lookup statute+tribunal → score risk) →
 *   detect contradictions → check missing protections →
 *   generate negotiation points → benchmark (async, non-blocking) →
 *   generate report → persist → mark complete
 *
 * Called from app/api/upload/route.ts as a fire-and-forget background task.
 * All errors are caught, written to the lease row, and re-thrown.
 */

import { createClient } from "@supabase/supabase-js";
import { McpClient } from "./mcp-client";
import { MCP_SERVER_PATH } from "./anthropic";
import { emitAnalysisEvent } from "./analysis-events";
import os from "os";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// ─── Local type mirrors (avoid importing from mcp-server ESM package) ───────

interface Clause {
  id: string;
  number: string;
  heading?: string;
  raw_text: string;
  char_start: number;
  char_end: number;
  cross_references: string[];
}

interface Statute {
  id: string;
  act_name: string;
  section_number: string;
  section_title: string;
  text: string;
  url: string;
  relevance_score: number;
  last_verified: string;
}

interface Decision {
  case_number: string;
  decision_date: string;
  ruling_summary: string;
  outcome: "tenant_favour" | "landlord_favour" | "mixed";
  relevant_principle: string;
  url: string;
  relevance_score: number;
}

interface ClassificationResult {
  clause_id: string;
  primary_type: string;
  subtype: string | null;
  confidence: number;
  requires_legal_lookup: boolean;
  lookup_priority: string;
  keywords: string[];
}

interface RiskScore {
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  is_potentially_unenforceable: boolean;
  is_unusual: boolean;
  is_standard: boolean;
  plain_english_explanation: string;
  risk_reasoning: string;
  statutory_violations: Array<{
    statute_section: string;
    violation_description: string;
  }>;
  confidence: number;
  suggested_compliant_language?: string;
}

interface NegotiationPoint {
  negotiable: boolean;
  negotiability_basis: string;
  priority: "high" | "medium" | "low";
  ask: string;
  counter_language: string;
  legal_argument: string;
  landlord_likely_response: string;
  your_rebuttal: string;
  walk_away_threshold: boolean;
}

interface ContradictionResult {
  has_contradiction: boolean;
  contradiction_type?: string;
  explanation?: string;
  which_governs?: string;
  legal_basis?: string;
  severity: "low" | "medium" | "high" | "critical";
  clause_a_id?: string;
  clause_b_id?: string;
}

/** Internal enriched clause — carries all analysis results until report assembly. */
interface AnalyzedClause {
  /** Original clause ID from segment_clauses (ephemeral, used for tool calls). */
  clause_id: string;
  clause_number: string;
  clause_type: string;
  clause_text: string;
  /** UUID of the persisted row in the clauses table. */
  db_clause_id: string;
  risk_score_result: RiskScore;
  retrieved_statutes: Statute[];
  retrieved_decisions: Decision[];
  negotiation_point?: NegotiationPoint;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** How many clauses to analyze concurrently. Higher = faster, but more MCP load. */
const CLAUSE_BATCH_SIZE = 5;

/** Minimum risk score for a clause to receive a negotiation point. */
const NEGOTIATION_RISK_THRESHOLD = 4;

/** Cap on negotiation points generated per lease (to control cost + latency). */
const MAX_NEGOTIATION_POINTS = 12;

/**
 * Clause type pairs that commonly have conflicting provisions.
 * detect_contradiction is called for each pair where both types are present.
 */
const CONTRADICTION_TYPE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["entry_rights", "quiet_enjoyment"],
  ["rent_increase", "rent_payment"],
  ["early_termination", "renewal_terms"],
  ["subletting_assignment", "early_termination"],
  ["maintenance_repairs", "liability_indemnification"],
  ["security_deposit", "maintenance_repairs"],
  ["dispute_resolution", "quiet_enjoyment"],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a 0–1 confidence number to the DB enum value. */
function confidenceToEnum(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.45) return "medium";
  return "low";
}

/**
 * Extract an array from a tool result that may be either a bare array
 * or an object wrapping it under a named key (e.g. { statutes: [...] }).
 */
function extractArray<T>(raw: unknown, key: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "object" && raw !== null) {
    const val = (raw as Record<string, unknown>)[key];
    if (Array.isArray(val)) return val as T[];
  }
  return [];
}

/**
 * Process items in parallel batches.
 * All items within a batch run concurrently; batches run sequentially.
 */
async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Tool Call Logger ─────────────────────────────────────────────────────────

/**
 * Build a compact, PII-safe summary of a tool's input for the trace log.
 * Raw text is replaced with char count; large arrays with item count.
 */
function summariseInput(input: Record<string, unknown>): Record<string, unknown> {
  const verbatim = new Set([
    "clause_id", "clause_type", "jurisdiction_code", "ocr_fallback",
    "lease_id", "jurisdiction", "risk_score",
  ]);
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(input)) {
    if (verbatim.has(k)) {
      result[k] = v;
    } else if (k === "raw_text" || k === "clause_text") {
      result[`${k}_chars`] = typeof v === "string" ? v.length : 0;
    } else if (k === "file_path") {
      result[k] = typeof v === "string" ? `…${v.slice(-24)}` : v;
    } else if (k === "retrieved_statutes" || k === "retrieved_decisions") {
      result[`${k}_count`] = Array.isArray(v) ? v.length : 0;
    } else if (k === "found_clause_types" && Array.isArray(v)) {
      result["found_count"] = v.length;
    } else if (k === "analyzed_clauses" && Array.isArray(v)) {
      result["clause_count"] = v.length;
    } else if (k === "focus_keywords" && Array.isArray(v)) {
      result["keywords"] = (v as string[]).slice(0, 5);
    } else if (k === "clause_a" || k === "clause_b") {
      const sub = v as Record<string, unknown>;
      result[k] = { id: sub.id, type: sub.type };
    }
  }
  return result;
}

/**
 * Build a compact summary of a tool's output for the trace log.
 * Keeps scalar outcome fields; converts arrays to counts.
 */
function summariseOutput(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {};
  }
  const verbatim = new Set([
    "risk_score", "risk_level", "is_potentially_unenforceable", "confidence",
    "page_count", "extraction_method", "jurisdiction", "jurisdiction_code",
    "has_contradiction", "severity", "negotiable", "priority",
    "fallback_used", "retrieval_confidence",
    "overall_risk_score", "overall_risk_level",
    "all_required_present", "coverage_score", "jurisdiction_supported",
    "primary_type", "subtype", "requires_legal_lookup",
  ]);
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
    if (verbatim.has(k)) {
      result[k] = v;
    } else if (Array.isArray(v)) {
      result[`${k}_count`] = v.length;
    }
  }
  return result;
}

/**
 * Wraps every mcp.callTool() call to record timing, success/failure, and
 * compact input/output summaries into tool_call_logs. DB writes are
 * fire-and-forget and never block or fail the analysis pipeline.
 */
class ToolCallLogger {
  private seqNum = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private readonly sb: { from: (table: string) => any },
    private readonly leaseId: string
  ) {}

  async call<T>(
    mcp: McpClient,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<T> {
    const seq = ++this.seqNum;
    const startMs = Date.now();
    let result: T | undefined;
    let success = true;
    let errorMessage: string | undefined;

    try {
      result = (await mcp.callTool(toolName, input)) as T;
      return result;
    } catch (err) {
      success = false;
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const durationMs = Date.now() - startMs;
      // Fire-and-forget — never blocks or fails the pipeline
      this.sb
        .from("tool_call_logs")
        .insert({
          lease_id: this.leaseId,
          tool_name: toolName,
          sequence_num: seq,
          duration_ms: durationMs,
          success,
          error_message: errorMessage?.slice(0, 500) ?? null,
          input_summary: summariseInput(input),
          output_summary:
            success && result !== undefined ? summariseOutput(result) : {},
        })
        .then(() => {}, () => {});
    }
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Typed validation error — carries a machine-readable `code` and optional
 * `detectedAs` hint so the frontend can render targeted error UI.
 */
export class LeaseValidationError extends Error {
  constructor(
    public readonly code: "not_a_lease" | "wrong_jurisdiction",
    message: string,
    public readonly detectedAs?: string
  ) {
    super(message);
    this.name = "LeaseValidationError";
  }
}

/**
 * Heuristic check: is this document a residential lease?
 *
 * Two-stage approach:
 * 1. Hard-reject known non-lease document types (resume, invoice, etc.)
 * 2. Require a minimum number of lease-specific keyword signals
 *
 * Designed to be fast (regex on raw text only) and conservative — it
 * only rejects when confidence is high, so valid leases are never blocked.
 */
function validateDocumentType(rawText: string): void {
  // ── Stage 1: hard-reject known non-lease types ──────────────────────────

  // Resume / CV detection — requires 2+ matching signals to avoid false positives
  const resumeSignals = [
    /\bcurriculum\s+vitae\b/i,
    /\r?sume\b/i,
    /\bwork\s+experience\b/i,
    /\bemployment\s+history\b/i,
    /\bprofessional\s+experience\b/i,
    /\b(bachelor|master|phd|m\.sc|b\.sc|b\.eng|honours)\b/i,
    /\bgpa\b/i,
    /\breferences\s+available\b/i,
    /\blinkedin\.com\/in\//i,
    /\bskills\s*&?\s*achievements\b/i,
    /\bcanvassing\s+(volunteer|coordinator)\b/i,
  ];
  const resumeHits = resumeSignals.filter((p) => p.test(rawText)).length;
  if (resumeHits >= 2) {
    throw new LeaseValidationError(
      "not_a_lease",
      "This appears to be a resume or CV, not a residential lease. Please upload an Ontario residential lease agreement.",
      "resume"
    );
  }

  // Invoice / bill detection
  const invoiceSignals = [
    /\binvoice\s*(number|#|no\.?)\b/i,
    /\bbill\s+to\b/i,
    /\btotal\s+(due|amount|payable)\b/i,
    /\bpayment\s+due\s+date\b/i,
    /\bpurchase\s+order\b/i,
  ];
  if (invoiceSignals.filter((p) => p.test(rawText)).length >= 2) {
    throw new LeaseValidationError(
      "not_a_lease",
      "This appears to be an invoice or bill, not a residential lease. Please upload an Ontario residential lease agreement.",
      "invoice"
    );
  }

  // Non-residential contract types
  const otherContractSignals = [
    /\bemployment\s+agreement\b/i,
    /\bservice\s+agreement\b/i,
    /\bconsulting\s+agreement\b/i,
    /\bnon.?disclosure\s+agreement\b/i,
    /\bconfidentiality\s+agreement\b/i,
    /\bshareholder\s+agreement\b/i,
    /\bpurchase\s+and\s+sale\s+agreement\b/i,
  ];
  if (otherContractSignals.some((p) => p.test(rawText))) {
    throw new LeaseValidationError(
      "not_a_lease",
      "This appears to be a non-residential contract. LeaseGuard only analyzes Ontario residential tenancy agreements.",
      "other_contract"
    );
  }

  // ── Stage 2: require minimum lease keyword signals ─────────────────────
  const leaseSignals = [
    /\b(landlord|lessor)\b/i,
    /\b(tenant|lessee|renter)\b/i,
    /\b(rental\s+unit|leased\s+premises|the\s+premises|rental\s+premises)\b/i,
    /\b(monthly\s+rent|base\s+rent|rent\s+payment|rent\s+due|rent\s+of)\b/i,
    /\b(tenancy\s+agreement|lease\s+agreement|rental\s+agreement|residential\s+lease)\b/i,
    /\b(security\s+deposit|damage\s+deposit|last\s+month.?s\s+rent)\b/i,
    /\b(landlord\s+and\s+tenant\s+board|\bLTB\b)\b/,
    /\b(residential\s+tenancies\s+act|\bRTA\b)\b/,
    /\b(term\s+of\s+(the\s+)?(tenancy|lease)|tenancy\s+term)\b/i,
    /\b(notice\s+to\s+(vacate|terminate)|eviction\s+notice)\b/i,
    /\b(occupancy|right\s+to\s+occupy|right\s+of\s+entry)\b/i,
  ];
  const leaseHits = leaseSignals.filter((p) => p.test(rawText)).length;

  if (leaseHits < 2) {
    throw new LeaseValidationError(
      "not_a_lease",
      "This document does not appear to be a residential lease. LeaseGuard only analyzes Ontario residential tenancy agreements. Please upload a lease or rental agreement.",
      "unknown"
    );
  }
}

// ─── Address extraction ───────────────────────────────────────────────────────

/**
 * Extract rental unit address fields from raw lease text.
 * Handles Ontario Standard Form layout and common free-form patterns.
 * Returns empty strings for any field that cannot be reliably extracted.
 * Never throws — address extraction failure is non-fatal.
 */
function extractLeaseAddress(rawText: string): {
  address: string;
  unit: string;
  city: string;
  postal_code: string;
} {
  const empty = { address: "", unit: "", city: "", postal_code: "" };
  if (!rawText || rawText.length < 20) return empty;

  // Normalise whitespace
  const text = rawText.replace(/[ \t]+/g, " ").replace(/\r\n/g, "\n");

  let raw = "";

  // Pattern 1 — Ontario Standard Form: "full address of [the] rental unit:"
  const stdForm = text.match(
    /full address of (?:the )?rental unit[^\n:]*:?[ \t]*\n?[ \t]*([^\n]{10,120})/i
  );
  if (stdForm) raw = stdForm[1].trim();

  // Pattern 2 — labelled field: "Rental Unit:", "Premises:", "Property Address:"
  if (!raw) {
    const label = text.match(
      /(?:^|\n)[ \t]*(?:rental unit|premises|rental premises|property address|unit address)[ \t]*:[ \t]*([^\n]{10,120})/im
    );
    if (label) raw = label[1].trim();
  }

  // Pattern 3 — "located at", "situate at", "known as"
  if (!raw) {
    const locAt = text.match(
      /(?:located at|situate(?:d)? at|known as|being and described as)\s+([^\n]{10,120})/i
    );
    if (locAt) raw = locAt[1].trim();
  }

  // Pattern 4 — street-number + street-suffix pattern in first 3 000 chars
  if (!raw) {
    const topHalf = text.slice(0, Math.min(text.length, 3000));
    const street = topHalf.match(
      /(?:^|\n)\s*(\d{1,5}[- ]?[A-Za-z0-9]?[,\s]+[A-Za-z][A-Za-z\s.'‑-]{3,50}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Crescent|Cres|Court|Ct|Lane|Ln|Place|Pl)[^\n]{0,60})/i
    );
    if (street) raw = street[1].trim();
  }

  if (!raw) return empty;

  // ── Extract sub-fields from the raw address string ──────────────────────────

  // Postal code: Canadian format A1A 1A1
  const postalMatch = raw.match(/([A-Z]\d[A-Z][ -]?\d[A-Z]\d)/i);
  const postal_code = postalMatch
    ? postalMatch[1].toUpperCase().replace(/^(.{3})[ -]?(.{3})$/, "$1 $2")
    : "";

  // Unit number
  const unitMatch = raw.match(/\b(?:unit|apt\.?|apartment|suite|#)\s*([0-9A-Za-z-]+)/i);
  const unit = unitMatch
    ? `${unitMatch[0].split(/\s+/)[0]} ${unitMatch[1]}`.trim()
    : "";

  // City — the token(s) immediately before ", ON" or ", Ontario"
  const cityMatch = raw.match(/,\s*([A-Za-z][A-Za-z\s]{1,30}?)(?:,\s*|\s+)(?:ON|Ontario)\b/i);
  const city = cityMatch ? cityMatch[1].trim() : "";

  // Full address — clean up province/postal noise, cap at 120 chars
  const address = raw
    .replace(/,\s*Ontario\b/gi, "")
    .replace(/,?\s*\bON\b/g, "")
    .replace(/[A-Z]\d[A-Z][ -]?\d[A-Z]\d/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/, "")
    .trim()
    .slice(0, 120);

  return { address, unit, city, postal_code };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Run the full lease analysis pipeline.
 *
 * @param leaseId     UUID of the lease row already created in the DB.
 * @param storagePath Path of the PDF within the "leases" Supabase Storage bucket.
 */

/** Maximum wall-clock time for a single analysis run (3 minutes). */
const ANALYSIS_TIMEOUT_MS = 180_000;

/**
 * Public entry point. Wraps the pipeline in a 3-minute timeout.
 * If the timeout fires before the pipeline completes, the lease is marked
 * failed and the client can retry (one click, same file).
 */
export async function runLeaseAnalysis(
  leaseId: string,
  storagePath: string
): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new Error(
            "Analysis timed out after 3 minutes. Please try again — this is usually a temporary issue."
          )
        ),
      ANALYSIS_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([
      _runLeaseAnalysisPipeline(leaseId, storagePath),
      timeoutPromise,
    ]);
  } catch (err) {
    // If the timeout won the race, the pipeline is still running in the
    // background. Write failed status here so the client sees the error.
    // The pipeline has its own catch that also writes failed — add a
    // .neq("status","failed") guard at step 14 so it never overwrites this.
    const isTimeout =
      err instanceof Error && err.message.includes("timed out after 3 minutes");
    if (isTimeout) {
      try {
        const { createClient: mkClient } = await import("@supabase/supabase-js");
        const failSupabase = mkClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await failSupabase
          .from("leases")
          .update({ status: "failed", error_message: (err as Error).message })
          .eq("id", leaseId);

        // Import inline to avoid circular at module level
        const { emitAnalysisEvent: emit } = await import("./analysis-events");
        emit(leaseId, {
          type: "error",
          message: (err as Error).message,
          severity: "critical",
        });
      } catch {
        /* swallow — already in error path */
      }
    }
    throw err;
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }
}

/** Internal pipeline — do not call directly; use runLeaseAnalysis instead. */
async function _runLeaseAnalysisPipeline(
  leaseId: string,
  storagePath: string
): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let tempFilePath: string | null = null;
  let mcp: McpClient | null = null;

  try {
    // ── 1. Download PDF from Supabase Storage ──────────────────────────────
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("leases")
      .download(storagePath);

    if (downloadError || !fileBlob) {
      throw new Error(
        `Storage download failed: ${downloadError?.message ?? "no data returned"}`
      );
    }

    // parse_document requires a local absolute path (spawns Python subprocess)
    tempFilePath = path.join(os.tmpdir(), `leaseguard-${uuidv4()}.pdf`);
    fs.writeFileSync(tempFilePath, Buffer.from(await fileBlob.arrayBuffer()));

    // ── 2. Start MCP server ────────────────────────────────────────────────
    mcp = await McpClient.create(MCP_SERVER_PATH);
    const logger = new ToolCallLogger(supabase, leaseId);

    emitAnalysisEvent(leaseId, { type: "log", message: "Parsing PDF...", severity: "info" });

    // ── 3. Parse document ──────────────────────────────────────────────────
    const parseResult = await logger.call<{
      raw_text: string;
      page_count: number;
      extraction_method: "text" | "ocr" | "unknown";
      confidence: number;
    }>(mcp, "parse_document", {
      file_path: tempFilePath,
      ocr_fallback: true,
    });

    const { raw_text: rawText, page_count: pageCount, extraction_method: extractionMethod } =
      parseResult;

    emitAnalysisEvent(leaseId, {
      type: "log",
      message: `✓ Extracted ${pageCount} pages via ${extractionMethod === "ocr" ? "OCR" : "text layer"}`,
      severity: "success",
      step: 1,
    });

    if (!rawText || rawText.trim().length < 50) {
      throw new Error(
        "Document contains insufficient text — it may be a scanned image that OCR could not read, or not a lease document."
      );
    }

    // Temp file no longer needed after parse_document has read it
    fs.unlinkSync(tempFilePath);
    tempFilePath = null;

    // ── 3b. Validate document type (fast heuristics — runs before any MCP calls) ──
    validateDocumentType(rawText);

    // ── 4. Detect jurisdiction ─────────────────────────────────────────────
    const jurisdictionResult = await logger.call<{
      jurisdiction: string;
      jurisdiction_code: string;
      confidence: number;
      detection_basis: string[];
      supported: boolean;
    }>(mcp, "detect_jurisdiction", {
      raw_text: rawText,
    });

    const { jurisdiction, jurisdiction_code: jurisdictionCode } = jurisdictionResult;

    emitAnalysisEvent(leaseId, {
      type: "log",
      message: `✓ Jurisdiction confirmed: ${jurisdiction}`,
      severity: "success",
      step: 2,
    });

    // ── 4b. Enforce Ontario-only jurisdiction ──────────────────────────────
    if (jurisdictionCode !== "CA-ON") {
      if (jurisdictionCode.startsWith("CA-")) {
        // Identified as a Canadian province other than Ontario
        throw new LeaseValidationError(
          "wrong_jurisdiction",
          `This appears to be a ${jurisdiction} lease. LeaseGuard currently only supports Ontario residential leases under the Residential Tenancies Act, 2006.`,
          jurisdictionCode
        );
      } else if (jurisdictionCode === "UNKNOWN") {
        // No jurisdiction signals at all — could be a non-Canadian doc or very sparse text
        throw new LeaseValidationError(
          "wrong_jurisdiction",
          "LeaseGuard could not confirm this is an Ontario lease. Please upload an Ontario residential tenancy agreement.",
          "UNKNOWN"
        );
      } else if (jurisdictionCode === "INTL") {
        throw new LeaseValidationError(
          "wrong_jurisdiction",
          "This appears to be a lease from outside Canada. LeaseGuard only analyzes Ontario residential leases.",
          "INTL"
        );
      }
    }

    // ── 4c. Extract property address (best-effort, never throws) ──────────
    const addressInfo = extractLeaseAddress(rawText);

    // ── 5. Update DB: mark processing, store metadata ──────────────────────
    await supabase
      .from("leases")
      .update({
        status: "processing",
        raw_text: rawText,
        page_count: pageCount,
        extraction_method: extractionMethod,
        jurisdiction,
        jurisdiction_code: jurisdictionCode,
        jurisdiction_confidence: confidenceToEnum(jurisdictionResult.confidence),
        ...(addressInfo.address      && { property_address:     addressInfo.address }),
        ...(addressInfo.unit         && { property_unit:        addressInfo.unit }),
        ...(addressInfo.city         && { property_city:        addressInfo.city }),
        ...(addressInfo.postal_code  && { property_postal_code: addressInfo.postal_code }),
      })
      .eq("id", leaseId);

    // ── 6. Segment into clauses ────────────────────────────────────────────
    const segmentRaw = await logger.call<unknown>(mcp, "segment_clauses", {
      raw_text: rawText,
      jurisdiction_code: jurisdictionCode,
    });

    const clauses: Clause[] = Array.isArray(segmentRaw)
      ? (segmentRaw as Clause[])
      : ((segmentRaw as Record<string, unknown>).clauses as Clause[]) ?? [];

    if (clauses.length === 0) {
      throw new Error(
        "No clauses could be extracted from the document — the file may not be a standard lease."
      );
    }

    emitAnalysisEvent(leaseId, {
      type: "log",
      message: `✓ Found ${clauses.length} clauses — beginning analysis`,
      severity: "success",
      step: 3,
    });
    emitAnalysisEvent(leaseId, {
      type: "log",
      message: `Analyzing clauses against 2,372 RTA statute chunks...`,
      severity: "info",
    });

    // ── 7. Parallel clause analysis (batches of CLAUSE_BATCH_SIZE) ─────────
    const analyzedClauses: AnalyzedClause[] = [];

    await runInBatches(clauses, CLAUSE_BATCH_SIZE, async (clause) => {
      try {
        // 7a. Classify clause type
        const classification = await logger.call<ClassificationResult>(
          mcp!,
          "classify_clause",
          {
            clause_id: clause.id,
            clause_text: clause.raw_text,
          }
        );

        const clauseType = classification.primary_type;

        // 7b. Retrieve statutes + decisions in parallel
        const [statuteRaw, tribunalRaw] = await Promise.all([
          logger
            .call<unknown>(mcp!, "lookup_statute", {
              clause_type: clauseType,
              clause_text: clause.raw_text,
              jurisdiction_code: jurisdictionCode,
              focus_keywords: classification.keywords,
            })
            .catch((err) => {
              console.warn(
                `[agent] lookup_statute failed for clause ${clause.id}:`,
                err.message
              );
              return { statutes: [] };
            }),
          logger
            .call<unknown>(mcp!, "lookup_tribunal", {
              clause_text: clause.raw_text,
              clause_type: clauseType,
              jurisdiction_code: jurisdictionCode,
            })
            .catch((err) => {
              console.warn(
                `[agent] lookup_tribunal failed for clause ${clause.id}:`,
                err.message
              );
              return { decisions: [] };
            }),
        ]);

        const retrievedStatutes = extractArray<Statute>(statuteRaw, "statutes");
        const retrievedDecisions = extractArray<Decision>(tribunalRaw, "decisions");

        // 7c. Score risk (grounded in retrieved statutes)
        const riskScore = await logger.call<RiskScore>(mcp!, "score_risk", {
          clause_id: clause.id,
          clause_text: clause.raw_text,
          clause_type: clauseType,
          retrieved_statutes: retrievedStatutes as unknown as Record<string, unknown>[],
          retrieved_decisions: retrievedDecisions as unknown as Record<string, unknown>[],
          jurisdiction_code: jurisdictionCode,
        });

        // 7d. Emit clause result
        {
          const sev =
            riskScore.risk_level === "critical" ? "critical"
            : riskScore.risk_level === "high" ? "warning"
            : "info";
          const statuteNote = retrievedStatutes.length > 0
            ? ` — ${retrievedStatutes.length} statute ref${retrievedStatutes.length !== 1 ? "s" : ""}`
            : "";
          const violationNote = riskScore.is_potentially_unenforceable
            ? " ⚠ potentially unenforceable" : "";
          emitAnalysisEvent(leaseId, {
            type: "log",
            message: `${clauseType.replace(/_/g, " ")}: ${riskScore.risk_level} (${riskScore.risk_score.toFixed(1)})${statuteNote}${violationNote}`,
            severity: sev,
          });
        }

        // 7e. Persist clause row
        const dbClauseId = uuidv4();
        await supabase.from("clauses").insert({
          id: dbClauseId,
          lease_id: leaseId,
          clause_number: clause.number,
          heading: clause.heading ?? null,
          raw_text: clause.raw_text,
          char_start: clause.char_start,
          char_end: clause.char_end,
          primary_type: clauseType,
          subtype: classification.subtype ?? null,
          classification_confidence: classification.confidence,
          risk_score: riskScore.risk_score,
          risk_level: riskScore.risk_level,
          is_potentially_unenforceable: riskScore.is_potentially_unenforceable,
          is_unusual: riskScore.is_unusual,
          is_standard: riskScore.is_standard,
          plain_english_explanation: riskScore.plain_english_explanation,
          risk_reasoning: riskScore.risk_reasoning,
          statutory_violations: riskScore.statutory_violations,
          analysis_confidence: riskScore.confidence,
          suggested_compliant_language: riskScore.suggested_compliant_language ?? null,
          has_negotiation_point:
            riskScore.risk_score >= NEGOTIATION_RISK_THRESHOLD,
          cross_references: clause.cross_references,
        });

        analyzedClauses.push({
          clause_id: clause.id,
          clause_number: clause.number,
          clause_type: clauseType,
          clause_text: clause.raw_text,
          db_clause_id: dbClauseId,
          risk_score_result: riskScore,
          retrieved_statutes: retrievedStatutes,
          retrieved_decisions: retrievedDecisions,
        });
      } catch (clauseErr) {
        // Per-clause failure: log and continue — don't abort the whole pipeline
        console.error(
          `[agent] Clause ${clause.id} failed:`,
          clauseErr instanceof Error ? clauseErr.message : String(clauseErr)
        );
      }
    });

    emitAnalysisEvent(leaseId, {
      type: "log",
      message: `✓ ${analyzedClauses.length} clause${analyzedClauses.length !== 1 ? "s" : ""} analyzed`,
      severity: "success",
      step: 4,
    });

    // ── 8. Contradiction detection ─────────────────────────────────────────
    // Index analyzed clauses by type (first occurrence wins for contradictions)
    const byType = new Map<string, AnalyzedClause>();
    for (const ac of analyzedClauses) {
      if (!byType.has(ac.clause_type)) byType.set(ac.clause_type, ac);
    }

    const contradictionResults: ContradictionResult[] = [];

    {
      const pairCount = CONTRADICTION_TYPE_PAIRS.filter(([a, b]) => byType.has(a) && byType.has(b)).length;
      if (pairCount > 0) {
        emitAnalysisEvent(leaseId, {
          type: "log",
          message: `Checking ${pairCount} clause pair${pairCount !== 1 ? "s" : ""} for contradictions...`,
          severity: "info",
        });
      }
    }

    await Promise.allSettled(
      CONTRADICTION_TYPE_PAIRS.filter(
        ([a, b]) => byType.has(a) && byType.has(b)
      ).map(async ([typeA, typeB]) => {
        const acA = byType.get(typeA)!;
        const acB = byType.get(typeB)!;
        try {
          // ROADMAP 4.1: pass retrieved statutes so the LLM can cite specific law
          const formatStatutes = (statutes: Statute[]) =>
            statutes
              .slice(0, 4)
              .map((s) => `${s.section_number}: ${s.text.slice(0, 250)}`);

          const result = await logger.call<ContradictionResult>(
            mcp!,
            "detect_contradiction",
            {
              clause_a: {
                id: acA.clause_id,
                text: acA.clause_text,
                type: acA.clause_type,
              } as unknown as Record<string, unknown>,
              clause_b: {
                id: acB.clause_id,
                text: acB.clause_text,
                type: acB.clause_type,
              } as unknown as Record<string, unknown>,
              statutes_a: formatStatutes(acA.retrieved_statutes) as unknown as Record<string, unknown>[],
              statutes_b: formatStatutes(acB.retrieved_statutes) as unknown as Record<string, unknown>[],
            }
          );

          const enriched: ContradictionResult = {
            ...result,
            clause_a_id: acA.clause_id,
            clause_b_id: acB.clause_id,
          };
          contradictionResults.push(enriched);

          if (result.has_contradiction) {
            emitAnalysisEvent(leaseId, {
              type: "log",
              message: `! Contradiction: ${typeA.replace(/_/g, " ")} ↔ ${typeB.replace(/_/g, " ")}`,
              severity: "warning",
            });
            await supabase.from("contradictions").insert({
              lease_id: leaseId,
              clause_a_id: acA.db_clause_id,
              clause_b_id: acB.db_clause_id,
              contradiction_type: result.contradiction_type ?? "direct_conflict",
              explanation: result.explanation ?? "",
              which_governs: result.which_governs ?? null,
              legal_basis: result.legal_basis ?? null,
              severity: result.severity,
            });
          }
        } catch (err) {
          console.warn(
            `[agent] Contradiction check ${typeA}↔${typeB} failed:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      })
    );

    // ── 9. Check for missing protections ───────────────────────────────────
    const foundClauseTypes = [
      ...new Set(analyzedClauses.map((c) => c.clause_type)),
    ];

    const missingRaw = await logger.call<{
      missing_protections: unknown[];
      implicit_protections: unknown[];
    }>(mcp, "check_missing", {
      found_clause_types: foundClauseTypes,
      jurisdiction_code: jurisdictionCode,
    });

    const missingProtections: unknown[] = missingRaw.missing_protections ?? [];
    const implicitProtections: unknown[] = missingRaw.implicit_protections ?? [];

    if (missingProtections.length > 0) {
      emitAnalysisEvent(leaseId, {
        type: "log",
        message: `! ${missingProtections.length} missing protection${missingProtections.length !== 1 ? "s" : ""} identified`,
        severity: "warning",
      });
    }

    // ── 10. Generate negotiation points (parallel) ─────────────────────────
    const highRiskClauses = analyzedClauses
      .filter((c) => c.risk_score_result.risk_score >= NEGOTIATION_RISK_THRESHOLD)
      .sort((a, b) => b.risk_score_result.risk_score - a.risk_score_result.risk_score)
      .slice(0, MAX_NEGOTIATION_POINTS);

    if (highRiskClauses.length > 0) {
      emitAnalysisEvent(leaseId, {
        type: "log",
        message: `Generating negotiation guidance for ${highRiskClauses.length} high-risk clause${highRiskClauses.length !== 1 ? "s" : ""}...`,
        severity: "info",
      });
    }

    await Promise.allSettled(
      highRiskClauses.map(async (ac) => {
        try {
          const negotiation = await logger.call<NegotiationPoint>(
            mcp!,
            "generate_negotiation",
            {
              clause_id: ac.clause_id,
              clause_text: ac.clause_text,
              clause_type: ac.clause_type,
              risk_score: ac.risk_score_result.risk_score,
              retrieved_statutes: ac.retrieved_statutes as unknown as Record<string, unknown>[],
              retrieved_decisions: ac.retrieved_decisions as unknown as Record<string, unknown>[],
            }
          );

          // Persist negotiation point
          await supabase.from("negotiation_points").insert({
            lease_id: leaseId,
            clause_id: ac.db_clause_id,
            priority: negotiation.priority,
            negotiable: negotiation.negotiable,
            ask: negotiation.ask,
            counter_language: negotiation.counter_language,
            legal_argument: negotiation.legal_argument,
            landlord_likely_response: negotiation.landlord_likely_response,
            tenant_rebuttal: negotiation.your_rebuttal,
            walk_away_threshold: negotiation.walk_away_threshold,
            cited_statutes: ac.retrieved_statutes
              .slice(0, 3)
              .map((s) => `${s.act_name} s.${s.section_number}`),
            cited_decisions: ac.retrieved_decisions
              .slice(0, 3)
              .map((d) => d.case_number),
          });

          ac.negotiation_point = negotiation;
        } catch (err) {
          console.error(
            `[agent] Negotiation failed for clause ${ac.clause_id}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      })
    );

    // ── 11. Benchmark — fire-and-forget (non-blocking) ─────────────────────
    for (const ac of analyzedClauses) {
      logger
        .call<unknown>(mcp, "benchmark_clause", {
          clause_type: ac.clause_type,
          clause_text: ac.clause_text,
          risk_score: ac.risk_score_result.risk_score,
          jurisdiction_code: jurisdictionCode,
        })
        .catch(() => {
          /* Benchmark failures never block the pipeline */
        });
    }

    emitAnalysisEvent(leaseId, {
      type: "log",
      message: "Assembling final risk report...",
      severity: "info",
      step: 4,
    });

    // ── 12. Generate final report ──────────────────────────────────────────
    const reportPayload = await logger.call<{
      overall_risk_score: number;
      overall_risk_level: "low" | "medium" | "high" | "critical";
      executive_summary: string;
      [key: string]: unknown;
    }>(mcp, "generate_report", {
      lease_id: leaseId,
      jurisdiction,
      analyzed_clauses: analyzedClauses.map((ac) => ({
        clause_id: ac.clause_id,
        clause_number: ac.clause_number,
        clause_type: ac.clause_type,
        clause_text: ac.clause_text,
        risk_score_result: ac.risk_score_result,
        retrieved_statutes: ac.retrieved_statutes,
        retrieved_decisions: ac.retrieved_decisions,
        ...(ac.negotiation_point && { negotiation_point: ac.negotiation_point }),
      })) as unknown as Record<string, unknown>[],
      contradictions: contradictionResults as unknown as Record<string, unknown>[],
      missing_protections: missingProtections as unknown as Record<string, unknown>[],
      implicit_protections: implicitProtections as unknown as Record<string, unknown>[],
      negotiation_points: analyzedClauses
        .filter((ac) => ac.negotiation_point)
        .map((ac) => ({
          ...ac.negotiation_point!,
          clause_id: ac.db_clause_id,
          clause_type: ac.clause_type,
        })) as unknown as Record<string, unknown>[],
    });

    // ── 13. Persist report ─────────────────────────────────────────────────
    const corpusVersion = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    await supabase.from("reports").insert({
      lease_id: leaseId,
      overall_risk_score: reportPayload.overall_risk_score,
      overall_risk_level: reportPayload.overall_risk_level,
      executive_summary: reportPayload.executive_summary,
      analysis_metadata: {
        clause_count: analyzedClauses.length,
        contradiction_count: contradictionResults.filter(
          (c) => c.has_contradiction
        ).length,
        missing_protection_count: missingProtections.length,
        corpus_version: corpusVersion,
        analyzed_at: new Date().toISOString(),
      },
      full_report_json: { ...reportPayload, corpus_version: corpusVersion },
    });

    // ── 14. Mark lease complete ────────────────────────────────────────────
    // Guard: if the timeout wrapper already set status = "failed", do not
    // overwrite it with "complete" (the pipeline kept running after timeout).
    await supabase
      .from("leases")
      .update({
        status: "complete",
        overall_risk_score: reportPayload.overall_risk_score,
        overall_risk_level: reportPayload.overall_risk_level,
        corpus_version: corpusVersion,
        analysis_completed_at: new Date().toISOString(),
      })
      .eq("id", leaseId)
      .neq("status", "failed");

    const completeSev =
      reportPayload.overall_risk_level === "critical" ? "critical"
      : reportPayload.overall_risk_level === "high" ? "warning"
      : "success";
    emitAnalysisEvent(leaseId, {
      type: "complete",
      message: `✓ Analysis complete — risk score: ${reportPayload.overall_risk_score.toFixed(1)}/10 (${reportPayload.overall_risk_level.toUpperCase()})`,
      severity: completeSev,
    });
  } catch (err) {
    // ── Error path: record failure, then re-throw ──────────────────────────
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[agent] Pipeline failed for lease ${leaseId}:`, errMsg);

    // Emit error event so the SSE stream closes cleanly.
    if (err instanceof LeaseValidationError) {
      emitAnalysisEvent(leaseId, {
        type: "error",
        message: JSON.stringify({ code: err.code, message: err.message, detected_as: err.detectedAs ?? null }),
        severity: "critical",
      });
    } else {
      emitAnalysisEvent(leaseId, {
        type: "error",
        message: errMsg.slice(0, 500),
        severity: "critical",
      });
    }

    try {
      // Use a fresh client — the one above may be in a bad state
      const failSupabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // For validation errors, store structured JSON so the frontend can
      // render targeted error UI (not_a_lease vs wrong_jurisdiction).
      // For all other errors, store plain text.
      const storedError =
        err instanceof LeaseValidationError
          ? JSON.stringify({
              code: err.code,
              message: err.message,
              detected_as: err.detectedAs ?? null,
            })
          : errMsg.slice(0, 1000);

      await failSupabase
        .from("leases")
        .update({ status: "failed", error_message: storedError })
        .eq("id", leaseId);

      // Clean up stored file for validation rejections — no point keeping a resume
      if (err instanceof LeaseValidationError && storagePath) {
        await failSupabase.storage.from("leases").remove([storagePath]);
      }
    } catch {
      // Swallow DB error — we're already in the error path
    }

    throw err;
  } finally {
    // Always clean up temp file and MCP process, regardless of success/failure
    if (tempFilePath) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        /* File may not exist if we failed before writing it */
      }
    }
    mcp?.close();
  }
}
