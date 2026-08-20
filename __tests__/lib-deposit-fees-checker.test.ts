import { checkDepositInterest, checkFeeLegality, allFeeTypes } from "../lib/deposit-fees-checker";

describe("checkDepositInterest", () => {
  it("flags a deposit that exceeds one month's rent", () => {
    const result = checkDepositInterest({
      depositAmount: 2500,
      monthlyRent: 2000,
      depositPaidDate: new Date("2024-01-01"),
      asOfDate: new Date("2024-06-01"),
    });
    expect(result.depositExceedsCap).toBe(true);
    expect(result.capAmount).toBe(2000);
  });

  it("does not flag a deposit at or below one month's rent", () => {
    const result = checkDepositInterest({
      depositAmount: 2000,
      monthlyRent: 2000,
      depositPaidDate: new Date("2024-01-01"),
      asOfDate: new Date("2024-06-01"),
    });
    expect(result.depositExceedsCap).toBe(false);
  });

  it("computes interest for a single full calendar year at that year's guideline", () => {
    const result = checkDepositInterest({
      depositAmount: 2000,
      monthlyRent: 2000,
      depositPaidDate: new Date("2024-01-01"),
      asOfDate: new Date("2025-01-01"),
    });
    // 2024 guideline is 2.5% for the full year
    expect(result.byYear).toHaveLength(1);
    expect(result.byYear[0].year).toBe(2024);
    expect(result.byYear[0].guidelinePercent).toBe(2.5);
    expect(result.totalInterestOwed).toBeCloseTo(50, 0); // 2000 * 2.5%
  });

  it("prorates interest across a partial year and applies each year's own guideline", () => {
    const result = checkDepositInterest({
      depositAmount: 2000,
      monthlyRent: 2000,
      depositPaidDate: new Date("2024-07-01"),
      asOfDate: new Date("2025-01-01"),
    });
    expect(result.byYear).toHaveLength(1);
    expect(result.byYear[0].year).toBe(2024);
    // roughly half of 2.5% for ~184 days of 2024
    expect(result.totalInterestOwed).toBeGreaterThan(20);
    expect(result.totalInterestOwed).toBeLessThan(30);
  });

  it("returns zero interest and no years when asOfDate is not after depositPaidDate", () => {
    const result = checkDepositInterest({
      depositAmount: 2000,
      monthlyRent: 2000,
      depositPaidDate: new Date("2024-06-01"),
      asOfDate: new Date("2024-06-01"),
    });
    expect(result.byYear).toHaveLength(0);
    expect(result.totalInterestOwed).toBe(0);
  });

  it("splits interest across multiple calendar years with different guideline rates", () => {
    const result = checkDepositInterest({
      depositAmount: 2000,
      monthlyRent: 2000,
      depositPaidDate: new Date("2023-01-01"),
      asOfDate: new Date("2025-01-01"),
    });
    expect(result.byYear.map((y) => y.year)).toEqual([2023, 2024]);
    expect(result.byYear[0].guidelinePercent).toBe(2.5); // 2023
    expect(result.byYear[1].guidelinePercent).toBe(2.5); // 2024
  });
});

describe("checkFeeLegality", () => {
  it("marks last month's rent deposit as legal", () => {
    expect(checkFeeLegality("last_months_rent").verdict).toBe("legal");
  });

  it("marks a key deposit as conditional", () => {
    expect(checkFeeLegality("key_deposit_refundable").verdict).toBe("conditional");
  });

  it("marks a security/damage deposit as illegal", () => {
    expect(checkFeeLegality("security_or_damage_deposit").verdict).toBe("illegal");
  });

  it("marks a pet deposit as illegal", () => {
    expect(checkFeeLegality("pet_deposit_or_fee").verdict).toBe("illegal");
  });

  it("marks an application fee as illegal", () => {
    expect(checkFeeLegality("application_or_credit_check_fee").verdict).toBe("illegal");
  });

  it("covers every fee type declared in allFeeTypes()", () => {
    for (const feeType of allFeeTypes()) {
      const result = checkFeeLegality(feeType);
      expect(result.feeType).toBe(feeType);
      expect(["legal", "illegal", "conditional"]).toContain(result.verdict);
    }
  });
});
