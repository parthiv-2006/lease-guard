import { z } from "zod";

export const toolDefinition = {
  name: "detect_jurisdiction",
  description:
    "Detect the legal jurisdiction of a lease document by analysing postal codes, province references, governing law clauses, and act names.",
  inputSchema: {
    type: "object" as const,
    properties: {
      raw_text: {
        type: "string",
        description: "The full raw text of the lease document",
      },
    },
    required: ["raw_text"],
  },
};

const InputSchema = z.object({
  raw_text: z.string().min(1, "raw_text must not be empty"),
});

interface JurisdictionResult {
  jurisdiction: string;
  jurisdiction_code: string;
  confidence: number;
  detection_basis: string[];
  governing_law_clause?: string;
  supported: boolean;
}

// Ontario postal code prefixes
const ONTARIO_POSTAL_PREFIXES = ["M", "K", "L", "N", "P"];

// Province name/abbreviation → code map
const PROVINCE_MAP: Record<string, string> = {
  ontario: "CA-ON",
  "on ": "CA-ON",
  " on,": "CA-ON",
  ", on ": "CA-ON",
  "ontario,": "CA-ON",
  "british columbia": "CA-BC",
  " bc,": "CA-BC",
  ", bc ": "CA-BC",
  "bc ": "CA-BC",
  alberta: "CA-AB",
  " ab,": "CA-AB",
  ", ab ": "CA-AB",
  "ab ": "CA-AB",
  "nova scotia": "CA-NS",
  "new brunswick": "CA-NB",
  manitoba: "CA-MB",
  saskatchewan: "CA-SK",
  quebec: "CA-QC",
  "québec": "CA-QC",
  "prince edward island": "CA-PE",
  "newfoundland": "CA-NL",
  "northwest territories": "CA-NT",
  nunavut: "CA-NU",
  yukon: "CA-YT",
};

// Ontario-specific act references
const ONTARIO_ACT_PATTERNS = [
  /residential\s+tenancies\s+act/i,
  /\bRTA\b/,
  /rent\s+control\s+act/i,
  /landlord\s+and\s+tenant\s+board/i,
  /\bLTB\b/,
  /ontario\s+standard\s+lease/i,
  /ontario\s+regulation/i,
];

// International indicators (not Canadian)
const INTERNATIONAL_PATTERNS = [
  /laws?\s+of\s+the\s+state\s+of/i,
  /laws?\s+of\s+england/i,
  /laws?\s+of\s+the\s+united\s+kingdom/i,
  /laws?\s+of\s+australia/i,
  /\bzip\s+code\b/i,
  /\bsocial\s+security\s+number\b/i,
];

