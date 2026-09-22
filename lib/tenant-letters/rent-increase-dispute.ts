/**
 * Rent increase dispute letter, built from a Rent Increase Checker result.
 * Only offered when the checker found at least one failed check — every reason
 * listed in the letter is a failed check's own detail and citation
 * (lib/rent-increase-checker.ts).
 */

import type { RentIncreaseCheckResult } from "../rent-increase-checker";
import {
  addDays,
  createLetter,
  formatLetterDate,
  formatMoney,
  type LetterParties,
  type TenantLetter,
} from "./core";

export interface RentIncreaseLetterDetails {
  currentRent: number;
  proposedRent: number;
  noticeGivenDate: Date;
  effectiveDate: Date;
}

const RESPOND_WITHIN_DAYS = 14;

export function buildRentIncreaseDisputeLetter(
  result: RentIncreaseCheckResult,
  details: RentIncreaseLetterDetails,
  parties: Partial<LetterParties>,
  letterDate: Date
): TenantLetter | null {
  const failed = result.checks.filter((c) => c.status === "fail");
  if (result.verdict !== "not_compliant" || failed.length === 0) return null;

  const respondBy = formatLetterDate(addDays(letterDate, RESPOND_WITHIN_DAYS));
  const noticeVoid = failed.some((c) => c.id === "notice_period");

  return createLetter({
    kind: "rent_increase_dispute",
    title: "Rent increase dispute",
    subject: `Notice of rent increase dated ${formatLetterDate(details.noticeGivenDate)}`,
    letterDate,
    respondWithinDays: RESPOND_WITHIN_DAYS,
    parties,
    blocks: [
      {
        type: "paragraph",
        text:
          `I am writing about your notice dated ${formatLetterDate(details.noticeGivenDate)}, which proposes to increase my rent ` +
          `from ${formatMoney(details.currentRent)} to ${formatMoney(details.proposedRent)} ` +
          `(${result.percentRequested.toFixed(2)}%) effective ${formatLetterDate(details.effectiveDate)}.`,
      },
      {
        type: "paragraph",
        text: "Having reviewed the notice against the Residential Tenancies Act, 2006, the increase does not appear to comply with the Act, for the following reasons:",
      },
      { type: "list", items: failed.map((c) => `${c.label}: ${c.detail} (${c.citation})`) },
      {
        type: "paragraph",
        text: noticeVoid
          ? "Because the required notice was not given, the increase may not be enforceable as proposed. Until a notice that complies with the Act takes effect, I will continue to pay my current rent of " +
            `${formatMoney(details.currentRent)}.`
          : `Until an increase that complies with the Act takes effect, I will continue to pay my current rent of ${formatMoney(details.currentRent)}.`,
      },
      {
        type: "paragraph",
        text: `Please confirm in writing by ${respondBy} that the increase will not take effect as proposed. If you believe I have misunderstood the notice, I would be glad to review any documents that support it.`,
      },
    ],
    citations: failed.map((c) => c.citation),
  });
}
