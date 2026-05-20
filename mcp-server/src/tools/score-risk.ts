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
    if (
      lowerClause.includes("tenant") &&
      (lowerClause.includes("responsible for") || lowerClause.includes("responsible for all")) &&
      (lowerClause.includes("repair") ||
        lowerClause.includes("maintenance") ||
        lowerClause.includes("plumbing")) &&
      statute.section_number === "20"
    ) {
      violations.push({
        statute_section: sectionRef,
        violation_type: "maintenance_offloaded",
        violation_description: `Clause shifts repair/maintenance responsibility to tenant, contradicting ${sectionRef} — landlord has a non-delegable duty to maintain the unit in good repair`,
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

  // Tenant assumes ALL repair / maintenance responsibility — RTA s.20
  if ((t.includes("100%") || t.includes("all repairs") || t.includes("all maintenance") ||
       t.includes("all costs") || t.includes("sole responsibility")) &&
      (t.includes("repair") || t.includes("maintenance") || t.includes("appliance"))) {
    bonus += 3;
  }

  // Surveillance cameras inside unit — RTA s.28 privacy
  if ((t.includes("camera") || t.includes("surveillance") || t.includes("cctv") ||
       t.includes("monitoring")) &&
      (t.includes("unit") || t.includes("premises") || t.includes("living") || t.includes("inside"))) {
    bonus += 3;
  }

  // Self-help eviction language — vacate within hours/days without LTB
  if ((t.includes("vacate") || t.includes("leave the premises") || t.includes("immediate eviction")) &&
      /within\s+\d+\s*(hour|day)/.test(t)) {
    bonus += 3;
  }

  // Surcharge / fee per guest — RTA s.134
  if (/\$\s*\d+.*per\s*(guest|person|visitor)/.test(t) ||
      /per\s*(guest|person|visitor).*\$\s*\d+/.test(t)) {
    bonus += 2;
  }

  // Mandatory cleaning fee regardless of condition — RTA s.134
  if (t.includes("cleaning fee") && t.includes("regardless")) {
    bonus += 3;
  }

  return bonus;
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
  const violations = hasStatutes
    ? detectStatutoryViolations(clause_text, retrieved_statutes)
    : [];

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
  };

  return result;
}
