/**
 * Entry objection letter, built from a Landlord Entry Checker result. Only
 * offered when the checker found at least one failed check. Reasons are the
 * failed checks' own details and citations (lib/landlord-entry-checker.ts),
 * plus s.25, s.27 and s.29 — all verified in that module's header.
 */

import { formatClock, type EntryCheckResult } from "../landlord-entry-checker";
import { addDays, createLetter, formatLetterDate, type LetterParties, type TenantLetter } from "./core";

export interface EntryLetterDetails {
  entryAt: Date;
}

const RESPOND_WITHIN_DAYS = 7;

export function buildEntryObjectionLetter(
  result: EntryCheckResult,
  details: EntryLetterDetails,
  parties: Partial<LetterParties>,
  letterDate: Date
): TenantLetter | null {
  const failed = result.checks.filter((c) => c.status === "fail");
  if (result.verdict !== "may_not_be_permitted" || failed.length === 0) return null;

  const respondBy = formatLetterDate(addDays(letterDate, RESPOND_WITHIN_DAYS));
  const when = `${formatLetterDate(details.entryAt)} at ${formatClock(details.entryAt)}`;
  const reasonSentence =
    result.reason === "other"
      ? "No reason that the Residential Tenancies Act, 2006 permits was given for the entry."
      : `The reason for the entry was: ${result.reasonLabel.charAt(0).toLowerCase()}${result.reasonLabel.slice(1)}.`;

  return createLetter({
    kind: "entry_objection",
    title: "Entry objection",
    subject: `Entry into my unit on ${formatLetterDate(details.entryAt)}`,
    letterDate,
    respondWithinDays: RESPOND_WITHIN_DAYS,
    parties,
    blocks: [
      { type: "paragraph", text: `I am writing about the entry into my rental unit on ${when}. ${reasonSentence}` },
      {
        type: "paragraph",
        text: "Having reviewed this against the Act, the entry does not appear to have followed its requirements, for the following reasons:",
      },
      { type: "list", items: failed.map((c) => `${c.label}: ${c.detail} (${c.citation})`) },
      {
        type: "paragraph",
        text:
          "Section 25 of the Act provides that a landlord may enter a rental unit only in accordance with sections 26 and 27. " +
          "For most entries, section 27 requires written notice at least 24 hours in advance that states the reason, the day, " +
          "and a time of entry between 8 a.m. and 8 p.m.",
      },
      {
        type: "paragraph",
        text: `Please make sure any future entry follows these requirements, and confirm in writing by ${respondBy} that it will.`,
      },
      {
        type: "paragraph",
        text:
          "I am keeping a dated record of this entry. If entries like this continue, I may apply to the Landlord and Tenant Board " +
          "under section 29 of the Act, which allows an application within one year of the conduct.",
      },
    ],
    citations: [...failed.map((c) => c.citation), "RTA s.25", "RTA s.27(1), (3)", "RTA s.29(1), (2)"],
  });
}
