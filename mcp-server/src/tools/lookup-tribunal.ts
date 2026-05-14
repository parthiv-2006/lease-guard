import { z } from "zod";
import { embed } from "../lib/embeddings.js";
import { supabase } from "../lib/supabase.js";
import type { ClauseType, Decision } from "../types.js";

export const toolDefinition = {
  name: "lookup_tribunal",
  description:
    "Retrieve relevant tribunal decisions from the database for a given clause. Uses vector similarity search, preferring decisions from the last 5 years.",
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
  similarity: number;
}

interface LookupResult {
  decisions: Decision[];
  total_found: number;
  retrieval_confidence: number;
}

function fiveYearsAgoISO(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

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
    similarity_threshold: threshold,
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
    relevance_score: row.similarity,
  }));
}

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

  // Build query string
  const queryParts = [clause_type.replace(/_/g, " "), clause_text];
  if (risk_angle) {
    queryParts.push(risk_angle);
  }
  const queryString = queryParts.join(" ").slice(0, 2000);

  let decisions: Decision[] = [];
  let embeddingFailed = false;
  let retrieval_confidence = 0;

  try {
    const embedding = await embed(queryString);

    // First pass: restrict to last 5 years
    const cutoffDate = fiveYearsAgoISO();
    decisions = await vectorSearchDecisions(
      embedding,
      jurisdiction_code,
      0.45,
      5,
      cutoffDate
    );

    // Fallback to all dates if < 2 recent results
    if (decisions.length < 2) {
      const allDecisions = await vectorSearchDecisions(
        embedding,
        jurisdiction_code,
        0.45,
        5
      );

      // Merge: keep recent ones, add older ones not already included
      const existingCases = new Set(decisions.map((d) => d.case_number));
      const olderDecisions = allDecisions.filter(
        (d) => !existingCases.has(d.case_number)
      );
      decisions = [...decisions, ...olderDecisions].slice(0, 5);
    }

    if (decisions.length > 0) {
      const avgSimilarity =
        decisions.reduce((sum, d) => sum + d.relevance_score, 0) /
        decisions.length;
      retrieval_confidence = Math.min(0.95, avgSimilarity + 0.1);
    }
  } catch (err) {
    embeddingFailed = true;
    console.error(
      `Decision search failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (embeddingFailed || decisions.length === 0) {
    // Attempt plain text search as fallback on empty corpus or embedding failure
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
          .from("decisions")
          .select(
            "case_number, decision_date, ruling_summary, outcome, relevant_principle, url"
          )
          .eq("jurisdiction_code", jurisdiction_code)
          .or(ilikeConditions)
          .limit(5);

        if (!error && Array.isArray(data) && data.length > 0) {
          decisions = (
            data as Omit<DecisionRow, "similarity">[]
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
