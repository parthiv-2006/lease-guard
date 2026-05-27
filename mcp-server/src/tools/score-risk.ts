import { z } from "zod";
import type { ClauseType, Statute, Decision, RiskScore } from "../types.js";

export const toolDefinition = {
  name: "score_risk",
  description:
    "Score the legal risk of a lease clause on a 1-10 scale. Requires retrieved statutes and decisions as grounding — never asserts law from training knowledge alone.",
  inputSchema: {
    type: "object" as const,
    properties: {
      clause_id: { type: "string" },
      clause_text: { type: "string" },
      clause_type: { type: "string" },
      retrieved_statutes: {
        type: "array",
        items: { type: "object" },
        description: "Statutes returned by lookup_statute",
      },
      retrieved_decisions: {
        type: "array",
        items: { type: "object" },
        description: "Decisions returned by lookup_tribunal",
      },
      jurisdiction_code: { type: "string" },
    },
    required: [
      "clause_id",
      "clause_text",
      "clause_type",
      "retrieved_statutes",
      "retrieved_decisions",
      "jurisdiction_code",
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
  retrieved_statutes: z.array(StatuteSchema),
  retrieved_decisions: z.array(DecisionSchema),
  jurisdiction_code: z.string(),
});

// ── Clause type helpers ───────────────────────────────────────────────────────

// Clause types that are standard — inherently lower risk baseline
// NOTE: "pets" intentionally excluded — no-pet clauses with fines/evictions are high risk
const STANDARD_BOILERPLATE_TYPES: ClauseType[] = [
  "standard_boilerplate",
  "utilities",
  "parking_storage",
  "guest_policy",
];

// High-risk clause types that get a score bump — but only when restrictive
const HIGH_RISK_TYPES: ClauseType[] = [
  "entry_rights",
  "early_termination",
  "dispute_resolution",
  "liability_indemnification",
  "security_deposit",
];

// Patterns that indicate the clause restricts tenant rights
const TENANT_RESTRICTIVE_PATTERNS = [
  /landlord.*not.*liable/i,
  /tenant.*waive/i,
  /waiver.*right/i,
  /no.*right.*to/i,
  /prohibit.*tenant/i,
  /tenant.*shall.*not/i,
  /tenant.*must.*not/i,
  /forfeit/i,
  /penalty/i,
  /without.*notice/i,
  /at.*landlord.*discretion/i,
  /sole.*discretion.*landlord/i,
  /non.refundable/i,
  /waive.*court/i,
  /mandatory.*arbitration/i,
  /class.*action.*waiver/i,
];

// Patterns that suggest unusually one-sided language
const UNUSUAL_LANGUAGE_PATTERNS = [
  /absolutely.*no.*right/i,
  /under.*no.*circumstances/i,
  /without.*exception/i,
  /irrevocably/i,
  /permanently.*waive/i,
  /forever.*waive/i,
  /unconditionally/i,
  /sole.*and.*absolute.*discretion/i,
  /with.*or.*without.*cause/i,
  /without.*reason/i,
];

// ── 3.4: Enforceability allowlist ─────────────────────────────────────────────
// ONLY these violation types may set is_potentially_unenforceable: true.
// These correspond to mandatory RTA provisions that cannot be contracted out of
// under RTA s.3 ("An agreement or waiver that purports to negate or modify the
// tenant's rights under this Act is void").
// Unusual language alone, without a specific statutory violation, is NOT sufficient.
const MANDATORY_PROVISION_VIOLATION_TYPES = new Set([
  "entry_without_notice",
  "non_refundable_deposit",
  "excess_deposit",
  "maintenance_offloaded",
  "rent_increase_without_guideline",
  "waiver_of_rights",
  "post_dated_cheques",
  "pet_fines",
  "rta_waiver",
  "daily_late_fee",
  "mandatory_arbitration",
  "self_help_eviction",    // RTA s.19 — only Sheriff + LTB order may enforce eviction
  "unlawful_termination",  // RTA s.44/48 — minimum 60 days written notice required
  "early_termination_fee", // RTA s.37/s.134 — lease-break fees are prohibited additional charges
  "surveillance_in_unit",  // RTA s.28 — landlord cannot install cameras inside rental unit
  "guest_surcharge",       // RTA s.134 — per-guest or per-night charges are prohibited
  "assignment_fee",        // RTA s.97(3) — no fee may be charged for processing assignment/sublet requests
  // ── New: 7 additional mandatory RTA provisions (v2.0) ──────────────────────
  "vital_services_cutoff",              // RTA s.29 — landlord cannot interrupt/cease vital services (heat/hydro/water/gas)
  "quiet_enjoyment_violation",          // RTA s.22 — excessive inspection/entry rights substantially interfere with quiet enjoyment
  "assignment_prohibition",             // RTA s.95 — outright ban on assignment/sublet is void; consent pathway must remain available
  "unlawful_renewal_obligation",        // RTA s.38 — tenancy auto-continues month-to-month; tenant cannot be required to give notice to not renew
  "multiple_rent_increases",            // RTA s.119 — only one rent increase per 12-month period is permitted
  "service_reduction_no_rent_decrease", // RTA s.121/125 — removal of included services requires corresponding rent reduction
  "retaliation_or_coercion",           // RTA s.137–139 — cannot evict/penalize/threaten tenant for exercising RTA rights
]);

// ── 3.1: Quoted text extraction ───────────────────────────────────────────────
// Extract the most relevant sentence/snippet from statute text to quote in the
// violation. Searches for sentences containing any of the provided keywords.
function extractQuotedText(statuteText: string, keywords: string[]): string {
  if (!statuteText) return "";
  // Split into sentences (roughly)
  const sentences = statuteText.split(/(?<=[.;])\s+/);
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  // Score each sentence by number of keyword hits
  let best = "";
  let bestScore = -1;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const score = lowerKeywords.filter((k) => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = sentence.trim();
    }
  }

  // Fall back to first 250 chars of statute text if no good sentence found
  if (!best || bestScore === 0) {
    return statuteText.slice(0, 250).trim() + (statuteText.length > 250 ? "…" : "");
  }

  return best.length > 300 ? best.slice(0, 300).trim() + "…" : best;
}

// ── 3.2: Compliance check ─────────────────────────────────────────────────────
// Before detecting violations, check if the clause explicitly complies with each
// retrieved statute. Returns { compliant: true } to skip violation detection for
// that statute. This implements the "compliance check pass before scoring" (3.2).
function checkStatuteCompliance(
  clauseText: string,
  statute: Statute
): { compliant: boolean; reason: string } {
  const lower = clauseText.toLowerCase();
  const sNum = statute.section_number;

  // ── Entry rights (s.26, s.27): explicit 24-hour written notice ──────────────
  if (
    (sNum === "26" || sNum === "27" || sNum.startsWith("26.") || sNum.startsWith("27.")) &&
    (lower.includes("24 hour") ||
      lower.includes("24-hour") ||
      lower.includes("twenty-four hour") ||
      lower.includes("24 hours")) &&
    (lower.includes("written notice") || lower.includes("notice in writing"))
  ) {
    return {
      compliant: true,
      reason: `Clause provides 24-hour written notice as required by ${statute.act_name} s.${sNum}`,
    };
  }

  // ── Entry rights: explicit RTA deferral ──────────────────────────────────────
  if (
    (sNum === "26" || sNum === "27") &&
    (lower.includes("in accordance with") ||
      lower.includes("pursuant to") ||
      lower.includes("as required by") ||
      lower.includes("as permitted by")) &&
    (lower.includes("residential tenancies act") ||
      lower.includes("rta") ||
      lower.includes("the act"))
  ) {
    return {
      compliant: true,
      reason: `Clause defers to RTA requirements for entry rights (${statute.act_name} s.${sNum})`,
    };
  }

  // ── Entry rights: emergency exception — s.26(2) ──────────────────────────────
  if (
    (sNum === "26" || sNum.startsWith("26.")) &&
    (lower.includes("emergency") || lower.includes("urgent repair") || lower.includes("urgent maintenance"))
  ) {
    return {
      compliant: true,
      reason: `Emergency exception language present — compliant with ${statute.act_name} s.26(2) which permits entry without notice in emergencies`,
    };
  }

  // ── Security deposit (s.105, s.106): last month's rent only ─────────────────
  if (
    (sNum === "105" || sNum.startsWith("106")) &&
    (lower.includes("last month") || lower.includes("last month's rent")) &&
    !lower.includes("non-refundable") &&
    !lower.includes("nonrefundable")
  ) {
    return {
      compliant: true,
      reason: `Deposit limited to last month's rent as permitted by ${statute.act_name} s.${sNum}`,
    };
  }

  // ── Maintenance (s.20): clause limits tenant to ordinary cleanliness ─────────
  if (
    sNum === "20" &&
    (lower.includes("ordinary cleanliness") ||
      lower.includes("reasonable cleanliness") ||
      lower.includes("clean and tidy") ||
      (lower.includes("clean") && !lower.includes("responsible for all repair") && !lower.includes("responsible for maintenance") && !lower.includes("plumbing") && !lower.includes("electrical")))
  ) {
    return {
      compliant: true,
      reason: `Clause limits tenant obligations to cleanliness/minor upkeep, consistent with ${statute.act_name} s.${sNum} — landlord retains repair responsibility`,
    };
  }

  // ── Rent increase (s.116, s.120, s.128): references guideline ───────────────
  if (
    (sNum === "116" || sNum === "120" || sNum === "128") &&
    (lower.includes("guideline") ||
      lower.includes("annual guideline") ||
      lower.includes("in accordance with") ||
      lower.includes("as permitted by"))
  ) {
    return {
      compliant: true,
      reason: `Clause ties rent increases to the provincial guideline as required by ${statute.act_name} s.${sNum}`,
    };
  }

  // ── Post-dated cheques (s.108): clause does not require them ─────────────────
  // Compliant if: (a) no mention of post-dated at all, OR
  //               (b) mentions post-dated but explicitly says "not required" / "voluntary"
  if (sNum === "108") {
    const mentionsPostDated =
      lower.includes("post-dated") ||
      lower.includes("postdated") ||
      lower.includes("post dated") ||
      lower.includes("automatic payment") ||
      lower.includes("pre-authorized");
    const explicitlyOptional =
      lower.includes("not required") ||
      lower.includes("voluntarily") ||
      lower.includes("optional") ||
      lower.includes("may be provided") ||
      lower.includes("are not required");
    if (!mentionsPostDated || explicitlyOptional) {
      return {
        compliant: true,
        reason: explicitlyOptional
          ? `Clause explicitly states post-dated cheques are not required — compliant with ${statute.act_name} s.${sNum}`
          : `Clause does not require post-dated cheques — consistent with ${statute.act_name} s.${sNum}`,
      };
    }
  }

  // ── Quiet enjoyment (s.22): clause explicitly guarantees enjoyment ──────────
  if (
    (sNum === "22" || sNum.startsWith("22.")) &&
    (lower.includes("quiet enjoyment") || lower.includes("reasonable enjoyment")) &&
    !lower.includes("any time") &&
    !lower.includes("at landlord's convenience")
  ) {
    return {
      compliant: true,
      reason: `Clause guarantees tenant's right to quiet enjoyment — compliant with ${statute.act_name} s.${sNum}`,
    };
  }

  // ── Vital services (s.29-31): utilities explicitly INCLUDED in rent ─────────
  if (
    (sNum === "29" || sNum === "30" || sNum === "31") &&
    (lower.includes("included") || lower.includes("landlord provides") ||
     lower.includes("landlord shall provide") || lower.includes("is responsible for")) &&
    (lower.includes("heat") || lower.includes("hydro") || lower.includes("water") ||
     lower.includes("gas") || lower.includes("electricity") || lower.includes("utilities"))
  ) {
    return {
      compliant: true,
      reason: `Clause specifies landlord-provided vital services — compliant with ${statute.act_name} s.${sNum}`,
    };
  }

  // ── Lease continuation (s.38): explicit month-to-month continuation ─────────
  if (
    sNum === "38" &&
    (lower.includes("month-to-month") || lower.includes("month to month")) &&
    (lower.includes("continue") || lower.includes("continuation") || lower.includes("convert"))
  ) {
    return {
      compliant: true,
      reason: `Clause explicitly states tenancy continues month-to-month at end of fixed term — compliant with ${statute.act_name} s.${sNum}`,
    };
  }

  // ── Assignment with consent (s.95/97): requires consent without prohibiting ──
  if (
    (sNum === "95" || sNum === "97" || sNum.startsWith("95.") || sNum.startsWith("97.")) &&
    (lower.includes("with written consent") || lower.includes("with the written consent") ||
     lower.includes("with consent") || lower.includes("subject to landlord") ||
     lower.includes("not to be unreasonably withheld") || lower.includes("not unreasonably withheld") ||
     lower.includes("shall not arbitrarily")) &&
    !lower.includes("no assignment") && !lower.includes("no subletting") &&
    !lower.includes("not permitted") && !lower.includes("prohibited")
  ) {
    return {
      compliant: true,
      reason: `Clause requires consent for assignment/sublet without outright prohibition — compliant with ${statute.act_name} s.${sNum}`,
    };
  }

  // ── Rent increase once per year (s.119): annual guideline ───────────────────
  if (
    (sNum === "119" || sNum.startsWith("119.")) &&
    (lower.includes("once per year") || lower.includes("once a year") ||
     lower.includes("once per 12 month") || lower.includes("annually") ||
     lower.includes("once every 12 month")) &&
    (lower.includes("guideline") || lower.includes("in accordance"))
  ) {
    return {
      compliant: true,
      reason: `Clause limits rent increases to once per year in line with the guideline — compliant with ${statute.act_name} s.${sNum}`,
    };
  }

  return { compliant: false, reason: "" };
}

