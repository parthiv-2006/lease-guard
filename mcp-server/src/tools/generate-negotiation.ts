import { z } from "zod";
import type { ClauseType, Statute, Decision, NegotiationPoint } from "../types.js";

export const toolDefinition = {
  name: "generate_negotiation",
  description:
    "Generate a negotiation strategy for a lease clause. Produces counter-language and a legal argument grounded in retrieved statutes or decisions.",
  inputSchema: {
    type: "object" as const,
    properties: {
      clause_id: { type: "string" },
      clause_text: { type: "string" },
      clause_type: { type: "string" },
      risk_score: { type: "number" },
      retrieved_statutes: {
        type: "array",
        items: { type: "object" },
      },
      retrieved_decisions: {
        type: "array",
        items: { type: "object" },
      },
    },
    required: [
      "clause_id",
      "clause_text",
      "clause_type",
      "risk_score",
      "retrieved_statutes",
      "retrieved_decisions",
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
  risk_score: z.number(),
  retrieved_statutes: z.array(StatuteSchema),
  retrieved_decisions: z.array(DecisionSchema),
});

// Non-negotiable types by nature
const NON_NEGOTIABLE_TYPES: ClauseType[] = ["standard_boilerplate"];

// Negotiation templates per clause type
const NEGOTIATION_TEMPLATES: Partial<
  Record<
    ClauseType,
    {
      ask: string;
      counter_language: (clauseText: string) => string;
      landlord_likely_response: string;
      your_rebuttal: string;
    }
  >
> = {
  entry_rights: {
    ask: "Amend entry rights clause to explicitly require 24-hour written notice for all non-emergency entry, consistent with RTA s.27.",
    counter_language: (text) =>
      `The Landlord shall provide the Tenant with at least twenty-four (24) hours written notice before entering the rental unit, specifying the reason for entry and the time of entry (which must be between 8:00 a.m. and 8:00 p.m.). Emergency entry is permitted without notice only where there is an immediate threat to life or property. ${text.length > 100 ? "All other provisions of this clause remain unchanged." : ""}`,
    landlord_likely_response:
      "Landlord may argue they need flexible access for inspections and repairs.",
    your_rebuttal:
      "The 24-hour notice requirement is mandated by Ontario RTA s.27 and cannot be contracted out of. Refusing this amendment means the current clause is unenforceable.",
  },
  security_deposit: {
    ask: "Limit deposit to one month's rent (last month's rent only) and specify the conditions and timeline for return.",
    counter_language: () =>
      `The Tenant has paid a last month's rent deposit equal to one (1) month's rent at the commencement of this tenancy. This deposit shall be applied to the final month of the tenancy. No other deposit, damage deposit, or security fee is payable. The Landlord shall pay interest on this deposit annually in accordance with the Residential Tenancies Act, 2006, s.106.`,
    landlord_likely_response:
      "Landlord may claim the extra deposit is for damage protection.",
    your_rebuttal:
      "Ontario RTA s.105 prohibits security deposits beyond last month's rent. Any amount collected beyond one month's rent is unlawfully retained and can be recovered via LTB application.",
  },
  early_termination: {
    ask: "Remove or cap early termination penalties. Any penalty should not exceed two months' rent and should not apply if subletting is unreasonably withheld.",
    counter_language: () =>
      `If the Tenant vacates the rental unit before the expiry of the fixed term, the Tenant's liability is limited to the lesser of: (a) two (2) months' rent; or (b) the actual rent lost by the Landlord until a replacement tenant is found, less any amount the Landlord saved by the early vacation. The Landlord must make reasonable efforts to re-rent the unit to mitigate losses.`,
    landlord_likely_response:
      "Landlord may argue they need protection against lost income.",
    your_rebuttal:
      "Ontario law requires landlords to mitigate losses upon early termination. Uncapped penalties are likely unenforceable. The proposed language is a fair compromise.",
  },
  dispute_resolution: {
    ask: "Remove mandatory arbitration clause. Tenants must retain the right to access the Landlord and Tenant Board.",
    counter_language: () =>
      `Any dispute arising from this tenancy shall be resolved in accordance with the Residential Tenancies Act, 2006. Either party may apply to the Landlord and Tenant Board for resolution. Nothing in this agreement limits either party's right to file an LTB application. Mediation may be used voluntarily as a first step, but is not mandatory.`,
    landlord_likely_response:
      "Landlord may prefer private arbitration to avoid LTB backlogs.",
    your_rebuttal:
      "Mandatory arbitration that ousts LTB jurisdiction is unenforceable in Ontario. The Residential Tenancies Act s.168 grants exclusive jurisdiction to the LTB over most tenancy disputes.",
  },
  rent_increase: {
    ask: "Limit rent increases to the Ontario annual guideline and require 90 days written notice.",
    counter_language: () =>
      `Rent increases shall not exceed the annual rent increase guideline published by the Ontario Ministry of Municipal Affairs and Housing. The Landlord shall provide at least ninety (90) days written notice of any rent increase. No more than one rent increase shall occur in any twelve (12) month period.`,
    landlord_likely_response:
      "Landlord may want flexibility to raise rent above guideline for capital improvements.",
    your_rebuttal:
      "Above-guideline increases require a separate LTB application (RTA s.126). The lease cannot pre-authorize above-guideline amounts.",
  },
  liability_indemnification: {
    ask: "Remove blanket liability waiver. Tenant should not be liable for landlord's negligence.",
    counter_language: () =>
      `The Tenant shall be responsible for damages caused by the Tenant's own negligence or intentional acts. The Landlord shall not be indemnified for damages caused by the Landlord's own negligence, failure to maintain the unit, or breach of the Residential Tenancies Act, 2006. Nothing in this clause limits either party's rights under the RTA.`,
    landlord_likely_response:
      "Landlord may argue they need liability protection for common areas and third-party claims.",
    your_rebuttal:
      "A blanket indemnification that covers the landlord's own negligence is against public policy. The proposed language is balanced and consistent with general tort law.",
  },
  subletting_assignment: {
    ask: "Confirm sublet/assignment rights and specify that consent will not be unreasonably withheld.",
    counter_language: () =>
      `The Tenant may sublet or assign the rental unit with the prior written consent of the Landlord. The Landlord shall not arbitrarily or unreasonably withhold consent. If the Landlord withholds consent, the Landlord shall provide written reasons within 7 days. The parties acknowledge the Tenant's rights under RTA s.97.`,
    landlord_likely_response:
      "Landlord may want to maintain control over who occupies the unit.",
    your_rebuttal:
      "RTA s.97 grants tenants the right to sublet with consent. The Landlord cannot arbitrarily refuse. Unreasonable refusal entitles the tenant to file an LTB application.",
  },
  maintenance_repairs: {
    ask: "Confirm landlord's statutory repair obligation and set a reasonable response timeline.",
    counter_language: () =>
      `The Landlord shall maintain the rental unit and residential complex in a good state of repair, fit for habitation, and in compliance with all applicable health, safety, and maintenance standards, as required by the Residential Tenancies Act s.20 and Ontario Regulation 517/06. The Landlord shall respond to repair requests within 24 hours for urgent matters and 7 business days for non-urgent matters.`,
    landlord_likely_response:
      "Landlord may object to the specific timelines.",
    your_rebuttal:
      "The maintenance obligation is statutory and cannot be waived. The timeline is reasonable and protects both parties by creating clear expectations.",
  },
};

function buildLegalArgument(
  clauseType: ClauseType,
  statutes: Statute[],
  decisions: Decision[]
): string {
  const highRelevanceStatutes = statutes.filter((s) => s.relevance_score >= 0.45);
  const tenantFavourDecisions = decisions.filter(
    (d) => d.outcome === "tenant_favour" && d.relevance_score >= 0.45
  );

  const parts: string[] = [];

  if (highRelevanceStatutes.length > 0) {
    const primaryStatute = highRelevanceStatutes[0];
    parts.push(
      `Under ${primaryStatute.act_name} s.${primaryStatute.section_number} (${primaryStatute.section_title}), ${primaryStatute.text.slice(0, 200).trimEnd()}...`
    );
  }

  if (tenantFavourDecisions.length > 0) {
    const decision = tenantFavourDecisions[0];
    parts.push(
      `The LTB has ruled in favour of tenants on similar provisions: ${decision.case_number} (${decision.decision_date.slice(0, 4)}) — ${decision.relevant_principle}`
    );
  }

  if (parts.length === 0) {
    // No retrieved legal grounding — provide a generic but accurate statement
    return `This ${clauseType.replace(/_/g, " ")} clause raises fairness concerns. We recommend reviewing it with a paralegal. No specific statute text was retrieved to ground a more precise legal argument.`;
  }

  return parts.join(" Furthermore, ");
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
    risk_score,
    retrieved_statutes,
    retrieved_decisions,
  } = parsed.data;

  const type = clause_type as ClauseType;

  // Empty clause text
  if (!clause_text || clause_text.trim().length === 0) {
    const result: NegotiationPoint = {
      negotiable: false,
      negotiability_basis: "Empty clause text — nothing to negotiate.",
      priority: "low",
      ask: "",
      counter_language: "",
      legal_argument: "",
      landlord_likely_response: "",
      your_rebuttal: "",
      walk_away_threshold: false,
    };
    return result;
  }

  // Non-negotiable: standard boilerplate
  if (NON_NEGOTIABLE_TYPES.includes(type)) {
    const result: NegotiationPoint = {
      negotiable: false,
      negotiability_basis:
        "Standard boilerplate clauses are generally non-negotiable and do not affect tenant rights.",
      priority: "low",
      ask: "",
      counter_language: "",
      legal_argument: "",
      landlord_likely_response: "",
      your_rebuttal: "",
      walk_away_threshold: false,
    };
    return result;
  }

  // Low risk — not worth negotiating
  if (risk_score < 4) {
    const result: NegotiationPoint = {
      negotiable: false,
      negotiability_basis: `Risk score is ${risk_score}/10 — below the negotiation threshold of 4. This clause does not pose significant risk.`,
      priority: "low",
      ask: "",
      counter_language: "",
      legal_argument: "",
      landlord_likely_response: "",
      your_rebuttal: "",
      walk_away_threshold: false,
    };
    return result;
  }

  // Determine priority
  let priority: NegotiationPoint["priority"];
  if (risk_score >= 8) priority = "high";
  else if (risk_score >= 6) priority = "medium";
  else priority = "low";

  // Walk-away threshold
  const highRelevanceStatutes = retrieved_statutes.filter(
    (s) => s.relevance_score >= 0.5
  );
  const isPotentiallyUnenforceable =
    risk_score >= 8 && highRelevanceStatutes.length > 0;
  const walkAwayThreshold = risk_score >= 8 || isPotentiallyUnenforceable;

  // Get template for this clause type
  const template = NEGOTIATION_TEMPLATES[type];

  const ask = template?.ask ?? `Request amendment of the ${type.replace(/_/g, " ")} clause to align with Ontario RTA requirements.`;
  const counterLanguage =
    template?.counter_language(clause_text) ??
    `[The ${type.replace(/_/g, " ")} clause should be amended to comply with the Residential Tenancies Act, 2006. Consult a paralegal for specific replacement language.]`;
  const landlordLikelyResponse =
    template?.landlord_likely_response ??
    "The landlord may argue the current clause is standard practice.";
  const yourRebuttal =
    template?.your_rebuttal ??
    "Standard practice does not override statutory tenant protections under the RTA.";

  const legalArgument = buildLegalArgument(
    type,
    retrieved_statutes,
    retrieved_decisions
  );

  const negotiabilityBasis =
    risk_score >= 8
      ? "High risk score and potential statutory violation make this clause a strong negotiation priority."
      : `Risk score of ${risk_score}/10 indicates this clause warrants negotiation.`;

  const result: NegotiationPoint = {
    negotiable: true,
    negotiability_basis: negotiabilityBasis,
    priority,
    ask,
    counter_language: counterLanguage,
    legal_argument: legalArgument,
    landlord_likely_response: landlordLikelyResponse,
    your_rebuttal: yourRebuttal,
    walk_away_threshold: walkAwayThreshold,
  };

  return result;
}
