import {
  allEntryReasons,
  checkLandlordEntry,
  isEntryReason,
  isWithinEntryWindow,
  toEntryDateTime,
  type EntryCheckInput,
} from "../lib/landlord-entry-checker";

function at(date: string, time: string): Date {
  const d = toEntryDateTime(date, time);
  if (!d) throw new Error(`bad test date ${date} ${time}`);
  return d;
}

const GOOD_NOTICE = { givenAt: at("2026-03-09", "10:00"), statedReason: true, statedTime: true };

function check(overrides: Partial<EntryCheckInput> = {}) {
  return checkLandlordEntry({
    reason: "repairs_or_work",
    entryAt: at("2026-03-10", "10:00"),
    writtenNotice: GOOD_NOTICE,
    ...overrides,
  });
}

function status(result: ReturnType<typeof check>, id: string) {
  return result.checks.find((c) => c.id === id)?.status;
}

describe("toEntryDateTime", () => {
  it("encodes a wall-clock date and time without timezone drift", () => {
    expect(at("2026-03-10", "19:45").toISOString()).toBe("2026-03-10T19:45:00.000Z");
  });

  it("rejects malformed and impossible values", () => {
    expect(toEntryDateTime("2026-02-30", "10:00")).toBeNull();
    expect(toEntryDateTime("2026-03-10", "24:00")).toBeNull();
    expect(toEntryDateTime("2026-03-10", "9:00")).toBeNull();
    expect(toEntryDateTime("March 10", "10:00")).toBeNull();
  });
});

describe("isWithinEntryWindow", () => {
  it("includes exactly 8:00 a.m. and 8:00 p.m.", () => {
    expect(isWithinEntryWindow(at("2026-03-10", "08:00"))).toBe(true);
    expect(isWithinEntryWindow(at("2026-03-10", "20:00"))).toBe(true);
  });

  it("excludes a minute either side", () => {
    expect(isWithinEntryWindow(at("2026-03-10", "07:59"))).toBe(false);
    expect(isWithinEntryWindow(at("2026-03-10", "20:01"))).toBe(false);
  });
});