// ── 3.3: Known-compliant pattern scoring ──────────────────────────────────────
// Applies score caps and adjustments for known-good clause patterns. This is the
// "few-shot examples" equivalent for a deterministic scoring engine — it encodes
// ground truth about what compliant clauses look like and prevents the base
// scoring logic from over-penalising them.
function applyCompliantPatterns(
  clauseText: string,
  clauseType: ClauseType,
  score: number
): { adjustedScore: number; compliance_notes: string[] } {
  const lower = clauseText.toLowerCase();
  const notes: string[] = [];

  // ── Entry rights: 24-hour written notice → compliant, cap at 3 ──────────────
  if (
    clauseType === "entry_rights" &&
    (lower.includes("24 hour") || lower.includes("24-hour") || lower.includes("24 hours")) &&
    (lower.includes("written notice") || lower.includes("notice in writing"))
  ) {
    score = Math.min(score, 3);
    notes.push(
      "Clause provides 24-hour written notice — compliant with RTA s.26/27 (cap: 3)"
    );
  }

  // ── Entry rights: emergency exception language → reduce score by 1 ──────────
  if (
    clauseType === "entry_rights" &&
    (lower.includes("emergency") || lower.includes("urgent repair") || lower.includes("urgent maintenance"))
  ) {
    score = Math.max(1, score - 1);
    notes.push("Emergency exception language present — consistent with RTA s.26(2)");
  }

  // ── Security deposit: explicitly last month's rent, no non-refundable ────────
  if (
    clauseType === "security_deposit" &&
    (lower.includes("last month") || lower.includes("last month's rent")) &&
    !lower.includes("non-refundable") &&
    !lower.includes("nonrefundable")
  ) {
    score = Math.min(score, 2);
    notes.push(
      "Deposit limited to last month's rent — compliant with RTA s.105 (cap: 2)"
    );
  }

  // ── Pets: no-pet clause without enforcement mechanism ───────────────────────
  // RTA s.14 makes no-pet provisions void, but a bare "no pets" clause without
  // fines, penalties, or eviction threats does not directly harm tenant rights —
  // it is void but benign. Clauses with fines/penalties remain high risk.
  if (
    clauseType === "pets" &&
    (lower.includes("no pet") || lower.includes("no animals") || lower.includes("pets are not permitted")) &&
    !lower.includes("fine") &&
    !lower.includes("penalty") &&
    !lower.includes("penalt") &&
    !lower.includes("evict") &&
    !lower.includes("terminat") &&
    !lower.includes("fee") &&
    !lower.includes("charge")
  ) {
    score = Math.min(score, 3);
    notes.push(
      "No-pet clause without enforcement mechanism — void under RTA s.14 but does not impose active penalties (cap: 3)"
    );
  }

  // ── Rent payment: standard terms, no prohibited conditions ──────────────────
  if (
    clauseType === "rent_payment" &&
    !lower.includes("post-dated") &&
    !lower.includes("postdated") &&
    !lower.includes("late fee") &&
    !lower.includes("late charge") &&
    !lower.includes("penalty") &&
    !lower.includes("interest on late") &&
    !lower.includes("non-refundable")
  ) {
    score = Math.min(score, 4);
    notes.push(
      "Standard rent payment terms — no prohibited conditions detected (cap: 4)"
    );
  }

  // ── Maintenance: limited to cleanliness/minor upkeep ────────────────────────
  if (
    clauseType === "maintenance_repairs" &&
    (lower.includes("ordinary cleanliness") ||
      lower.includes("reasonable cleanliness") ||
      lower.includes("clean and tidy")) &&
    !lower.includes("responsible for all repair") &&
    !lower.includes("responsible for all maintenance") &&
    !lower.includes("plumbing") &&
    !lower.includes("electrical") &&
    !lower.includes("structural")
  ) {
    score = Math.min(score, 3);
    notes.push(
      "Tenant maintenance obligations limited to cleanliness — landlord retains repair duty under RTA s.20 (cap: 3)"
    );
  }

  // ── General: explicit RTA deferral language anywhere in clause ───────────────
  if (
    lower.includes("residential tenancies act") ||
    lower.includes("pursuant to the act") ||
    lower.includes("as required by the act") ||
    lower.includes("in accordance with the residential tenancies")
  ) {
    score = Math.max(1, score - 1);
    notes.push(
      "Clause explicitly defers to Residential Tenancies Act requirements (−1 adjustment)"
    );
  }

  return { adjustedScore: Math.max(1, score), compliance_notes: notes };
}

