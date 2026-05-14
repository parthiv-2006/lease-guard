import { z } from "zod";
import type { ClauseType, Statute, Decision, RiskScore } from "../types.js";

export const toolDefinition = {
  name: "score_risk",
  description:
    "Score the legal risk of a lease clause on a 1-10 scale. Requires retrieved statutes and decisions as grounding — never asserts law from training knowledge alone.",
  inputSchema: {
    type: "object" as const,
    properties: {
      clause_id: { type: "string" },
      clause_text: { type: "string" },
      clause_type: { type: "string" },
      retrieved_statutes: {
        type: "array",
        items: { type: "object" },
        description: "Statutes returned by lookup_statute",
      },
      retrieved_decisions: {
        type: "array",
        items: { type: "object" },
        description: "Decisions returned by lookup_tribunal",
      },
      jurisdiction_code: { type: "string" },
    },
    required: [
      "clause_id",
      "clause_text",
      "clause_type",
      "retrieved_statutes",
      "retrieved_decisions",
      "jurisdiction_code",
    ],
  },
};

const StatuteSchema = z.object({
  id: z.string(),
  act_name: z.string(),
  section_number: z.string(),
  section_title: z.string(),
  text: z.string(),
  url: z.string(),
  relevance_score: z.number(),
  last_verified: z.string(),
});

const DecisionSchema = z.object({
  case_number: z.string(),
  decision_date: z.string(),
  ruling_summary: z.string(),
  outcome: z.enum(["tenant_favour", "landlord_favour", "mixed"]),
  relevant_principle: z.string(),
  url: z.string(),
  relevance_score: z.number(),
});

const InputSchema = z.object({
  clause_id: z.string(),
  clause_text: z.string(),
  clause_type: z.string(),
  retrieved_statutes: z.array(StatuteSchema),
  retrieved_decisions: z.array(DecisionSchema),
  jurisdiction_code: z.string(),
});

// Clause types that are standard — inherently lower risk baseline
const STANDARD_BOILERPLATE_TYPES: ClauseType[] = [
  "standard_boilerplate",
  "utilities",
  "parking_storage",
  "guest_policy",
  "pets",
];

// Patterns that indicate the clause restricts tenant rights
const TENANT_RESTRICTIVE_PATTERNS = [
  /landlord.*not.*liable/i,
  /tenant.*waive/i,
  /waiver.*right/i,
  /no.*right.*to/i,
  /prohibit.*tenant/i,
  /tenant.*shall.*not/i,
  /tenant.*must.*not/i,
  /forfeit/i,
  /penalty/i,
  /without.*notice/i,
  /at.*landlord.*discretion/i,
  /sole.*discretion.*landlord/i,
  /non.refundable/i,
  /waive.*court/i,
  /mandatory.*arbitration/i,
  /class.*action.*waiver/i,
];

// Patterns that suggest unusually one-sided language
const UNUSUAL_LANGUAGE_PATTERNS = [
  /absolutely.*no.*right/i,
  /under.*no.*circumstances/i,
  /without.*exception/i,
  /irrevocably/i,
  /permanently.*waive/i,
  /forever.*waive/i,
  /unconditionally/i,
  /sole.*and.*absolute.*discretion/i,
  /with.*or.*without.*cause/i,
  /without.*reason/i,
];

