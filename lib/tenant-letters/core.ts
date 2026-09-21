/**
 * Core model for LeaseGuard's tenant letters — plain-language letters a tenant
 * can send their landlord after running one of the deterministic RTA checkers.
 *
 * Letters are assembled from fixed templates (lib/tenant-letters/*.ts), never
 * from an LLM call. Every legal statement in a letter is either copied from a
 * checker result (which already carries its own verified citation) or cites a
 * section verified directly against the seeded RTA corpus (`statutes` table,
 * jurisdiction_code = 'CA-ON') on 2026-09-21:
 *   - s.27(1)/(3) — landlord may enter to carry out a repair on 24 hours' written
 *                   notice specifying the reason, day, and a time between 8 a.m. and 8 p.m.
 *   - s.39        — a landlord may not recover possession unless the tenant has
 *                   vacated or the Board has ordered an eviction
 *
 * Party details (names, addresses) are only ever held in the browser. Nothing
 * in this module persists or transmits them.
 */

export type LetterKind =
  | "repair_request"
  | "rent_increase_dispute"
  | "deposit_interest_demand"
  | "eviction_notice_response";

export interface LetterParties {
  tenantName: string;
  landlordName: string;
  rentalAddress: string;
}

export type LetterBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export interface TenantLetter {
  kind: LetterKind;
  /** Short name for the letter type, e.g. "Repair request". */
  title: string;
  subject: string;
  /** Letter date, already formatted, e.g. "September 21, 2026". */
  date: string;
  /** Date the landlord is asked to respond by, already formatted. */
  respondBy: string;
  recipient: string;
  rentalAddress: string;
  salutation: string;
  blocks: LetterBlock[];
  signOff: string;
  signature: string;
  citations: string[];
  disclaimer: string;
}

export const LETTER_DISCLAIMER =
  "This letter was prepared with LeaseGuard, which provides educational information only and does not constitute legal advice. " +
  "For matters requiring professional legal judgment, consult a licensed paralegal, lawyer, or the Landlord and Tenant Board.";

export const PARTY_PLACEHOLDERS: LetterParties = {
  tenantName: "[Your name]",
  landlordName: "[Landlord's name]",
  rentalAddress: "[Rental unit address]",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Formats a date as "September 21, 2026". Uses UTC accessors because every
 * checker parses "YYYY-MM-DD" inputs as UTC midnight — local accessors would
 * print the previous day in any timezone behind UTC.
 */
export function formatLetterDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Fills blank party fields with bracketed placeholders the tenant can spot and replace. */
export function resolveParties(parties: Partial<LetterParties>): LetterParties {
  return {
    tenantName: parties.tenantName?.trim() || PARTY_PLACEHOLDERS.tenantName,
    landlordName: parties.landlordName?.trim() || PARTY_PLACEHOLDERS.landlordName,
    rentalAddress: parties.rentalAddress?.trim() || PARTY_PLACEHOLDERS.rentalAddress,
  };
}

export interface CreateLetterInput {
  kind: LetterKind;
  title: string;
  subject: string;
  letterDate: Date;
  respondWithinDays: number;
  parties: Partial<LetterParties>;
  blocks: LetterBlock[];
  citations: string[];
}

export function createLetter(input: CreateLetterInput): TenantLetter {
  const parties = resolveParties(input.parties);

  return {
    kind: input.kind,
    title: input.title,
    subject: input.subject,
    date: formatLetterDate(input.letterDate),
    respondBy: formatLetterDate(addDays(input.letterDate, input.respondWithinDays)),
    recipient: parties.landlordName,
    rentalAddress: parties.rentalAddress,
    salutation: `Dear ${parties.landlordName},`,
    blocks: input.blocks.filter((b) => (b.type === "paragraph" ? b.text.trim() !== "" : b.items.length > 0)),
    signOff: "Sincerely,",
    signature: parties.tenantName,
    citations: Array.from(new Set(input.citations)),
    disclaimer: LETTER_DISCLAIMER,
  };
}

/** Renders a letter as plain text for copying into an email or word processor. */
export function letterToPlainText(letter: TenantLetter): string {
  const lines: string[] = [
    letter.date,
    "",
    `To: ${letter.recipient}`,
    `Re: ${letter.subject}`,
    `Rental unit: ${letter.rentalAddress}`,
    "",
    letter.salutation,
    "",
  ];

  for (const block of letter.blocks) {
    if (block.type === "paragraph") {
      lines.push(block.text, "");
    } else {
      for (const item of block.items) lines.push(`- ${item}`);
      lines.push("");
    }
  }

  lines.push(letter.signOff, "", letter.signature, "", "---", letter.disclaimer);
  return lines.join("\n");
}

/** True if any bracketed placeholder is still in the letter. */
export function hasPlaceholders(letter: TenantLetter): boolean {
  const text = letterToPlainText(letter);
  return Object.values(PARTY_PLACEHOLDERS).some((p) => text.includes(p));
}