// ── Violation detection ────────────────────────────────────────────────────────
// 3.1: Each violation now includes violation_type (for enforceability gate) and
//      quoted_text (exact snippet from the retrieved statute, not from training knowledge).
// 3.2: Before checking violations, call checkStatuteCompliance() — if the clause
//      explicitly complies with a statute, skip violation detection for that statute.
function detectStatutoryViolations(
  clauseText: string,
  statutes: Statute[]
): Array<{
  statute_section: string;
  violation_description: string;
  violation_type: string;
  quoted_text: string;
}> {
  const violations: Array<{
    statute_section: string;
    violation_description: string;
    violation_type: string;
    quoted_text: string;
  }> = [];

  const lowerClause = clauseText.toLowerCase();

  for (const statute of statutes) {
    if (statute.relevance_score < 0.5) continue;

    // ── 3.2: Compliance check pass ────────────────────────────────────────────
    // If the clause explicitly complies with this statute, skip violation detection.
    const compliance = checkStatuteCompliance(clauseText, statute);
    if (compliance.compliant) continue;

    const sectionRef = `${statute.act_name} s.${statute.section_number}`;
    const statuteText = statute.text.toLowerCase();

    // ── Entry without notice — RTA s.26/27 ───────────────────────────────────
    // Do NOT flag if the clause qualifies "without notice" with emergency/consent
    // exception language — that is RTA s.26(2)/s.26(3) compliant behaviour.
    // Also catches vague "reasonable notice" that does not specify 24h + written.
    if (
      (lowerClause.includes("enter") || lowerClause.includes("access")) &&
      (lowerClause.includes("without notice") ||
        lowerClause.includes("any time") ||
        lowerClause.includes("at any time") ||
        // Vague notice: mentions "notice" but not "24 hour"/"24-hour"/"24 hours" + "written"
        (lowerClause.includes("notice") &&
          !lowerClause.includes("24 hour") &&
          !lowerClause.includes("24-hour") &&
          !lowerClause.includes("24 hours") &&
          !lowerClause.includes("written notice") &&
          (statute.section_number === "26" || statute.section_number.startsWith("26") ||
           statute.section_number === "27" || statute.section_number.startsWith("27")))) &&
      !lowerClause.includes("emergency") &&
      !lowerClause.includes("urgent") &&
      !lowerClause.includes("in accordance") &&
      !lowerClause.includes("except") &&
      !lowerClause.includes("unless") &&
      !lowerClause.includes("pursuant to") &&
      (statuteText.includes("24") || statuteText.includes("notice"))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "entry_without_notice",
        violation_description: `Clause permits entry without required notice, contradicting ${sectionRef} which mandates advance written notice`,
        quoted_text: extractQuotedText(statute.text, ["24", "notice", "written", "hour"]),
      });
      continue;
    }

    // ── Non-refundable deposit — RTA s.105 ────────────────────────────────────
    if (
      (lowerClause.includes("non-refundable") || lowerClause.includes("nonrefundable")) &&
      lowerClause.includes("deposit") &&
      statuteText.includes("deposit")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "non_refundable_deposit",
        violation_description: `Non-refundable deposit clause contradicts ${sectionRef} which restricts permissible deposits`,
        quoted_text: extractQuotedText(statute.text, ["deposit", "refund", "last month"]),
      });
      continue;
    }

    // ── Rent increase without guideline — RTA s.120 ───────────────────────────
    // Catches both "rent increase" and "increase rent" word orders.
    // Also catches insufficient notice period (< 90 days) even if guideline mentioned.
    if (
      (lowerClause.includes("rent increase") ||
        lowerClause.includes("increase rent") ||
        /increas.*rent/.test(lowerClause)) &&
      (lowerClause.includes("any amount") ||
        /landlord.*may.*increas/.test(lowerClause) ||
        lowerClause.includes("sole discretion") ||
        /\b(?:30|60)\s*day/.test(lowerClause)) &&
      !lowerClause.includes("guideline") &&
      !lowerClause.includes("in accordance") &&
      (statuteText.includes("guideline") || statuteText.includes("90"))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "rent_increase_without_guideline",
        violation_description: `Unlimited rent increase clause contradicts ${sectionRef} which ties increases to the annual guideline`,
        quoted_text: extractQuotedText(statute.text, ["guideline", "increase", "annual"]),
      });
      continue;
    }

    // ── Waiver of rights — RTA s.3 ────────────────────────────────────────────
    if (
      (lowerClause.includes("waive") ||
        lowerClause.includes("forfeit") ||
        lowerClause.includes("give up")) &&
      (lowerClause.includes("right") || lowerClause.includes("protection")) &&
      (statuteText.includes("waiv") || statuteText.includes("contract out"))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "waiver_of_rights",
        violation_description: `Rights waiver contradicts ${sectionRef} — tenants cannot contract out of RTA protections`,
        quoted_text: extractQuotedText(statute.text, ["waive", "void", "contract out", "agreement"]),
      });
      continue;
    }

    // ── Mandatory arbitration / waiving LTB ──────────────────────────────────
    if (
      (lowerClause.includes("arbitration") ||
        /waive.*court/.test(lowerClause) ||
        /no.*court/.test(lowerClause)) &&
      statuteText.includes("board")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "mandatory_arbitration",
        violation_description: `Mandatory arbitration clause may contradict ${sectionRef} — tenants have the right to access the Landlord and Tenant Board`,
        quoted_text: extractQuotedText(statute.text, ["board", "landlord and tenant", "application"]),
      });
      continue;
    }

    // ── Post-dated cheques — RTA s.108 ───────────────────────────────────────
    // Only flag if the clause REQUIRES post-dated cheques, not merely mentions
    // them as optional. "Post-dated cheques may be provided voluntarily but are
    // not required" is explicitly compliant with s.108.
    if (
      (lowerClause.includes("post-dated") ||
        lowerClause.includes("postdated") ||
        lowerClause.includes("post dated")) &&
      !lowerClause.includes("not required") &&
      !lowerClause.includes("voluntarily") &&
      !lowerClause.includes("optional") &&
      !lowerClause.includes("are not required") &&
      !lowerClause.includes("may be provided") &&
      statute.section_number === "108"
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "post_dated_cheques",
        violation_description: `Clause requires post-dated cheques, which is prohibited by ${sectionRef} — landlords cannot require post-dated cheques or automatic payment authorizations`,
        quoted_text: extractQuotedText(statute.text, ["post-dated", "cheque", "payment", "require"]),
      });
      continue;
    }

    // ── Maintenance offloading — RTA s.20 ────────────────────────────────────
    // Catches broad responsibility-shifting language including major systems
    if (
      statute.section_number === "20" &&
      lowerClause.includes("tenant") &&
      (
        lowerClause.includes("responsible for") ||
        lowerClause.includes("responsible for all") ||
        lowerClause.includes("bear all") ||
        lowerClause.includes("bears all") ||
        lowerClause.includes("shall maintain") ||
        lowerClause.includes("shall repair") ||
        lowerClause.includes("all repair") ||
        lowerClause.includes("all maintenance") ||
        lowerClause.includes("all costs") ||
        lowerClause.includes("sole responsibility") ||
        lowerClause.includes("at the tenant's expense") ||
        lowerClause.includes("at tenant's expense")
      ) &&
      (
        lowerClause.includes("repair") ||
        lowerClause.includes("maintenance") ||
        lowerClause.includes("plumbing") ||
        lowerClause.includes("electrical") ||
        lowerClause.includes("furnace") ||
        lowerClause.includes("hvac") ||
        lowerClause.includes("appliance") ||
        lowerClause.includes("structural")
      )
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "maintenance_offloaded",
        violation_description: `Clause shifts repair/maintenance responsibility to the tenant, contradicting ${sectionRef} — the landlord has a non-delegable statutory duty to maintain the unit and all its systems in a good state of repair`,
        quoted_text: extractQuotedText(statute.text, ["maintain", "good repair", "landlord", "obligation"]),
      });
      continue;
    }

    // ── RTA waiver / superseding provincial law — RTA s.4 ────────────────────
    if (
      (lowerClause.includes("supersede") ||
        lowerClause.includes("overrides") ||
        lowerClause.includes("provincial law") ||
        (lowerClause.includes("waive") && lowerClause.includes("rta"))) &&
      statute.section_number === "4"
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "rta_waiver",
        violation_description: `Clause purports to supersede or waive the RTA, which is void under ${sectionRef} — no tenancy agreement can contract out of the Residential Tenancies Act`,
        quoted_text: extractQuotedText(statute.text, ["void", "agreement", "supersede", "override"]),
      });
      continue;
    }

    // ── Daily late fee penalty — RTA s.59 / s.134 ───────────────────────────
    // s.134: additional charges prohibited. s.59: only N4 process available.
    // Catches: "per day", "for each day", "per diem", and "late fee/penalty + $amount".
    if (
      (/\$\s*\d+(?:\.\d+)?\s*per\s*day/.test(lowerClause) ||
        /\d+\s*dollar[s]?\s*per\s*day/.test(lowerClause) ||
        /\$\s*\d+.*(?:per\s*day|for\s*each\s*day|per\s*diem)/.test(lowerClause) ||
        /(?:per\s*day|for\s*each\s*day).*\$\s*\d+/.test(lowerClause) ||
        (lowerClause.includes("late") &&
          (lowerClause.includes("penalty") || lowerClause.includes("fee")) &&
          /\$\d+/.test(lowerClause) &&
          (lowerClause.includes("per day") || lowerClause.includes("for each day") ||
           lowerClause.includes("each day") || lowerClause.includes("daily")))) &&
      (statute.section_number === "59" || statute.section_number === "134")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "daily_late_fee",
        violation_description: `Clause imposes a daily late-payment penalty, which is not permitted under Ontario law. ${sectionRef} provides the only remedy for non-payment: an N4 notice followed by an LTB application`,
        quoted_text: extractQuotedText(statute.text, ["non-payment", "N4", "notice", "remedy"]),
      });
      continue;
    }

    // ── Unlawful pet fines / eviction — RTA s.14 ─────────────────────────────
    if (
      (lowerClause.includes("fine") ||
        lowerClause.includes("penalty") ||
        lowerClause.includes("fee")) &&
      (lowerClause.includes("pet") || lowerClause.includes("animal")) &&
      statute.section_number === "14"
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "pet_fines",
        violation_description: `Clause imposes fines or penalties for having pets. The underlying no-pet provision is void under ${sectionRef} — fines and eviction threats based on it are therefore also unenforceable`,
        quoted_text: extractQuotedText(statute.text, ["void", "pet", "animal", "provision"]),
      });
      continue;
    }

    // ── Excess security deposit — RTA s.105/106 ──────────────────────────────
    // Catches: non-refundable deposits, large dollar amounts (handles comma-formatted
    // numbers like $6,600), and multi-month text like "three months' rent".
    if (
      (lowerClause.includes("deposit") || lowerClause.includes("security")) &&
      (lowerClause.includes("non-refundable") ||
        lowerClause.includes("nonrefundable") ||
        /\$\s*[2-9][\d,]{2,}/.test(lowerClause) ||               // $2,000+ (comma-safe)
        /(?:two|three|four|five|[2-5])\s+month/.test(lowerClause)) &&  // "three months' rent"
      (statute.section_number === "105" || statute.section_number.startsWith("106"))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "excess_deposit",
        violation_description: `Clause requires a deposit that likely exceeds the one-month-rent limit or is non-refundable, contradicting ${sectionRef} — only a last-month's-rent deposit is permitted`,
        quoted_text: extractQuotedText(statute.text, ["deposit", "one month", "last month", "refund"]),
      });
      continue;
    }

    // ── Early termination fee — RTA s.37 / s.134 ─────────────────────────────
    // Lease-break fees, liquidated damages for early termination, and penalty
    // clauses for vacating before end of fixed term are prohibited. The Act
    // provides the exclusive mechanism for ending a tenancy (s.37); any
    // financial penalty is also an additional charge void under s.134.
    if (
      (lowerClause.includes("lease-break") ||
        lowerClause.includes("lease break") ||
        lowerClause.includes("break fee") ||
        lowerClause.includes("liquidated damage") ||
        (lowerClause.includes("early termination") && /fee|penalt|charge|pay/.test(lowerClause)) ||
        (lowerClause.includes("terminat") && /fee|penalt/.test(lowerClause) && /month.*rent|rent.*month/.test(lowerClause)) ||
        (/(?:two|three|four|[2-4])\s+month.*rent/.test(lowerClause) &&
          (lowerClause.includes("terminat") || lowerClause.includes("vacat") || lowerClause.includes("leave")))) &&
      (statute.section_number === "37" || statute.section_number === "134")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "early_termination_fee",
        violation_description: `Clause imposes a financial penalty for early termination, which is prohibited by ${sectionRef} — a tenancy may only be ended in accordance with the RTA; lease-break fees and liquidated damages clauses are void`,
        quoted_text: extractQuotedText(statute.text, ["terminate", "void", "fee", "penalty", "additional"]),
      });
      continue;
    }

    // ── Surveillance cameras in unit — RTA s.28 ──────────────────────────────
    // Installing monitoring devices inside the rental unit violates the tenant's
    // right to exclusive possession and privacy under RTA s.28. Common areas
    // may be monitored; the rental unit itself may not be.
    if (
      (lowerClause.includes("camera") ||
        lowerClause.includes("surveillance") ||
        lowerClause.includes("cctv") ||
        lowerClause.includes("monitor") ||
        lowerClause.includes("recording device")) &&
      (lowerClause.includes("unit") ||
        lowerClause.includes("interior") ||
        lowerClause.includes("inside") ||
        lowerClause.includes("premises") ||
        lowerClause.includes("bedroom") ||
        lowerClause.includes("bathroom")) &&
      statute.section_number === "28"
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "surveillance_in_unit",
        violation_description: `Clause authorizes installation of surveillance or monitoring devices inside the rental unit, violating ${sectionRef} — the tenant has an exclusive right to possession and privacy within their unit that the landlord cannot override`,
        quoted_text: extractQuotedText(statute.text, ["privacy", "exclusive", "possession", "monitor", "unit"]),
      });
      continue;
    }

    // ── Guest surcharge / per-night fee — RTA s.134 ───────────────────────────
    // Any charge beyond base rent is prohibited under s.134. This includes fees
    // per guest, per-night surcharges for guest stays, and per-visitor charges.
    if (
      (lowerClause.includes("per night") ||
        lowerClause.includes("per-night") ||
        /\$\s*\d+.*per\s*(guest|visitor|person)/.test(lowerClause) ||
        /per\s*(guest|visitor|person).*\$\s*\d+/.test(lowerClause) ||
        (/\$\s*\d+/.test(lowerClause) && (lowerClause.includes("per night") || lowerClause.includes("per-night")) && (lowerClause.includes("guest") || lowerClause.includes("visitor")))) &&
      statute.section_number === "134"
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "guest_surcharge",
        violation_description: `Clause imposes a per-guest or per-night surcharge, which is a prohibited additional charge under ${sectionRef} — the landlord may not collect any amount beyond base rent`,
        quoted_text: extractQuotedText(statute.text, ["charge", "fee", "additional", "prohibited", "rent"]),
      });
      continue;
    }

    // ── Assignment / sublet processing fee — RTA s.97 ────────────────────────
    // Section 97(3) explicitly prohibits landlords from charging any fee for
    // processing or consenting to an assignment or sublet request. Even a nominal
    // "administrative" or "processing" fee is void.
    if (
      (lowerClause.includes("assign") ||
        lowerClause.includes("sublet") ||
        lowerClause.includes("sublease") ||
        lowerClause.includes("subletting")) &&
      (lowerClause.includes("fee") ||
        lowerClause.includes("charge") ||
        lowerClause.includes("administrative") ||
        lowerClause.includes("processing")) &&
      /\$\s*\d+/.test(lowerClause) &&
      statute.section_number === "97"
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "assignment_fee",
        violation_description: `Clause charges a fee for processing an assignment or sublet request, which is prohibited by ${sectionRef} — a landlord may not charge any fee for consenting to or processing an assignment or subletting`,
        quoted_text: extractQuotedText(statute.text, ["fee", "charge", "consent", "assignment", "sublet", "prohibited"]),
      });
      continue;
    }

    // ── Vital services cutoff — RTA s.29/30/31 ───────────────────────────────
    if (
      (statute.section_number === "29" || statute.section_number === "30" || statute.section_number === "31") &&
      (lowerClause.includes("tenant") || lowerClause.includes("renter")) &&
      (lowerClause.includes("responsible for") || lowerClause.includes("must ensure") ||
       lowerClause.includes("at tenant's cost") || lowerClause.includes("at the tenant's cost") ||
       lowerClause.includes("not liable if") || lowerClause.includes("may discontinue") ||
       lowerClause.includes("may disconnect") || lowerClause.includes("cut off")) &&
      (lowerClause.includes("heat") || lowerClause.includes("hydro") || lowerClause.includes("water") ||
       lowerClause.includes("gas") || lowerClause.includes("electricity") || lowerClause.includes("utilities"))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "vital_services_cutoff",
        violation_description: `Clause shifts responsibility for vital services to the tenant or allows their interruption, contradicting ${sectionRef} — the landlord has a statutory duty to provide and maintain vital services (heat, hydro, water, gas) at all times`,
        quoted_text: extractQuotedText(statute.text, ["vital service", "heat", "water", "interrupt", "landlord shall", "supply"]),
      });
      continue;
    }

    // ── Quiet enjoyment violation — RTA s.22 ─────────────────────────────────
    // High-frequency inspections (monthly/quarterly) are a violation regardless of notice period.
    // Unbounded/discretionary access is only a violation when 24h notice is absent.
    const _isHighFreqInspection = lowerClause.includes("monthly") || lowerClause.includes("quarterly") ||
      lowerClause.includes("regular inspection") || lowerClause.includes("periodic inspection");
    const _isUnboundedAccess = lowerClause.includes("any time") || lowerClause.includes("at landlord's discretion") ||
      lowerClause.includes("at landlord's convenience") || lowerClause.includes("at any time");
    const _has24hNotice = lowerClause.includes("24 hour") || lowerClause.includes("24-hour");
    if (
      (statute.section_number === "22" || statute.section_number.startsWith("22.")) &&
      (lowerClause.includes("inspect") || lowerClause.includes("inspection") ||
       lowerClause.includes("enter") || lowerClause.includes("access")) &&
      (_isHighFreqInspection || _isUnboundedAccess) &&
      (_isHighFreqInspection || !_has24hNotice) &&
      !lowerClause.includes("emergency") && !lowerClause.includes("in accordance")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "quiet_enjoyment_violation",
        violation_description: `Clause grants landlord unrestricted or excessively frequent inspection/entry rights that substantially interfere with the tenant's right to quiet enjoyment, contradicting ${sectionRef}`,
        quoted_text: extractQuotedText(statute.text, ["quiet enjoyment", "reasonable", "interference", "tenant", "enjoyment"]),
      });
      continue;
    }

    // ── Assignment prohibition — RTA s.95/97 ─────────────────────────────────
    if (
      (statute.section_number === "95" || statute.section_number === "97" ||
       statute.section_number.startsWith("95.") || statute.section_number.startsWith("97.")) &&
      (lowerClause.includes("no assignment") || lowerClause.includes("no subletting") ||
       lowerClause.includes("may not assign") || lowerClause.includes("may not sublet") ||
       lowerClause.includes("not permitted to assign") || lowerClause.includes("not permitted to sublet") ||
       lowerClause.includes("prohibited from subletting") || lowerClause.includes("prohibited from assigning") ||
       /assignment.*(?:prohibited|forbidden|not allowed)/.test(lowerClause) ||
       /subletting.*(?:prohibited|forbidden|not allowed)/.test(lowerClause)) &&
      !lowerClause.includes("with consent") && !lowerClause.includes("with written consent") &&
      !lowerClause.includes("subject to approval") && !lowerClause.includes("subject to landlord")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "assignment_prohibition",
        violation_description: `Clause completely prohibits assignment or subletting with no consent pathway, contradicting ${sectionRef} — a landlord may require consent but cannot outright prevent a tenant from requesting to assign or sublet`,
        quoted_text: extractQuotedText(statute.text, ["assign", "sublet", "consent", "tenant", "request", "arbitrarily"]),
      });
      continue;
    }

    // ── Unlawful renewal obligation — RTA s.38 ───────────────────────────────
    if (
      (statute.section_number === "38" || statute.section_number.startsWith("38.")) &&
      (((lowerClause.includes("must give") || lowerClause.includes("shall give") || lowerClause.includes("required to give")) &&
        (lowerClause.includes("notice") || lowerClause.includes("days notice")) &&
        (lowerClause.includes("not renew") || lowerClause.includes("intention to vacate") ||
         lowerClause.includes("vacate at end") || lowerClause.includes("intent to vacate") ||
         lowerClause.includes("not continue"))) ||
       (lowerClause.includes("automatically renew") && lowerClause.includes("fixed term") &&
        !lowerClause.includes("month-to-month")))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "unlawful_renewal_obligation",
        violation_description: `Clause imposes an obligation on the tenant to give advance notice of intent not to renew, or purports to auto-renew for a new fixed term — contradicting ${sectionRef} which provides that a tenancy automatically continues month-to-month at end of fixed term`,
        quoted_text: extractQuotedText(statute.text, ["fixed term", "month-to-month", "continue", "renewal", "notice", "expire"]),
      });
      continue;
    }

    // ── Multiple rent increases — RTA s.119 ──────────────────────────────────
    if (
      (statute.section_number === "119" || statute.section_number.startsWith("119.")) &&
      (lowerClause.includes("rent increase") || lowerClause.includes("increase rent") ||
       /increas.*rent/.test(lowerClause) || /rent.*increas/.test(lowerClause) ||
       lowerClause.includes("rent shall be adjusted") || lowerClause.includes("rent will be adjusted") ||
       lowerClause.includes("rent is adjusted") || lowerClause.includes("rent adjusted")) &&
      (lowerClause.includes("monthly") || lowerClause.includes("quarterly") ||
       lowerClause.includes("semi-annual") || lowerClause.includes("biannual") ||
       lowerClause.includes("every six month") || lowerClause.includes("cpi") ||
       lowerClause.includes("consumer price") || lowerClause.includes("inflation index")) &&
      !lowerClause.includes("once per 12 month") && !lowerClause.includes("once every 12 month") &&
      !lowerClause.includes("once per year") && !lowerClause.includes("once a year")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "multiple_rent_increases",
        violation_description: `Clause permits rent increases more frequently than once per 12-month period, contradicting ${sectionRef} — only one rent increase is allowed per 12 months regardless of amount`,
        quoted_text: extractQuotedText(statute.text, ["12 months", "once", "increase", "period", "guideline", "12-month"]),
      });
      continue;
    }

    // ── Service reduction without rent decrease — RTA s.121/125 ──────────────
    if (
      (statute.section_number === "121" || statute.section_number === "125" ||
       statute.section_number.startsWith("121.") || statute.section_number.startsWith("125.")) &&
      (lowerClause.includes("may remove") || lowerClause.includes("may discontinue") ||
       lowerClause.includes("reserves the right to change") || lowerClause.includes("may change") ||
       lowerClause.includes("subject to change") || lowerClause.includes("may modify") ||
       lowerClause.includes("amenities may") || lowerClause.includes("services may") ||
       lowerClause.includes("right to remove") || lowerClause.includes("right to discontinue") ||
       lowerClause.includes("right to reassign") || lowerClause.includes("reserves the right to remove") ||
       lowerClause.includes("reserves the right to discontinue")) &&
      (lowerClause.includes("parking") || lowerClause.includes("laundry") || lowerClause.includes("storage") ||
       lowerClause.includes("locker") || lowerClause.includes("amenities") || lowerClause.includes("services") ||
       lowerClause.includes("facilities") || lowerClause.includes("cable") || lowerClause.includes("internet")) &&
      !lowerClause.includes("rent will be reduced") && !lowerClause.includes("rent reduction") &&
      !lowerClause.includes("rent shall be reduced")
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "service_reduction_no_rent_decrease",
        violation_description: `Clause allows landlord to remove or reduce included services/facilities without a corresponding rent reduction, contradicting ${sectionRef} — any reduction in services included in rent requires a proportionate rent decrease`,
        quoted_text: extractQuotedText(statute.text, ["reduction", "service", "rent", "facility", "decrease", "included"]),
      });
      continue;
    }

    // ── Retaliation or coercion — RTA s.137–139 ──────────────────────────────
    if (
      (statute.section_number === "137" || statute.section_number === "138" ||
       statute.section_number === "139" || statute.section_number.startsWith("137.") ||
       statute.section_number.startsWith("138.") || statute.section_number.startsWith("139.")) &&
      (((lowerClause.includes("waive") || lowerClause.includes("forfeit") || lowerClause.includes("relinquish")) &&
        (lowerClause.includes("right to complain") || lowerClause.includes("right to apply") ||
         lowerClause.includes("ltb") || lowerClause.includes("board") || lowerClause.includes("tribunal"))) ||
       ((lowerClause.includes("terminat") || lowerClause.includes("evict")) &&
        (lowerClause.includes("any complaint") || lowerClause.includes("any request") ||
         lowerClause.includes("any application") || lowerClause.includes("if tenant"))))
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "retaliation_or_coercion",
        violation_description: `Clause contains retaliatory or coercive language — waiving the tenant's right to access the LTB or threatening consequences for exercising rights, contradicting ${sectionRef}`,
        quoted_text: extractQuotedText(statute.text, ["retaliation", "complain", "right", "coerce", "evict", "landlord", "penalty"]),
      });
      continue;
    }
  }

  return violations;
}

