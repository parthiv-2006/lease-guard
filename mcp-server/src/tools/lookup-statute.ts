import { z } from "zod";
import { embed } from "../lib/embeddings.js";
import { supabase } from "../lib/supabase.js";
import type { Statute } from "../types.js";

export const toolDefinition = {
  name: "lookup_statute",
  description:
    "Retrieve relevant Ontario statutes from the database for a given clause. Uses multi-query vector similarity search with Reciprocal Rank Fusion, plus a keyword fallback.",
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

// ---------------------------------------------------------------------------
// Query #3 — statute-targeted keyword phrases per clause type.
// Each phrase uses vocabulary that closely matches how the RTA corpus row for
// that section is worded, maximising cosine similarity to the correct row.
// ---------------------------------------------------------------------------
const CLAUSE_TYPE_QUERY_PHRASES: Record<string, string> = {
  rent_payment:
    "rent payment obligation due date monthly Ontario Residential Tenancies Act section 12",
  rent_increase:
    "rent increase notice guideline percentage cap Ontario RTA section 116 120 128",
  security_deposit:
    "security deposit last month rent key deposit limit refund Ontario RTA section 105 106",
  entry_rights:
    "landlord entry written notice 24 hours tenant consent emergency Ontario RTA section 26 27",
  maintenance_repairs:
    "maintenance repairs good repair habitable standard landlord obligation Ontario RTA section 20 29",
  subletting_assignment:
    "subletting assignment sublet consent unreasonably withheld Ontario RTA section 97 98",
  early_termination:
    "early termination notice grounds eviction Ontario RTA section 37 38 44 48 60 61",
  renewal_terms:
    "lease renewal automatic month-to-month tenancy continuation Ontario RTA section 95 96",
  utilities:
    "utilities heat water electricity included rental unit obligation Ontario RTA",
  pets:
    "pets no-pet clause void unenforceable Ontario RTA section 14",
  alterations:
    "alterations improvements restoration tenant obligation consent Ontario RTA",
  quiet_enjoyment:
    "quiet enjoyment interference substantial interference harassment Ontario RTA section 22 23",
  liability_indemnification:
    "liability indemnification waiver release tenant rights Ontario RTA",
  dispute_resolution:
    "dispute resolution Landlord Tenant Board application hearing Ontario RTA",
  parking_storage:
    "parking storage locker additional services fee Ontario RTA",
  guest_policy:
    "guest occupant visitor overnight policy Ontario RTA",
  standard_boilerplate:
    "standard lease terms Ontario RTA Residential Tenancies Act form",
  unknown:
    "Ontario Residential Tenancies Act tenant landlord rights obligations",
};

// ---------------------------------------------------------------------------
// buildQueries — generates 3 distinct query strings for a clause.
//
//  Q1 — Raw clause text:  captures the exact vocabulary in the clause itself.
//  Q2 — Risk-angle phrase: focuses on the risk dimension (from focus_keywords
//       if provided, or a generic clause-type + jurisdiction phrase).
//  Q3 — Statute-targeted: uses vocabulary that matches the RTA corpus row
//       for this clause type, improving recall on specific subsections.
// ---------------------------------------------------------------------------
function buildQueries(
  clauseType: string,
  clauseText: string,
  focusKeywords?: string[]
): [string, string, string] {
  const q1 = clauseText.slice(0, 1000);

  const riskPhrase =
    focusKeywords && focusKeywords.length > 0
      ? focusKeywords.join(" ")
      : `${clauseType.replace(/_/g, " ")} tenant rights Ontario lease`;
  const q2 = `${clauseType.replace(/_/g, " ")} ${riskPhrase}`.slice(0, 500);

  const q3 =
    CLAUSE_TYPE_QUERY_PHRASES[clauseType] ??
    `${clauseType.replace(/_/g, " ")} Ontario Residential Tenancies Act`;

  return [q1, q2, q3];
}

// ---------------------------------------------------------------------------
// reciprocalRankFusion — merges multiple ranked result lists into one.
//
// Algorithm: for each document d appearing in any list, its RRF score is the
// sum over all lists of 1 / (k + rank(d)), where rank is 1-indexed and k=60
// is the standard damping constant (Robertson 2009).
//
// Final score = 70 % normalised RRF + 30 % max cosine similarity.
// The cosine component rewards documents that scored well on at least one query.
// Results are sorted descending and deduplicated by statute ID.
// ---------------------------------------------------------------------------
function reciprocalRankFusion(resultLists: Statute[][], k = 60): Statute[] {
  const scoreMap = new Map<
    string,
    { statute: Statute; rrfScore: number; maxCosine: number }
  >();

  for (const list of resultLists) {
    for (let i = 0; i < list.length; i++) {
      const statute = list[i];
      const rrfContribution = 1 / (k + i + 1); // 1-indexed rank

      const existing = scoreMap.get(statute.id);
      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.maxCosine = Math.max(existing.maxCosine, statute.relevance_score);
      } else {
        scoreMap.set(statute.id, {
          statute,
          rrfScore: rrfContribution,
          maxCosine: statute.relevance_score,
        });
      }
    }
  }

  // Normalise: max possible RRF score when a doc ranks #1 in every list
  const maxRRF = resultLists.length / (k + 1);

  return Array.from(scoreMap.values())
    .map(({ statute, rrfScore, maxCosine }) => {
      const normalizedRRF = maxRRF > 0 ? rrfScore / maxRRF : 0;
      const blended = 0.7 * normalizedRRF + 0.3 * maxCosine;
      return {
        ...statute,
        relevance_score: Math.round(blended * 1000) / 1000,
      };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score);
}

// ---------------------------------------------------------------------------
// hybridSearch — ROADMAP 2.2: pgvector cosine + PostgreSQL FTS merged via
// in-database RRF.  Calls the search_statutes_hybrid RPC introduced in
// migration 005.  If the migration has not been applied yet (PGRST202),
// gracefully falls back to the pure-vector vectorSearch() below.
// ---------------------------------------------------------------------------
async function hybridSearch(
  embedding: number[],
  queryText: string,
  jurisdictionCode: string,
  threshold: number,
  limit: number
): Promise<Statute[]> {
  const { data, error } = await supabase.rpc("search_statutes_hybrid", {
    query_embedding: embedding,
    query_text: queryText,
    jurisdiction: jurisdictionCode,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    // PGRST202 = RPC function not found — migration 005 not yet applied
    if (
      error.code === "PGRST202" ||
      (error.message ?? "").includes("search_statutes_hybrid")
    ) {
      console.warn(
        "[lookup-statute] search_statutes_hybrid not found — falling back to pure vector search. " +
          "Apply supabase/migrations/005_hybrid_search.sql to enable hybrid search."
      );
      return vectorSearch(embedding, jurisdictionCode, threshold, limit);
    }
    throw new Error(`Supabase hybrid search failed: ${error.message}`);
  }

  if (!Array.isArray(data)) return [];

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

// ---------------------------------------------------------------------------
// vectorSearch — single embedding → pgvector cosine search (fallback)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// keywordFallback — ilike-based Supabase query when vector returns < 2 results
// ---------------------------------------------------------------------------
async function keywordFallback(
  queryText: string,
  jurisdictionCode: string,
  limit: number
): Promise<Statute[]> {
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

  const searchTerms = [...new Set(words)].slice(0, 5);
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
    relevance_score: 0.3,
    last_verified: row.corpus_version,
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

  const { clause_type, clause_text, jurisdiction_code, focus_keywords } =
    parsed.data;

  if (!clause_text || clause_text.trim().length === 0) {
    return {
      statutes: [],
      retrieval_confidence: 0,
      fallback_used: false,
    } satisfies LookupResult;
  }

  // Build 3 queries targeting different aspects of the clause
  const [q1, q2, q3] = buildQueries(clause_type, clause_text, focus_keywords);

  let statutes: Statute[] = [];
  let fallbackUsed = false;
  let embeddingFailed = false;

  try {
    // Embed all 3 queries in parallel using RETRIEVAL_QUERY task type
    const [emb1, emb2, emb3] = await Promise.all([
      embed(q1, "RETRIEVAL_QUERY"),
      embed(q2, "RETRIEVAL_QUERY"),
      embed(q3, "RETRIEVAL_QUERY"),
    ]);

    // Run 3 hybrid searches in parallel (ROADMAP 2.2: vector + FTS + in-DB RRF)
    // Threshold 0.55 (slightly lower than pure-vector 0.60 — FTS compensates for
    // near-misses and the DB-level RRF re-ranks by combined signal).
    // Falls back to pure vector if migration 005 has not been applied.
    const [results1, results2, results3] = await Promise.all([
      hybridSearch(emb1, q1, jurisdiction_code, 0.55, 5),
      hybridSearch(emb2, q2, jurisdiction_code, 0.55, 5),
      hybridSearch(emb3, q3, jurisdiction_code, 0.55, 5),
    ]);

    // Merge via Reciprocal Rank Fusion and keep top 5
    const merged = reciprocalRankFusion([results1, results2, results3]);
    statutes = merged.slice(0, 5);
  } catch (err) {
    embeddingFailed = true;
    console.error(
      `Multi-query vector search failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Keyword fallback if vector returned < 2 results or embedding failed
  if (statutes.length < 2) {
    try {
      // Use Q3 (statute-targeted) as the keyword fallback query for best precision
      const fallbackResults = await keywordFallback(q3, jurisdiction_code, 5);

      if (fallbackResults.length > 0) {
        const existingIds = new Set(statutes.map((s) => s.id));
        const newResults = fallbackResults.filter((r) => !existingIds.has(r.id));
        statutes = [...statutes, ...newResults].slice(0, 5);
        fallbackUsed = true;
      }
    } catch (err) {
      console.error(
        `Keyword fallback failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Compute retrieval confidence
  let retrievalConfidence: number;
  if (statutes.length === 0) {
    retrievalConfidence = 0;
  } else if (embeddingFailed && fallbackUsed) {
    retrievalConfidence = 0.3;
  } else if (fallbackUsed) {
    retrievalConfidence = 0.5;
  } else {
    const avgBlended =
      statutes.reduce((sum, s) => sum + s.relevance_score, 0) / statutes.length;
    retrievalConfidence = Math.min(0.95, avgBlended + 0.1);
  }

  return {
    statutes,
    retrieval_confidence: Math.round(retrievalConfidence * 100) / 100,
    fallback_used: fallbackUsed,
  } satisfies LookupResult;
}
