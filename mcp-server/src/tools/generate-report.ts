import { z } from "zod";
import type { ClauseType } from "../types.js";

export const toolDefinition = {
  name: "generate_report",
  description:
    "Assemble a complete lease analysis report from all prior tool outputs. Weights risk scores by clause type, identifies red flags, and produces a plain-English executive summary.",
  inputSchema: {
    type: "object" as const,
    properties: {
      lease_id: { type: "string" },
      jurisdiction: { type: "string" },
      analyzed_clauses: {
        type: "array",
        items: { type: "object" },
        description: "Array of analyzed clause objects with risk scores",
      },
      contradictions: {
        type: "array",
        items: { type: "object" },
        description: "Array of contradiction detection results",
      },
      missing_protections: {
        type: "array",
        items: { type: "object" },
        description: "Array of missing required protections",
      },
      implicit_protections: {
        type: "array",
        items: { type: "object" },
        description: "Array of implicit statutory protections",
      },
      negotiation_points: {
        type: "array",
        items: { type: "object" },
        description: "Array of negotiation point objects",
      },
    },
    required: [
      "lease_id",
      "jurisdiction",
      "analyzed_clauses",
      "contradictions",
      "missing_protections",
      "implicit_protections",
      "negotiation_points",
    ],
  },
};

const RiskScoreSchema = z.object({
  risk_score: z.number(),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  is_potentially_unenforceable: z.boolean(),
  is_unusual: z.boolean(),
  is_standard: z.boolean(),
  plain_english_explanation: z.string(),
  risk_reasoning: z.string(),
  statutory_violations: z.array(
    z.object({
      statute_section: z.string(),
      violation_description: z.string(),
    })
  ),
  confidence: z.number(),
});

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

const NegotiationPointSchema = z.object({
  negotiable: z.boolean(),
  negotiability_basis: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  ask: z.string(),
  counter_language: z.string(),
  legal_argument: z.string(),
  landlord_likely_response: z.string(),
  your_rebuttal: z.string(),
  walk_away_threshold: z.boolean(),
  // Clause provenance — passed through from agent for UI labelling
  clause_id: z.string().optional(),
  clause_type: z.string().optional(),
});

const AnalyzedClauseSchema = z.object({
  clause_id: z.string(),
  clause_number: z.string().optional(),
  clause_type: z.string(),
  clause_text: z.string(),
  risk_score_result: RiskScoreSchema,
  retrieved_statutes: z.array(StatuteSchema).optional().default([]),
  retrieved_decisions: z.array(DecisionSchema).optional().default([]),
  negotiation_point: NegotiationPointSchema.optional(),
});

const ContradictionSchema = z.object({
  has_contradiction: z.boolean(),
  contradiction_type: z.string().optional(),
  explanation: z.string().optional(),
  which_governs: z.string().optional(),
  legal_basis: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  clause_a_id: z.string().optional(),
  clause_b_id: z.string().optional(),
});

const MissingProtectionSchema = z.object({
  clause_type: z.string(),
  description: z.string(),
  statute_reference: z.string(),
  statute_section: z.string(),
  risk_if_missing: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

const ImplicitProtectionSchema = z.object({
  name: z.string(),
  description: z.string(),
  statute_reference: z.string(),
  applies_regardless_of_lease: z.boolean(),
});

const InputSchema = z.object({
  lease_id: z.string(),
  jurisdiction: z.string(),
  analyzed_clauses: z.array(AnalyzedClauseSchema),
  contradictions: z.array(ContradictionSchema),
  missing_protections: z.array(MissingProtectionSchema),
  implicit_protections: z.array(ImplicitProtectionSchema),
  negotiation_points: z.array(NegotiationPointSchema),
});

// Clause types that receive 1.5× weight in risk scoring
const HIGH_WEIGHT_TYPES: ClauseType[] = [
  "entry_rights",
  "early_termination",
  "dispute_resolution",
  "liability_indemnification",
  "security_deposit",
];

const DISCLAIMER =
  "This analysis is not legal advice. Consult a licensed paralegal or lawyer before making decisions about your lease.";

function weightedRiskScore(
  clauses: Array<{ clause_type: string; risk_score_result: { risk_score: number } }>
): number {
  if (clauses.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const clause of clauses) {
    const type = clause.clause_type as ClauseType;
    const weight = HIGH_WEIGHT_TYPES.includes(type) ? 1.5 : 1.0;
    weightedSum += clause.risk_score_result.risk_score * weight;
    totalWeight += weight;
  }

  const base = Math.round((weightedSum / totalWeight) * 10) / 10;

  // When any single clause is critical (≥ 8), blend in the worst clause so
  // the headline score reflects the severity rather than being diluted by
  // standard low-risk clauses.
  const maxScore = Math.max(...clauses.map((c) => c.risk_score_result.risk_score));
  if (maxScore >= 8) {
    return Math.round((base * 0.6 + maxScore * 0.4) * 10) / 10;
  }
  return base;
}

function overallRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score <= 3) return "low";
  if (score <= 6) return "medium";
  if (score <= 8) return "high";
  return "critical";
}