// ── Text-pattern score bonus ──────────────────────────────────────────────────
// Catches obvious RTA violations that the statute-gated checks miss when the
// wrong clause type is assigned (e.g. deposit language inside rent_payment).
// Does NOT affect is_potentially_unenforceable — that still needs statute backing.
function detectTextPatternScore(clauseText: string): number {
  const t = clauseText.toLowerCase();
  let bonus = 0;

  // Non-refundable deposit or fee — RTA s.105/s.134
  if ((t.includes("non-refundable") || t.includes("nonrefundable")) &&
      (t.includes("deposit") || t.includes("fee") || t.includes("cleaning"))) {
    bonus += 4;
  }

  // Daily late-payment penalty — RTA s.134 (additional charges prohibited)
  if (/\$\s*\d+.*per\s*day/.test(t) || /per\s*day.*\$\s*\d+/.test(t) ||
      (t.includes("per day") && (t.includes("penalty") || t.includes("fee") || t.includes("late")))) {
    bonus += 4;
  }

  // Tenant assumes maintenance responsibility — RTA s.20
  // Tier A: broad responsibility-shifting language (+3)
  if (
    (t.includes("100%") || t.includes("all repairs") || t.includes("all maintenance") ||
     t.includes("all costs") || t.includes("sole responsibility") ||
     t.includes("bear all") || t.includes("at the tenant's expense") ||
     t.includes("tenant's expense") || t.includes("tenant shall repair") ||
     t.includes("tenant is responsible for repair") || t.includes("responsible for all repair") ||
     t.includes("responsible for any repair")) &&
    (t.includes("repair") || t.includes("maintenance") || t.includes("appliance"))
  ) {
    bonus += 3;
  }
  // Tier B: major systems explicitly offloaded to tenant (+3 additional — these are critical)
  if (
    (t.includes("furnace") || t.includes("plumbing") || t.includes("electrical") ||
     t.includes("hvac") || t.includes("boiler") || t.includes("water heater")) &&
    (t.includes("tenant") || t.includes("renter")) &&
    (t.includes("responsible") || t.includes("repair") || t.includes("cost") ||
     t.includes("maintain") || t.includes("expense") || t.includes("bear"))
  ) {
    bonus += 3;
  }

  // Surveillance cameras inside unit — PIPEDA + RTA s.28 privacy (+4)
  if (
    (t.includes("camera") || t.includes("surveillance") || t.includes("cctv") ||
     t.includes("monitoring device") || t.includes("recording device")) &&
    (t.includes("unit") || t.includes("premises") || t.includes("living") ||
     t.includes("inside") || t.includes("interior") || t.includes("bedroom") ||
     t.includes("bathroom"))
  ) {
    bonus += 4;
  }

  // Self-help eviction language — RTA s.19 (+5 — criminal exposure, hardcoded void)
  if (
    t.includes("change the locks") || t.includes("change locks") || t.includes("alter the locks") ||
    (t.includes("vacate") && /within\s+\d+\s*(hour|day)/i.test(t)) ||
    (t.includes("vacate") && t.includes("immediately")) ||
    (t.includes("leave the premises") && /within\s+\d+\s*(hour|day)/i.test(t)) ||
    t.includes("remove the tenant") || t.includes("tenant's belongings will be")
  ) {
    bonus += 5;
  }

  // Surcharge / fee per guest or per night for guests — RTA s.134
  if (
    /\$\s*\d+.*per\s*(guest|person|visitor)/.test(t) ||
    /per\s*(guest|person|visitor).*\$\s*\d+/.test(t) ||
    (t.includes("per night") && (t.includes("guest") || t.includes("visitor")) && /\$\s*\d+/.test(t))
  ) {
    bonus += 4;  // Bumped from 2 to 4 — explicit additional charge
  }

  // Mandatory cleaning fee regardless of condition — RTA s.134
  if (t.includes("cleaning fee") && t.includes("regardless")) {
    bonus += 3;
  }

  // Lease-break fee / early termination penalty — RTA s.37/s.134
  if (
    t.includes("lease-break") || t.includes("lease break") || t.includes("break fee") ||
    t.includes("liquidated damage") ||
    (t.includes("early termination") && /fee|penalt|charge/.test(t))
  ) {
    bonus += 5;
  }

  // Assignment / sublet processing fee — RTA s.97
  if (
    (t.includes("assign") || t.includes("sublet") || t.includes("sublease")) &&
    (t.includes("fee") || t.includes("administrative") || t.includes("processing")) &&
    /\$\s*\d+/.test(t)
  ) {
    bonus += 4;
  }

  return bonus;
}

