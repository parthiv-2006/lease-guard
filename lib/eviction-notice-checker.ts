/**
 * Deterministic rule engine for checking whether a landlord's eviction /
 * termination notice complies with Ontario's Residential Tenancies Act, 2006.
 * No LLM call — pure date math and switch logic, same pattern as
 * lib/rent-increase-checker.ts and mcp-server/src/tools/score-risk.ts.
 *
 * Citations verified directly against the seeded RTA corpus (`statutes` table,
 * jurisdiction_code = 'CA-ON') on 2026-08-20:
 *   - s.44          — general notice-period table referenced by s.58 (N8): 28 days for a
 *                      daily/weekly tenancy, 60 days for monthly/yearly/fixed-term, ending
 *                      on the last day of a period or term
 *   - s.48/48.1      — N12 landlord (or landlord's spouse/child/parent/caregiver) personally
 *                      requires the unit: 60 days' notice, ending on last day of period/term;
 *                      only available if the landlord is an individual AND the unit is owned
 *                      in whole or part by an individual (s.48(5)) — a corporate landlord
 *                      cannot serve this notice; compensation of one month's rent or another
 *                      acceptable unit is mandatory (s.48.1)
 *   - s.49/49.1      — N12 purchaser variant: same 60-day/compensation structure as s.48
 *   - s.50, 52, 53   — N13 demolition / conversion / repairs: 120 days' notice, ending on
 *                      last day of period/term; compensation (3 months' rent for buildings
 *                      with 5+ units under s.52(1), 1 month's rent for smaller buildings
 *                      under s.52(2), or another acceptable unit) applies only to demolition
 *                      and conversion grounds — the repairs ground instead carries a right of
 *                      first refusal to move back in (s.50(3)/s.53), not mandatory cash
 *                      compensation under the Act
 *   - s.58           — N8 additional grounds at end of term/period, incl. persistent late
 *                      rent payment; notice period per s.44, no cure/void mechanism
 *   - s.59           — N4 non-payment of rent: 7 days' notice for a daily/weekly tenancy,
 *                      14 days for all other tenancy types; void if the tenant pays all
 *                      arrears before the landlord applies to the Board (s.59(3))
 *   - s.62           — N5 ordinary undue damage: 20 days' notice; void if the tenant
 *                      corrects the issue within 7 days of receiving the notice
 *   - s.63           — N5 wilful or severe damage: 10 days' notice; s.63(3) explicitly
 *                      disapplies the s.62 cure/void mechanism — there is no opportunity
 *                      to correct
 *   - s.64           — N5 interference with reasonable enjoyment: 20 days' notice; void if
 *                      corrected within 7 days
 *   - s.67           — N5 overcrowding: 20 days' notice; void if corrected within 7 days
 */

export type NoticeType = "N4" | "N5" | "N8" | "N12" | "N13";
export type CheckStatus = "pass" | "fail" | "not_applicable";
export type EvictionVerdict = "appears_valid" | "not_valid";

export interface EvictionCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  citation: string;
}

export interface EvictionCheckResult {
  verdict: EvictionVerdict;
  summary: string;
  requiredNoticeDays: number;
  actualNoticeDays: number;
  checks: EvictionCheckItem[];
  disclaimer: string;
}

export type TenancyType = "daily_weekly" | "other";
export type N5Ground = "damage_ordinary" | "damage_wilful_severe" | "interference" | "overcrowding";
export type N13Ground = "demolition" | "conversion" | "repairs";
export type N12ServedBy = "landlord" | "purchaser";

export type EvictionCheckInput =
  | {
      noticeType: "N4";
      noticeGivenDate: Date;
      terminationDate: Date;
      tenancyType: TenancyType;
    }
  | {
      noticeType: "N5";
      noticeGivenDate: Date;
      terminationDate: Date;
      ground: N5Ground;
    }
  | {
      noticeType: "N8";
      noticeGivenDate: Date;
      terminationDate: Date;
      tenancyType: TenancyType;
    }
  | {
      noticeType: "N12";
      noticeGivenDate: Date;
      terminationDate: Date;
      servedBy: N12ServedBy;
      landlordIsIndividual: boolean;
      unitIndividuallyOwned: boolean;
      compensationOffered: boolean;
    }
  | {
      noticeType: "N13";
      noticeGivenDate: Date;
      terminationDate: Date;
      ground: N13Ground;
      buildingUnitCount: number;
      compensationOffered: boolean;
    };

const DISCLAIMER =
  "LeaseGuard provides educational information only and does not constitute legal advice. " +
  "For matters requiring professional legal judgment, consult a licensed paralegal, lawyer, or the Landlord and Tenant Board.";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function diffInDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

