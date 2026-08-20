import { checkEvictionNotice } from "../lib/eviction-notice-checker";

describe("checkEvictionNotice", () => {
  describe("N4 — non-payment of rent", () => {
    it("passes with exactly 14 days' notice for a monthly tenancy", () => {
      const result = checkEvictionNotice({
        noticeType: "N4",
        noticeGivenDate: new Date("2026-06-01"),
        terminationDate: new Date("2026-06-15"),
        tenancyType: "other",
      });
      expect(result.verdict).toBe("appears_valid");
      expect(result.checks.find((c) => c.id === "notice_period")?.status).toBe("pass");
    });

    it("fails with only 10 days' notice for a monthly tenancy", () => {
      const result = checkEvictionNotice({
        noticeType: "N4",
        noticeGivenDate: new Date("2026-06-01"),
        terminationDate: new Date("2026-06-11"),
        tenancyType: "other",
      });
      expect(result.verdict).toBe("not_valid");
      expect(result.checks.find((c) => c.id === "notice_period")?.status).toBe("fail");
    });

    it("only requires 7 days' notice for a daily/weekly tenancy", () => {
      const result = checkEvictionNotice({
        noticeType: "N4",
        noticeGivenDate: new Date("2026-06-01"),
        terminationDate: new Date("2026-06-08"),
        tenancyType: "daily_weekly",
      });
      expect(result.verdict).toBe("appears_valid");
      expect(result.requiredNoticeDays).toBe(7);
    });
  });

  describe("N5 — behaviour grounds", () => {
    it("requires 20 days and offers a cure period for ordinary damage", () => {
      const result = checkEvictionNotice({
        noticeType: "N5",
        noticeGivenDate: new Date("2026-06-01"),
        terminationDate: new Date("2026-06-21"),
        ground: "damage_ordinary",
      });
      expect(result.verdict).toBe("appears_valid");
      expect(result.requiredNoticeDays).toBe(20);
      expect(result.checks.find((c) => c.id === "n5_cure_period")?.detail).toMatch(/void/i);
    });

    it("requires only 10 days and has no cure period for wilful/severe damage", () => {
      const result = checkEvictionNotice({
        noticeType: "N5",
        noticeGivenDate: new Date("2026-06-01"),
        terminationDate: new Date("2026-06-11"),
        ground: "damage_wilful_severe",
      });
      expect(result.verdict).toBe("appears_valid");
      expect(result.requiredNoticeDays).toBe(10);
      expect(result.checks.find((c) => c.id === "n5_cure_period")?.label).toBe("No opportunity to correct");
    });

    it("fails interference ground with insufficient notice", () => {
      const result = checkEvictionNotice({
        noticeType: "N5",
        noticeGivenDate: new Date("2026-06-01"),
        terminationDate: new Date("2026-06-10"),
        ground: "interference",
      });
      expect(result.verdict).toBe("not_valid");
    });

    it("requires 20 days for overcrowding", () => {
      const result = checkEvictionNotice({
        noticeType: "N5",
        noticeGivenDate: new Date("2026-06-01"),
        terminationDate: new Date("2026-06-21"),
        ground: "overcrowding",
      });
      expect(result.requiredNoticeDays).toBe(20);
      expect(result.verdict).toBe("appears_valid");
    });
  });

  describe("N8 — persistent late payment / other end-of-term grounds", () => {
    it("requires 60 days for a monthly tenancy", () => {
      const result = checkEvictionNotice({
        noticeType: "N8",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-03-02"),
        tenancyType: "other",
      });
      expect(result.requiredNoticeDays).toBe(60);
      expect(result.verdict).toBe("appears_valid");
    });

    it("requires only 28 days for a daily/weekly tenancy", () => {
      const result = checkEvictionNotice({
        noticeType: "N8",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-01-29"),
        tenancyType: "daily_weekly",
      });
      expect(result.requiredNoticeDays).toBe(28);
      expect(result.verdict).toBe("appears_valid");
    });

    it("fails with insufficient notice for a monthly tenancy", () => {
      const result = checkEvictionNotice({
        noticeType: "N8",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-01-20"),
        tenancyType: "other",
      });
      expect(result.verdict).toBe("not_valid");
    });
  });

  describe("N12 — landlord/purchaser own use", () => {
    it("passes when landlord is an individual, unit individually owned, and compensation offered", () => {
      const result = checkEvictionNotice({
        noticeType: "N12",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-03-02"),
        servedBy: "landlord",
        landlordIsIndividual: true,
        unitIndividuallyOwned: true,
        compensationOffered: true,
      });
      expect(result.verdict).toBe("appears_valid");
      expect(result.requiredNoticeDays).toBe(60);
    });

    it("fails when the landlord is a corporation", () => {
      const result = checkEvictionNotice({
        noticeType: "N12",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-03-02"),
        servedBy: "landlord",
        landlordIsIndividual: false,
        unitIndividuallyOwned: true,
        compensationOffered: true,
      });
      expect(result.verdict).toBe("not_valid");
      expect(result.checks.find((c) => c.id === "n12_eligibility")?.status).toBe("fail");
    });

    it("fails when compensation was not offered", () => {
      const result = checkEvictionNotice({
        noticeType: "N12",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-03-02"),
        servedBy: "landlord",
        landlordIsIndividual: true,
        unitIndividuallyOwned: true,
        compensationOffered: false,
      });
      expect(result.verdict).toBe("not_valid");
      expect(result.checks.find((c) => c.id === "n12_compensation")?.status).toBe("fail");
    });

    it("treats purchaser eligibility as informational, not a hard fail", () => {
      const result = checkEvictionNotice({
        noticeType: "N12",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-03-02"),
        servedBy: "purchaser",
        landlordIsIndividual: false,
        unitIndividuallyOwned: false,
        compensationOffered: true,
      });
      expect(result.checks.find((c) => c.id === "n12_eligibility")?.status).toBe("not_applicable");
      expect(result.verdict).toBe("appears_valid");
    });
  });

  describe("N13 — demolition / conversion / repairs", () => {
    it("requires 120 days' notice regardless of ground", () => {
      const result = checkEvictionNotice({
        noticeType: "N13",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-05-01"),
        ground: "repairs",
        buildingUnitCount: 10,
        compensationOffered: false,
      });
      expect(result.requiredNoticeDays).toBe(120);
    });

    it("does not require compensation for repairs (right of first refusal instead)", () => {
      const result = checkEvictionNotice({
        noticeType: "N13",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-05-01"),
        ground: "repairs",
        buildingUnitCount: 10,
        compensationOffered: false,
      });
      expect(result.verdict).toBe("appears_valid");
      expect(result.checks.find((c) => c.id === "n13_compensation")?.status).toBe("not_applicable");
    });

    it("requires 3 months' compensation for demolition in a 5+ unit building", () => {
      const result = checkEvictionNotice({
        noticeType: "N13",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-05-01"),
        ground: "demolition",
        buildingUnitCount: 8,
        compensationOffered: false,
      });
      expect(result.verdict).toBe("not_valid");
      const comp = result.checks.find((c) => c.id === "n13_compensation");
      expect(comp?.status).toBe("fail");
      expect(comp?.detail).toMatch(/3 months/);
    });

    it("requires only 1 month's compensation for conversion in a small building", () => {
      const result = checkEvictionNotice({
        noticeType: "N13",
        noticeGivenDate: new Date("2026-01-01"),
        terminationDate: new Date("2026-05-01"),
        ground: "conversion",
        buildingUnitCount: 3,
        compensationOffered: true,
      });
      expect(result.verdict).toBe("appears_valid");
      const comp = result.checks.find((c) => c.id === "n13_compensation");
      expect(comp?.status).toBe("pass");
      expect(comp?.citation).toBe("RTA s.52(2)");
    });
  });
});
