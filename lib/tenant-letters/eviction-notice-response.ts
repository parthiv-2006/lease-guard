/**
 * Eviction notice response letter, built from an Eviction Notice Checker result.
 * Only offered when the checker found at least one failed check. Reasons are the
 * failed checks' own details and citations (lib/eviction-notice-checker.ts), plus
 * s.39 — a landlord may not recover possession without the tenant leaving or a
 * Board order (see lib/tenant-letters/core.ts).
 */

import type { EvictionCheckResult, NoticeType } from "../eviction-notice-checker";
import { createLetter, formatLetterDate, type LetterParties, type TenantLetter } from "./core";

export interface EvictionLetterDetails {
  noticeType: NoticeType;
  noticeGivenDate: Date;
  terminationDate: Date;
}

export const NOTICE_TYPE_NAMES: Record<NoticeType, string> = {
  N4: "Form N4 (non-payment of rent)",
  N5: "Form N5 (interference, damage or overcrowding)",
  N8: "Form N8 (persistent late payment or other grounds)",
  N12: "Form N12 (landlord's or purchaser's own use)",
  N13: "Form N13 (demolition, conversion or repairs)",
};

const RESPOND_WITHIN_DAYS = 14;

export function buildEvictionNoticeResponseLetter(
  result: EvictionCheckResult,
  details: EvictionLetterDetails,
  parties: Partial<LetterParties>,
  letterDate: Date
): TenantLetter | null {
  const failed = result.checks.filter((c) => c.status === "fail");
  if (result.verdict !== "not_valid" || failed.length === 0) return null;

  const noticeName = NOTICE_TYPE_NAMES[details.noticeType];

  return createLetter({
    kind: "eviction_notice_response",
    title: "Eviction notice response",
    subject: `Response to ${details.noticeType} notice dated ${formatLetterDate(details.noticeGivenDate)}`,
    letterDate,
    respondWithinDays: RESPOND_WITHIN_DAYS,
    parties,
    blocks: [
      {
        type: "paragraph",
        text:
          `I am writing about the ${noticeName} notice of termination dated ${formatLetterDate(details.noticeGivenDate)}, ` +
          `which gives a termination date of ${formatLetterDate(details.terminationDate)}.`,
      },
      {
        type: "paragraph",
        text: "Having reviewed the notice against the Residential Tenancies Act, 2006, it does not appear to meet the Act's requirements, for the following reasons:",
      },
      { type: "list", items: failed.map((c) => `${c.label}: ${c.detail} (${c.citation})`) },
      {
        type: "paragraph",
        text:
          "I do not agree to end my tenancy on the basis of this notice. Under section 39 of the Act, a landlord may not recover " +
          "possession of a rental unit unless the tenant has moved out or the Landlord and Tenant Board has ordered an eviction.",
      },
      {
        type: "paragraph",
        text:
          "If you apply to the Board based on this notice, I intend to raise the issues above at the hearing. " +
          "I would prefer to resolve this directly, so please let me know in writing if you have any questions.",
      },
    ],
    citations: [...failed.map((c) => c.citation), "RTA s.39"],
  });
}
