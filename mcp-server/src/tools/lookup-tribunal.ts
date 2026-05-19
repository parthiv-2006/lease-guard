import { z } from "zod";
import { embed } from "../lib/embeddings.js";
import { supabase } from "../lib/supabase.js";
import type { Decision } from "../types.js";

export const toolDefinition = {
  name: "lookup_tribunal",
  description:
    "Retrieve relevant LTB tribunal decisions from the database for a given clause. Uses multi-query vector similarity search with Reciprocal Rank Fusion, preferring decisions from the last 5 years.",
  inputSchema: {
    type: "object" as const,
    properties: {
      clause_type: {
        type: "string",
        description: "The ClauseType of the clause",
      },
      clause_text: {
        type: "string",
        description: "The raw text of the clause",
      },
      jurisdiction_code: {
        type: "string",
        description: "The jurisdiction code e.g. CA-ON",
      },
      risk_angle: {
        type: "string",
        description:
          "Optional description of the risk angle to focus the search",
      },
    },
    required: ["clause_type", "clause_text", "jurisdiction_code"],
  },
};

const InputSchema = z.object({
  clause_type: z.string(),
  clause_text: z.string(),
  jurisdiction_code: z.string(),
  risk_angle: z.string().optional(),
});

interface DecisionRow {
  case_number: string;
  decision_date: string;
  ruling_summary: string;
  outcome: "tenant_favour" | "landlord_favour" | "mixed";
  relevant_principle: string;
  url: string;
  relevance_score: number;
}

interface LookupResult {
  decisions: Decision[];
  total_found: number;
  retrieval_confidence: number;
}

// ---------------------------------------------------------------------------
// Decision-focused query phrases per clause type.
// Targets the kind of language found in LTB ruling summaries.
// ---------------------------------------------------------------------------
const DECISION_TYPE_QUERY_PHRASES: Record<string, string> = {
  entry_rights:
    "landlord entry without notice harassment illegal entry Ontario LTB ruling tenant remedy",
  security_deposit:
    "security deposit key deposit non-refundable charge illegal void Ontario LTB order repayment",
  maintenance_repairs:
    "maintenance failure disrepair uninhabitable standard landlord obligation Ontario LTB remedy",
  rent_increase:
    "above guideline rent increase illegal unauthorized Ontario LTB ruling",
  early_termination:
    "N12 N13 N4 bad faith eviction early termination notice Ontario LTB decision",
  subletting_assignment:
    "sublet assignment consent unreasonably withheld refused Ontario LTB",
  quiet_enjoyment:
    "interference quiet enjoyment substantial interference harassment Ontario LTB",
  rent_payment:
    "rent arrears N4 notice termination payment plan Ontario LTB",
  renewal_terms:
    "lease renewal automatic continuation month-to-month Ontario LTB",
  utilities:
    "utilities heat water electricity withheld landlord obligation Ontario LTB",
  pets:
    "no-pet clause void unenforceable eviction pets Ontario LTB",
  alterations:
    "alterations restoration tenant landlord consent damage Ontario LTB",
  liability_indemnification:
    "liability waiver tenant rights void unenforceable Ontario LTB",
  dispute_resolution:
    "Landlord Tenant Board jurisdiction application hearing Ontario",
  standard_boilerplate:
    "Ontario Residential Tenancies Act standard lease compliance LTB",
  unknown:
    "Ontario LTB Landlord Tenant Board ruling tenant landlord rights",
};