describe("checkLandlordEntry — written notice entries (s.27)", () => {
  it("passes a repair entry with a full notice given exactly 24 hours before", () => {
    const result = check();
    expect(result.verdict).toBe("appears_permitted");
    expect(result.noticeHours).toBe(24);
    expect(result.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("fails a notice given 23.5 hours before", () => {
    const result = check({ writtenNotice: { ...GOOD_NOTICE, givenAt: at("2026-03-09", "10:30") } });
    expect(result.verdict).toBe("may_not_be_permitted");
    expect(status(result, "written_notice")).toBe("fail");
    expect(result.checks.find((c) => c.id === "written_notice")?.detail).toContain("only 23.5 hours");
  });

  it("fails an entry with no written notice at all", () => {
    const result = check({ writtenNotice: null });
    expect(status(result, "written_notice")).toBe("fail");
    expect(result.noticeHours).toBeNull();
  });

  it("flags a notice dated after the entry", () => {
    const result = check({ writtenNotice: { ...GOOD_NOTICE, givenAt: at("2026-03-11", "10:00") } });
    expect(result.checks.find((c) => c.id === "written_notice")?.detail).toContain("dated after the entry");
  });

  it("fails a notice missing the reason or the time", () => {
    const result = check({ writtenNotice: { ...GOOD_NOTICE, statedReason: false, statedTime: false } });
    expect(status(result, "notice_reason")).toBe("fail");
    expect(status(result, "notice_time")).toBe("fail");
  });

  it("fails an entry at 9 p.m. even with good notice", () => {
    const result = check({ entryAt: at("2026-03-10", "21:00"), writtenNotice: { ...GOOD_NOTICE, givenAt: at("2026-03-08", "21:00") } });
    expect(status(result, "entry_window")).toBe("fail");
    expect(result.checks.find((c) => c.id === "entry_window")?.detail).toContain("9:00 p.m.");
  });

  it("cites the right paragraph for each written-notice reason", () => {
    expect(check({ reason: "inspection" }).checks[0].citation).toBe("RTA s.27(1) para 4");
    expect(check({ reason: "showing_to_purchaser" }).checks[0].citation).toBe("RTA s.27(2)");
    expect(check({ reason: "mortgagee_or_insurer" }).checks[0].citation).toBe("RTA s.27(1) para 2");
    expect(check({ reason: "lease_specified_reason" }).checks[0].citation).toBe("RTA s.27(1) para 5");
  });
});

describe("checkLandlordEntry — no-notice entries (s.26)", () => {
  it("permits an emergency entry at 3 a.m. with no notice", () => {
    const result = check({ reason: "emergency", entryAt: at("2026-03-10", "03:00"), writtenNotice: null });
    expect(result.verdict).toBe("appears_permitted");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].citation).toBe("RTA s.26(1)(a)");
  });

  it("permits an entry the tenant consented to at the time", () => {
    const result = check({ reason: "tenant_consented", entryAt: at("2026-03-10", "22:00"), writtenNotice: null });
    expect(result.verdict).toBe("appears_permitted");
  });

  it("permits cleaning the lease requires within 8 a.m. to 8 p.m.", () => {
    const result = check({ reason: "regular_cleaning", leaseRequiresCleaning: true, writtenNotice: null });
    expect(result.verdict).toBe("appears_permitted");
  });

  it("permits cleaning outside 8 to 8 when the lease sets that time", () => {
    const result = check({
      reason: "regular_cleaning",
      entryAt: at("2026-03-10", "21:00"),
      leaseRequiresCleaning: true,
      atLeaseSpecifiedCleaningTime: true,
      writtenNotice: null,
    });
    expect(result.verdict).toBe("appears_permitted");
    expect(result.checks.find((c) => c.id === "entry_window")?.citation).toBe("RTA s.26(2)(a)");
  });

  it("fails cleaning the lease does not require", () => {
    const result = check({ reason: "regular_cleaning", leaseRequiresCleaning: false, writtenNotice: null });
    expect(status(result, "cleaning_in_lease")).toBe("fail");
  });

  it("requires all three conditions to show the unit to prospective tenants", () => {
    const ok = check({ reason: "showing_to_prospective_tenant", tenancyEnding: true, tenantInformedBeforehand: true, writtenNotice: null });
    expect(ok.verdict).toBe("appears_permitted");

    const bad = check({
      reason: "showing_to_prospective_tenant",
      entryAt: at("2026-03-10", "07:30"),
      tenancyEnding: false,
      tenantInformedBeforehand: false,
      writtenNotice: null,
    });
    expect(status(bad, "tenancy_ending")).toBe("fail");
    expect(status(bad, "entry_window")).toBe("fail");
    expect(status(bad, "tenant_informed")).toBe("fail");
  });
});

describe("checkLandlordEntry — other reasons (s.25)", () => {
  it("never permits an entry for an unlisted reason, even with notice", () => {
    const result = check({ reason: "other" });
    expect(result.verdict).toBe("may_not_be_permitted");
    expect(result.checks[0].citation).toBe("RTA s.25");
  });
});

describe("checkLandlordEntry — next steps and deadline", () => {
  it("gives a one-year T2 application deadline for an entry that may not be permitted", () => {
    const result = check({ reason: "other" });
    expect(result.applicationDeadline).toBe("2027-03-10");
    expect(result.nextSteps.join(" ")).toContain("Form T2");
    expect(result.nextSteps.join(" ")).toContain("by 2027-03-10");
  });

  it("clamps a Feb 29 entry's deadline to Feb 28", () => {
    const result = check({ reason: "other", entryAt: at("2028-02-29", "10:00") });
    expect(result.applicationDeadline).toBe("2029-02-28");
  });

  it("does not suggest a Board application for a permitted entry", () => {
    expect(check().nextSteps.join(" ")).not.toContain("Form T2");
  });
});

describe("reason helpers", () => {
  it("recognises every reason and rejects unknown values", () => {
    for (const reason of allEntryReasons()) expect(isEntryReason(reason)).toBe(true);
    expect(isEntryReason("snooping")).toBe(false);
    expect(isEntryReason(42)).toBe(false);
  });

  it("never describes an entry as illegal", () => {
    for (const reason of allEntryReasons()) {
      const text = JSON.stringify(check({ reason, writtenNotice: null }));
      expect(text.toLowerCase()).not.toContain("illegal");
    }
  });
});
