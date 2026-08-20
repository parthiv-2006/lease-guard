/**
 * Deterministic rule engine for checking last-month's-rent deposit interest owed
 * and flagging illegal fees under Ontario's Residential Tenancies Act, 2006.
 * No LLM call — pure math and a static lookup table, same pattern as
 * lib/rent-increase-checker.ts and lib/eviction-notice-checker.ts.
 *
 * Citations verified directly against the seeded RTA corpus (`statutes` table,
 * jurisdiction_code = 'CA-ON') on 2026-08-20:
 *   - s.105(1)   — the only security deposit a landlord may collect is a rent deposit
 *                  collected under s.106; any other deposit type is not permitted
 *   - s.106(2)   — a rent deposit cannot exceed the lesser of one rent period's rent
 *                  or one month's rent
 *   - s.106(6)   — a landlord must pay interest annually on the rent deposit at a rate
 *                  equal to the s.120 guideline in effect at the time payment becomes due
 *                  (the same guideline table used by lib/rent-increase-guideline.ts)
 *   - s.106(9)   — if the landlord fails to pay that interest, the tenant may deduct the
 *                  amount owing from a subsequent rent payment
 *   - s.134(1)   — prohibits a landlord from collecting any fee, premium, commission,
 *                  bonus, penalty, key deposit, or other like amount (refundable or not),
 *                  or requiring payment for goods/services as a condition of tenancy,
 *                  unless specifically prescribed as exempt
 *   - O.Reg 516/06 s.17 — exempts payment for additional/replacement keys or remote entry
 *                  devices at direct cost, and a refundable key/fob deposit not exceeding
 *                  the expected direct replacement cost
 *   - s.14       — a lease clause prohibiting pets is void, which is why a "pet deposit"
 *                  or "pet fee" has no lawful basis under the Act either
 */

import { getGuidelineForYear } from "./rent-increase-guideline";

export interface DepositInterestInput {
  depositAmount: number;
  monthlyRent: number;
  depositPaidDate: Date;
  asOfDate: Date;
}

export interface DepositInterestYear {
  year: number;
  guidelinePercent: number;
  daysInYear: number;
  interestOwed: number;
}

export interface DepositInterestResult {
  depositExceedsCap: boolean;
  capAmount: number;
  totalInterestOwed: number;
  byYear: DepositInterestYear[];
  disclaimer: string;
}

const DISCLAIMER =
  "LeaseGuard provides educational information only and does not constitute legal advice. " +
  "For matters requiring professional legal judgment, consult a licensed paralegal, lawyer, or the Landlord and Tenant Board.";

/**
 * Interest accrues annually at the guideline rate in effect for each calendar
 * year the deposit was held, prorated for partial first/last years. This
 * mirrors how the Board calculates interest owing under s.106(6): each
 * calendar year's guideline percentage applies to the portion of that year
 * the deposit was actually held.
 *
 * All year-bucketing uses UTC accessors/constructors throughout. Mixing a
 * UTC-parsed input date (e.g. `new Date("2024-01-01")`) with locally
 * constructed year boundaries (`new Date(year, 0, 1)`) would silently shift
 * the bucket by a day for any server/test timezone behind UTC — this keeps
 * the whole calculation timezone-agnostic.
 */
