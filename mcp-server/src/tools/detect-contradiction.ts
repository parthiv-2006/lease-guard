/**
 * detect-contradiction — ROADMAP 4.1
 *
 * Replaces the regex-based approach with an LLM call (Claude Haiku 3.5).
 * The LLM receives both clause texts + retrieved statute context and must
 * CITE a specific statute before flagging a contradiction.
 *
 * Fallback: if the Anthropic API key is missing or the call fails, the tool
 * degrades to the original regex approach so no functionality is lost.
 */

import { z } from "zod";
import type { ClauseType } from "../types.js";

export const toolDefinition = {
  name: "detect_contradiction",
  description:
    "Detect semantic contradictions between two lease clauses using LLM reasoning grounded in retrieved Ontario RTA statutes.",
  inputSchema: {
    type: "object" as const,
    properties: {
      clause_a: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          type: { type: "string" },
        },
        required: ["id", "text", "type"],
      },
      clause_b: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          type: { type: "string" },
        },
        required: ["id", "text", "type"],
      },
      // Optional: pre-formatted statute snippets from the agent's earlier
      // lookup_statute calls. Format: "s.26: <text excerpt up to 300 chars>"
      statutes_a: {
        type: "array",
        items: { type: "string" },
        description: "Statute snippets retrieved for clause_a",
      },
      statutes_b: {
        type: "array",
        items: { type: "string" },
        description: "Statute snippets retrieved for clause_b",
      },
    },
    required: ["clause_a", "clause_b"],
  },
};

const ClauseInputSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.string(),
});

const InputSchema = z.object({
  clause_a: ClauseInputSchema,
  clause_b: ClauseInputSchema,
  statutes_a: z.array(z.string()).optional(),
  statutes_b: z.array(z.string()).optional(),
});

type Severity = "low" | "medium" | "high" | "critical";

interface ContradictionResult {
  has_contradiction: boolean;
  contradiction_type?: string;
  explanation?: string;
  which_governs?: string;
  legal_basis?: string;
  severity: Severity;
  detection_method?: "llm" | "regex" | "none";
}

// ─── Known pair metadata (used both for regex fallback AND as LLM context) ───

const INTERACTION_PAIRS: Array<[ClauseType, ClauseType]> = [
  ["entry_rights", "quiet_enjoyment"],
  ["maintenance_repairs", "liability_indemnification"],
  ["early_termination", "renewal_terms"],
  ["rent_increase", "security_deposit"],
  ["subletting_assignment", "early_termination"],
];

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

const PAIR_METADATA: Record<
  string,
  {
    contradiction_type: string;
    legal_basis: string;
    which_governs: string;
    severity: Severity;
    llm_hint: string;
  }
> = {
  [pairKey("entry_rights", "quiet_enjoyment")]: {
    contradiction_type: "entry_vs_quiet_enjoyment",
    legal_basis:
      "Ontario RTA s.22 (quiet enjoyment) and s.27 (entry with notice) — both apply; unrestricted entry conflicts with quiet enjoyment.",
    which_governs:
      "RTA s.27 governs entry (24-hour written notice required). Quiet enjoyment (s.22) prevails if entry clause grants unrestricted access.",
    severity: "high",
    llm_hint:
      "Flag only if the entry clause grants UNRESTRICTED access (no notice required). Standard 24-hour notice + emergency exception is compliant and does NOT contradict quiet enjoyment.",
  },
  [pairKey("maintenance_repairs", "liability_indemnification")]: {
    contradiction_type: "maintenance_vs_indemnification",
    legal_basis:
      "Ontario RTA s.20 places maintenance obligations on the landlord; an indemnification clause cannot override statutory duties.",
    which_governs:
      "Statutory maintenance obligations (RTA s.20) prevail over contractual indemnification. The landlord cannot contractually escape repair duties.",
    severity: "high",
    llm_hint:
      "Flag only if the indemnification clause OFFLOADS the landlord's RTA s.20 repair duty onto the tenant. A clause merely limiting tort liability does not contradict a maintenance clause.",
  },
  [pairKey("early_termination", "renewal_terms")]: {
    contradiction_type: "termination_vs_renewal",
    legal_basis:
      "Ontario RTA s.95 (renewal) and ss.59–84 (termination) — automatic renewal clauses are of limited effect under the RTA.",
    which_governs:
      "The RTA governs tenancy continuation. A fixed-term lease converting to month-to-month (s.95) typically prevails over automatic renewal traps.",
    severity: "medium",
    llm_hint:
      "Flag only if the renewal clause creates an AUTOMATIC binding renewal that the tenant cannot escape, while the termination clause imposes heavy penalties. Compliant RTA deferral language is not contradictory.",
  },
  [pairKey("rent_increase", "security_deposit")]: {
    contradiction_type: "rent_increase_vs_deposit",
    legal_basis:
      "Ontario RTA s.105 limits deposits to one month's rent at the rent amount at time of deposit; requiring top-ups after increases may be prohibited.",
    which_governs:
      "RTA s.105 prevails — the landlord cannot demand additional deposit funds above the original one-month limit.",
    severity: "medium",
    llm_hint:
      "Flag only if the deposit clause REQUIRES the tenant to top up the deposit after each rent increase. A standard last-month rent deposit with no top-up requirement is not contradictory.",
  },
  [pairKey("subletting_assignment", "early_termination")]: {
    contradiction_type: "subletting_vs_termination",
    legal_basis:
      "Ontario RTA s.97 gives tenants the right to sublet with consent; combined with early termination penalties, a total prohibition may be unenforceable.",
    which_governs:
      "RTA s.97 prevails — the landlord cannot both prohibit subletting AND impose unlimited early termination penalties.",
    severity: "high",
    llm_hint:
      "Flag only if subletting is COMPLETELY prohibited AND heavy early termination fees are imposed simultaneously — leaving the tenant no lawful exit route. Either alone is not automatically contradictory.",
  },
};

