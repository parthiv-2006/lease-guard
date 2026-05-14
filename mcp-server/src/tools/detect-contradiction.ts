import { z } from "zod";
import type { ClauseType } from "../types.js";

export const toolDefinition = {
  name: "detect_contradiction",
  description:
    "Detect semantic contradictions between two lease clauses. Checks known interaction pairs and looks for grant-restrict conflicts.",
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
});

type Severity = "low" | "medium" | "high" | "critical";

interface ContradictionResult {
  has_contradiction: boolean;
  contradiction_type?: string;
  explanation?: string;
  which_governs?: string;
  legal_basis?: string;
  severity: Severity;
}

// Known interaction pairs that may produce contradictions
// [typeA, typeB] — order doesn't matter
const INTERACTION_PAIRS: Array<[ClauseType, ClauseType]> = [
  ["entry_rights", "quiet_enjoyment"],
  ["maintenance_repairs", "liability_indemnification"],
  ["early_termination", "renewal_terms"],
  ["rent_increase", "security_deposit"],
  ["subletting_assignment", "early_termination"],
];

// Grant signals: words that give a right or permission
const GRANT_PATTERNS = [
  /(?:landlord|tenant)\s+(?:may|shall|has\s+the\s+right|is\s+entitled|can|will)\s+(?:enter|access|inspect|terminate|increase|sublet|assign|renew)/i,
  /right\s+to\s+(?:enter|access|terminate|sublet|assign|renew|increase)/i,
  /permitted\s+to/i,
  /allowed\s+to/i,
  /entitled\s+to/i,
  /may\s+(?:enter|terminate|sublet|increase)/i,
];

// Restrict signals: words that limit or deny a right
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

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

const PAIR_METADATA: Record<
  string,
  {
    contradiction_type: string;
    explanation_template: (aType: string, bType: string) => string;
    legal_basis: string;
    which_governs: string;
    severity: Severity;
  }
> = {
  [pairKey("entry_rights", "quiet_enjoyment")]: {
    contradiction_type: "entry_vs_quiet_enjoyment",
    explanation_template: (aType, bType) =>
      `The ${aType} clause grants entry rights that may conflict with the ${bType} clause's guarantee of undisturbed possession.`,
    legal_basis:
      "Ontario RTA s.22 (quiet enjoyment) and s.27 (entry with notice) — both apply; unrestricted entry conflicts with quiet enjoyment.",
    which_governs:
      "RTA s.27 governs entry (24-hour written notice required). Quiet enjoyment (s.22) prevails if entry clause grants unrestricted access.",
    severity: "high",
  },
  [pairKey("maintenance_repairs", "liability_indemnification")]: {
    contradiction_type: "maintenance_vs_indemnification",
    explanation_template: (aType, bType) =>
      `The ${aType} clause assigns repair obligations that appear to conflict with the ${bType} clause's liability exclusions.`,
    legal_basis:
      "Ontario RTA s.20 places maintenance obligations on the landlord; an indemnification clause cannot override statutory duties.",
    which_governs:
      "Statutory maintenance obligations (RTA s.20) prevail over contractual indemnification. The landlord cannot contractually escape repair duties.",
    severity: "high",
  },
  [pairKey("early_termination", "renewal_terms")]: {
    contradiction_type: "termination_vs_renewal",
    explanation_template: (aType, bType) =>
      `The ${aType} clause and ${bType} clause may conflict on what happens at lease end — one may allow exit while the other binds the tenant to renewal.`,
    legal_basis:
      "Ontario RTA s.95 (renewal) and ss.59-84 (termination) — automatic renewal clauses are of limited effect under the RTA.",
    which_governs:
      "The RTA governs tenancy continuation. A fixed-term lease converting to month-to-month (s.95) typically prevails over automatic renewal traps.",
    severity: "medium",
  },
  [pairKey("rent_increase", "security_deposit")]: {
    contradiction_type: "rent_increase_vs_deposit",
    explanation_template: (aType, bType) =>
      `The ${aType} clause and ${bType} clause may create an inconsistency — if rent increases, the corresponding deposit top-up may be unlawful.`,
    legal_basis:
      "Ontario RTA s.105 limits deposits to one month's rent at the rent amount at time of deposit; requiring top-ups after increases may be prohibited.",
    which_governs:
      "RTA s.105 prevails — the landlord cannot demand additional deposit funds above the original one-month limit.",
    severity: "medium",
  },
  [pairKey("subletting_assignment", "early_termination")]: {
    contradiction_type: "subletting_vs_termination",
    explanation_template: (aType, bType) =>
      `The ${aType} clause may conflict with the ${bType} clause — prohibiting subletting while imposing early termination fees denies the tenant any exit route.`,
    legal_basis:
      "Ontario RTA s.97 gives tenants the right to sublet with consent; combined with early termination penalties, a total prohibition may be unenforceable.",
    which_governs:
      "RTA s.97 prevails — the landlord cannot both prohibit subletting and impose unlimited early termination penalties.",
    severity: "high",
  },
};

