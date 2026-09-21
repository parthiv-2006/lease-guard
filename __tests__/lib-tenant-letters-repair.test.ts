import { checkRepairIssue } from "../lib/maintenance-repairs-checker";
import { letterToPlainText } from "../lib/tenant-letters/core";
import { buildRepairRequestLetter } from "../lib/tenant-letters/repair-request";

const PARTIES = { tenantName: "Sam Lee", landlordName: "Acme Rentals", rentalAddress: "12 King St, Unit 4, Toronto" };

describe("buildRepairRequestLetter", () => {
  it("asks for an unreported standard repair within 7 days and cites s.20 and s.27", () => {
    const asOf = new Date("2026-09-21");
    const result = checkRepairIssue({ issueType: "pests", reportedDate: null, reportedInWriting: false, asOfDate: asOf });
    const letter = buildRepairRequestLetter(result, { description: "There are mice in the kitchen." }, PARTIES, asOf);
    const text = letterToPlainText(letter);

    expect(letter.kind).toBe("repair_request");
    expect(letter.subject).toBe("Request for repair — Pests (mice, cockroaches, bed bugs)");
    expect(letter.respondBy).toBe("September 28, 2026");
    expect(text).toContain("There are mice in the kitchen.");
    expect(text).toContain("confirm in writing by September 28, 2026");
    expect(text).toContain("between 8 a.m. and 8 p.m.");
    expect(text).not.toContain("I first reported");
    expect(text).not.toContain("section 29");
    expect(letter.citations).toEqual(["RTA s.20(1)", "RTA s.20(2)", "O. Reg. 517/06 s.46", "RTA s.27(1), (3)"]);
  });

  it("flags a cold unit in heat season as a vital service with a next-day response", () => {
    const asOf = new Date("2026-01-12");
    const reported = new Date("2026-01-05");
    const result = checkRepairIssue({
      issueType: "no_heat",
      reportedDate: reported,
      reportedInWriting: true,
      asOfDate: asOf,
      measuredTempC: 16,
    });
    const letter = buildRepairRequestLetter(result, { reportedDate: reported, reportedInWriting: true }, PARTIES, asOf);
    const text = letterToPlainText(letter);

    expect(letter.respondBy).toBe("January 13, 2026");
    expect(text).toContain("I first reported this problem to you in writing on January 5, 2026, 7 days before");
    expect(text).toContain("below the 20 °C minimum");
    expect(text).toContain("This is a vital service.");
    expect(text).toContain("a vital service was withheld");
    expect(letter.citations).toContain("RTA s.21(1)");
    expect(letter.citations).toContain("RTA s.29(1)");
  });

  it("points an overdue non-vital repair at a maintenance breach, not a vital service", () => {
    const asOf = new Date("2026-04-01");
    const reported = new Date("2026-03-01");
    const result = checkRepairIssue({ issueType: "mould_leak", reportedDate: reported, reportedInWriting: false, asOfDate: asOf });
    const text = letterToPlainText(buildRepairRequestLetter(result, { reportedDate: reported }, PARTIES, asOf));

    expect(text).toContain("I first reported this problem to you on March 1, 2026, 31 days before");
    expect(text).toContain("breached its maintenance obligations");
    expect(text).not.toContain("vital service");
  });

  it("uses a singular day for a one-day-old report", () => {
    const asOf = new Date("2026-02-02");
    const reported = new Date("2026-02-01");
    const result = checkRepairIssue({ issueType: "appliance", reportedDate: reported, reportedInWriting: false, asOfDate: asOf });
    const text = letterToPlainText(buildRepairRequestLetter(result, { reportedDate: reported }, PARTIES, asOf));
    expect(text).toContain("1 day before the date of this letter");
  });

  it("never calls the landlord's conduct illegal", () => {
    const asOf = new Date("2026-01-12");
    const result = checkRepairIssue({ issueType: "utility_cut_off", reportedDate: new Date("2026-01-01"), reportedInWriting: true, asOfDate: asOf });
    const text = letterToPlainText(buildRepairRequestLetter(result, {}, PARTIES, asOf));
    expect(text.toLowerCase()).not.toContain("illegal");
  });
});
