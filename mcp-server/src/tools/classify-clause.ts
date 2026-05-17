import { z } from "zod";
import type { ClauseType } from "../types.js";

export const toolDefinition = {
  name: "classify_clause",
  description:
    "Classify a lease clause into a ClauseType category using keyword matching. Returns the primary type, confidence, and whether a legal statute lookup is required.",
  inputSchema: {
    type: "object" as const,
    properties: {
      clause_id: {
        type: "string",
        description: "The unique ID of the clause",
      },
      clause_text: {
        type: "string",
        description: "The raw text of the clause to classify",
      },
    },
    required: ["clause_id", "clause_text"],
  },
};

const InputSchema = z.object({
  clause_id: z.string().min(1, "clause_id must not be empty"),
  clause_text: z.string(),
});

type LookupPriority = "high" | "medium" | "low" | "none";

interface ClassificationResult {
  clause_id: string;
  primary_type: ClauseType;
  subtype: string | null;
  confidence: number;
  requires_legal_lookup: boolean;
  lookup_priority: LookupPriority;
  keywords: string[];
}

// Keyword sets per clause type (order matters — first match wins for primary)
const CLAUSE_KEYWORDS: Array<{
  type: ClauseType;
  keywords: string[];
  subtypeMap?: Record<string, string>;
  priority: LookupPriority;
}> = [
  {
    type: "entry_rights",
    keywords: [
      "right of entry", "landlord.*enter", "enter the unit", "entry notice",
      "access to the unit", "inspection", "enter the premises", "landlord access",
      "right to inspect", "24.hour notice", "24 hour notice",
    ],
    priority: "high",
  },
  {
    type: "security_deposit",
    keywords: [
      "security deposit", "last month", "last month's rent", "damage deposit",
      "key deposit", "deposit held", "return.*deposit", "deposit.*returned",
    ],
    priority: "high",
  },
  {
    type: "early_termination",
    keywords: [
      "early termination", "break clause", "lease break", "vacate.*early",
      "terminate.*lease", "terminate.*tenancy", "termination fee", "penalty.*terminat",
      "notice to terminate", "early.*vacate", "break.*lease",
    ],
    subtypeMap: {
      "penalty": "with_penalty",
      "fee": "with_fee",
      "notice": "with_notice",
    },
    priority: "high",
  },
  {
    type: "dispute_resolution",
    keywords: [
      "arbitration", "waive.*right", "waiver.*right", "mediation", "binding arbitration",
      "dispute.*resolution", "legal action", "court.*jurisdiction", "waive.*court",
      "class action waiver", "mandatory arbitration", "landlord.*tribunal",
      // RTA waiver / supersession patterns
      "supersedes", "supersede", "overrides", "override.*rta", "override.*act",
      "provincial law", "standard form of lease", "standard form", "notwithstanding.*rta",
      "notwithstanding.*act", "waive.*rta", "waive.*act", "exempt.*rta",
    ],
    subtypeMap: {
      "supersede": "rta_waiver",
      "override": "rta_waiver",
      "provincial law": "rta_waiver",
      "standard form": "non_standard_form",
      "arbitration": "arbitration",
      "mediation": "mediation",
    },
    priority: "high",
  },
  {
    type: "rent_payment",
    keywords: [
      "rent.*due", "monthly rent", "rent payment", "pay rent", "amount.*rent",
      "rent.*amount", "base rent", "total rent", "rent.*payable", "rent is due",
      "rental amount", "monthly.*payment", "first.*month.*rent",
      // Post-dated cheque requirement
      "post-dated", "post dated", "postdated", "post.dated cheque", "cheque",
      // Late fees and penalties
      "late.*fee", "late.*penalty", "late fee", "late penalty", "per day.*late",
      "penalty.*late", "nsf", "nsf fee", "bounced cheque", "bounced.*cheque",
      "non-sufficient", "insufficient funds",
    ],
    subtypeMap: {
      "late": "late_payment",
      "nsf": "nsf_fee",
      "post-dated": "post_dated_cheque",
      "postdated": "post_dated_cheque",
      "electronic": "e_transfer",
    },
    priority: "high",
  },
  {
    type: "rent_increase",
    keywords: [
      "rent increase", "rent.*increas", "annual.*increas", "guideline.*increas",
      "increas.*rent", "rent.*adjust", "CPI.*increas", "notice.*increas",
      "rent.*review",
    ],
    priority: "medium",
  },
  {
    type: "maintenance_repairs",
    keywords: [
      "maintenance", "repairs", "tenant.*repair", "landlord.*repair",
      "damage", "fix", "responsible.*repair", "repair.*responsible",
      "wear and tear", "maintenance.*obligation", "upkeep",
    ],
    subtypeMap: {
      "appliance": "appliances",
      "structural": "structural",
    },
    priority: "medium",
  },
  {
    type: "subletting_assignment",
    keywords: [
      "sublet", "sublease", "assignment", "assign.*lease", "sub-let",
      "subletting", "transfer.*tenancy", "assign.*tenancy", "prohibited.*sublet",
    ],
    priority: "high",
  },
  {
    type: "renewal_terms",
    keywords: [
      "renewal", "renew.*lease", "lease.*renewal", "month.to.month",
      "holdover", "automatic.*renewal", "option.*renew", "extend.*lease",
    ],
    priority: "medium",
  },
  {
    type: "quiet_enjoyment",
    keywords: [
      "quiet enjoyment", "peaceful enjoyment", "peaceful possession",
      "undisturbed.*possession", "covenant.*quiet", "right.*occupy",
    ],
    priority: "medium",
  },
  {
    type: "liability_indemnification",
    keywords: [
      "indemnif", "hold harmless", "liability", "liable", "negligence",
      "indemnity", "waive.*claim", "release.*claim", "not.*liable",
      "landlord.*not.*responsible",
    ],
    subtypeMap: {
      "personal injury": "personal_injury",
      "property damage": "property_damage",
    },
    priority: "medium",
  },
  {
    type: "utilities",
    keywords: [
      "utilities", "hydro", "electricity", "water", "gas", "heat",
      "internet", "cable", "utility.*included", "utility.*excluded",
      "tenant.*pay.*util", "landlord.*pay.*util",
    ],
    priority: "low",
  },
  {
    type: "pets",
    keywords: [
      "pets", "pet policy", "no pets", "pet.*allowed", "animal",
      "cat", "dog", "pet.*deposit", "pet.*fee", "pet.*prohibited",
    ],
    priority: "low",
  },
  {
    type: "alterations",
    keywords: [
      "alterations", "modification", "renovate", "paint", "nail holes",
      "alter.*unit", "change.*unit", "install", "tenant.*alter",
      "no.*alteration", "written.*consent.*alter",
    ],
    priority: "medium",
  },
  {
    type: "parking_storage",
    keywords: [
      "parking", "parking space", "storage", "locker", "parking.*included",
      "garage", "parking.*fee", "storage.*unit", "bicycle.*storage",
    ],
    priority: "low",
  },
  {
    type: "guest_policy",
    keywords: [
      "guest", "visitor", "overnight.*guest", "guest.*policy",
      "guest.*stay", "unauthorized.*occupant", "additional.*occupant",
    ],
    priority: "low",
  },
  {
    type: "standard_boilerplate",
    keywords: [
      "entire agreement", "severability", "waiver.*provision",
      "governing.*law", "notice.*in.*writing", "time.*essence",
      "successors.*assigns", "hereinafter", "witnesseth",
      "this agreement.*binding", "amendments.*writing",
    ],
    priority: "none",
  },
];