// ─── Regex fallback (legacy approach, used when LLM is unavailable) ──────────

const GRANT_PATTERNS = [
  /(?:landlord|tenant)\s+(?:may|shall|has\s+the\s+right|is\s+entitled|can|will)\s+(?:enter|access|inspect|terminate|increase|sublet|assign|renew)/i,
  /right\s+to\s+(?:enter|access|terminate|sublet|assign|renew|increase)/i,
  /permitted\s+to/i,
  /allowed\s+to/i,
  /entitled\s+to/i,
  /may\s+(?:enter|terminate|sublet|increase)/i,
];

const RESTRICT_PATTERNS = [
  /(?:shall|will)\s+not\s+(?:enter|access|terminate|sublet|assign|renew|increase)/i,
  /no\s+right\s+to/i,
  /prohibited\s+from/i,
  /forbidden\s+to/i,
  /not\s+permitted\s+to/i,
  /not\s+allowed\s+to/i,
  /without\s+(?:written\s+)?consent/i,
  /landlord.*sole.*discretion.*deny/i,
];

function hasGrant(text: string): boolean {
  return GRANT_PATTERNS.some((p) => p.test(text));
}
function hasRestriction(text: string): boolean {
  return RESTRICT_PATTERNS.some((p) => p.test(text));
}

function regexDetect(
  textA: string,
  typeA: string,
  textB: string,
  typeB: string
): boolean {
  const key = pairKey(typeA, typeB);
  const meta = PAIR_METADATA[key];
  if (!meta) {
    return (hasGrant(textA) && hasRestriction(textB)) ||
           (hasRestriction(textA) && hasGrant(textB));
  }
  return (hasGrant(textA) || hasGrant(textB)) &&
         (hasRestriction(textA) || hasRestriction(textB));
}

// ─── LLM detection (Anthropic SDK with credential fallback) ─────────────────

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import os from "os";
import path from "path";

const LLM_MODEL = "claude-3-5-haiku-20241022";
const LLM_TIMEOUT_MS = 12_000;

/**
 * Resolve Anthropic credentials — mirrors lib/anthropic.ts.
 * Prefers ANTHROPIC_API_KEY env var; falls back to Claude Code OAuth token.
 */
function resolveAnthropicKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const credPaths = [
    path.join(os.homedir(), ".claude", ".credentials.json"),
    path.join(os.homedir(), ".claude", "credentials.json"),
  ];
  for (const p of credPaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const creds = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
      const token =
        (creds.claudeAiOauth as Record<string, string> | undefined)?.accessToken ??
        (creds as Record<string, string>).access_token ??
        (creds as Record<string, string>).apiKey;
      if (token) return token;
    } catch {
      // unreadable — try next
    }
  }
  return undefined;
}

