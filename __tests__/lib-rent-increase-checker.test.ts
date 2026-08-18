import { checkRentIncrease } from "../lib/rent-increase-checker";

// 2024 guideline is 2.5% (known table year, not an estimate) — used as the
// baseline year for most cases below so results are deterministic.
const LAST_INCREASE = new Date("2023-06-01");
const NOTICE_GIVEN = new Date("2024-03-01");
const EFFECTIVE = new Date("2024-06-01"); // >= 90 days after notice, >= 12 months after last increase

describe("checkRentIncrease", () => {
  it("marks a within-guideline increase as compliant", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2040, // 2% increase, under 2.5% guideline
      noticeGivenDate: NOTICE_GIVEN,
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    expect(result.verdict).toBe("compliant");
    expect(result.checks.every((c) => c.status !== "fail")).toBe(true);
    expect(result.guidelinePercent).toBe(2.5);
    expect(result.guidelineIsEstimate).toBe(false);
  });

  it("marks an over-guideline increase as not compliant", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2200, // 10% increase, well over guideline
      noticeGivenDate: NOTICE_GIVEN,
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    expect(result.verdict).toBe("not_compliant");
    const guidelineCheck = result.checks.find((c) => c.id === "guideline_cap");
    expect(guidelineCheck?.status).toBe("fail");
  });

  it("fails on insufficient notice (< 90 days)", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2040,
      noticeGivenDate: new Date("2024-05-01"), // only 31 days before effective date
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    expect(result.verdict).toBe("not_compliant");
    const noticeCheck = result.checks.find((c) => c.id === "notice_period");
    expect(noticeCheck?.status).toBe("fail");
  });

  it("passes with exactly 90 days' notice", () => {
    const effective = new Date("2024-06-01");
    const notice = new Date(effective);
    notice.setDate(notice.getDate() - 90);
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2040,
      noticeGivenDate: notice,
      effectiveDate: effective,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    const noticeCheck = result.checks.find((c) => c.id === "notice_period");
    expect(noticeCheck?.status).toBe("pass");
  });

  it("fails the 12-month rule when increases are too frequent", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2040,
      noticeGivenDate: NOTICE_GIVEN,
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: new Date("2024-01-01"), // only 5 months before effective date
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    expect(result.verdict).toBe("not_compliant");
    const frequencyCheck = result.checks.find((c) => c.id === "frequency");
    expect(frequencyCheck?.status).toBe("fail");
  });

  it("exempts new-construction units from the guideline cap but still enforces notice and frequency", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2400, // 20% — would fail guideline cap if it applied
      noticeGivenDate: NOTICE_GIVEN,
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: true,
      hasAgiApproval: false,
    });
    const guidelineCheck = result.checks.find((c) => c.id === "guideline_cap");
    expect(guidelineCheck?.status).toBe("not_applicable");
    expect(result.verdict).toBe("compliant");

    const badNotice = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2400,
      noticeGivenDate: new Date("2024-05-01"),
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: true,
      hasAgiApproval: false,
    });
    expect(badNotice.verdict).toBe("not_compliant");
  });

  it("marks the guideline cap not_applicable when an AGI approval is indicated", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2200,
      noticeGivenDate: NOTICE_GIVEN,
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: false,
      hasAgiApproval: true,
    });
    const guidelineCheck = result.checks.find((c) => c.id === "guideline_cap");
    expect(guidelineCheck?.status).toBe("not_applicable");
    expect(result.verdict).toBe("compliant");
  });

  it("treats a non-increase (proposed <= current) as compliant with no checks", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2000,
      noticeGivenDate: NOTICE_GIVEN,
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    expect(result.verdict).toBe("compliant");
    expect(result.checks).toHaveLength(0);
  });

  it("falls back to the latest known year and flags it as an estimate for years beyond the table", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2040,
      noticeGivenDate: new Date("2030-01-01"),
      effectiveDate: new Date("2030-06-01"),
      lastIncreaseDate: new Date("2029-01-01"),
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    expect(result.guidelineIsEstimate).toBe(true);
    expect(result.guidelineYear).toBe(2027);
  });

  it("treats 12 months from a Feb 29 last-increase date as Feb 28 the following year, not March 1", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2040,
      noticeGivenDate: new Date("2024-11-01"),
      effectiveDate: new Date("2025-02-28"),
      lastIncreaseDate: new Date("2024-02-29"),
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    const frequencyCheck = result.checks.find((c) => c.id === "frequency");
    expect(frequencyCheck?.status).toBe("pass");
  });

  it("passes at exactly the guideline percentage", () => {
    const result = checkRentIncrease({
      currentRent: 2000,
      proposedRent: 2050, // exactly 2.5% for the 2024 guideline
      noticeGivenDate: NOTICE_GIVEN,
      effectiveDate: EFFECTIVE,
      lastIncreaseDate: LAST_INCREASE,
      isNewBuildingExempt: false,
      hasAgiApproval: false,
    });
    const guidelineCheck = result.checks.find((c) => c.id === "guideline_cap");
    expect(guidelineCheck?.status).toBe("pass");
    expect(result.verdict).toBe("compliant");
  });
});
