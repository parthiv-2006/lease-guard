import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import type { ClauseType } from "../types.js";

export const toolDefinition = {
  name: "benchmark_clause",
  description:
    "Compare a clause's risk score against anonymised historical lease clauses of the same type. Contributes the current clause to the benchmark pool.",
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
      risk_score: {
        type: "number",
        description: "The risk score (1-10) from score_risk",
      },
      jurisdiction_code: {
        type: "string",
        description: "Jurisdiction code e.g. CA-ON",
      },
    },
    required: ["clause_type", "clause_text", "risk_score", "jurisdiction_code"],
  },
};

const InputSchema = z.object({
  clause_type: z.string(),
  clause_text: z.string(),
  risk_score: z.number().min(1).max(10),
  jurisdiction_code: z.string(),
});

interface BenchmarkResult {
  sufficient_data: boolean;
  sample_size: number;
  percentile: number | null;
  comparison_label: string;
  average_risk_score: number | null;
  median_risk_score: number | null;
  contributed_to_pool: boolean;
}

// PII scrubbing patterns
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Full names (FirstName LastName patterns)
  {
    pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
    replacement: "[NAME]",
  },
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL]",
  },
  // Canadian postal codes
  {
    pattern: /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/g,
    replacement: "[POSTAL]",
  },
  // Street addresses (number + street name)
  {
    pattern: /\b\d{1,6}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Crescent|Cres|Court|Ct|Lane|Ln|Way|Place|Pl)\b/gi,
    replacement: "[ADDRESS]",
  },
  // Phone numbers
  {
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE]",
  },
  // Dollar amounts with specific figures
  {
    pattern: /\$\s*[\d,]+(?:\.\d{2})?/g,
    replacement: "$[AMOUNT]",
  },
  // Unit/apartment numbers
  {
    pattern: /(?:Unit|Apt|Suite|Apartment)\s*#?\s*\d+[A-Z]?/gi,
    replacement: "[UNIT]",
  },
  // SIN / SIN-like numbers
  {
    pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
    replacement: "[ID_NUMBER]",
  },
];

function anonymizeClauseText(text: string): string {
  let anonymized = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    anonymized = anonymized.replace(pattern, replacement);
  }
  return anonymized;
}

function computePercentile(scores: number[], targetScore: number): number {
  if (scores.length === 0) return 50;
  const countAtOrBelow = scores.filter((s) => s <= targetScore).length;
  return Math.round((countAtOrBelow / scores.length) * 100);
}

function percentileToLabel(percentile: number, riskScore: number): string {
  if (riskScore <= 3) {
    if (percentile >= 70) return "Lower risk than most comparable clauses";
    if (percentile >= 40) return "Typical low-risk clause for this type";
    return "Unusually low risk — may be missing tenant-protective language";
  }

  if (riskScore <= 6) {
    if (percentile >= 80)
      return "Higher risk than average — this clause is more restrictive than most";
    if (percentile >= 50) return "Moderate risk, comparable to average leases";
    if (percentile >= 30) return "Below-average risk for this clause type";
    return "Lower risk than most comparable clauses of this type";
  }

  // High risk (7-10)
  if (percentile >= 90)
    return "Critically high risk — among the most restrictive clauses in our database";
  if (percentile >= 70)
    return "High risk — significantly more restrictive than typical leases";
  if (percentile >= 50) return "Above-average risk for this clause type";
  return "Elevated risk, but not unusual for this clause type";
}

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { clause_type, clause_text, risk_score, jurisdiction_code } =
    parsed.data;

  // Fetch existing comparisons for this clause type + jurisdiction
  const { data: rows, error: fetchError } = await supabase
    .from("clause_comparisons")
    .select("risk_score")
    .eq("clause_type", clause_type)
    .eq("jurisdiction_code", jurisdiction_code);

  if (fetchError) {
    return {
      error: "Failed to fetch benchmark data",
      details: fetchError.message,
    };
  }

  const existingRows = Array.isArray(rows) ? rows : [];
  const sampleSize = existingRows.length;

  // Insufficient data check — require at least 10 rows
  if (sampleSize < 10) {
    // Still contribute this clause to grow the pool
    let contributed = false;
    try {
      const anonymizedText = anonymizeClauseText(clause_text);
      const { error: insertError } = await supabase
        .from("clause_comparisons")
        .insert({
          clause_type,
          jurisdiction_code,
          anonymized_text: anonymizedText,
          risk_score,
          created_at: new Date().toISOString(),
        });

      if (!insertError) contributed = true;
    } catch {
      // Non-critical — contribution failure should not break the analysis
    }

    return {
      sufficient_data: false,
      sample_size: sampleSize,
      percentile: null,
      comparison_label:
        "Insufficient data for meaningful benchmark. This clause has been added to the pool.",
      average_risk_score: null,
      median_risk_score: null,
      contributed_to_pool: contributed,
    } satisfies BenchmarkResult;
  }

  // Compute statistics
  const scores = existingRows.map(
    (r: { risk_score: number }) => r.risk_score
  );
  const percentile = computePercentile(scores, risk_score);
  const averageRiskScore =
    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

  const sorted = [...scores].sort((a, b) => a - b);
  const midIndex = Math.floor(sorted.length / 2);
  const medianRiskScore =
    sorted.length % 2 === 0
      ? (sorted[midIndex - 1] + sorted[midIndex]) / 2
      : sorted[midIndex];

  const comparisonLabel = percentileToLabel(percentile, risk_score);

  // Contribute current clause to the pool
  let contributed = false;
  try {
    const anonymizedText = anonymizeClauseText(clause_text);
    const { error: insertError } = await supabase
      .from("clause_comparisons")
      .insert({
        clause_type,
        jurisdiction_code,
        anonymized_text: anonymizedText,
        risk_score,
        created_at: new Date().toISOString(),
      });

    if (!insertError) contributed = true;
  } catch {
    // Non-critical
  }

  return {
    sufficient_data: true,
    sample_size: sampleSize,
    percentile,
    comparison_label: comparisonLabel,
    average_risk_score: averageRiskScore,
    median_risk_score: Math.round(medianRiskScore * 10) / 10,
    contributed_to_pool: contributed,
  } satisfies BenchmarkResult;
}
