import { checkLandlordEntry, toEntryDateTime, type EntryCheckInput } from "../lib/landlord-entry-checker";
import { letterToPlainText } from "../lib/tenant-letters/core";
import { buildEntryObjectionLetter } from "../lib/tenant-letters/entry-objection";

const PARTIES = { tenantName: "Sam Lee", landlordName: "Acme Rentals", rentalAddress: "12 King St, Unit 4, Toronto" };
const LETTER_DATE = new Date("2026-09-22");

function run(overrides: Partial<EntryCheckInput> = {}) {
  const input: EntryCheckInput = {
    reason: "repairs_or_work",
    entryAt: toEntryDateTime("2026-09-20", "21:15")!,
    writtenNotice: null,
    ...overrides,
  };
  const result = checkLandlordEntry(input);
  return buildEntryObjectionLetter(result, { entryAt: input.entryAt }, PARTIES, LETTER_DATE);
}

describe("buildEntryObjectionLetter", () => {
  it("returns null for an entry that appears permitted", () => {
    expect(run({ reason: "emergency" })).toBeNull();
  });

  it("quotes the entry date, time and reason with each failed check", () => {
    const letter = run();
    const text = letterToPlainText(letter!);

    expect(letter!.kind).toBe("entry_objection");
    expect(letter!.subject).toBe("Entry into my unit on September 20, 2026");
    expect(text).toContain("on September 20, 2026 at 9:15 p.m.");
    expect(text).toContain("The reason for the entry was: repairs, replacement or other work.");
    expect(text).toContain("- 24 hours' written notice: No written notice was given.");
    expect(text).toContain("confirm in writing by September 29, 2026");
    expect(letter!.citations).toEqual(["RTA s.27(1)", "RTA s.25", "RTA s.27(1), (3)", "RTA s.29(1), (2)"]);
  });

  it("says no permitted reason was given for an unlisted reason", () => {
    const text = letterToPlainText(run({ reason: "other" })!);
    expect(text).toContain("No reason that the Residential Tenancies Act, 2006 permits was given");
    expect(text).toContain("- Permitted reason for entry:");
  });

  it("lists every failed condition for a showing to prospective tenants", () => {
    const text = letterToPlainText(
      run({ reason: "showing_to_prospective_tenant", tenancyEnding: false, tenantInformedBeforehand: false })!
    );
    expect(text).toContain("- Tenancy is ending:");
    expect(text).toContain("- Between 8 a.m. and 8 p.m.:");
    expect(text).toContain("- Tenant informed beforehand:");
  });

  it("never calls the entry illegal", () => {
    const text = letterToPlainText(run({ reason: "other" })!);
    expect(text.toLowerCase()).not.toContain("illegal");
  });
});