// ── Statute-independent critical violation detection ─────────────────────────
// These patterns are so clearly void under Ontario RTA that they warrant
// is_potentially_unenforceable: true even when no statute was retrieved.
// Only include violations where the text alone is conclusive — no ambiguity.
function detectCriticalTextViolations(clauseText: string): Array<{
  statute_section: string;
  violation_type: string;
  violation_description: string;
  quoted_text: string;
}> {
  const t = clauseText.toLowerCase();
  const found: Array<{
    statute_section: string;
    violation_type: string;
    violation_description: string;
    quoted_text: string;
  }> = [];

  // ── Self-help eviction — RTA s.19 ────────────────────────────────────────
  // Changing locks, seizing belongings, requiring immediate vacation without LTB
  const selfHelpEviction =
    t.includes("change the locks") ||
    t.includes("change locks") ||
    t.includes("alter the locks") ||
    t.includes("remove the tenant") ||
    t.includes("remove tenant's belongings") ||
    t.includes("seize the tenant") ||
    t.includes("tenant's belongings will be") ||
    (t.includes("vacate") && /within\s+\d+\s*(hour|day)/i.test(t)) ||
    (t.includes("vacate") && t.includes("immediately")) ||
    (t.includes("leave the premises") && /within\s+\d+\s*(hour|day)/i.test(t));

  if (selfHelpEviction) {
    found.push({
      statute_section: "RTA s.19",
      violation_type: "self_help_eviction",
      violation_description:
        "Clause attempts to authorize self-help eviction (changing locks, removing belongings, or requiring immediate vacation without an LTB order) — illegal under RTA s.19. Only a Sheriff acting on a Board eviction order may remove a tenant.",
      quoted_text:
        "A landlord shall not alter the locking system on a door giving entry to a rental unit or residential complex, or cause the locking system to be altered, during the tenant's occupancy of the rental unit without giving the tenant replacement keys (RTA s.19).",
    });
  }

  // ── Unlawful termination notice — RTA s.44/48 ────────────────────────────
  // Verbal notice or notice period shorter than RTA minimums (60 days for most terminations)
  const unlawfulTermination =
    (t.includes("verbal") || t.includes("verbally") || t.includes("oral notice")) &&
    (t.includes("notice") || t.includes("terminat") || t.includes("vacate")) ||
    (/\b([1-9]|[12]\d|3[0-9]|4[0-9]|5[0-9])\s*day[s]?\s*(written\s+)?notice/.test(t) &&
      (t.includes("terminat") || t.includes("vacate") || t.includes("end the tenancy")));

  if (unlawfulTermination) {
    found.push({
      statute_section: "RTA s.44",
      violation_type: "unlawful_termination",
      violation_description:
        "Clause provides for verbal notice or a notice period shorter than the RTA minimum (60 days written notice for most terminations) — void under RTA s.44. Tenancy can only be terminated through a proper written notice using prescribed LTB forms.",
      quoted_text:
        "A notice of termination shall be in writing, signed by the person giving the notice, and shall identify the rental unit for which the notice is given (RTA s.43).",
    });
  }

  // ── RTA rights waiver — RTA s.3 ──────────────────────────────────────────
  // Broad waiver language beyond what detectStatutoryViolations() catches
  const rtaWaiver =
    (t.includes("waive") || t.includes("waiver")) &&
    (t.includes("all rights") ||
      t.includes("any rights") ||
      t.includes("right to dispute") ||
      t.includes("right to appeal") ||
      t.includes("right to apply") ||
      t.includes("rights under") ||
      t.includes("rta rights") ||
      t.includes("statutory rights")) ||
    (t.includes("by signing") &&
      (t.includes("waive") || t.includes("forfeit") || t.includes("relinquish")));

  if (rtaWaiver) {
    found.push({
      statute_section: "RTA s.3",
      violation_type: "rta_waiver",
      violation_description:
        "Clause attempts to make the tenant waive RTA rights — automatically void under RTA s.3(1). A tenant cannot waive any right, benefit, or protection conferred by the Act, regardless of what the tenancy agreement says.",
      quoted_text:
        "This Act applies despite any agreement or waiver to the contrary (RTA s.3(1)).",
    });
  }

  // ── Major-system maintenance offload without statute retrieval ────────────
  // Catches "tenant responsible for furnace/plumbing/electrical" even if s.20 not retrieved
  const majorSystemOffload =
    (t.includes("tenant") || t.includes("renter")) &&
    (t.includes("furnace") || t.includes("plumbing") || t.includes("electrical") || t.includes("hvac")) &&
    (t.includes("responsible") || t.includes("bear") || t.includes("cost") ||
     t.includes("repair") || t.includes("maintain") || t.includes("expense"));

  if (majorSystemOffload) {
    found.push({
      statute_section: "RTA s.20",
      violation_type: "maintenance_offloaded",
      violation_description:
        "Clause shifts responsibility for major building systems (furnace, plumbing, electrical, or HVAC) to the tenant — void under RTA s.20. The landlord's duty to keep the unit in good repair is non-delegable and cannot be contracted away.",
      quoted_text:
        "A landlord is responsible for providing and maintaining a residential complex, including the rental units in it, in a good state of repair and fit for habitation (RTA s.20(1)).",
    });
  }

  // ── Early termination fee — RTA s.37 / s.134 ─────────────────────────────
  // Lease-break fees, liquidated damages, and penalty fees for leaving before
  // end of fixed term are void even without statute retrieval — the prohibition
  // in s.37 (Act provides exclusive termination mechanism) and s.134 (no
  // additional charges) is clear and well-established.
  const earlyTerminationFee =
    (t.includes("lease-break") || t.includes("lease break") || t.includes("break fee")) ||
    (t.includes("liquidated damage") && (t.includes("terminat") || t.includes("vacat"))) ||
    (t.includes("early termination") && /fee|penalt|charge/.test(t) &&
      (t.includes("pay") || t.includes("shall") || t.includes("must"))) ||
    (/(?:two|three|four|[2-4])\s+month/.test(t) &&
      (t.includes("terminat") || t.includes("vacat") || t.includes("leave")) &&
      (t.includes("fee") || t.includes("penalt") || t.includes("pay")));

  if (earlyTerminationFee) {
    found.push({
      statute_section: "RTA s.37 / s.134",
      violation_type: "early_termination_fee",
      violation_description:
        "Clause imposes a financial penalty or lease-break fee for early termination of the tenancy — void under RTA s.37 and s.134. The Act provides the exclusive mechanism for terminating a tenancy; a landlord may not collect a fee, penalty, or liquidated damages for early departure.",
      quoted_text:
        "A tenancy may be terminated only in accordance with this Act (RTA s.37(1)). No landlord shall charge or collect any amount other than rent, including a fee or penalty (RTA s.134(1)).",
    });
  }

  // ── Surveillance cameras inside rental unit — RTA s.28 / PIPEDA ──────────
  // Installing monitoring devices inside the rental unit is a clear violation
  // of the tenant's right to exclusive possession and privacy even without
  // statute retrieval — this is universally recognised as prohibited.
  const surveillanceInUnit =
    (t.includes("camera") || t.includes("surveillance") || t.includes("cctv") ||
     t.includes("monitoring device") || t.includes("recording device")) &&
    (t.includes("unit") || t.includes("interior") || t.includes("inside") ||
     t.includes("premises") || t.includes("bedroom") || t.includes("bathroom") ||
     t.includes("living"));

  if (surveillanceInUnit) {
    found.push({
      statute_section: "RTA s.28",
      violation_type: "surveillance_in_unit",
      violation_description:
        "Clause authorizes the landlord to install surveillance or monitoring devices inside the rental unit — a direct violation of the tenant's right to exclusive possession and privacy under RTA s.28 and PIPEDA. A landlord may monitor common areas only; the unit interior is exclusively the tenant's.",
      quoted_text:
        "A tenant is entitled to exclusive possession of the rental unit. The landlord has no right to install monitoring devices inside the unit without the tenant's ongoing informed consent (RTA s.28).",
    });
  }

  // ── Guest surcharge / per-night fee — RTA s.134 ──────────────────────────
  // Any dollar charge per guest or per night for guest stays is a prohibited
  // additional charge that is clear on its face — no statute retrieval needed.
  const guestSurcharge =
    (/\$\s*\d+.*per\s*(guest|visitor|person|night)/.test(t) ||
     /per\s*(guest|visitor|person|night).*\$\s*\d+/.test(t) ||
     (t.includes("per night") && (t.includes("guest") || t.includes("visitor")) && /\$\s*\d+/.test(t))) &&
    (t.includes("charge") || t.includes("fee") || t.includes("billed") ||
     t.includes("pay") || t.includes("owe"));

  if (guestSurcharge) {
    found.push({
      statute_section: "RTA s.134",
      violation_type: "guest_surcharge",
      violation_description:
        "Clause imposes a per-guest or per-night surcharge — a prohibited additional charge under RTA s.134(1). A landlord may not collect any money beyond base rent, including fees for guests staying longer than a defined period.",
      quoted_text:
        "No landlord shall, directly or indirectly, charge or collect any amount of money other than the rent charged for the rental unit (RTA s.134(1)).",
    });
  }

  // ── Assignment / sublet processing fee — RTA s.97(3) ─────────────────────
  // Any fee for processing or consenting to assignment/sublet is explicitly
  // void under s.97(3) — clear enough to flag without statute retrieval.
  const assignmentFee =
    (t.includes("assign") || t.includes("sublet") || t.includes("sublease")) &&
    (t.includes("fee") || t.includes("charge") || t.includes("administrative") ||
     t.includes("processing")) &&
    /\$\s*\d+/.test(t);

  if (assignmentFee) {
    found.push({
      statute_section: "RTA s.97",
      violation_type: "assignment_fee",
      violation_description:
        "Clause imposes an administrative or processing fee for an assignment or sublet request — prohibited under RTA s.97(3). A landlord may not charge any fee for consenting to or processing an assignment; the only remedy for refusing is to allow the tenant to terminate.",
      quoted_text:
        "A landlord shall not charge a fee for consenting to an assignment or subletting, or for processing a request to assign or sublet (RTA s.97(3)).",
    });
  }

  // ── Vital services cutoff — RTA s.29 ─────────────────────────────────────
  const vitalServicesCutoff =
    (t.includes("tenant") || t.includes("renter")) &&
    (t.includes("responsible for") || t.includes("must ensure") ||
     t.includes("may disconnect") || t.includes("may cut off") ||
     t.includes("not liable if") || t.includes("at tenant's expense") ||
     t.includes("at the tenant's expense") || t.includes("tenant shall pay for")) &&
    (t.includes("heat") || t.includes("hydro") || t.includes("water") ||
     t.includes("gas") || t.includes("electricity")) &&
    // Guard: "tenant pays for hydro directly to utility" is COMPLIANT — tenant bills, not landlord cutoff
    !t.includes("directly to") && !t.includes("utility provider") && !t.includes("directly to the utility");

  if (vitalServicesCutoff) {
    found.push({
      statute_section: "RTA s.29",
      violation_type: "vital_services_cutoff",
      violation_description:
        "Clause makes tenant responsible for ensuring vital services (heat, hydro, water, or gas) remain on, or allows their interruption — void under RTA s.29. The landlord has a non-delegable statutory duty to provide and maintain vital services at all times.",
      quoted_text:
        "A landlord shall not cause the supply of a vital service to be withheld or interrupted (RTA s.29(1)). Vital services include heat, hot and cold water, fuel, electricity, natural gas, and refrigeration.",
    });
  }

  // ── Assignment prohibition — RTA s.95 ────────────────────────────────────
  const assignmentProhibition =
    (t.includes("no assignment") || t.includes("no subletting") ||
     t.includes("may not assign") || t.includes("may not sublet") ||
     t.includes("not permitted to assign") || t.includes("not permitted to sublet") ||
     /assignment.*(?:prohibited|forbidden|not allowed)/.test(t) ||
     /subletting.*(?:prohibited|forbidden|not allowed)/.test(t) ||
     (/(?:assignment|subletting).*not.*(?:permit|allow)/.test(t))) &&
    !t.includes("with consent") && !t.includes("with written consent") &&
    !t.includes("subject to") && !t.includes("with approval") &&
    !t.includes("not unreasonably") && !t.includes("not arbitrarily");

  if (assignmentProhibition) {
    found.push({
      statute_section: "RTA s.95",
      violation_type: "assignment_prohibition",
      violation_description:
        "Clause completely prohibits assignment or subletting with no consent pathway — void under RTA s.95. A landlord may require written consent (and that consent cannot be unreasonably withheld), but cannot contractually prevent a tenant from even requesting to assign or sublet.",
      quoted_text:
        "A tenant may assign a tenancy agreement with the consent of the landlord (RTA s.95(1)). A landlord shall not arbitrarily or unreasonably withhold consent to an assignment.",
    });
  }

  // ── Unlawful renewal obligation — RTA s.38 ───────────────────────────────
  const unlawfulRenewalObligation =
    ((t.includes("must give") || t.includes("shall give") ||
      t.includes("required to give") || t.includes("obligated to give")) &&
     /\b([3-9]\d|[1-9]\d{2})\s*day/.test(t) &&
     (t.includes("not renew") || t.includes("intention to vacate") ||
      t.includes("intent not to continue") || t.includes("will not be continuing") ||
      t.includes("will not renew"))) ||
    (t.includes("automatically renew") &&
     (t.includes("fixed term") || t.includes("one year") || t.includes("1 year") || /\d+.year.term/.test(t)) &&
     !t.includes("month-to-month"));

  if (unlawfulRenewalObligation) {
    found.push({
      statute_section: "RTA s.38",
      violation_type: "unlawful_renewal_obligation",
      violation_description:
        "Clause requires tenant to give advance notice of intent not to renew, or purports to auto-renew for a new fixed term — void under RTA s.38. At end of a fixed-term tenancy, the tenancy automatically continues month-to-month; no renewal notice is required from the tenant.",
      quoted_text:
        "If a tenancy agreement for a fixed term expires and is not renewed and the tenant continues to occupy the unit, the tenancy continues as a monthly tenancy on the same terms and conditions (RTA s.38(1)).",
    });
  }

  // ── Retaliation or coercion — RTA s.137/139 ──────────────────────────────
  const retaliationCoercion =
    ((t.includes("waive") || t.includes("waiver") || t.includes("forfeit")) &&
     (t.includes("right to complain") || t.includes("right to apply") ||
      t.includes("right to contact") || t.includes("right to file") ||
      t.includes("ltb") || t.includes("landlord and tenant board") ||
      t.includes("any government") || t.includes("any authority"))) ||
    ((t.includes("terminat") || t.includes("evict") || t.includes("penalt")) &&
     (t.includes("if tenant complains") || t.includes("any complaint made") ||
      t.includes("any application to") || t.includes("for making any request") ||
      t.includes("for exercising")));

  if (retaliationCoercion) {
    found.push({
      statute_section: "RTA s.139",
      violation_type: "retaliation_or_coercion",
      violation_description:
        "Clause waives the tenant's right to access the Landlord and Tenant Board, or threatens consequences for exercising legal rights — void under RTA s.139 and s.3. A landlord cannot threaten, penalize, or take adverse action against a tenant for exercising any right under the RTA.",
      quoted_text:
        "This Act applies despite any agreement or waiver to the contrary (RTA s.3(1)). A landlord shall not evict or threaten to evict a tenant in retaliation for the tenant seeking to enforce their rights under this Act.",
    });
  }

  return found;
}