function detectSubtype(
  text: string,
  subtypeMap: Record<string, string> | undefined
): string | null {
  if (!subtypeMap) return null;
  const lowerText = text.toLowerCase();
  for (const [keyword, subtype] of Object.entries(subtypeMap)) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return subtype;
    }
  }
  return null;
}

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { clause_id, clause_text } = parsed.data;

  // Handle empty clause
  if (!clause_text || clause_text.trim().length === 0) {
    const result: ClassificationResult = {
      clause_id,
      primary_type: "unknown",
      subtype: null,
      confidence: 0,
      requires_legal_lookup: false,
      lookup_priority: "none",
      keywords: [],
    };
    return result;
  }

  const lowerText = clause_text.toLowerCase();
  const matchedKeywordsByType: Map<ClauseType, string[]> = new Map();

  // Score each type by counting keyword hits
  for (const { type, keywords } of CLAUSE_KEYWORDS) {
    const hits: string[] = [];
    for (const kw of keywords) {
      // Use regex to handle partial patterns
      try {
        const pattern = new RegExp(kw, "i");
        if (pattern.test(clause_text)) {
          hits.push(kw.replace(/\.\*/g, " ").replace(/\\/g, ""));
        }
      } catch {
        // Fallback to simple includes if regex is invalid
        if (lowerText.includes(kw.toLowerCase())) {
          hits.push(kw);
        }
      }
    }
    if (hits.length > 0) {
      matchedKeywordsByType.set(type, hits);
    }
  }

  if (matchedKeywordsByType.size === 0) {
    const result: ClassificationResult = {
      clause_id,
      primary_type: "unknown",
      subtype: null,
      confidence: 0.1,
      requires_legal_lookup: false,
      lookup_priority: "none",
      keywords: [],
    };
    return result;
  }

  // Find primary type: highest keyword hit count, respecting CLAUSE_KEYWORDS order for ties
  let primaryType: ClauseType = "unknown";
  let maxHits = 0;
  const matchedKeywords: string[] = [];

  for (const { type } of CLAUSE_KEYWORDS) {
    const hits = matchedKeywordsByType.get(type);
    if (hits && hits.length > maxHits) {
      maxHits = hits.length;
      primaryType = type;
    }
  }

  // Collect all matched keywords for the primary type
  const primaryHits = matchedKeywordsByType.get(primaryType) ?? [];
  matchedKeywords.push(...primaryHits);

  // Get config for primary type
  const typeConfig = CLAUSE_KEYWORDS.find((c) => c.type === primaryType);
  const subtype = typeConfig
    ? detectSubtype(clause_text, typeConfig.subtypeMap)
    : null;
  const lookupPriority: LookupPriority = typeConfig?.priority ?? "none";

  // Calculate confidence based on hit density
  const totalKeywords = typeConfig?.keywords.length ?? 1;
  const hitRatio = primaryHits.length / totalKeywords;
  const confidence = Math.min(
    0.95,
    0.4 + hitRatio * 0.55 + (matchedKeywordsByType.size === 1 ? 0.1 : 0)
  );

  // Mixed-type clause warning: if multiple types hit
  const isMixedType = matchedKeywordsByType.size > 1;
  const adjustedConfidence = isMixedType
    ? Math.max(0.3, confidence - 0.15)
    : confidence;

  const requiresLegalLookup =
    primaryType !== "standard_boilerplate" &&
    primaryType !== "unknown" &&
    lookupPriority !== "none";

  const result: ClassificationResult = {
    clause_id,
    primary_type: primaryType,
    subtype,
    confidence: Math.round(adjustedConfidence * 100) / 100,
    requires_legal_lookup: requiresLegalLookup,
    lookup_priority: lookupPriority,
    keywords: matchedKeywords.slice(0, 10),
  };

  return result;
}