function detectStatutoryViolations(
  clauseText: string,
  statutes: Statute[]
): Array<{ statute_section: string; violation_description: string }> {
  const violations: Array<{
    statute_section: string;
    violation_description: string;
  }> = [];

  const lowerClause = clauseText.toLowerCase();

  for (const statute of statutes) {
    if (statute.relevance_score < 0.5) continue;

    const sectionRef = `${statute.act_name} s.${statute.section_number}`;
    const statuteText = statute.text.toLowerCase();

    // Check for explicit contradictions based on known patterns

    // Entry without notice — RTA s.27 requires 24-hour written notice
    if (
      (lowerClause.includes("enter") || lowerClause.includes("access")) &&
      (lowerClause.includes("without notice") ||
        lowerClause.includes("any time") ||
        lowerClause.includes("at any time")) &&
      (statuteText.includes("24") || statuteText.includes("notice"))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_description: `Clause permits entry without required notice, contradicting ${sectionRef} which mandates advance written notice`,
      });
      continue;
    }

    // Non-refundable deposit — RTA s.105 prohibits deposits beyond last month's rent
    if (
      (lowerClause.includes("non-refundable") ||
        lowerClause.includes("nonrefundable")) &&
      lowerClause.includes("deposit") &&
      statuteText.includes("deposit")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_description: `Non-refundable deposit clause contradicts ${sectionRef} which restricts permissible deposits`,
      });
      continue;
    }

    // Rent increase without guideline — RTA s.120
    if (
      lowerClause.includes("rent increase") &&
      (lowerClause.includes("any amount") ||
        lowerClause.includes("landlord.*increas") ||
        lowerClause.includes("sole discretion")) &&
      statuteText.includes("guideline")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_description: `Unlimited rent increase clause contradicts ${sectionRef} which ties increases to the annual guideline`,
      });
      continue;
    }

    // Waiver of rights — RTA s.3 prohibits contracting out
    if (
      (lowerClause.includes("waive") ||
        lowerClause.includes("forfeit") ||
        lowerClause.includes("give up")) &&
      (lowerClause.includes("right") || lowerClause.includes("protection")) &&
      (statuteText.includes("waiv") || statuteText.includes("contract out"))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_description: `Rights waiver contradicts ${sectionRef} — tenants cannot contract out of RTA protections`,
      });
      continue;
    }

    // Mandatory arbitration / waiving LTB
    if (
      (lowerClause.includes("arbitration") ||
        lowerClause.includes("waive.*court") ||
        lowerClause.includes("no.*court")) &&
      statuteText.includes("board")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_description: `Mandatory arbitration clause may contradict ${sectionRef} — tenants have the right to access the Landlord and Tenant Board`,
      });
      continue;
    }
  }

  return violations;
}