// ── Compliant language templates ──────────────────────────────────────────────
// Keyed by violation_type. Each template is a model clause that would comply
// with the Ontario RTA provision violated. Placeholders like [AMOUNT] are
// intentional — the template is a starting point, not a finalised clause.
const COMPLIANT_LANGUAGE_TEMPLATES: Record<string, string> = {
  entry_without_notice:
    "The Landlord may enter the rental unit only in accordance with sections 26 and 27 of the Residential Tenancies Act, 2006. The Landlord shall provide at least 24 hours' written notice specifying the reason for entry and the time of entry (between 8:00 a.m. and 8:00 p.m.). Entry without notice is permitted only in the case of an emergency as defined in s.26(3) of the Act.",

  non_refundable_deposit:
    "The Tenant shall pay a last month's rent deposit equal to one month's rent, applied to the final period of the tenancy, in accordance with section 106 of the Residential Tenancies Act, 2006. This deposit is refundable and shall be returned with accrued interest if not applied to the last rent period. No other deposit or non-refundable fee may be collected.",

  excess_deposit:
    "The Tenant shall provide a last month's rent deposit equal to one month's rent, as permitted by section 105 of the Residential Tenancies Act, 2006. No additional security deposit, damage deposit, pet deposit, key deposit, or other deposit of any kind may be collected beyond this one permitted amount.",

  maintenance_offloaded:
    "The Landlord shall maintain the rental unit and residential complex in a good state of repair and fit for habitation, and shall comply with all applicable health, safety, housing, and maintenance standards, as required by section 20 of the Residential Tenancies Act, 2006. The Tenant is responsible for ordinary cleanliness of the rental unit only.",

  rent_increase_without_guideline:
    "The Landlord may increase the rent only once per 12-month period and only in accordance with the annual rent increase guideline established by the Province of Ontario under section 120 of the Residential Tenancies Act, 2006. The Landlord shall provide at least 90 days' written notice using the prescribed Form N1 before any increase takes effect.",

  waiver_of_rights:
    "Nothing in this agreement limits or modifies the rights, benefits, or protections of the Tenant under the Residential Tenancies Act, 2006. Any provision of this agreement that purports to waive or diminish those rights is void to that extent, pursuant to section 3(1) of the Act.",

  post_dated_cheques:
    "Rent shall be paid on the first day of each month. Post-dated cheques and pre-authorized payment are not required. The Tenant may pay by any mutually agreed lawful method. Pre-authorized debit or cheques may be provided voluntarily but cannot be demanded as a condition of the tenancy, in accordance with section 108 of the Residential Tenancies Act, 2006.",

  pet_fines:
    "Note: Any provision restricting pets is void under section 14 of the Residential Tenancies Act, 2006, and no fine, fee, or penalty may be imposed for keeping a pet, nor may a tenancy be terminated solely on the basis of having a pet.",

  rta_waiver:
    "This agreement is governed by the Residential Tenancies Act, 2006. No provision of this agreement limits the rights or remedies of either party under that Act. Any term that purports to contract out of or limit the Act's protections is void, pursuant to section 3(1) of the Residential Tenancies Act, 2006.",

  daily_late_fee:
    "Rent is due on the [1st] day of each month. If rent is not paid when due, the Landlord's remedy is to serve a Notice to End a Tenancy Early for Non-payment of Rent (Form N4) in accordance with section 59 of the Residential Tenancies Act, 2006. No additional charges, daily fees, interest, or penalties for late payment may be imposed.",

  mandatory_arbitration:
    "Any dispute arising from this tenancy shall be resolved through the Landlord and Tenant Board in accordance with the Residential Tenancies Act, 2006. Neither party waives their right to apply to the Board. Mandatory arbitration or any clause requiring the parties to forgo LTB proceedings is void under the Act.",

  self_help_eviction:
    "A tenancy may only be terminated in accordance with the Residential Tenancies Act, 2006. The Landlord shall not change the locks, seize belongings, or otherwise interfere with the Tenant's access to the rental unit. Eviction may only be carried out by a Sheriff acting on a valid order of the Landlord and Tenant Board, as required by section 19 of the Act.",

  unlawful_termination:
    "Either party may terminate this tenancy only in accordance with the Residential Tenancies Act, 2006. Termination notices must be in writing on a prescribed LTB form. The Landlord shall provide at least 60 days' written notice for most terminations. Verbal notice and notice periods shorter than the statutory minimum are void and of no effect.",

  early_termination_fee:
    "A tenancy may only be terminated in accordance with the Residential Tenancies Act, 2006. No lease-break fee, liquidated damages, or financial penalty may be charged for vacating before the end of a fixed term. If the Tenant wishes to end a fixed-term tenancy early, the parties may agree to a mutual termination in writing. The Landlord's remedies upon early departure are limited to those provided by the Act.",

  surveillance_in_unit:
    "The Landlord shall not install or maintain any camera, recording device, or monitoring equipment inside the rental unit. Security cameras may only be installed in common areas of the residential complex (hallways, entrances, parking areas) with appropriate notice to residents. The Tenant has an exclusive right to privacy within the rental unit, in accordance with the Residential Tenancies Act, 2006 and applicable privacy legislation.",

  guest_surcharge:
    "The Tenant may have guests visit the rental unit. No additional charges, fees, or surcharges may be imposed on the Tenant for the presence or duration of stay of any guest. The only remedy available to the Landlord with respect to guests who have become unauthorized occupants is through the Landlord and Tenant Board process, as permitted by the Residential Tenancies Act, 2006.",

  assignment_fee:
    "The Tenant may request to assign the tenancy or sublet the rental unit in accordance with the Residential Tenancies Act, 2006. The Landlord shall not charge any fee or administrative charge for processing or consenting to such a request. If the Landlord refuses consent without reasonable grounds, the Tenant may terminate the tenancy by giving 30 days' written notice, in accordance with section 97 of the Act.",

  // ── New: 7 additional mandatory provisions (v2.0) ──────────────────────────
  vital_services_cutoff:
    "The Landlord shall provide and maintain the following vital services at all times during the tenancy: [heat / hot and cold water / fuel / electricity / natural gas]. The Landlord shall not cause or permit the supply of any vital service to be withheld or interrupted, in accordance with sections 29–31 of the Residential Tenancies Act, 2006. Responsibility for vital services cannot be transferred to the Tenant by agreement.",

  quiet_enjoyment_violation:
    "The Landlord shall not substantially interfere with the Tenant's reasonable enjoyment of the rental unit or residential complex. Entry by the Landlord for any purpose (including inspections, repairs, or showing the unit) requires at least 24 hours' written notice specifying the reason and time of entry (between 8 a.m. and 8 p.m.), in accordance with sections 22, 26, and 27 of the Residential Tenancies Act, 2006. Periodic 'routine inspection' clauses that do not comply with the notice requirements of ss.26/27 are void.",

  assignment_prohibition:
    "The Tenant may request to assign this tenancy or sublet the rental unit in accordance with the Residential Tenancies Act, 2006. Such requests require the written consent of the Landlord, which shall not be arbitrarily or unreasonably withheld. A complete prohibition on assignment or subletting with no consent pathway is void under section 95 of the Act — the Landlord may require consent but cannot outright prevent the Tenant from making a request.",

  unlawful_renewal_obligation:
    "At the end of the fixed-term period, this tenancy agreement will automatically continue on a month-to-month basis on the same terms and conditions, in accordance with section 38 of the Residential Tenancies Act, 2006. Neither party is required to give notice of an intention to not renew. Either party may terminate the tenancy only through the proper notice procedures under the Act.",

  multiple_rent_increases:
    "The Landlord may increase the rent no more than once per 12-month period, in accordance with section 119 of the Residential Tenancies Act, 2006. Any increase must comply with the annual rent increase guideline established under section 120 of the Act and requires at least 90 days' written notice on the prescribed Form N1. Indexing rent to CPI, inflation, or any other measure on a more frequent basis is void.",

  service_reduction_no_rent_decrease:
    "If the Landlord reduces or eliminates any service or facility that is included in the rent (such as parking, storage, laundry, or utilities), the rent shall be reduced by a corresponding amount in accordance with section 125 of the Residential Tenancies Act, 2006. Either party may apply to the Landlord and Tenant Board to determine the appropriate reduction. Any clause allowing removal of included services without a rent reduction is void.",

  retaliation_or_coercion:
    "The Landlord shall not take any retaliatory action — including issuing a notice of termination, increasing rent, or reducing services — because the Tenant has exercised or intends to exercise any right under the Residential Tenancies Act, 2006, including the right to apply to the Landlord and Tenant Board, request repairs, or make a complaint to any government authority, in accordance with sections 83, 139, and 3(1) of the Act.",
};

