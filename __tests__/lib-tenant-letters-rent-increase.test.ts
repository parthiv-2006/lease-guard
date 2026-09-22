import { checkRentIncrease } from "../lib/rent-increase-checker";
import { letterToPlainText } from "../lib/tenant-letters/core";
import { buildRentIncreaseDisputeLetter } from "../lib/tenant-letters/rent-increase-dispute";

const PARTIES = { tenantName: "Sam Lee", landlordName: "Acme Rentals", rentalAddress: "12 King St, Unit 4, Toronto" };
const LETTER_DATE = new Date("2026-09-21");

function run(overrides: Partial<Parameters<typeof checkRentIncrease>[0]> = {}) {
  const input = {
    currentRent: 2000,
    proposedRent: 2040,
    noticeGivenDate: new Date("2026-06-01"),
    effectiveDate: new Date("2026-10-01"),
    lastIncreaseDate: new Date("2025-09-01"),
    isNewBuildingExempt: false,
    hasAgiApproval: false,
    ...overrides,
  };
  const result = checkRentIncrease(input);
  return {
    result,
    letter: buildRentIncreaseDisputeLetter(
      result,
      {
        currentRent: input.currentRent,
        proposedRent: input.proposedRent,
        noticeGivenDate: input.noticeGivenDate,
        effectiveDate: input.effectiveDate,
      },
      PARTIES,
      LETTER_DATE
    ),
  };
}

describe("buildRentIncreaseDisputeLetter", () => {
  it("returns null for a compliant increase", () => {
    const { result, letter } = run();
    expect(result.verdict).toBe("compliant");
    expect(letter).toBeNull();
  });

  it("lists only the failed checks and keeps paying the current rent", () => {
    const { letter } = run({ proposedRent: 2200 });
    expect(letter).not.toBeNull();
    const text = letterToPlainText(letter!);

    expect(letter!.subject).toBe("Notice of rent increase dated June 1, 2026");
    expect(text).toContain("from $2,000.00 to $2,200.00 (10.00%) effective October 1, 2026");
    expect(text).toContain("- Guideline cap:");
    expect(text).not.toContain("- 90-day written notice:");
    expect(text).not.toContain("- 12-month rule:");
    expect(text).toContain("I will continue to pay my current rent of $2,000.00");
    expect(text).toContain("confirm in writing by October 5, 2026");
    expect(letter!.citations).toEqual(["RTA s.120(1)"]);
  });

  it("says a short-notice increase may not be enforceable", () => {
    const { letter } = run({ noticeGivenDate: new Date("2026-08-15") });
    const text = letterToPlainText(letter!);
    expect(text).toContain("- 90-day written notice:");
    expect(text).toContain("may not be enforceable as proposed");
    expect(letter!.citations).toEqual(["RTA s.116(1), (4)"]);
  });

  it("combines every failed check into one letter", () => {
    const { letter } = run({
      proposedRent: 2300,
      noticeGivenDate: new Date("2026-08-15"),
      lastIncreaseDate: new Date("2026-03-01"),
    });
    expect(letter!.citations).toEqual(["RTA s.116(1), (4)", "RTA s.119(1)", "RTA s.120(1)"]);
  });

  it("never describes the increase as illegal", () => {
    const { letter } = run({ proposedRent: 2300, noticeGivenDate: new Date("2026-08-15") });
    expect(letterToPlainText(letter!).toLowerCase()).not.toContain("illegal");
  });
});
