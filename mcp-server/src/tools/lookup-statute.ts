import { z } from "zod";
import { embed } from "../lib/embeddings.js";
import { supabase } from "../lib/supabase.js";
import type { ClauseType, Statute } from "../types.js";

export const toolDefinition = {
  name: "lookup_statute",
  description:
    "Retrieve relevant Ontario statutes from the database for a given clause. Uses vector similarity search with a keyword fallback.",
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
      focus_keywords: {
        type: "array",
        items: { type: "string" },
        description: "Optional additional keywords to focus the search",
      },
    },
    required: ["clause_type", "clause_text", "jurisdiction_code"],
  },
};

const InputSchema = z.object({
  clause_type: z.string(),
  clause_text: z.string(),
  jurisdiction_code: z.string(),
  focus_keywords: z.array(z.string()).optional(),
});

interface StatuteRow {
  id: string;
  act_name: string;
  section_number: string;
  section_title: string;
  full_text: string;
  url: string;
  relevance_score: number;
  corpus_version: string;
}

interface LookupResult {
  statutes: Statute[];
  retrieval_confidence: number;
  fallback_used: boolean;
}

async function vectorSearch(
  embedding: number[],
  jurisdictionCode: string,
  threshold: number,
  limit: number
): Promise<Statute[]> {
  const { data, error } = await supabase.rpc("search_statutes", {
    query_embedding: embedding,
    jurisdiction: jurisdictionCode,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Supabase RPC search_statutes failed: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return (data as StatuteRow[]).map((row) => ({
    id: row.id,
    act_name: row.act_name,
    section_number: row.section_number,
    section_title: row.section_title,
    text: row.full_text,
    url: row.url,
    relevance_score: row.relevance_score,
    last_verified: row.corpus_version,
  }));
}

async function keywordFallback(
  queryText: string,
  jurisdictionCode: string,
  limit: number
): Promise<Statute[]> {
  // Extract the most meaningful words (skip stop words)
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "this", "that", "is", "are", "was", "were",
    "be", "been", "have", "has", "had", "do", "does", "did", "will", "would",
    "shall", "should", "may", "might", "can", "could", "tenant", "landlord",
  ]);

  const words = queryText
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  if (words.length === 0) {
    return [];
  }

  // Use the top 5 most meaningful words
  const searchTerms = [...new Set(words)].slice(0, 5);

  // Build ilike conditions
  const ilikeConditions = searchTerms
    .map((term) => `full_text.ilike.%${term}%`)
    .join(",");

  const { data, error } = await supabase
    .from("statutes")
    .select("id, act_name, section_number, section_title, full_text, url, corpus_version")
    .eq("jurisdiction_code", jurisdictionCode)
    .or(ilikeConditions)
    .limit(limit);

  if (error) {
    throw new Error(`Supabase keyword fallback failed: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return (data as Omit<StatuteRow, "relevance_score">[]).map((row) => ({
    id: row.id,
    act_name: row.act_name,
    section_number: row.section_number,
    section_title: row.section_title,
    text: row.full_text,
    url: row.url,
    relevance_score: 0.3, // Low score for keyword fallback results
    last_verified: row.corpus_version,
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

  const { clause_type, clause_text, jurisdiction_code, focus_keywords } =
    parsed.data;

  if (!clause_text || clause_text.trim().length === 0) {
    return {
      statutes: [],
      retrieval_confidence: 0,
      fallback_used: false,
    } satisfies LookupResult;
  }

  // Build query string
  const queryParts = [clause_type.replace(/_/g, " "), clause_text];
  if (focus_keywords && focus_keywords.length > 0) {
    queryParts.push(focus_keywords.join(" "));
  }
  const queryString = queryParts.join(" ").slice(0, 2000); // Cap at 2000 chars for embedding

  let statutes: Statute[] = [];
  let fallbackUsed = false;
  let embeddingFailed = false;

  // Attempt vector search
  try {
    const embedding = await embed(queryString);
    statutes = await vectorSearch(embedding, jurisdiction_code, 0.45, 3);
  } catch (err) {
    embeddingFailed = true;
    // Log but continue to fallback
    console.error(
      `Vector search failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Keyword fallback if vector returned < 2 results or embedding failed
  if (statutes.length < 2) {
    try {
      const fallbackResults = await keywordFallback(
        queryString,
        jurisdiction_code,
        3
      );

      if (fallbackResults.length > 0) {
        // Merge: add fallback results not already in statutes
        const existingIds = new Set(statutes.map((s) => s.id));
        const newResults = fallbackResults.filter(
          (r) => !existingIds.has(r.id)
        );
        statutes = [...statutes, ...newResults].slice(0, 3);
        fallbackUsed = true;
      }
    } catch (err) {
      console.error(
        `Keyword fallback failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Calculate retrieval confidence
  let retrievalConfidence: number;
  if (statutes.length === 0) {
    retrievalConfidence = 0;
  } else if (embeddingFailed && fallbackUsed) {
    retrievalConfidence = 0.3;
  } else if (fallbackUsed) {
    retrievalConfidence = 0.5;
  } else {
    const avgSimilarity =
      statutes.reduce((sum, s) => sum + s.relevance_score, 0) / statutes.length;
    retrievalConfidence = Math.min(0.95, avgSimilarity + 0.1);
  }

  return {
    statutes,
    retrieval_confidence: Math.round(retrievalConfidence * 100) / 100,
    fallback_used: fallbackUsed,
  } satisfies LookupResult;
}