function buildExecutiveSummary(
  jurisdiction: string,
  overallScore: number,
  riskLevel: string,
  redFlagCount: number,
  missingCount: number,
  contradictionCount: number,
  negotiableCount: number,
  totalClauses: number
): string {
  const sentences: string[] = [];

  // Sentence 1: Overall assessment
  if (riskLevel === "low") {
    sentences.push(
      `This lease in ${jurisdiction} scores ${overallScore}/10 overall risk — it appears to be relatively tenant-friendly with no major red flags across ${totalClauses} analyzed clauses.`
    );
  } else if (riskLevel === "medium") {
    sentences.push(
      `This lease in ${jurisdiction} scores ${overallScore}/10 overall risk — it contains several provisions worth reviewing carefully across ${totalClauses} analyzed clauses.`
    );
  } else if (riskLevel === "high") {
    sentences.push(
      `This lease in ${jurisdiction} scores ${overallScore}/10 overall risk — it contains significant provisions that may restrict your rights or be difficult to enforce across ${totalClauses} analyzed clauses.`
    );
  } else {
    sentences.push(
      `This lease in ${jurisdiction} scores ${overallScore}/10 overall risk — it contains critical provisions that may directly contradict Ontario tenant protection law across ${totalClauses} analyzed clauses.`
    );
  }

  // Sentence 2: Red flags and contradictions
  if (redFlagCount > 0 || contradictionCount > 0) {
    const parts: string[] = [];
    if (redFlagCount > 0)
      parts.push(`${redFlagCount} high-risk clause${redFlagCount > 1 ? "s" : ""} (red flag${redFlagCount > 1 ? "s" : ""})`);
    if (contradictionCount > 0)
      parts.push(`${contradictionCount} internal contradiction${contradictionCount > 1 ? "s" : ""} between clauses`);
    sentences.push(`The analysis identified ${parts.join(" and ")}.`);
  } else {
    sentences.push("No red flags or internal contradictions were detected.");
  }

  // Sentence 3: Missing protections
  if (missingCount > 0) {
    sentences.push(
      `${missingCount} required Ontario tenancy protection${missingCount > 1 ? "s are" : " is"} absent from this lease — though statutory protections still apply by law, their absence from the lease weakens your written record.`
    );
  } else {
    sentences.push(
      "All required Ontario tenancy protections appear to be addressed in this lease."
    );
  }

  // Sentence 4: Negotiation
  if (negotiableCount > 0) {
    sentences.push(
      `${negotiableCount} clause${negotiableCount > 1 ? "s" : ""} ${negotiableCount > 1 ? "have been" : "has been"} flagged for negotiation — review the negotiation points section before signing.`
    );
  } else {
    sentences.push(
      "No clauses were identified as requiring negotiation based on the risk thresholds."
    );
  }

  return sentences.join(" ");
}

interface Source {
  type: "statute" | "decision";
  reference: string;
  url: string;
  full_text?: string;
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
    lease_id,
    jurisdiction,
    analyzed_clauses,
    contradictions,
    missing_protections,
    implicit_protections,
    negotiation_points,
  } = parsed.data;

  // Weighted overall risk score
  const overall_risk_score = weightedRiskScore(analyzed_clauses);
  const overall_risk_level = overallRiskLevel(overall_risk_score);

  // Red flags: clauses with risk_score >= 6, sorted descending
  const red_flags = analyzed_clauses
    .filter((c) => c.risk_score_result.risk_score >= 6)
    .sort(
      (a, b) =>
        b.risk_score_result.risk_score - a.risk_score_result.risk_score
    )
    .map((c) => ({
      clause_id: c.clause_id,
      clause_number: c.clause_number,
      clause_type: c.clause_type,
      risk_score: c.risk_score_result.risk_score,
      risk_level: c.risk_score_result.risk_level,
      is_potentially_unenforceable: c.risk_score_result.is_potentially_unenforceable,
      plain_english_explanation: c.risk_score_result.plain_english_explanation,
      statutory_violations: c.risk_score_result.statutory_violations,
    }));

  // Active contradictions only
  const active_contradictions = contradictions.filter(
    (c) => c.has_contradiction
  );

  // Negotiable points only
  const active_negotiation_points = negotiation_points.filter(
    (n) => n.negotiable
  );

  // Assemble sources — only from clauses that were actually analyzed
  const sourcesMap = new Map<string, Source>();

  for (const clause of analyzed_clauses) {
    for (const statute of clause.retrieved_statutes) {
      const key = `statute:${statute.id}`;
      if (!sourcesMap.has(key)) {
        sourcesMap.set(key, {
          type: "statute",
          reference: `${statute.act_name} s.${statute.section_number} — ${statute.section_title}`,
          url: statute.url,
          full_text: statute.text,
        });
      }
    }
    for (const decision of clause.retrieved_decisions) {
      const key = `decision:${decision.case_number}`;
      if (!sourcesMap.has(key)) {
        sourcesMap.set(key, {
          type: "decision",
          reference: `${decision.case_number} (${decision.decision_date.slice(0, 4)}) — ${decision.relevant_principle.slice(0, 100)}`,
          url: decision.url,
        });
      }
    }
  }

  const sources = [...sourcesMap.values()];

  // Risk distribution
  const risk_distribution = {
    low: analyzed_clauses.filter(
      (c) => c.risk_score_result.risk_level === "low"
    ).length,
    medium: analyzed_clauses.filter(
      (c) => c.risk_score_result.risk_level === "medium"
    ).length,
    high: analyzed_clauses.filter(
      (c) => c.risk_score_result.risk_level === "high"
    ).length,
    critical: analyzed_clauses.filter(
      (c) => c.risk_score_result.risk_level === "critical"
    ).length,
  };

  const executive_summary = buildExecutiveSummary(
    jurisdiction,
    overall_risk_score,
    overall_risk_level,
    red_flags.length,
    missing_protections.length,
    active_contradictions.length,
    active_negotiation_points.length,
    analyzed_clauses.length
  );

  return {
    lease_id,
    generated_at: new Date().toISOString(),
    jurisdiction,
    overall_risk_score,
    overall_risk_level,
    executive_summary,
    risk_distribution,
    total_clauses_analyzed: analyzed_clauses.length,
    red_flags,
    contradictions: active_contradictions,
    missing_protections,
    implicit_protections,
    negotiation_points: active_negotiation_points,
    sources,
    disclaimer: DISCLAIMER,
  };
}