function fiveYearsAgoISO(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// buildDecisionQueries — 3 queries targeting different aspects
//
//  Q1 — Raw clause text: captures clause vocabulary
//  Q2 — Risk-angle phrase: focuses on the legal risk dimension
//  Q3 — Decision-targeted: uses LTB ruling summary vocabulary
// ---------------------------------------------------------------------------
function buildDecisionQueries(
  clauseType: string,
  clauseText: string,
  riskAngle?: string
): [string, string, string] {
  const q1 = clauseText.slice(0, 1000);

  const riskPhrase =
    riskAngle ??
    `${clauseType.replace(/_/g, " ")} tenant rights Ontario LTB decision`;
  const q2 = `${clauseType.replace(/_/g, " ")} ${riskPhrase}`.slice(0, 500);

  const q3 =
    DECISION_TYPE_QUERY_PHRASES[clauseType] ??
    `${clauseType.replace(/_/g, " ")} Ontario Landlord Tenant Board ruling`;

  return [q1, q2, q3];
}

// ---------------------------------------------------------------------------
// reciprocalRankFusion for Decision lists
// ---------------------------------------------------------------------------
function reciprocalRankFusion(resultLists: Decision[][], k = 60): Decision[] {
  const scoreMap = new Map<
    string,
    { decision: Decision; rrfScore: number; maxCosine: number }
  >();

  for (const list of resultLists) {
    for (let i = 0; i < list.length; i++) {
      const decision = list[i];
      const rrfContribution = 1 / (k + i + 1);

      const existing = scoreMap.get(decision.case_number);
      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.maxCosine = Math.max(existing.maxCosine, decision.relevance_score);
      } else {
        scoreMap.set(decision.case_number, {
          decision,
          rrfScore: rrfContribution,
          maxCosine: decision.relevance_score,
        });
      }
    }
  }

  const maxRRF = resultLists.length / (k + 1);

  return Array.from(scoreMap.values())
    .map(({ decision, rrfScore, maxCosine }) => {
      const normalizedRRF = maxRRF > 0 ? rrfScore / maxRRF : 0;
      const blended = 0.7 * normalizedRRF + 0.3 * maxCosine;
      return {
        ...decision,
        relevance_score: Math.round(blended * 1000) / 1000,
      };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score);
}

// ---------------------------------------------------------------------------
// vectorSearchDecisions — single embedding → pgvector cosine search
// ---------------------------------------------------------------------------
async function vectorSearchDecisions(
  embedding: number[],
  jurisdictionCode: string,
  threshold: number,
  limit: number,
  minDate?: string
): Promise<Decision[]> {
  const rpcParams: Record<string, unknown> = {
    query_embedding: embedding,
    jurisdiction: jurisdictionCode,
    match_threshold: threshold,
    match_count: limit,
  };

  if (minDate) {
    rpcParams["min_decision_date"] = minDate;
  }

  const { data, error } = await supabase.rpc("search_decisions", rpcParams);

  if (error) {
    throw new Error(`Supabase RPC search_decisions failed: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return (data as DecisionRow[]).map((row) => ({
    case_number: row.case_number,
    decision_date: row.decision_date,
    ruling_summary: row.ruling_summary,
    outcome: row.outcome,
    relevant_principle: row.relevant_principle,
    url: row.url,
    relevance_score: row.relevance_score,
  }));
}

// ---------------------------------------------------------------------------
// execute — main entry point
// ---------------------------------------------------------------------------
export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { clause_type, clause_text, jurisdiction_code, risk_angle } =
    parsed.data;

  if (!clause_text || clause_text.trim().length === 0) {
    return {
      decisions: [],
      total_found: 0,
      retrieval_confidence: 0,
    } satisfies LookupResult;
  }

  const [q1, q2, q3] = buildDecisionQueries(clause_type, clause_text, risk_angle);

  let decisions: Decision[] = [];
  let embeddingFailed = false;
  let retrieval_confidence = 0;

  try {
    // Embed all 3 queries in parallel
    const [emb1, emb2, emb3] = await Promise.all([
      embed(q1, "RETRIEVAL_QUERY"),
      embed(q2, "RETRIEVAL_QUERY"),
      embed(q3, "RETRIEVAL_QUERY"),
    ]);

    const cutoffDate = fiveYearsAgoISO();

    // First pass: restrict to last 5 years across all 3 queries
    const [recent1, recent2, recent3] = await Promise.all([
      vectorSearchDecisions(emb1, jurisdiction_code, 0.45, 5, cutoffDate),
      vectorSearchDecisions(emb2, jurisdiction_code, 0.45, 5, cutoffDate),
      vectorSearchDecisions(emb3, jurisdiction_code, 0.45, 5, cutoffDate),
    ]);

    let merged = reciprocalRankFusion([recent1, recent2, recent3]).slice(0, 5);

    // If < 2 recent results, expand to all dates
    if (merged.length < 2) {
      const [all1, all2, all3] = await Promise.all([
        vectorSearchDecisions(emb1, jurisdiction_code, 0.45, 5),
        vectorSearchDecisions(emb2, jurisdiction_code, 0.45, 5),
        vectorSearchDecisions(emb3, jurisdiction_code, 0.45, 5),
      ]);

      const allMerged = reciprocalRankFusion([all1, all2, all3]);
      const existingCases = new Set(merged.map((d) => d.case_number));
      const olderDecisions = allMerged.filter(
        (d) => !existingCases.has(d.case_number)
      );
      merged = [...merged, ...olderDecisions].slice(0, 5);
    }

    decisions = merged;

    if (decisions.length > 0) {
      const avgBlended =
        decisions.reduce((sum, d) => sum + d.relevance_score, 0) /
        decisions.length;
      retrieval_confidence = Math.min(0.95, avgBlended + 0.1);
    }
  } catch (err) {
    embeddingFailed = true;
    console.error(
      `Multi-query decision search failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Keyword fallback if corpus empty or embedding failed
  if (embeddingFailed || decisions.length === 0) {
    try {
      const stopWords = new Set([
        "the", "a", "an", "and", "or", "in", "on", "to", "of", "with",
        "tenant", "landlord", "lease", "agreement",
      ]);

      const words = clause_text
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !stopWords.has(w))
        .slice(0, 4);

      if (words.length > 0) {
        const ilikeConditions = words
          .map((w) => `ruling_summary.ilike.%${w}%`)
          .join(",");

        const { data, error } = await supabase
          .from("tribunal_decisions")
          .select(
            "case_number, decision_date, ruling_summary, outcome, relevant_principle, url"
          )
          .eq("jurisdiction_code", jurisdiction_code)
          .or(ilikeConditions)
          .limit(5);

        if (!error && Array.isArray(data) && data.length > 0) {
          decisions = (
            data as Omit<DecisionRow, "relevance_score">[]
          ).map((row) => ({
            case_number: row.case_number,
            decision_date: row.decision_date,
            ruling_summary: row.ruling_summary,
            outcome: row.outcome,
            relevant_principle: row.relevant_principle,
            url: row.url,
            relevance_score: 0.25,
          }));
          retrieval_confidence = 0.25;
        }
      }
    } catch {
      // Keyword fallback also failed — return empty
    }
  }

  return {
    decisions,
    total_found: decisions.length,
    retrieval_confidence: Math.round(retrieval_confidence * 100) / 100,
  } satisfies LookupResult;
}