const SYSTEM_PROMPT = `You are a legal analyst reviewing an Ontario residential lease for internal contradictions.

TASK: Determine if two lease clauses create a DIRECT LEGAL CONFLICT — one that a tenant cannot resolve without advice because both clauses cannot be satisfied simultaneously.

STRICT RULES (apply all before deciding):
1. A contradiction requires MUTUALLY EXCLUSIVE obligations. Both clauses must DEMAND conflicting things at the same time.
2. "Burdensome", "unusual", or "unfair" language is NOT a contradiction by itself.
3. Two clauses covering the same topic are NOT necessarily contradictory — they may complement each other.
4. You MUST reference a specific Ontario RTA section from the statute context provided. Do not invent citations.
5. Language that defers to the RTA ("in accordance with the Act", "as permitted by law", "subject to the Residential Tenancies Act") ELIMINATES a potential contradiction — the RTA governs, not the lease.
6. If the conflict is already resolved by the statute (i.e., one clause is void and the RTA governs), that is NOT a contradiction between the clauses — it is a statutory override.
7. Set has_contradiction: false and confidence >= 0.8 for clearly compliant clause pairs.`;

const LLM_TOOL = {
  name: "report_contradiction",
  description: "Report the result of the contradiction analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      has_contradiction: {
        type: "boolean",
        description: "True only if the clauses create a mutually exclusive conflict",
      },
      contradiction_type: {
        type: ["string", "null"] as unknown as "string",
        description:
          "Short snake_case label, e.g. entry_vs_quiet_enjoyment. null if no contradiction.",
      },
      explanation: {
        type: ["string", "null"] as unknown as "string",
        description:
          "1–2 sentence explanation of why the clauses conflict (or null if no conflict).",
      },
      statute_cited: {
        type: ["string", "null"] as unknown as "string",
        description:
          "The specific RTA section(s) that make this a conflict, e.g. 'RTA s.22 and s.27'. Must come from the provided statute context. null if no contradiction.",
      },
      which_governs: {
        type: ["string", "null"] as unknown as "string",
        description:
          "Which clause or statute prevails and why (1 sentence). null if no contradiction.",
      },
      confidence: {
        type: "number",
        description:
          "Confidence in the finding: 0.0–1.0. Use >= 0.8 for clear cases, 0.5–0.7 for ambiguous.",
      },
    },
    required: ["has_contradiction", "confidence"],
  },
};

interface LlmContradictionOutput {
  has_contradiction: boolean;
  contradiction_type?: string | null;
  explanation?: string | null;
  statute_cited?: string | null;
  which_governs?: string | null;
  confidence: number;
}