export function checkDepositInterest(input: DepositInterestInput): DepositInterestResult {
  const { depositAmount, monthlyRent, depositPaidDate, asOfDate } = input;

  const capAmount = monthlyRent;
  const depositExceedsCap = depositAmount > capAmount + 0.01;

  const byYear: DepositInterestYear[] = [];
  let totalInterestOwed = 0;

  if (asOfDate.getTime() > depositPaidDate.getTime()) {
    const startYear = depositPaidDate.getUTCFullYear();
    const endYear = asOfDate.getUTCFullYear();

    for (let year = startYear; year <= endYear; year++) {
      const yearStart = new Date(Math.max(Date.UTC(year, 0, 1), depositPaidDate.getTime()));
      const yearEnd = new Date(Math.min(Date.UTC(year + 1, 0, 1), asOfDate.getTime()));
      if (yearEnd.getTime() <= yearStart.getTime()) continue;

      const daysInYear = Math.round((yearEnd.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000));
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const daysInCalendarYear = isLeap ? 366 : 365;
      const guideline = getGuidelineForYear(year);
      const interestOwed = depositAmount * (guideline.percent / 100) * (daysInYear / daysInCalendarYear);

      byYear.push({
        year,
        guidelinePercent: guideline.percent,
        daysInYear,
        interestOwed: Math.round(interestOwed * 100) / 100,
      });
      totalInterestOwed += interestOwed;
    }
  }

  return {
    depositExceedsCap,
    capAmount,
    totalInterestOwed: Math.round(totalInterestOwed * 100) / 100,
    byYear,
    disclaimer: DISCLAIMER,
  };
}

export type FeeType =
  | "last_months_rent"
  | "key_deposit_refundable"
  | "security_or_damage_deposit"
  | "pet_deposit_or_fee"
  | "application_or_credit_check_fee"
  | "admin_or_move_in_fee"
  | "post_dated_cheque_fee";

export type FeeVerdict = "legal" | "illegal" | "conditional";

export interface FeeCheckResult {
  feeType: FeeType;
  verdict: FeeVerdict;
  label: string;
  detail: string;
  citation: string;
}

const FEE_RULES: Record<FeeType, Omit<FeeCheckResult, "feeType">> = {
  last_months_rent: {
    verdict: "legal",
    label: "Last month's rent deposit",
    detail: "This is the only deposit type the RTA permits, capped at the lesser of one rent period's rent or one month's rent, and it earns annual interest.",
    citation: "RTA s.105(1), s.106(2)",
  },
  key_deposit_refundable: {
    verdict: "conditional",
    label: "Key / fob deposit",
    detail: "Legal only if it is refundable and does not exceed the actual expected replacement cost of the keys or devices. A deposit larger than that cost, or one that isn't refundable, is not permitted.",
    citation: "RTA s.134(1); O. Reg. 516/06 s.17",
  },
  security_or_damage_deposit: {
    verdict: "illegal",
    label: "Security or damage deposit",
    detail: "The RTA does not permit any security or damage deposit beyond the last month's rent deposit. A landlord cannot lawfully collect this, refundable or not.",
    citation: "RTA s.105(1)",
  },
  pet_deposit_or_fee: {
    verdict: "illegal",
    label: "Pet deposit or pet fee",
    detail: "Not permitted under the RTA — the only lawful deposit is the last month's rent deposit, and lease clauses that prohibit pets outright are void, so a fee tied to allowing a pet has no lawful basis either.",
    citation: "RTA s.105(1), s.14",
  },
  application_or_credit_check_fee: {
    verdict: "illegal",
    label: "Application or credit-check fee",
    detail: "A landlord cannot require a prospective tenant to pay a fee as a condition of granting a tenancy, unless specifically prescribed as exempt (which this is not).",
    citation: "RTA s.134(1)",
  },
  admin_or_move_in_fee: {
    verdict: "illegal",
    label: "Administration / move-in fee",
    detail: "A generic administrative or move-in charge is not one of the prescribed exemptions and is prohibited as an additional charge.",
    citation: "RTA s.134(1)",
  },
  post_dated_cheque_fee: {
    verdict: "illegal",
    label: "Fee for providing post-dated cheques / pre-authorized payment",
    detail: "A landlord cannot charge a fee simply for the method of rent payment a tenant chooses to offer or is asked to provide.",
    citation: "RTA s.134(1)",
  },
};

export function checkFeeLegality(feeType: FeeType): FeeCheckResult {
  return { feeType, ...FEE_RULES[feeType] };
}

export function allFeeTypes(): FeeType[] {
  return Object.keys(FEE_RULES) as FeeType[];
}
