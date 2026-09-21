import {
  addDays,
  createLetter,
  formatLetterDate,
  formatMoney,
  hasPlaceholders,
  letterToPlainText,
  LETTER_DISCLAIMER,
  PARTY_PLACEHOLDERS,
  resolveParties,
} from "../lib/tenant-letters/core";

const LETTER_DATE = new Date("2026-09-21");

function baseLetter(parties = {}) {
  return createLetter({
    kind: "repair_request",
    title: "Repair request",
    subject: "Request for repair",
    letterDate: LETTER_DATE,
    respondWithinDays: 7,
    parties,
    blocks: [
      { type: "paragraph", text: "First paragraph." },
      { type: "list", items: ["One", "Two"] },
      { type: "paragraph", text: "   " },
      { type: "list", items: [] },
    ],
    citations: ["RTA s.20(1)", "RTA s.20(1)", "RTA s.27(1)"],
  });
}

describe("formatLetterDate", () => {
  it("formats a UTC-parsed date without drifting a day", () => {
    expect(formatLetterDate(new Date("2026-09-21"))).toBe("September 21, 2026");
    expect(formatLetterDate(new Date("2027-01-01"))).toBe("January 1, 2027");
  });
});

describe("addDays", () => {
  it("adds whole days across a month boundary", () => {
    expect(formatLetterDate(addDays(new Date("2026-09-28"), 7))).toBe("October 5, 2026");
  });
});

describe("formatMoney", () => {
  it("always shows two decimal places with a thousands separator", () => {
    expect(formatMoney(1850)).toBe("$1,850.00");
    expect(formatMoney(12.5)).toBe("$12.50");
  });
});

describe("resolveParties", () => {
  it("fills blank or whitespace-only fields with placeholders", () => {
    expect(resolveParties({ tenantName: "  " })).toEqual(PARTY_PLACEHOLDERS);
  });

  it("trims provided values", () => {
    expect(resolveParties({ tenantName: " Sam Lee ", landlordName: "Acme Rentals", rentalAddress: "12 King St" })).toEqual({
      tenantName: "Sam Lee",
      landlordName: "Acme Rentals",
      rentalAddress: "12 King St",
    });
  });
});

describe("createLetter", () => {
  it("sets the response date from the letter date", () => {
    const letter = baseLetter();
    expect(letter.date).toBe("September 21, 2026");
    expect(letter.respondBy).toBe("September 28, 2026");
  });

  it("drops empty paragraphs and empty lists", () => {
    expect(baseLetter().blocks).toHaveLength(2);
  });

  it("de-duplicates citations while keeping their order", () => {
    expect(baseLetter().citations).toEqual(["RTA s.20(1)", "RTA s.27(1)"]);
  });

  it("addresses the landlord and signs with the tenant's name", () => {
    const letter = baseLetter({ tenantName: "Sam Lee", landlordName: "Acme Rentals" });
    expect(letter.salutation).toBe("Dear Acme Rentals,");
    expect(letter.signature).toBe("Sam Lee");
    expect(letter.disclaimer).toBe(LETTER_DISCLAIMER);
  });
});

describe("letterToPlainText", () => {
  it("renders the header, body, list items and disclaimer in order", () => {
    const text = letterToPlainText(
      baseLetter({ tenantName: "Sam Lee", landlordName: "Acme Rentals", rentalAddress: "12 King St, Unit 4" })
    );
    const order = ["September 21, 2026", "To: Acme Rentals", "Re: Request for repair", "Rental unit: 12 King St, Unit 4", "Dear Acme Rentals,", "First paragraph.", "- One", "- Two", "Sincerely,", "Sam Lee", LETTER_DISCLAIMER];
    let last = -1;
    for (const piece of order) {
      const index = text.indexOf(piece);
      expect(index).toBeGreaterThan(last);
      last = index;
    }
  });
});

describe("hasPlaceholders", () => {
  it("is true until every party field is filled in", () => {
    expect(hasPlaceholders(baseLetter())).toBe(true);
    expect(hasPlaceholders(baseLetter({ tenantName: "Sam Lee", landlordName: "Acme Rentals" }))).toBe(true);
    expect(
      hasPlaceholders(baseLetter({ tenantName: "Sam Lee", landlordName: "Acme Rentals", rentalAddress: "12 King St" }))
    ).toBe(false);
  });
});