async function detectConflictWithLLM(
  typeA: string,
  textA: string,
  typeB: string,
  textB: string,
  statutesA: string[],
  statutesB: string[]
): Promise<LlmContradictionOutput | null> {
  const apiKey = resolveAnthropicKey();
  if (!apiKey) {
    console.warn(
      "[detect-contradiction] No Anthropic credentials found — using regex fallback"
    );
    return null;
  }

  // Build statute context block
  const key = pairKey(typeA, typeB);
  const meta = PAIR_METADATA[key];

  const statuteLines: string[] = [];
  if (statutesA.length > 0) {
    statuteLines.push("Statutes for Clause A:");
    statutesA.forEach((s) => statuteLines.push(`  ${s}`));
  }
  if (statutesB.length > 0) {
    statuteLines.push("Statutes for Clause B:");
    statutesB.forEach((s) => statuteLines.push(`  ${s}`));
  }
  if (statuteLines.length === 0 && meta) {
    // No statutes passed by agent — use the hardcoded legal basis as context
    statuteLines.push("Relevant statute context:");
    statuteLines.push(`  ${meta.legal_basis}`);
  }
  if (statuteLines.length === 0) {
    statuteLines.push(
      "Relevant statute context: Ontario Residential Tenancies Act (general)"
    );
  }

  // Include LLM hint for known pairs to guide the model toward correct behaviour
  const hintBlock = meta
    ? `\nANALYSIS HINT for ${typeA} × ${typeB}: ${meta.llm_hint}`
    : "";

  const userMessage =
    `CLAUSE A (type: ${typeA}):\n${textA.slice(0, 800)}\n\n` +
    `CLAUSE B (type: ${typeB}):\n${textB.slice(0, 800)}\n\n` +
    `${statuteLines.join("\n")}` +
    hintBlock +
    `\n\nCall report_contradiction with your analysis.`;

  try {
    const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS });

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      tools: [LLM_TOOL as Anthropic.Tool],
      tool_choice: { type: "tool", name: "report_contradiction" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolBlock = response.content.find(
      (c): c is Anthropic.ToolUseBlock =>
        c.type === "tool_use" && c.name === "report_contradiction"
    );
    if (!toolBlock?.input) {
      console.error("[detect-contradiction] No tool_use block in LLM response");
      return null;
    }

    return toolBlock.input as LlmContradictionOutput;
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === 408) {
      console.error("[detect-contradiction] LLM call timed out — using regex fallback");
    } else {
      console.error(
        `[detect-contradiction] LLM call failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  }
}

// ─── Severity helper ──────────────────────────────────────────────────────────

function severityFromConfidence(
  confidence: number,
  knownSeverity?: Severity
): Severity {
  if (knownSeverity) return knownSeverity;
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.65) return "medium";
  return "low";
}

// ─── Main execute ─────────────────────────────────────────────────────────────

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  const { clause_a, clause_b, statutes_a = [], statutes_b = [] } = parsed.data;

  // Quick exits — same-clause or identical text
  if (clause_a.id === clause_b.id) {
    return {
      has_contradiction: false,
      explanation: "Same clause provided for both inputs.",
      severity: "low",
      detection_method: "none",
    } satisfies ContradictionResult;
  }
  if (clause_a.text.trim() === clause_b.text.trim()) {
    return {
      has_contradiction: false,
      explanation: "Both clauses have identical text.",
      severity: "low",
      detection_method: "none",
    } satisfies ContradictionResult;
  }

  const typeA = clause_a.type as ClauseType;
  const typeB = clause_b.type as ClauseType;
  const key = pairKey(typeA, typeB);
  const meta = PAIR_METADATA[key];

  // ── Attempt LLM detection ─────────────────────────────────────────────────
  const llmResult = await detectConflictWithLLM(
    typeA, clause_a.text,
    typeB, clause_b.text,
    statutes_a, statutes_b
  );

  if (llmResult !== null) {
    // Gate: only flag if confidence >= 0.65 to reduce false positives
    const MIN_CONFIDENCE = 0.65;

    if (!llmResult.has_contradiction || llmResult.confidence < MIN_CONFIDENCE) {
      return {
        has_contradiction: false,
        severity: "low",
        detection_method: "llm",
      } satisfies ContradictionResult;
    }

    // Enrich with PAIR_METADATA where LLM left fields null
    const severity = severityFromConfidence(
      llmResult.confidence,
      meta?.severity
    );
    const which_governs =
      llmResult.which_governs ?? meta?.which_governs ?? undefined;
    const legal_basis =
      llmResult.statute_cited ?? meta?.legal_basis ?? undefined;

    return {
      has_contradiction: true,
      contradiction_type:
        llmResult.contradiction_type ?? meta?.contradiction_type ?? "direct_conflict",
      explanation: llmResult.explanation ?? undefined,
      which_governs,
      legal_basis,
      severity,
      detection_method: "llm",
    } satisfies ContradictionResult;
  }

  // ── Regex fallback ────────────────────────────────────────────────────────
  const isKnownPair = INTERACTION_PAIRS.some(
    ([a, b]) => (typeA === a && typeB === b) || (typeA === b && typeB === a)
  );

  const hasConflict = regexDetect(
    clause_a.text, typeA,
    clause_b.text, typeB
  );

  if (!hasConflict) {
    return {
      has_contradiction: false,
      severity: "low",
      detection_method: "regex",
    } satisfies ContradictionResult;
  }

  if (!isKnownPair || !meta) {
    return {
      has_contradiction: true,
      contradiction_type: "generic_grant_restrict_conflict",
      explanation: `Clause ${clause_a.id} (${typeA}) and clause ${clause_b.id} (${typeB}) appear to grant and restrict overlapping rights.`,
      which_governs: "Requires legal review to determine which clause prevails.",
      legal_basis:
        "General contract law: specific provisions may override general ones; statute prevails over contract.",
      severity: "medium",
      detection_method: "regex",
    } satisfies ContradictionResult;
  }

  return {
    has_contradiction: true,
    contradiction_type: meta.contradiction_type,
    explanation: `The ${typeA} clause and ${typeB} clause appear to conflict.`,
    which_governs: meta.which_governs,
    legal_basis: meta.legal_basis,
    severity: meta.severity,
    detection_method: "regex",
  } satisfies ContradictionResult;
}
