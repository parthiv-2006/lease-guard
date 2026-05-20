// LeaseGuard — shared TypeScript types (matches lg-data.js shape)

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type SeverityLevel = "critical" | "important" | "minor";
export type Priority = "high" | "medium" | "low";

export interface StatutoryViolation {
  statute_section: string;
  violation_description: string;
}

export interface Clause {
  id: string;
  number: string;
  heading: string;
  primary_type: string;
  raw_text: string;
  risk_score: number;
  risk_level: RiskLevel;
  is_potentially_unenforceable: boolean;
  is_unusual: boolean;
  is_standard: boolean;
  plain_english_explanation: string;
  risk_reasoning: string;
  statutory_violations: StatutoryViolation[];
  has_negotiation_point: boolean;
}

export interface Contradiction {
  id: string;
  clause_a_id: string;
  clause_b_id: string;
  clause_a_label: string;
  clause_b_label: string;
  contradiction_type: string;
  severity: RiskLevel;
  explanation: string;
  which_governs: string;
  legal_basis: string;
}

export interface MissingProtection {
  id: string;
  protection_name: string;
  rta_section: string;
  severity: SeverityLevel;
  explanation: string;
  risk_if_missing: string;
  suggested_addition: string;
}

export interface NegotiationPoint {
  id: string;
  clause_id: string;
  clause_label: string;
  priority: Priority;
  negotiable: boolean;
  walk_away_threshold: boolean;
  ask: string;
  counter_language: string;
  legal_argument: string;
  landlord_likely_response: string;
  your_rebuttal: string;
}

export interface Source {
  id: string;
  act_name: string;
  section_number: string;
  section_title: string;
  full_text: string;
  url: string;
  relevance_score: number;
  corpus_version: string;
  relevant_clauses: string[];
}

export interface TraceStep {
  id: string;
  sequence: number;
  tool_name: string;
  /** ISO 8601 wall-clock start time of this tool call. May be absent on very old reports. */
  called_at: string;
  duration_ms: number;
  success: boolean;
  input_summary: Record<string, unknown>;
  output_summary: Record<string, unknown>;
}

export interface LeaseInfo {
  id: string;
  address: string;
  city: string;
  landlord: string;
  term: string;
  monthly_rent: string;
  uploaded_at: string;
  page_count: number;
  extraction_method: string;
  jurisdiction: string;
  filename: string;
  pdf_url?: string | null;
}

export interface OverallInfo {
  risk_score: number;
  risk_level: RiskLevel;
  executive_summary: string;
  clause_count: number;
  red_flag_count: number;
  contradiction_count: number;
  missing_count: number;
  negotiation_count: number;
  corpus_version: string;
  corpus_date: string;
  analysis_time_s: number;
}

export interface Report {
  lease: LeaseInfo;
  overall: OverallInfo;
  clauses: Clause[];
  contradictions: Contradiction[];
  missing_protections: MissingProtection[];
  negotiation_points: NegotiationPoint[];
  sources: Source[];
  agent_trace: TraceStep[];
  expires_at?: string;
  share_url?: string | null;
  disclaimer?: string;
}

export type PanelId =
  | "overview"
  | "redflags"
  | "clauses"
  | "negotiation"
  | "missing"
  | "contradictions"
  | "sources"
  | "trace";
