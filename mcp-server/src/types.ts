export type ClauseType =
  | "rent_payment"
  | "rent_increase"
  | "security_deposit"
  | "entry_rights"
  | "maintenance_repairs"
  | "subletting_assignment"
  | "early_termination"
  | "renewal_terms"
  | "utilities"
  | "pets"
  | "alterations"
  | "quiet_enjoyment"
  | "liability_indemnification"
  | "dispute_resolution"
  | "parking_storage"
  | "guest_policy"
  | "standard_boilerplate"
  | "unknown";

export interface Clause {
  id: string;
  number: string;
  heading?: string;
  raw_text: string;
  char_start: number;
  char_end: number;
  cross_references: string[];
}

export interface Statute {
  id: string;
  act_name: string;
  section_number: string;
  section_title: string;
  text: string;
  url: string;
  relevance_score: number;
  last_verified: string;
}

export interface Decision {
  case_number: string;
  decision_date: string;
  ruling_summary: string;
  outcome: "tenant_favour" | "landlord_favour" | "mixed";
  relevant_principle: string;
  url: string;
  relevance_score: number;
}

export interface RiskScore {
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  is_potentially_unenforceable: boolean;
  is_unusual: boolean;
  is_standard: boolean;
  plain_english_explanation: string;
  risk_reasoning: string;
  statutory_violations: Array<{ statute_section: string; violation_description: string }>;
  confidence: number;
}

export interface NegotiationPoint {
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
