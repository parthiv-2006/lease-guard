import {
  checkRepairIssue,
  isHeatSeason,
  allRepairIssueTypes,
  isRepairIssueType,
  repairIssueRule,
  FOLLOW_UP_THRESHOLD_DAYS,
} from "../lib/maintenance-repairs-checker";

describe("isHeatSeason", () => {
  it("treats September 1 to June 15 as heat season", () => {
    expect(isHeatSeason(new Date("2026-09-01"))).toBe(true);
    expect(isHeatSeason(new Date("2026-01-15"))).toBe(true);
    expect(isHeatSeason(new Date("2026-06-15"))).toBe(true);
  });

  it("treats June 16 to August 31 as outside heat season", () => {
    expect(isHeatSeason(new Date("2026-06-16"))).toBe(false);
    expect(isHeatSeason(new Date("2026-07-20"))).toBe(false);
    expect(isHeatSeason(new Date("2026-08-31"))).toBe(false);
  });
});

describe("checkRepairIssue — reporting status", () => {
  it("returns not_yet_reported when there is no reported date", () => {
    const result = checkRepairIssue({
      issueType: "pests",
      reportedDate: null,
      reportedInWriting: false,
      asOfDate: new Date("2026-03-01"),
    });
    expect(result.status).toBe("not_yet_reported");
    expect(result.daysSinceReported).toBeNull();
    expect(result.nextSteps[0]).toMatch(/in writing/i);
  });

  it("is within the follow-up window for a standard issue reported recently", () => {
    const result = checkRepairIssue({
      issueType: "pests",
      reportedDate: new Date("2026-03-01"),
      reportedInWriting: true,
      asOfDate: new Date("2026-03-10"),
    });
    expect(result.urgency).toBe("standard");
    expect(result.daysSinceReported).toBe(9);
    expect(result.status).toBe("within_follow_up_window");
  });

  it("is overdue for a standard issue past the 14-day threshold", () => {
    const result = checkRepairIssue({
      issueType: "mould_leak",
      reportedDate: new Date("2026-03-01"),
      reportedInWriting: true,
      asOfDate: new Date("2026-03-20"),
    });
    expect(result.followUpThresholdDays).toBe(FOLLOW_UP_THRESHOLD_DAYS.standard);
    expect(result.status).toBe("follow_up_overdue");
    expect(result.nextSteps.join(" ")).toMatch(/T6/);
  });

  it("treats an urgent issue as overdue after one day", () => {
    const result = checkRepairIssue({
      issueType: "no_hot_water",
      reportedDate: new Date("2026-03-01"),
      reportedInWriting: true,
      asOfDate: new Date("2026-03-03"),
    });
    expect(result.urgency).toBe("urgent");
    expect(result.status).toBe("follow_up_overdue");
  });

  it("points vital-service issues at the T2 application", () => {
    const result = checkRepairIssue({
      issueType: "utility_cut_off",
      reportedDate: new Date("2026-03-01"),
      reportedInWriting: true,
      asOfDate: new Date("2026-03-05"),
    });
    const steps = result.nextSteps.join(" ");
    expect(steps).toMatch(/T2/);
    expect(steps).not.toMatch(/T6/);
  });

  it("asks for a written follow-up when the report was only verbal", () => {
    const result = checkRepairIssue({
      issueType: "plumbing",
      reportedDate: new Date("2026-03-01"),
      reportedInWriting: false,
      asOfDate: new Date("2026-03-02"),
    });
    expect(result.nextSteps[0]).toMatch(/follow up in writing/i);
  });

  it("never reports negative days when asOfDate is before reportedDate", () => {
    const result = checkRepairIssue({
      issueType: "pests",
      reportedDate: new Date("2026-03-10"),
      reportedInWriting: true,
      asOfDate: new Date("2026-03-01"),
    });
    expect(result.daysSinceReported).toBe(0);
  });

  it("always tells the tenant to keep paying rent", () => {
    for (const issueType of allRepairIssueTypes()) {
      const result = checkRepairIssue({
        issueType,
        reportedDate: new Date("2026-01-01"),
        reportedInWriting: true,
        asOfDate: new Date("2026-03-01"),
      });
      expect(result.nextSteps.join(" ")).toMatch(/keep paying your rent/i);
    }
  });
});

describe("checkRepairIssue — heat", () => {
  it("flags a temperature below 20 °C during heat season", () => {
    const result = checkRepairIssue({
      issueType: "no_heat",
      reportedDate: new Date("2026-01-10"),
      reportedInWriting: true,
      asOfDate: new Date("2026-01-12"),
      measuredTempC: 16,
    });
    expect(result.heat).toEqual({ inHeatSeason: true, belowMinimum: true, minimumC: 20 });
  });

  it("does not flag 20 °C or warmer", () => {
    const result = checkRepairIssue({
      issueType: "no_heat",
      reportedDate: null,
      reportedInWriting: false,
      asOfDate: new Date("2026-01-12"),
      measuredTempC: 20,
    });
    expect(result.heat?.belowMinimum).toBe(false);
  });

  it("does not apply the 20 °C minimum outside heat season", () => {
    const result = checkRepairIssue({
      issueType: "no_heat",
      reportedDate: null,
      reportedInWriting: false,
      asOfDate: new Date("2026-07-12"),
      measuredTempC: 15,
    });
    expect(result.heat?.inHeatSeason).toBe(false);
    expect(result.heat?.belowMinimum).toBeNull();
  });

  it("leaves belowMinimum null when no temperature was measured", () => {
    const result = checkRepairIssue({
      issueType: "no_heat",
      reportedDate: null,
      reportedInWriting: false,
      asOfDate: new Date("2026-01-12"),
    });
    expect(result.heat?.belowMinimum).toBeNull();
  });

  it("returns no heat check for other issue types", () => {
    const result = checkRepairIssue({
      issueType: "pests",
      reportedDate: null,
      reportedInWriting: false,
      asOfDate: new Date("2026-01-12"),
      measuredTempC: 10,
    });
    expect(result.heat).toBeNull();
  });
});

describe("rule table", () => {
  it("cites at least one RTA section for every issue type", () => {
    for (const issueType of allRepairIssueTypes()) {
      const rule = repairIssueRule(issueType);
      expect(rule.citations.some((c) => c.startsWith("RTA s."))).toBe(true);
    }
  });

  it("never describes a landlord as acting illegally", () => {
    for (const issueType of allRepairIssueTypes()) {
      const result = checkRepairIssue({
        issueType,
        reportedDate: new Date("2026-01-01"),
        reportedInWriting: false,
        asOfDate: new Date("2026-03-01"),
      });
      const text = [result.obligation, ...result.nextSteps].join(" ").toLowerCase();
      expect(text).not.toContain("illegal");
    }
  });

  it("validates issue type strings", () => {
    expect(isRepairIssueType("pests")).toBe(true);
    expect(isRepairIssueType("toString")).toBe(false);
    expect(isRepairIssueType("flooding")).toBe(false);
    expect(isRepairIssueType(42)).toBe(false);
  });
});