function detectSemanticConflict(
  textA: string,
  typeA: string,
  textB: string,
  typeB: string
): boolean {
  const key = pairKey(typeA, typeB);
  const metadata = PAIR_METADATA[key];

  if (!metadata) {
    // For unknown pairs, do a basic grant-restrict conflict check
    const aGrants = hasGrant(textA);
    const aRestricts = hasRestriction(textA);
    const bGrants = hasGrant(textB);
    const bRestricts = hasRestriction(textB);

    // Conflict: A grants what B restricts, or vice versa
    return (aGrants && bRestricts) || (aRestricts && bGrants);
  }

  // For known pairs, check if the two clauses point in opposite directions
  const hasGrantSignal = hasGrant(textA) || hasGrant(textB);
  const hasRestrictSignal = hasRestriction(textA) || hasRestriction(textB);

  // Both should have at least some content indicating a conflict
  return hasGrantSignal && hasRestrictSignal;
}

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { clause_a, clause_b } = parsed.data;

  // Edge case: same clause passed twice
  if (clause_a.id === clause_b.id) {
    return {
      has_contradiction: false,
      explanation: "The same clause was provided for both inputs — no contradiction possible.",
      severity: "low",
    } satisfies ContradictionResult;
  }

  // Edge case: identical text in both clauses
  if (clause_a.text.trim() === clause_b.text.trim()) {
    return {
      has_contradiction: false,
      explanation: "Both clauses have identical text — no contradiction possible.",
      severity: "low",
    } satisfies ContradictionResult;
  }

  const typeA = clause_a.type as ClauseType;
  const typeB = clause_b.type as ClauseType;
  const key = pairKey(typeA, typeB);
  const metadata = PAIR_METADATA[key];

  // Check if these types form a known interaction pair
  const isKnownPair = INTERACTION_PAIRS.some(
    ([a, b]) =>
      (typeA === a && typeB === b) || (typeA === b && typeB === a)
  );

  // For types not in the interaction list, run basic semantic check only
  if (!isKnownPair) {
    const hasConflict = detectSemanticConflict(
      clause_a.text,
      typeA,
      clause_b.text,
      typeB
    );

    if (!hasConflict) {
      return {
        has_contradiction: false,
        severity: "low",
      } satisfies ContradictionResult;
    }

    return {
      has_contradiction: true,
      contradiction_type: "generic_grant_restrict_conflict",
      explanation: `Clause ${clause_a.id} (${typeA}) and clause ${clause_b.id} (${typeB}) appear to grant and restrict overlapping rights.`,
      which_governs: "Requires legal review to determine which clause prevails.",
      legal_basis:
        "General contract law: specific provisions may override general ones; statute prevails over contract.",
      severity: "medium",
    } satisfies ContradictionResult;
  }

  // Known pair — run semantic conflict detection
  const hasConflict = detectSemanticConflict(
    clause_a.text,
    typeA,
    clause_b.text,
    typeB
  );

  if (!hasConflict) {
    return {
      has_contradiction: false,
      severity: "low",
    } satisfies ContradictionResult;
  }

  return {
    has_contradiction: true,
    contradiction_type: metadata.contradiction_type,
    explanation: metadata.explanation_template(typeA, typeB),
    which_governs: metadata.which_governs,
    legal_basis: metadata.legal_basis,
    severity: metadata.severity,
  } satisfies ContradictionResult;
}