function extractGoverningLawClause(text: string): string | undefined {
  const patterns = [
    /governing\s+law[^\n.]{0,300}/i,
    /this\s+(?:agreement|lease)\s+(?:shall\s+be\s+)?governed\s+by[^\n.]{0,300}/i,
    /applicable\s+law[^\n.]{0,300}/i,
    /jurisdiction[^\n.]{0,150}/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return undefined;
}

function detectPostalCodes(text: string): {
  province_code: string | null;
  matched: string[];
} {
  // Canadian postal code pattern: A1A 1A1
  const postalCodePattern = /\b([A-Z])\d[A-Z]\s*\d[A-Z]\d\b/g;
  const matches = [...text.matchAll(postalCodePattern)];

  if (matches.length === 0) {
    return { province_code: null, matched: [] };
  }

  const foundPrefixes = matches.map((m) => m[1]);
  const matchedCodes = matches.map((m) => m[0]);

  // Count Ontario prefixes
  const ontarioPrefixCount = foundPrefixes.filter((p) =>
    ONTARIO_POSTAL_PREFIXES.includes(p)
  ).length;

  if (ontarioPrefixCount > 0) {
    return { province_code: "CA-ON", matched: matchedCodes };
  }

  // B = Nova Scotia, T = Alberta, V = BC, R = Manitoba, S = Saskatchewan, G/H/J = Quebec
  const otherMap: Record<string, string> = {
    B: "CA-NS",
    T: "CA-AB",
    V: "CA-BC",
    R: "CA-MB",
    S: "CA-SK",
    G: "CA-QC",
    H: "CA-QC",
    J: "CA-QC",
  };

  const firstPrefix = foundPrefixes[0];
  if (firstPrefix && otherMap[firstPrefix]) {
    return { province_code: otherMap[firstPrefix], matched: matchedCodes };
  }

  return { province_code: null, matched: matchedCodes };
}

function detectFromProvinceNames(
  text: string
): { province_code: string | null; matched: string[] } {
  const lowerText = text.toLowerCase();

  for (const [name, code] of Object.entries(PROVINCE_MAP)) {
    if (lowerText.includes(name)) {
      return { province_code: code, matched: [name.trim()] };
    }
  }

  return { province_code: null, matched: [] };
}

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { raw_text } = parsed.data;

  const detectionBasis: string[] = [];
  const jurisdictionVotes: Map<string, number> = new Map();
  let confidence = 0;

  // Check for international indicators first
  for (const pattern of INTERNATIONAL_PATTERNS) {
    if (pattern.test(raw_text)) {
      return {
        jurisdiction: "International (non-Canadian)",
        jurisdiction_code: "INTL",
        confidence: 0.5,
        detection_basis: [
          `International indicator found: ${pattern.source.slice(0, 40)}`,
        ],
        governing_law_clause: extractGoverningLawClause(raw_text),
        supported: false,
      } satisfies JurisdictionResult;
    }
  }

  // Extract governing law clause
  const governingLawClause = extractGoverningLawClause(raw_text);
  if (governingLawClause) {
    const lowerClause = governingLawClause.toLowerCase();
    for (const [name, code] of Object.entries(PROVINCE_MAP)) {
      if (lowerClause.includes(name.toLowerCase())) {
        const current = jurisdictionVotes.get(code) ?? 0;
        jurisdictionVotes.set(code, current + 3); // High weight for explicit governing law
        detectionBasis.push(`Governing law clause references "${name.trim()}"`);
        break;
      }
    }
  }

  // Check Ontario act references
  const ontarioActMatches: string[] = [];
  for (const pattern of ONTARIO_ACT_PATTERNS) {
    const match = raw_text.match(pattern);
    if (match) {
      ontarioActMatches.push(match[0]);
    }
  }
  if (ontarioActMatches.length > 0) {
    const current = jurisdictionVotes.get("CA-ON") ?? 0;
    jurisdictionVotes.set("CA-ON", current + 2 * ontarioActMatches.length);
    detectionBasis.push(
      `Ontario legislation referenced: ${ontarioActMatches.slice(0, 3).join(", ")}`
    );
  }

  // Postal code detection
  const postalResult = detectPostalCodes(raw_text);
  if (postalResult.province_code) {
    const current = jurisdictionVotes.get(postalResult.province_code) ?? 0;
    jurisdictionVotes.set(postalResult.province_code, current + 2);
    detectionBasis.push(
      `Postal code(s) detected: ${postalResult.matched.slice(0, 3).join(", ")}`
    );
  }

  // Province name detection
  const provinceResult = detectFromProvinceNames(raw_text);
  if (provinceResult.province_code) {
    const current = jurisdictionVotes.get(provinceResult.province_code) ?? 0;
    jurisdictionVotes.set(provinceResult.province_code, current + 1);
    detectionBasis.push(
      `Province name found: ${provinceResult.matched.slice(0, 2).join(", ")}`
    );
  }

  if (jurisdictionVotes.size === 0) {
    return {
      jurisdiction: "Unknown",
      jurisdiction_code: "UNKNOWN",
      confidence: 0.1,
      detection_basis: ["No jurisdiction indicators found in document"],
      governing_law_clause: governingLawClause,
      supported: false,
    } satisfies JurisdictionResult;
  }

  // Find the province with the highest vote count
  let bestCode = "";
  let bestScore = 0;
  let totalScore = 0;

  for (const [code, score] of jurisdictionVotes.entries()) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }

  // Check for ambiguity (two provinces with close scores)
  const sortedVotes = [...jurisdictionVotes.entries()].sort(
    ([, a], [, b]) => b - a
  );
  const isAmbiguous =
    sortedVotes.length >= 2 &&
    sortedVotes[1][1] >= sortedVotes[0][1] * 0.7;

  if (isAmbiguous) {
    detectionBasis.push(
      `Ambiguous — multiple provinces detected: ${sortedVotes
        .slice(0, 2)
        .map(([c, s]) => `${c}(${s})`)
        .join(", ")}`
    );
    confidence = 0.3;
  } else {
    confidence = Math.min(0.95, bestScore / totalScore + 0.3);
  }

  // Province code → human name
  const provinceNames: Record<string, string> = {
    "CA-ON": "Ontario, Canada",
    "CA-BC": "British Columbia, Canada",
    "CA-AB": "Alberta, Canada",
    "CA-NS": "Nova Scotia, Canada",
    "CA-NB": "New Brunswick, Canada",
    "CA-MB": "Manitoba, Canada",
    "CA-SK": "Saskatchewan, Canada",
    "CA-QC": "Quebec, Canada",
    "CA-PE": "Prince Edward Island, Canada",
    "CA-NL": "Newfoundland and Labrador, Canada",
    "CA-NT": "Northwest Territories, Canada",
    "CA-NU": "Nunavut, Canada",
    "CA-YT": "Yukon, Canada",
  };

  const result: JurisdictionResult = {
    jurisdiction: provinceNames[bestCode] ?? bestCode,
    jurisdiction_code: bestCode,
    confidence,
    detection_basis: detectionBasis,
    governing_law_clause: governingLawClause,
    supported: bestCode === "CA-ON",
  };

  return result;
}
