import { checkEvictionNotice, type EvictionCheckInput } from "../lib/eviction-notice-checker";
import { letterToPlainText } from "../lib/tenant-letters/core";
import { buildEvictionNoticeResponseLetter } from "../lib/tenant-letters/eviction-notice-response";

const PARTIES = { tenantName: "Sam Lee", landlordName: "Acme Rentals", rentalAddress: "12 King St, Unit 4, Toronto" };
const LETTER_DATE = new Date("2026-09-21");

function run(input: EvictionCheckInput) {
  const result = checkEvictionNotice(input);
  return {
    result,
    letter: buildEvictionNoticeResponseLetter(
      result,
      { noticeType: input.noticeType, noticeGivenDate: input.noticeGivenDate, terminationDate: input.terminationDate },
      PARTIES,
      LETTER_DATE
    ),
  };
}

describe("buildEvictionNoticeResponseLetter", () => {
  it("returns null for a notice that appears valid", () => {
    const { letter } = run({
      noticeType: "N4",
      noticeGivenDate: new Date("2026-09-01"),
      terminationDate: new Date("2026-09-20"),
      tenancyType: "other",
    });
    expect(letter).toBeNull();
  });

  it("responds to a short N4 with the notice-period defect and s.39", () => {
    const { letter } = run({
      noticeType: "N4",
      noticeGivenDate: new Date("2026-09-10"),
      terminationDate: new Date("2026-09-17"),
      tenancyType: "other",
    });
    const text = letterToPlainText(letter!);

    expect(letter!.subject).toBe("Response to N4 notice dated September 10, 2026");
    expect(text).toContain("Form N4 (non-payment of rent) notice of termination dated September 10, 2026");
    expect(text).toContain("termination date of September 17, 2026");
    expect(text).toContain("- Notice period (N4): Only 7 days' notice was given.");
    expect(text).toContain("section 39 of the Act");
    expect(letter!.citations).toEqual(["RTA s.59(1)", "RTA s.39"]);
  });

  it("lists every failed N12 requirement but skips checks it cannot verify", () => {
    const { letter } = run({
      noticeType: "N12",
      noticeGivenDate: new Date("2026-09-01"),
      terminationDate: new Date("2026-11-30"),
      servedBy: "landlord",
      landlordIsIndividual: false,
      unitIndividuallyOwned: true,
      compensationOffered: false,
    });
    const text = letterToPlainText(letter!);

    expect(text).toContain("- Landlord eligible to serve N12:");
    expect(text).toContain("- Compensation provided:");
    expect(text).not.toContain("Good-faith requirement");
    expect(letter!.citations).toEqual(["RTA s.48(5)", "RTA s.48.1 / s.49.1", "RTA s.39"]);
  });

  it("never calls the notice illegal", () => {
    const { letter } = run({
      noticeType: "N13",
      noticeGivenDate: new Date("2026-09-01"),
      terminationDate: new Date("2026-10-31"),
      ground: "demolition",
      buildingUnitCount: 12,
      compensationOffered: false,
    });
    expect(letterToPlainText(letter!).toLowerCase()).not.toContain("illegal");
  });
});
