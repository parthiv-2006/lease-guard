/**
 * Deterministic rule engine for checking a landlord's maintenance and repair
 * obligations under Ontario's Residential Tenancies Act, 2006 and its
 * maintenance regulations. No LLM call — a static rule table plus date math,
 * same pattern as lib/deposit-fees-checker.ts and lib/eviction-notice-checker.ts.
 *
 * Citations verified directly against the seeded RTA corpus (`statutes` table,
 * jurisdiction_code = 'CA-ON') on 2026-09-20:
 *   - s.20(1)    — landlord must keep the complex and units in a good state of repair,
 *                  fit for habitation, and compliant with health, safety, housing and
 *                  maintenance standards
 *   - s.20(2)    — s.20(1) applies even if the tenant knew about the disrepair before
 *                  signing the lease
 *   - s.21(1)    — landlord shall not withhold, or deliberately interfere with, the
 *                  reasonable supply of any vital service it is obliged to supply
 *   - s.29(1)    — tenant may apply to the Board for an order that the landlord breached
 *                  s.20(1) (para 1) or withheld a vital service (para 2)
 *   - s.30(1)    — Board remedies for a s.20(1) breach: terminate the tenancy, abate rent,
 *                  authorize a repair at the landlord's cost, order specified repairs
 *   - s.31(1)    — Board remedies for a vital-service breach: prohibition order, payment,
 *                  rent abatement, administrative fine, termination
 *   - s.82(1)    — at an arrears (s.59) eviction hearing the tenant may raise any issue that
 *                  could be the subject of a tenant application, incl. maintenance
 *   - O. Reg. 516/06 s.4 — heat is a vital service from September 1 to June 15, and must
 *                  keep habitable space at least 20 °C (unless the tenant controls the heat)
 *   - O. Reg. 517/06 s.9  — plumbing and drainage free from leaks, defects and obstructions
 *   - O. Reg. 517/06 s.11 — hot and cold running water; hot water at least 43 °C
 *   - O. Reg. 517/06 s.16 — fuel and utilities supplied continuously, except for a reasonable
 *                  interruption for repair
 *   - O. Reg. 517/06 s.17 — heating systems kept in a good state of repair
 *   - O. Reg. 517/06 s.29 — exterior doors/windows securable from inside; entrance door lockable
 *   - O. Reg. 517/06 s.39 — walls and ceilings free from leaks, mould, mildew and other fungi
 *   - O. Reg. 517/06 s.40 — landlord-supplied appliances kept in good repair
 *   - O. Reg. 517/06 s.43 — elevators kept in operation except for reasonable repair time
 *   - O. Reg. 517/06 s.46 — complex kept reasonably free of rodents, vermin and insects
 *
 * NOTE: the corpus labels O. Reg. 516/06 as "Maintenance Standards" and 517/06 as
 * "Rent Increase" — the act_name values are swapped. The section text is correct, so
 * citations here use the real regulation numbers (516/06 = General, 517/06 =
 * Maintenance Standards).
 *
 * The RTA sets no fixed repair deadline. The follow-up thresholds below are
 * LeaseGuard guidance for when to escalate, not statutory deadlines, and the UI
 * must say so.
 */

export type RepairIssueType =
  | "no_heat"
  | "no_hot_water"
  | "utility_cut_off"
  | "pests"
  | "mould_leak"
  | "plumbing"
  | "appliance"
  | "elevator"
  | "locks_security";

export type RepairUrgency = "urgent" | "standard";

export type RepairStatus = "not_yet_reported" | "within_follow_up_window" | "follow_up_overdue";

export interface RepairIssueRule {
  label: string;
  urgency: RepairUrgency;
  obligation: string;
  citations: string[];
  /** Whether a failure is also a vital-service issue under s.21 rather than only s.20. */
  vitalService: boolean;
}

export interface RepairCheckInput {
  issueType: RepairIssueType;
  /** Date the tenant first told the landlord, or null if not yet reported. */
  reportedDate: Date | null;
  reportedInWriting: boolean;
  asOfDate: Date;
  /** Measured indoor temperature in °C — only used for no_heat. */
  measuredTempC?: number | null;
}