function noticePeriodCheck(
  actualDays: number,
  requiredDays: number,
  citation: string,
  label = "Minimum notice period"
): EvictionCheckItem {
  return actualDays >= requiredDays
    ? {
        id: "notice_period",
        label,
        status: "pass",
        detail: `${actualDays} days' notice was given, meeting the ${requiredDays}-day minimum.`,
        citation,
      }
    : {
        id: "notice_period",
        label,
        status: "fail",
        detail:
          actualDays < 0
            ? "The termination date is before the notice date — check the dates entered."
            : `Only ${actualDays} days' notice was given. RTA requires at least ${requiredDays} days for this notice type. A notice with insufficient notice period is not valid.`,
        citation,
      };
}

export function checkEvictionNotice(input: EvictionCheckInput): EvictionCheckResult {
  const actualNoticeDays = diffInDays(input.terminationDate, input.noticeGivenDate);
  const checks: EvictionCheckItem[] = [];
  let requiredNoticeDays: number;

  switch (input.noticeType) {
    case "N4": {
      requiredNoticeDays = input.tenancyType === "daily_weekly" ? 7 : 14;
      checks.push(
        noticePeriodCheck(actualNoticeDays, requiredNoticeDays, "RTA s.59(1)", "Notice period (N4)")
      );
      checks.push({
        id: "n4_void_on_payment",
        label: "Right to void by paying arrears",
        status: "not_applicable",
        detail:
          "The N4 becomes void if the tenant pays all rent owing (plus any additional rent that has since become due) before the landlord applies to the Board for an eviction order. This checker cannot verify whether payment was made.",
        citation: "RTA s.59(3)",
      });
      break;
    }
    case "N5": {
      const groundInfo: Record<N5Ground, { days: number; citation: string; hasCure: boolean; label: string }> = {
        damage_ordinary: { days: 20, citation: "RTA s.62", hasCure: true, label: "Notice period (N5 — undue damage)" },
        damage_wilful_severe: {
          days: 10,
          citation: "RTA s.63",
          hasCure: false,
          label: "Notice period (N5 — wilful/severe damage)",
        },
        interference: { days: 20, citation: "RTA s.64", hasCure: true, label: "Notice period (N5 — interference)" },
        overcrowding: { days: 20, citation: "RTA s.67", hasCure: true, label: "Notice period (N5 — overcrowding)" },
      };
      const info = groundInfo[input.ground];
      requiredNoticeDays = info.days;
      checks.push(noticePeriodCheck(actualNoticeDays, requiredNoticeDays, info.citation, info.label));
      checks.push(
        info.hasCure
          ? {
              id: "n5_cure_period",
              label: "Right to correct within 7 days",
              status: "not_applicable",
              detail:
                "This notice is void if the tenant stops the conduct, corrects the issue, or reduces occupancy (as applicable) within 7 days of receiving it. This checker cannot verify whether the issue was corrected.",
              citation: `${info.citation} — cure/void provision`,
            }
          : {
              id: "n5_cure_period",
              label: "No opportunity to correct",
              status: "not_applicable",
              detail:
                "For wilful or severe damage under s.63, the law does not give the tenant a chance to correct the problem before this notice can proceed — s.63(3) explicitly removes the s.62 cure period.",
              citation: "RTA s.63(3)",
            }
      );
      break;
    }
    case "N8": {
      requiredNoticeDays = input.tenancyType === "daily_weekly" ? 28 : 60;
      checks.push(
        noticePeriodCheck(actualNoticeDays, requiredNoticeDays, "RTA s.58(2), s.44", "Notice period (N8)")
      );
      checks.push({
        id: "n8_period_end",
        label: "Must end on last day of a rental period or term",
        status: "not_applicable",
        detail:
          "The termination date must fall on the last day of a rental period (or the end of the term, for a fixed-term tenancy). This checker cannot verify your rental period boundaries from the dates alone — confirm this against your lease.",
        citation: "RTA s.58(2)",
      });
      break;
    }
    case "N12": {
      requiredNoticeDays = 60;
      checks.push(noticePeriodCheck(actualNoticeDays, requiredNoticeDays, "RTA s.48(2)/49(3)", "Notice period (N12)"));

      if (input.servedBy === "landlord") {
        const eligible = input.landlordIsIndividual && input.unitIndividuallyOwned;
        checks.push(
          eligible
            ? {
                id: "n12_eligibility",
                label: "Landlord eligible to serve N12",
                status: "pass",
                detail: "A landlord who is an individual, for a unit owned in whole or part by an individual, may serve this notice.",
                citation: "RTA s.48(5)",
              }
            : {
                id: "n12_eligibility",
                label: "Landlord eligible to serve N12",
                status: "fail",
                detail:
                  "Section 48 only authorizes an N12 if the landlord is an individual (not a corporation) and the rental unit is owned in whole or part by an individual. Based on what you entered, this notice does not meet that requirement.",
                citation: "RTA s.48(5)",
              }
        );
      } else {
        checks.push({
          id: "n12_eligibility",
          label: "Purchaser own-use notice",
          status: "not_applicable",
          detail:
            "A landlord may serve this notice on behalf of a purchaser only for a residential complex of 3 or fewer units, or a condominium unit under an agreement of purchase and sale. This checker cannot verify property type or unit count from the dates alone.",
          citation: "RTA s.49(1)/(2)",
        });
      }

      checks.push(
        input.compensationOffered
          ? {
              id: "n12_compensation",
              label: "Compensation provided",
              status: "pass",
              detail: "One month's rent (or another unit acceptable to the tenant) is owed by the termination date — you indicated this was provided.",
              citation: "RTA s.48.1 / s.49.1",
            }
          : {
              id: "n12_compensation",
              label: "Compensation provided",
              status: "fail",
              detail:
                "The landlord must compensate the tenant an amount equal to one month's rent, or offer another unit acceptable to the tenant, by the termination date. Based on what you entered, this has not happened.",
              citation: "RTA s.48.1 / s.49.1",
            }
      );

      checks.push({
        id: "n12_good_faith",
        label: "Good-faith requirement",
        status: "not_applicable",
        detail:
          "The landlord (or purchaser), their spouse, a child or parent of either, or a caregiver, must in good faith require the unit for residential occupation for at least one year. Good faith cannot be verified from a form — it is the most commonly disputed issue in N12 cases at the Board.",
        citation: "RTA s.48(1) / s.49(1)-(2)",
      });
      break;
    }
    case "N13": {
      requiredNoticeDays = 120;
      checks.push(noticePeriodCheck(actualNoticeDays, requiredNoticeDays, "RTA s.50(2)", "Notice period (N13)"));

      if (input.ground === "repairs") {
        checks.push({
          id: "n13_compensation",
          label: "Right of first refusal (repairs)",
          status: "not_applicable",
          detail:
            "For repairs/renovations requiring a building permit and vacant possession, the Act does not require cash compensation — instead the tenant has a right of first refusal to move back in once work is done, and must notify the landlord of that intent before vacating.",
          citation: "RTA s.50(3), s.53",
        });
      } else {
        const requiredMonths = input.buildingUnitCount >= 5 ? 3 : 1;
        checks.push(
          input.compensationOffered
            ? {
                id: "n13_compensation",
                label: "Compensation provided",
                status: "pass",
                detail: `${requiredMonths} month${requiredMonths > 1 ? "s'" : "'s"} rent (or another acceptable unit) is owed by the termination date for a building with ${input.buildingUnitCount >= 5 ? "5 or more" : "fewer than 5"} units — you indicated this was provided.`,
                citation: input.buildingUnitCount >= 5 ? "RTA s.52(1)" : "RTA s.52(2)",
              }
            : {
                id: "n13_compensation",
                label: "Compensation provided",
                status: "fail",
                detail: `For demolition or conversion, the landlord must pay ${requiredMonths} month${requiredMonths > 1 ? "s'" : "'s"} rent (or offer another acceptable unit) — ${input.buildingUnitCount >= 5 ? "3 months' rent applies to buildings with 5 or more units" : "1 month's rent applies to buildings with fewer than 5 units"}. Based on what you entered, this has not happened.`,
                citation: input.buildingUnitCount >= 5 ? "RTA s.52(1)" : "RTA s.52(2)",
              }
        );
      }
      break;
    }
  }

  const verdict: EvictionVerdict = checks.some((c) => c.status === "fail") ? "not_valid" : "appears_valid";
  const summary =
    verdict === "appears_valid"
      ? "Based on what you entered, this notice appears to meet the RTA's formal requirements. This does not mean the underlying grounds are true — the Board still decides that at a hearing."
      : "Based on what you entered, this notice does not appear to meet the RTA's requirements — see the failed checks below. An eviction notice with a defect like this can be challenged at the Landlord and Tenant Board.";

  return {
    verdict,
    summary,
    requiredNoticeDays,
    actualNoticeDays,
    checks,
    disclaimer: DISCLAIMER,
  };
}