function scoreClause(
  clauseText: string,
  clauseType: string,
  statutes: Statute[],
  decisions: Decision[]
): {
  base_score: number;
  is_unusual: boolean;
  is_standard: boolean;
  violation_bonus: number;
} {
  const type = clauseType as ClauseType;
  const isStandard = STANDARD_BOILERPLATE_TYPES.includes(type);

  // Base score
  let score = isStandard ? 1 : 3;

  // Count restrictive patterns
  const restrictiveCount = TENANT_RESTRICTIVE_PATTERNS.filter((p) =>
    p.test(clauseText)
  ).length;
  score += Math.min(2, restrictiveCount * 0.7);

  // Unusual language check
  const isUnusual = UNUSUAL_LANGUAGE_PATTERNS.some((p) => p.test(clauseText));
  if (isUnusual) score += 1.5;

  // High-risk clause types get a bump
  const highRiskTypes: ClauseType[] = [
    "entry_rights",
    "early_termination",
    "dispute_resolution",
    "liability_indemnification",
    "security_deposit",
  ];
  if (highRiskTypes.includes(type)) {
    score += 1;
  }

  // Decisions weighting: landlord_favour decisions reduce score (clause is common/upheld),
  // tenant_favour decisions increase score (clause has been struck down)
  const highRelevanceDecisions = decisions.filter(
    (d) => d.relevance_score >= 0.5
  );
  const tenantFavourCount = highRelevanceDecisions.filter(
    (d) => d.outcome === "tenant_favour"
  ).length;
  const landlordFavourCount = highRelevanceDecisions.filter(
    (d) => d.outcome === "landlord_favour"
  ).length;

  score += tenantFavourCount * 0.5;
  score -= landlordFavourCount * 0.3;

  return {
    base_score: Math.max(1, Math.min(10, score)),
    is_unusual: isUnusual,
    is_standard: isStandard && restrictiveCount === 0,
    violation_bonus: 0, // Applied after violation detection
  };
}

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const {
    clause_id,
    clause_text,
    clause_type,
    retrieved_statutes,
    retrieved_decisions,
  } = parsed.data;

  // Handle empty clause
  if (!clause_text || clause_text.trim().length === 0) {
    const result: RiskScore = {
      risk_score: 1,
      risk_level: "low",
      is_potentially_unenforceable: false,
      is_unusual: false,
      is_standard: true,
      plain_english_explanation: "Empty clause — no content to assess.",
      risk_reasoning: "No clause text provided.",
      statutory_violations: [],
      confidence: 0,
    };
    return result;
  }

  const hasStatutes = retrieved_statutes.length > 0;
  const highRelevanceStatutes = retrieved_statutes.filter(
    (s) => s.relevance_score >= 0.5
  );

  // Detect statutory violations
  const violations = hasStatutes
    ? detectStatutoryViolations(clause_text, retrieved_statutes)
    : [];

  // Score the clause
  const { base_score, is_unusual, is_standard } = scoreClause(
    clause_text,
    clause_type,
    retrieved_statutes,
    retrieved_decisions
  );

  // Add violation score
  const violationBonus = Math.min(4, violations.length * 3);
  let finalScore = Math.round(
    Math.min(10, Math.max(1, base_score + violationBonus))
  );

  // Determine risk level
  let risk_level: RiskScore["risk_level"];
  if (finalScore <= 3) risk_level = "low";
  else if (finalScore <= 6) risk_level = "medium";
  else if (finalScore <= 8) risk_level = "high";
  else risk_level = "critical";

  // Enforceability: only when a specific retrieved statute is directly contradicted
  // AND we have high-relevance statutes AND violations exist
  const is_potentially_unenforceable =
    violations.length > 0 && highRelevanceStatutes.length > 0;

  // Confidence depends on statute coverage
  let confidence: number;
  if (!hasStatutes) {
    confidence = 0.3; // Cannot be confident without statute grounding
    finalScore = Math.min(finalScore, 5); // Cap score without statute backing
  } else if (highRelevanceStatutes.length >= 2) {
    confidence = 0.8;
  } else if (highRelevanceStatutes.length === 1) {
    confidence = 0.6;
  } else {
    confidence = 0.4;
  }

  // Build plain English explanation
  const clauseTypeLabel = clause_type.replace(/_/g, " ");
  let plainEnglish = `This ${clauseTypeLabel} clause scores ${finalScore}/10 risk`;

  if (finalScore <= 3) {
    plainEnglish += ". It appears to be standard language that aligns with tenant protections.";
  } else if (finalScore <= 6) {
    plainEnglish += ". It contains some provisions worth reviewing, as they may limit your rights.";
  } else if (finalScore <= 8) {
    plainEnglish += ". It contains high-risk provisions that may significantly restrict your rights or be legally questionable.";
  } else {
    plainEnglish += ". This clause is potentially unenforceable and may directly contradict Ontario tenant protection law.";
  }

  if (!hasStatutes) {
    plainEnglish +=
      " Note: No statutes were retrieved for this clause, so the risk assessment has lower confidence.";
  }

  // Build risk reasoning — MUST cite retrieved statute sections only
  const reasoningParts: string[] = [];

  if (violations.length > 0) {
    reasoningParts.push(
      `Statutory violations found: ${violations
        .map((v) => `${v.statute_section} (${v.violation_description})`)
        .join("; ")}`
    );
  }

  if (is_unusual) {
    reasoningParts.push(
      "Clause contains unusually one-sided language (e.g., absolute discretion, irrevocable waiver)"
    );
  }

  if (highRelevanceStatutes.length > 0) {
    const statuteRefs = highRelevanceStatutes
      .map((s) => `${s.act_name} s.${s.section_number} (${s.section_title})`)
      .join(", ");
    reasoningParts.push(`Assessed against: ${statuteRefs}`);
  } else if (!hasStatutes) {
    reasoningParts.push(
      "No statutes retrieved — risk assessment based on clause language patterns only"
    );
  }

  const risk_reasoning =
    reasoningParts.length > 0
      ? reasoningParts.join(". ")
      : `${clauseTypeLabel} clause assessed on language patterns. Score: ${finalScore}/10.`;

  const result: RiskScore = {
    risk_score: finalScore,
    risk_level,
    is_potentially_unenforceable,
    is_unusual,
    is_standard,
    plain_english_explanation: plainEnglish,
    risk_reasoning,
    statutory_violations: violations,
    confidence: Math.round(confidence * 100) / 100,
  };

  return result;
}