export interface HeatCheck {
  inHeatSeason: boolean;
  belowMinimum: boolean | null;
  minimumC: number;
}

export interface RepairCheckResult {
  issueType: RepairIssueType;
  label: string;
  urgency: RepairUrgency;
  obligation: string;
  citations: string[];
  status: RepairStatus;
  daysSinceReported: number | null;
  followUpThresholdDays: number;
  heat: HeatCheck | null;
  nextSteps: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "LeaseGuard provides educational information only and does not constitute legal advice. " +
  "For matters requiring professional legal judgment, consult a licensed paralegal, lawyer, or the Landlord and Tenant Board.";

export const HEAT_MINIMUM_C = 20;

/** LeaseGuard guidance for when to escalate — the RTA sets no fixed repair deadline. */
export const FOLLOW_UP_THRESHOLD_DAYS: Record<RepairUrgency, number> = {
  urgent: 1,
  standard: 14,
};

const RULES: Record<RepairIssueType, RepairIssueRule> = {
  no_heat: {
    label: "No heat or not enough heat",
    urgency: "urgent",
    obligation:
      "From September 1 to June 15, heat is a vital service and must keep all habitable space at least 20 °C, unless you control the heat yourself. Heating systems must be kept in a good state of repair.",
    citations: ["RTA s.21(1)", "O. Reg. 516/06 s.4", "O. Reg. 517/06 s.17"],
    vitalService: true,
  },
  no_hot_water: {
    label: "No hot water",
    urgency: "urgent",
    obligation:
      "Every kitchen sink, washbasin, bathtub and shower must have hot and cold running water, with hot water at least 43 °C. Utilities the landlord supplies must be supplied continuously.",
    citations: ["RTA s.21(1)", "O. Reg. 517/06 s.11", "O. Reg. 517/06 s.16"],
    vitalService: true,
  },
  utility_cut_off: {
    label: "Electricity, water or gas cut off",
    urgency: "urgent",
    obligation:
      "Fuel and utilities the landlord supplies must be supplied continuously, apart from a reasonable interruption for repair or replacement. A landlord may not withhold or deliberately interfere with a vital service it is obliged to supply.",
    citations: ["RTA s.21(1)", "O. Reg. 517/06 s.16"],
    vitalService: true,
  },
  pests: {
    label: "Pests (mice, cockroaches, bed bugs)",
    urgency: "standard",
    obligation:
      "The residential complex must be kept reasonably free of rodents, vermin and insects, and openings in the building must be sealed to keep pests out.",
    citations: ["RTA s.20(1)", "O. Reg. 517/06 s.46"],
    vitalService: false,
  },
  mould_leak: {
    label: "Mould, leaks or water damage",
    urgency: "standard",
    obligation:
      "Walls and ceilings must be kept free from holes, leaks, mould, mildew and other fungi, and the building must be weathertight and damp-proofed.",
    citations: ["RTA s.20(1)", "O. Reg. 517/06 s.39", "O. Reg. 517/06 s.6"],
    vitalService: false,
  },
  plumbing: {
    label: "Plumbing or drainage problem",
    urgency: "standard",
    obligation:
      "Plumbing and drainage systems must be kept free from leaks, defects and obstructions and protected from freezing.",
    citations: ["RTA s.20(1)", "O. Reg. 517/06 s.9"],
    vitalService: false,
  },
  appliance: {
    label: "Broken appliance supplied by the landlord",
    urgency: "standard",
    obligation:
      "Appliances the landlord supplies — fridge, stove, washer, dryer, dishwasher, hot water tank — must be kept in a good state of repair and safely operable.",
    citations: ["RTA s.20(1)", "O. Reg. 517/06 s.40"],
    vitalService: false,
  },
  elevator: {
    label: "Elevator out of service",
    urgency: "standard",
    obligation:
      "Elevators intended for tenants must be properly maintained and kept in operation, except for the reasonable time needed to repair or replace them.",
    citations: ["RTA s.20(1)", "O. Reg. 517/06 s.43"],
    vitalService: false,
  },
  locks_security: {
    label: "Broken locks, doors or windows",
    urgency: "urgent",
    obligation:
      "Exterior doors and accessible windows must be securable from the inside, and at least one entrance door must lock from outside the unit.",
    citations: ["RTA s.20(1)", "O. Reg. 517/06 s.29"],
    vitalService: false,
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Heat is a vital service from September 1 to June 15 inclusive (O. Reg. 516/06
 * s.4(1)). Uses UTC accessors so a date parsed from "YYYY-MM-DD" is bucketed the
 * same regardless of server timezone.
 */
export function isHeatSeason(date: Date): boolean {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month >= 9 || month <= 5) return true;
  return month === 6 && day <= 15;
}

function buildNextSteps(
  rule: RepairIssueRule,
  status: RepairStatus,
  reportedInWriting: boolean
): string[] {
  const steps: string[] = [];

  if (status === "not_yet_reported") {
    steps.push(
      "Tell your landlord about the problem in writing (email or letter) and keep a copy. A dated written request is your best evidence if you later apply to the Board."
    );
  } else if (!reportedInWriting) {
    steps.push(
      "Follow up in writing. Your verbal report counts, but a dated email or letter referring back to it is much stronger evidence."
    );
  }

  steps.push("Take dated photos or video of the problem and keep a log of every contact with your landlord.");

  if (status === "follow_up_overdue") {
    steps.push(
      rule.vitalService
        ? "You can apply to the Landlord and Tenant Board (Form T2) for an order that the landlord withheld a vital service. The Board can order a rent abatement, payment to you, or a fine against the landlord."
        : "You can apply to the Landlord and Tenant Board (Form T6) for an order that the landlord breached its maintenance obligations. The Board can order the repair, a rent abatement, or let you have it repaired at the landlord's cost."
    );
    steps.push(
      "You can also contact your municipality's property standards office. Local by-law officers can inspect the unit and order repairs."
    );
  }

  steps.push(
    "Keep paying your rent in full. Unpaid rent can lead to a termination notice for non-payment; repair problems are resolved through the Board, and you can raise them at any arrears hearing."
  );

  return steps;
}

export function checkRepairIssue(input: RepairCheckInput): RepairCheckResult {
  const { issueType, reportedDate, reportedInWriting, asOfDate, measuredTempC } = input;
  const rule = RULES[issueType];
  const followUpThresholdDays = FOLLOW_UP_THRESHOLD_DAYS[rule.urgency];

  let status: RepairStatus = "not_yet_reported";
  let daysSinceReported: number | null = null;
  if (reportedDate) {
    daysSinceReported = Math.max(0, Math.floor((asOfDate.getTime() - reportedDate.getTime()) / DAY_MS));
    status = daysSinceReported > followUpThresholdDays ? "follow_up_overdue" : "within_follow_up_window";
  }

  let heat: HeatCheck | null = null;
  if (issueType === "no_heat") {
    const inHeatSeason = isHeatSeason(asOfDate);
    const hasTemp = typeof measuredTempC === "number" && Number.isFinite(measuredTempC);
    heat = {
      inHeatSeason,
      belowMinimum: hasTemp && inHeatSeason ? measuredTempC < HEAT_MINIMUM_C : null,
      minimumC: HEAT_MINIMUM_C,
    };
  }

  return {
    issueType,
    label: rule.label,
    urgency: rule.urgency,
    obligation: rule.obligation,
    citations: rule.citations,
    status,
    daysSinceReported,
    followUpThresholdDays,
    heat,
    nextSteps: buildNextSteps(rule, status, reportedInWriting),
    disclaimer: DISCLAIMER,
  };
}

export function repairIssueRule(issueType: RepairIssueType): RepairIssueRule {
  return RULES[issueType];
}

export function allRepairIssueTypes(): RepairIssueType[] {
  return Object.keys(RULES) as RepairIssueType[];
}

export function isRepairIssueType(value: unknown): value is RepairIssueType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RULES, value);
}
