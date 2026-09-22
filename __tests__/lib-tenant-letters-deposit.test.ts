import { checkDepositInterest, checkFeeLegality } from "../lib/deposit-fees-checker";
import { letterToPlainText } from "../lib/tenant-letters/core";
import { buildDepositInterestDemandLetter } from "../lib/tenant-letters/deposit-interest-demand";

const PARTIES = { tenantName: "Sam Lee", landlordName: "Acme Rentals", rentalAddress: "12 King St, Unit 4, Toronto" };
const LETTER_DATE = new Date("2026-09-21");

function run(depositAmount: number, monthlyRent: number, paid: string, asOf: string, fees = [] as ReturnType<typeof checkFeeLegality>[]) {
  const details = { depositAmount, depositPaidDate: new Date(paid), asOfDate: new Date(asOf) };
  const result = checkDepositInterest({ ...details, monthlyRent });
  return { result, letter: buildDepositInterestDemandLetter(result, details, fees, PARTIES, LETTER_DATE) };
}

describe("buildDepositInterestDemandLetter", () => {
  it("returns null when nothing is owed and nothing was overcharged", () => {
    const { letter } = run(2000, 2000, "2026-09-21", "2026-09-21");
    expect(letter).toBeNull();
  });

  it("demands the interest owed with a per-year breakdown and s.106(9) deduction right", () => {
    const { result, letter } = run(2000, 2000, "2024-01-01", "2026-01-01");
    const text = letterToPlainText(letter!);

    expect(letter!.title).toBe("Deposit interest demand");
    expect(text).toContain("On January 1, 2024 I paid you a last month's rent deposit of $2,000.00.");
    expect(text).toContain(`is $${result.totalInterestOwed.toFixed(2)}:`);
    for (const y of result.byYear) expect(text).toContain(`- ${y.year}: ${y.guidelinePercent}%`);
    expect(text).toContain("Please pay this amount by October 5, 2026");
    expect(text).toContain("section 106(9)");
    expect(letter!.citations).toEqual(["RTA s.106(6)", "RTA s.106(9)"]);
  });

  it("asks for the excess back when the deposit is over one month's rent", () => {
    const { letter } = run(2500, 2000, "2026-09-21", "2026-09-21");
    const text = letterToPlainText(letter!);
    expect(letter!.title).toBe("Deposit and fee refund request");
    expect(text).toContain("the deposit is $500.00 more than the Act permits");
    expect(letter!.citations).toEqual(["RTA s.106(2)"]);
  });

  it("lists only fees the Act does not permit", () => {
    const fees = [
      checkFeeLegality("pet_deposit_or_fee"),
      checkFeeLegality("key_deposit_refundable"),
      checkFeeLegality("last_months_rent"),
    ];
    const { letter } = run(2000, 2000, "2026-09-21", "2026-09-21", fees);
    const text = letterToPlainText(letter!);
    expect(text).toContain("- Pet deposit or pet fee (RTA s.105(1), s.14)");
    expect(text).not.toContain("Key / fob deposit");
    expect(text).not.toContain("- Last month's rent deposit");
  });

  it("never describes a charge as illegal", () => {
    const fees = [checkFeeLegality("security_or_damage_deposit"), checkFeeLegality("admin_or_move_in_fee")];
    const { letter } = run(2500, 2000, "2023-05-01", "2026-09-21", fees);
    expect(letterToPlainText(letter!).toLowerCase()).not.toContain("illegal");
  });
});