// Returns a compliant language template for the first mandatory-provision
// violation found in the clause. Returns undefined if no such violation exists.
function suggestCompliantLanguage(
  violations: Array<{ violation_type: string }>
): string | undefined {
  for (const v of violations) {
    if (MANDATORY_PROVISION_VIOLATION_TYPES.has(v.violation_type)) {
      const template = COMPLIANT_LANGUAGE_TEMPLATES[v.violation_type];
      if (template) return template;
    }
  }
  return undefined;
}

// ── Base scoring ──────────────────────────────────────────────────────────────
function scoreClause(
  clauseText: string,
  clauseType: string,
  statutes: Statute[],
  decisions: Decision[]
): {
  base_score: number;
  is_unusual: boolean;
  is_standard: boolean;
} {
  const type = clauseType as ClauseType;
  const isStandard = STANDARD_BOILERPLATE_TYPES.includes(type);

  // Base score by clause type
  let score = isStandard ? 1 : 3;

  // Count restrictive patterns
  const restrictiveCount = TENANT_RESTRICTIVE_PATTERNS.filter((p) =>
    p.test(clauseText)
  ).length;
  score += Math.min(2, restrictiveCount * 0.7);

  // Unusual language check
  const isUnusual = UNUSUAL_LANGUAGE_PATTERNS.some((p) => p.test(clauseText));
  if (isUnusual) score += 1.5;

  // High-risk clause types get a bump — but only when the clause is restrictive,
  // not when it explicitly defers to the RTA.
  const lowerClause = clauseText.toLowerCase();
  const isRtaDeferring =
    lowerClause.includes("in accordance with") ||
    lowerClause.includes("as required by") ||
    lowerClause.includes("pursuant to") ||
    lowerClause.includes("residential tenancies act") ||
    lowerClause.includes("as permitted by");
  if (HIGH_RISK_TYPES.includes(type) && !isRtaDeferring) {
    score += 1;
  }

  // Decisions weighting: landlord_favour decisions reduce score (clause is common/upheld),
  // tenant_favour decisions increase score (clause has been struck down before)
  const highRelevanceDecisions = decisions.filter((d) => d.relevance_score >= 0.5);
  const tenantFavourCount = highRelevanceDecisions.filter(
    (d) => d.outcome === "tenant_favour"
  ).length;
  const landlordFavourCount = highRelevanceDecisions.filter(
    (d) => d.outcome === "landlord_favour"
  ).length;
  score += tenantFavourCount * 0.5;
  score -= landlordFavourCount * 0.3;

  return {
    base_score: Math.max(1, Math.min(10, score)),
    is_unusual: isUnusual,
    is_standard: isStandard && restrictiveCount === 0,
  };
}

