/**
 * Deposit interest demand letter, built from a Deposit & Fees Checker result.
 * Interest math and every citation come from lib/deposit-fees-checker.ts:
 * s.106(6) interest owed, s.106(9) the tenant's right to deduct unpaid interest,
 * s.106(2) the deposit cap, and s.105(1)/s.134(1) for charges the Act does not permit.
 */

import type { DepositInterestResult, FeeCheckResult } from "../deposit-fees-checker";
import {
  addDays,
  createLetter,
  formatLetterDate,
  formatMoney,
  type LetterBlock,
  type LetterParties,
  type TenantLetter,
} from "./core";

export interface DepositLetterDetails {
  depositAmount: number;
  depositPaidDate: Date;
  asOfDate: Date;
}

const RESPOND_WITHIN_DAYS = 14;

export function buildDepositInterestDemandLetter(
  result: DepositInterestResult,
  details: DepositLetterDetails,
  chargedFees: FeeCheckResult[],
  parties: Partial<LetterParties>,
  letterDate: Date
): TenantLetter | null {
  const notPermittedFees = chargedFees.filter((f) => f.verdict === "not_permitted");
  const owesInterest = result.totalInterestOwed > 0;
  if (!owesInterest && !result.depositExceedsCap && notPermittedFees.length === 0) return null;

  const respondBy = formatLetterDate(addDays(letterDate, RESPOND_WITHIN_DAYS));
  const blocks: LetterBlock[] = [
    {
      type: "paragraph",
      text: `On ${formatLetterDate(details.depositPaidDate)} I paid you a last month's rent deposit of ${formatMoney(details.depositAmount)}.`,
    },
  ];
  const citations: string[] = [];

  if (owesInterest) {
    blocks.push(
      {
        type: "paragraph",
        text:
          "Section 106(6) of the Residential Tenancies Act, 2006 requires a landlord to pay the tenant interest on a rent deposit every year, " +
          "at the rent increase guideline rate in effect when the payment is due. Based on the guideline for each year, the interest owing " +
          `up to ${formatLetterDate(details.asOfDate)} is ${formatMoney(result.totalInterestOwed)}:`,
      },
      {
        type: "list",
        items: result.byYear.map(
          (y) => `${y.year}: ${y.guidelinePercent}% for ${y.daysInYear} ${y.daysInYear === 1 ? "day" : "days"} — ${formatMoney(y.interestOwed)}`
        ),
      },
      {
        type: "paragraph",
        text:
          `Please pay this amount by ${respondBy}. If it is not paid, section 106(9) of the Act permits me to deduct ` +
          "the unpaid interest from a future rent payment, and I intend to do so.",
      }
    );
    citations.push("RTA s.106(6)", "RTA s.106(9)");
  }

  if (result.depositExceedsCap) {
    const excess = Math.round((details.depositAmount - result.capAmount) * 100) / 100;
    blocks.push({
      type: "paragraph",
      text:
        `A rent deposit cannot be more than one month's rent (s.106(2)). My monthly rent is ${formatMoney(result.capAmount)}, ` +
        `so the deposit is ${formatMoney(excess)} more than the Act permits. Please refund that amount by ${respondBy}.`,
    });
    citations.push("RTA s.106(2)");
  }

  if (notPermittedFees.length > 0) {
    blocks.push(
      {
        type: "paragraph",
        text: `I was also charged the following, which the Act does not permit a landlord to collect. Please refund these amounts by ${respondBy}:`,
      },
      { type: "list", items: notPermittedFees.map((f) => `${f.label} (${f.citation})`) }
    );
    citations.push(...notPermittedFees.map((f) => f.citation));
  }

  blocks.push({
    type: "paragraph",
    text: "Please confirm in writing how and when the payment will be made. I am happy to receive it by cheque, e-transfer, or as a credit on my next rent payment.",
  });

  return createLetter({
    kind: "deposit_interest_demand",
    title: owesInterest ? "Deposit interest demand" : "Deposit and fee refund request",
    subject: owesInterest ? "Interest owing on my last month's rent deposit" : "Refund of deposit and fees",
    letterDate,
    respondWithinDays: RESPOND_WITHIN_DAYS,
    parties,
    blocks,
    citations,
  });
}
