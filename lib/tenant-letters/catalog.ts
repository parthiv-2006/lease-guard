/**
 * The letters LeaseGuard can write, and the checker each one is generated from.
 * Read by the /letters hub page. Every letter starts from a checker result, so
 * `checkerSlug` must match an entry in lib/tenant-tools.ts.
 */

import type { LetterKind } from "./core";

export interface LetterCatalogEntry {
  kind: LetterKind;
  title: string;
  whenToUse: string;
  checkerSlug: string;
  statuteRefs: string[];
}

export const LETTER_CATALOG: LetterCatalogEntry[] = [
  {
    kind: "repair_request",
    title: "Repair request",
    whenToUse:
      "Something in your unit needs fixing — heat, hot water, pests, mould, a broken appliance or lock. Puts your request on the record with the obligation that applies and a date to reply by.",
    checkerSlug: "maintenance-repairs-checker",
    statuteRefs: ["s. 20", "s. 21", "s. 27"],
  },
  {
    kind: "rent_increase_dispute",
    title: "Rent increase dispute",
    whenToUse:
      "Your rent increase notice came too late, too soon after the last one, or asks for more than the guideline. Lists each requirement the notice doesn't appear to meet.",
    checkerSlug: "rent-increase-checker",
    statuteRefs: ["s. 116", "s. 119", "s. 120"],
  },
  {
    kind: "deposit_interest_demand",
    title: "Deposit interest demand",
    whenToUse:
      "Your landlord holds a last month's rent deposit and hasn't paid the yearly interest, the deposit is over one month's rent, or you were charged a fee the RTA does not permit.",
    checkerSlug: "deposit-fees-checker",
    statuteRefs: ["s. 105", "s. 106", "s. 134"],
  },
  {
    kind: "eviction_notice_response",
    title: "Eviction notice response",
    whenToUse:
      "You received an N4, N5, N8, N12 or N13 notice with a defect such as too little notice or missing compensation. Tells your landlord you don't agree to end your tenancy on the basis of that notice.",
    checkerSlug: "eviction-notice-checker",
    statuteRefs: ["s. 39", "s. 48", "s. 59"],
  },
];