// ── Main execute ──────────────────────────────────────────────────────────────
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
    retrieved_statutes,
    retrieved_decisions,
  } = parsed.data;

  // Handle empty clause
  if (!clause_text || clause_text.trim().length === 0) {
    const result: RiskScore = {
      risk_score: 1,
      risk_level: "low",
      is_potentially_unenforceable: false,
      is_unusual: false,
      is_standard: true,
      plain_english_explanation: "Empty clause — no content to assess.",
      risk_reasoning: "No clause text provided.",
      statutory_violations: [],
      confidence: 0,
    };
    return result;
  }

  const hasStatutes = retrieved_statutes.length > 0;
  const highRelevanceStatutes = retrieved_statutes.filter(
    (s) => s.relevance_score >= 0.5
  );

  // ── 3.2: Compliance check pass — run before violation detection ───────────────
  // Collect compliance notes for statutes where the clause is explicitly compliant.
  const complianceNotes: string[] = [];
  for (const statute of highRelevanceStatutes) {
    const check = checkStatuteCompliance(clause_text, statute);
    if (check.compliant) {
      complianceNotes.push(`✓ Complies with ${statute.act_name} s.${statute.section_number}: ${check.reason}`);
    }
  }

  // ── Detect statutory violations (3.1 + 3.2 integrated) ────────────────────
  const statuteViolations = hasStatutes
    ? detectStatutoryViolations(clause_text, retrieved_statutes)
    : [];

  // ── Statute-independent critical text violations (always run) ──────────────
  // These are so clearly void that statute retrieval is not required.
  // De-dupe: skip if the same violation_type was already caught by statute path.
  const existingTypes = new Set(statuteViolations.map((v) => v.violation_type));
  const criticalTextViolations = detectCriticalTextViolations(clause_text).filter(
    (v) => !existingTypes.has(v.violation_type)
  );
  const violations = [...statuteViolations, ...criticalTextViolations];

  // ── Base score ─────────────────────────────────────────────────────────────
  const { base_score, is_unusual, is_standard } = scoreClause(
    clause_text,
    clause_type,
    retrieved_statutes,
    retrieved_decisions
  );

  // ── 3.3: Apply known-compliant patterns (score caps + adjustments) ─────────
  const clauseTypeEnum = clause_type as ClauseType;
  const { adjustedScore: patternAdjustedScore, compliance_notes: patternNotes } =
    applyCompliantPatterns(clause_text, clauseTypeEnum, base_score);

  // Add violation bonus on top of pattern-adjusted score
  const violationBonus = Math.min(4, violations.length * 3);
  const textPatternBonus = detectTextPatternScore(clause_text);
  let finalScore = Math.round(
    Math.min(10, Math.max(1, patternAdjustedScore + violationBonus + textPatternBonus))
  );

  // ── Mandatory provision floor ──────────────────────────────────────────────
  // Any clause that violates a mandatory RTA provision (cannot be contracted out
  // of per s.3) must score at least 5 — "medium" risk at minimum.
  // Particularly severe violations (ongoing financial harm, health/safety, rights
  // suppression) carry a higher floor of 7 ("high").
  const CRITICAL_FLOOR_VIOLATIONS = new Set([
    "multiple_rent_increases",      // Quarterly/CPI increases — recurring financial harm
    "vital_services_cutoff",        // Heat/water cutoff — immediate health/safety risk
    "retaliation_or_coercion",      // Waiving LTB rights — suppression of tenant rights
    "rent_increase_without_guideline", // Above-guideline increases — severe financial harm
    "waiver_of_rights",             // Full RTA waiver — eliminates all protections
    "rta_waiver",
  ]);
  const hasEnforceabilityViolationEarly = violations.some((v) =>
    MANDATORY_PROVISION_VIOLATION_TYPES.has(v.violation_type)
  );
  const hasCriticalFloorViolation = violations.some((v) =>
    CRITICAL_FLOOR_VIOLATIONS.has(v.violation_type)
  );
  if (hasCriticalFloorViolation) {
    finalScore = Math.max(7, finalScore);
  } else if (hasEnforceabilityViolationEarly) {
    finalScore = Math.max(5, finalScore);
  }

  // ── Risk level ─────────────────────────────────────────────────────────────
  let risk_level: RiskScore["risk_level"];
  if (finalScore <= 3) risk_level = "low";
  else if (finalScore <= 6) risk_level = "medium";
  else if (finalScore <= 8) risk_level = "high";
  else risk_level = "critical";

  // ── 3.4: Strict enforceability gate ───────────────────────────────────────
  // is_potentially_unenforceable is ONLY set when:
  //   1. At least one violation is of a MANDATORY RTA provision (cannot be contracted out of per s.3)
  //   2. We have at least one high-relevance statute backing that violation
  // Unusual language alone (no specific statutory violation) does NOT trigger this.
  // A clause can score 6–8 risk (burdensome, unfair) without being unenforceable.
  const hasEnforceabilityViolation = violations.some((v) =>
    MANDATORY_PROVISION_VIOLATION_TYPES.has(v.violation_type)
  );
  const is_potentially_unenforceable =
    hasEnforceabilityViolation && highRelevanceStatutes.length > 0;

  // ── Confidence ─────────────────────────────────────────────────────────────
  let confidence: number;
  if (!hasStatutes) {
    confidence = 0.3;
    finalScore = Math.min(finalScore, 5); // Cap without statute backing
  } else if (highRelevanceStatutes.length >= 2) {
    confidence = 0.8;
  } else if (highRelevanceStatutes.length === 1) {
    confidence = 0.6;
  } else {
    confidence = 0.4;
  }

  // ── Plain English explanation ──────────────────────────────────────────────
  const clauseTypeLabel = clause_type.replace(/_/g, " ");
  let plainEnglish = `This ${clauseTypeLabel} clause scores ${finalScore}/10 risk`;

  if (finalScore <= 3) {
    plainEnglish += ". It appears to be standard language that aligns with tenant protections.";
  } else if (finalScore <= 6) {
    plainEnglish +=
      ". It contains some provisions worth reviewing, as they may limit your rights.";
  } else if (finalScore <= 8) {
    plainEnglish +=
      ". It contains high-risk provisions that may significantly restrict your rights or be legally questionable.";
  } else {
    plainEnglish +=
      ". This clause is potentially unenforceable and may directly contradict Ontario tenant protection law.";
  }

  if (!hasStatutes) {
    plainEnglish +=
      " Note: No statutes were retrieved for this clause, so the risk assessment has lower confidence.";
  }

  // ── Risk reasoning (3.1: cites quoted statute text; 3.2: shows compliance checks) ─
  const reasoningParts: string[] = [];

  // 3.2: Show compliance pass results
  if (complianceNotes.length > 0) {
    reasoningParts.push(`Compliance check: ${complianceNotes.join("; ")}`);
  }

  // 3.1: Violations with quoted statute text
  if (violations.length > 0) {
    const violationSummary = violations
      .map(
        (v) =>
          `${v.statute_section} — ${v.violation_description}` +
          (v.quoted_text ? `. Statutory basis: "${v.quoted_text}"` : "")
      )
      .join("; ");
    reasoningParts.push(`Statutory violations found: ${violationSummary}`);
  }

  // 3.3: Pattern-based adjustments applied
  if (patternNotes.length > 0) {
    reasoningParts.push(`Compliant pattern adjustments: ${patternNotes.join("; ")}`);
  }

  if (is_unusual) {
    reasoningParts.push(
      "Clause contains unusually one-sided language (e.g., absolute discretion, irrevocable waiver). Note: unusual language alone does not make a clause unenforceable."
    );
  }

  if (highRelevanceStatutes.length > 0) {
    const statuteRefs = highRelevanceStatutes
      .map((s) => `${s.act_name} s.${s.section_number} (${s.section_title})`)
      .join(", ");
    reasoningParts.push(`Assessed against: ${statuteRefs}`);
  } else if (!hasStatutes) {
    reasoningParts.push(
      "No statutes retrieved — risk assessment based on clause language patterns only"
    );
  }

  const risk_reasoning =
    reasoningParts.length > 0
      ? reasoningParts.join(". ")
      : `${clauseTypeLabel} clause assessed on language patterns. Score: ${finalScore}/10.`;

  // Suppress unused variable warning for clause_id (kept in schema for logging)
  void clause_id;

  // ── Suggested compliant language ───────────────────────────────────────────
  // Only generated when a mandatory RTA provision is violated — clauses that
  // are merely unusual or high-risk but not void do not get a template.
  const suggested_compliant_language = suggestCompliantLanguage(violations);

  const result: RiskScore = {
    risk_score: finalScore,
    risk_level,
    is_potentially_unenforceable,
    is_unusual,
    is_standard,
    plain_english_explanation: plainEnglish,
    risk_reasoning,
    statutory_violations: violations,
    confidence: Math.round(confidence * 100) / 100,
    ...(suggested_compliant_language ? { suggested_compliant_language } : {}),
  };

  return result;
}
