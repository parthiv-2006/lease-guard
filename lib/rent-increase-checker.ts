/**
 * Deterministic rule engine for checking whether a rent increase notice
 * complies with Ontario's Residential Tenancies Act, 2006. No LLM call —
 * pure date/percentage math, same pattern as mcp-server/src/tools/score-risk.ts.
 *
 * Citations verified directly against the seeded RTA corpus (`statutes` table,
 * jurisdiction_code = 'CA-ON') on 2026-08-17:
 *   - s.116(1)/(3)/(4) — 90 days' written notice in the Board-approved form; increase is void without it
 *   - s.119(1)         — at least 12 months must elapse since the last increase (or tenancy start)
 *   - s.120(1)         — increase may not exceed the annual guideline
 *   - s.6.1(2)         — guideline (s.120-122,126-133,165,167) does not apply to units first occupied
 *                        for residential purposes after November 15, 2018 — notice/frequency rules
 *                        (s.116, s.119) still apply to these units
 *   - s.121 / s.126    — above-guideline increases are only lawful via a signed tenant agreement
 *                        (s.121, capital expenditure/new service) or an LTB order (s.126)
 */

import { getGuidelineForYear } from "./rent-increase-guideline";

export interface RentIncreaseCheckInput {
  currentRent: number;
  proposedRent: number;
  noticeGivenDate: Date;
  effectiveDate: Date;
  lastIncreaseDate: Date;
  isNewBuildingExempt: boolean;
  hasAgiApproval: boolean;
}

export type CheckStatus = "pass" | "fail" | "not_applicable";

export interface RentIncreaseCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  citation: string;
}

export type RentIncreaseVerdict = "compliant" | "not_compliant";

export interface RentIncreaseCheckResult {
  verdict: RentIncreaseVerdict;
  summary: string;
  percentRequested: number;
  guidelineYear: number;
  guidelinePercent: number;
  guidelineIsEstimate: boolean;
  checks: RentIncreaseCheckItem[];
  disclaimer: string;
}

const DISCLAIMER =
  "LeaseGuard provides educational information only and does not constitute legal advice. " +
  "For matters requiring professional legal judgment, consult a licensed paralegal, lawyer, or the Landlord and Tenant Board.";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function diffInDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

export function checkRentIncrease(input: RentIncreaseCheckInput): RentIncreaseCheckResult {
  const {
    currentRent,
    proposedRent,
    noticeGivenDate,
    effectiveDate,
    lastIncreaseDate,
    isNewBuildingExempt,
    hasAgiApproval,
  } = input;

  const percentRequested = ((proposedRent - currentRent) / currentRent) * 100;
  const guideline = getGuidelineForYear(effectiveDate.getFullYear());

  if (percentRequested <= 0) {
    return {
      verdict: "compliant",
      summary: "The proposed rent is not higher than the current rent, so no rent-increase rules apply.",
      percentRequested,
      guidelineYear: guideline.year,
      guidelinePercent: guideline.percent,
      guidelineIsEstimate: guideline.isEstimate,
      checks: [],
      disclaimer: DISCLAIMER,
    };
  }

  const checks: RentIncreaseCheckItem[] = [];

  // s.116 — 90 days' written notice, required even where s.121/s.126 above-guideline
  // approval exists (s.116(2)) and even for units exempt from the guideline under s.6.1.
  const noticeDays = diffInDays(effectiveDate, noticeGivenDate);
  checks.push(
    noticeDays >= 90
      ? {
          id: "notice_period",
          label: "90-day written notice",
          status: "pass",
          detail: `${noticeDays} days' notice was given before the effective date, meeting the 90-day minimum.`,
          citation: "RTA s.116(1)",
        }
      : {
          id: "notice_period",
          label: "90-day written notice",
          status: "fail",
          detail:
            noticeDays < 0
              ? "The effective date is before the notice date — check the dates entered."
              : `Only ${noticeDays} days' notice was given. RTA s.116(4): an increase without the required 90 days' notice is void.`,
          citation: "RTA s.116(1), (4)",
        }
  );

  // s.119 — 12 months must have elapsed since the last increase (or tenancy start).
  const minNextIncreaseDate = addMonths(lastIncreaseDate, 12);
  const frequencyOk = effectiveDate.getTime() >= minNextIncreaseDate.getTime();
  checks.push(
    frequencyOk
      ? {
          id: "frequency",
          label: "12-month rule",
          status: "pass",
          detail: "At least 12 months have elapsed since the last rent increase (or start of tenancy).",
          citation: "RTA s.119(1)",
        }
      : {
          id: "frequency",
          label: "12-month rule",
          status: "fail",
          detail: `Fewer than 12 months have elapsed since the last increase. The earliest a new increase could lawfully take effect is ${minNextIncreaseDate.toISOString().slice(0, 10)}.`,
          citation: "RTA s.119(1)",
        }
  );

  // s.120 guideline cap — does not apply to s.6.1(2) new-construction-exempt units,
  // and does not apply where the landlord has a s.121 agreement or s.126 LTB order.
  if (isNewBuildingExempt) {
    checks.push({
      id: "guideline_cap",
      label: "Guideline cap",
      status: "not_applicable",
      detail:
        "This unit was first occupied for residential purposes after November 15, 2018, so it is exempt from the guideline cap. The 90-day notice and 12-month rules above still apply in full.",
      citation: "RTA s.6.1(2)",
    });
  } else if (hasAgiApproval) {
    checks.push({
      id: "guideline_cap",
      label: "Guideline cap",
      status: "not_applicable",
      detail:
        "You indicated the landlord has a signed s.121 agreement or an LTB s.126 order authorizing an above-guideline increase. This checker cannot verify the amount actually approved — confirm the proposed rent does not exceed what that agreement or order permits.",
      citation: "RTA s.121, s.126",
    });
  } else {
    const withinGuideline = percentRequested <= guideline.percent + 0.01;
    checks.push(
      withinGuideline
        ? {
            id: "guideline_cap",
            label: "Guideline cap",
            status: "pass",
            detail: `The requested increase (${percentRequested.toFixed(2)}%) is within the ${guideline.year} guideline of ${guideline.percent}%.`,
            citation: "RTA s.120(1)",
          }
        : {
            id: "guideline_cap",
            label: "Guideline cap",
            status: "fail",
            detail: `The requested increase (${percentRequested.toFixed(2)}%) exceeds the ${guideline.year} guideline of ${guideline.percent}%. An increase above the guideline is only lawful with a signed s.121 agreement or an LTB s.126 order.`,
            citation: "RTA s.120(1)",
          }
    );
  }

  const verdict: RentIncreaseVerdict = checks.some((c) => c.status === "fail")
    ? "not_compliant"
    : "compliant";

  const summary =
    verdict === "compliant"
      ? "Based on the dates and amounts entered, this rent increase appears to comply with the RTA."
      : "Based on the dates and amounts entered, this rent increase does not appear to comply with the RTA — see the failed checks below.";

  return {
    verdict,
    summary,
    percentRequested,
    guidelineYear: guideline.year,
    guidelinePercent: guideline.percent,
    guidelineIsEstimate: guideline.isEstimate,
    checks,
    disclaimer: DISCLAIMER,
  };
}
