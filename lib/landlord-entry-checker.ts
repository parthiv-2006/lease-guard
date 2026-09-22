/**
 * Deterministic rule engine for checking whether a landlord's entry into a
 * rental unit was permitted under Ontario's Residential Tenancies Act, 2006.
 * No LLM call — a static reason table plus time math, same pattern as
 * lib/maintenance-repairs-checker.ts and lib/eviction-notice-checker.ts.
 *
 * Citations verified directly against the seeded RTA corpus (`statutes` table,
 * jurisdiction_code = 'CA-ON') on 2026-09-22:
 *   - s.25       — a landlord may enter a rental unit only in accordance with s.26 or s.27
 *   - s.26(1)    — entry at any time without written notice (a) in an emergency, or
 *                  (b) if the tenant consents at the time of entry
 *   - s.26(2)    — entry without notice to clean, if the tenancy agreement requires regular
 *                  cleaning, at the times it specifies or else between 8 a.m. and 8 p.m.
 *   - s.26(3)    — entry without notice to show the unit to prospective tenants, if the
 *                  tenancy is ending by agreement or notice, between 8 a.m. and 8 p.m., and
 *                  after informing or making a reasonable effort to inform the tenant
 *   - s.27(1)    — entry on written notice given at least 24 hours before entry: para 1
 *                  repairs/work, para 2 mortgagee or insurer viewing, para 4 inspection of
 *                  the unit's state of repair, para 5 another reasonable reason specified
 *                  in the tenancy agreement
 *   - s.27(2)    — same 24-hour written notice to show the unit to a potential purchaser
 *   - s.27(3)    — the notice must specify the reason, the day, and a time of entry
 *                  between 8 a.m. and 8 p.m.
 *   - s.29(1)    — para 6: tenant may apply to the Board (Form T2) for an order about an
 *                  entry the landlord was not permitted to make
 *   - s.29(2)    — no application more than one year after the conduct occurred
 *
 * Times are wall-clock times with no timezone: callers encode "YYYY-MM-DD" +
 * "HH:MM" as a UTC Date (see toEntryDateTime) and every accessor here is UTC,
 * so the 24-hour and 8 a.m.–8 p.m. math never shifts with the server timezone.
 */

export type EntryReason =
  | "emergency"
  | "tenant_consented"
  | "regular_cleaning"
  | "showing_to_prospective_tenant"
  | "repairs_or_work"
  | "inspection"
  | "showing_to_purchaser"
  | "mortgagee_or_insurer"
  | "lease_specified_reason"
  | "other";

export type EntryBasis = "no_notice_needed" | "conditional_no_notice" | "written_notice" | "not_permitted";

export type EntryCheckStatus = "pass" | "fail" | "not_applicable";

export type EntryVerdict = "appears_permitted" | "may_not_be_permitted";

export interface EntryReasonRule {
  label: string;
  basis: EntryBasis;
  summary: string;
  citation: string;
}

export interface WrittenNoticeInput {
  givenAt: Date;
  statedReason: boolean;
  statedTime: boolean;
}

export interface EntryCheckInput {
  reason: EntryReason;
  entryAt: Date;
  writtenNotice: WrittenNoticeInput | null;
  /** s.26(2): the tenancy agreement requires the landlord to clean at regular intervals. */
  leaseRequiresCleaning?: boolean;
  /** s.26(2)(a): the entry was at a time the tenancy agreement specifies for cleaning. */
  atLeaseSpecifiedCleaningTime?: boolean;
  /** s.26(3)(a): the tenancy is ending by agreement or a notice of termination. */
  tenancyEnding?: boolean;
  /** s.26(3)(c): the landlord told, or reasonably tried to tell, the tenant first. */
  tenantInformedBeforehand?: boolean;
}

export interface EntryCheckItem {
  id: string;
  label: string;
  status: EntryCheckStatus;
  detail: string;
  citation: string;
}

export interface EntryCheckResult {
  reason: EntryReason;
  reasonLabel: string;
  basis: EntryBasis;
  verdict: EntryVerdict;
  summary: string;
  noticeHours: number | null;
  checks: EntryCheckItem[];
  /** Last day to apply to the Board about this entry (s.29(2)), "YYYY-MM-DD". */
  applicationDeadline: string;
  nextSteps: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "LeaseGuard provides educational information only and does not constitute legal advice. " +
  "For matters requiring professional legal judgment, consult a licensed paralegal, lawyer, or the Landlord and Tenant Board.";

export const MIN_NOTICE_HOURS = 24;
/** 8 a.m. and 8 p.m. as minutes after midnight — both ends inclusive. */
export const ENTRY_WINDOW_START_MIN = 8 * 60;
export const ENTRY_WINDOW_END_MIN = 20 * 60;

const RULES: Record<EntryReason, EntryReasonRule> = {
  emergency: {
    label: "An emergency (fire, flood, gas leak)",
    basis: "no_notice_needed",
    summary: "A landlord may enter at any time without written notice in an emergency.",
    citation: "RTA s.26(1)(a)",
  },
  tenant_consented: {
    label: "I agreed to let them in at the time",
    basis: "no_notice_needed",
    summary: "A landlord may enter at any time without written notice if the tenant consents at the time of entry.",
    citation: "RTA s.26(1)(b)",
  },
  regular_cleaning: {
    label: "Cleaning the lease says the landlord does",
    basis: "conditional_no_notice",
    summary:
      "A landlord may enter without written notice to clean only if the tenancy agreement requires regular cleaning, and only at the times it specifies (or between 8 a.m. and 8 p.m. if it specifies none).",
    citation: "RTA s.26(2)",
  },
  showing_to_prospective_tenant: {
    label: "Showing the unit to new tenants",
    basis: "conditional_no_notice",
    summary:
      "A landlord may show the unit to prospective tenants without written notice only if the tenancy is ending, between 8 a.m. and 8 p.m., and after informing or making a reasonable effort to inform the tenant.",
    citation: "RTA s.26(3)",
  },
  repairs_or_work: {
    label: "Repairs, replacement or other work",
    basis: "written_notice",
    summary: "A landlord may enter to carry out a repair or replacement or do work, with at least 24 hours' written notice.",
    citation: "RTA s.27(1) para 1",
  },
  inspection: {
    label: "Inspecting the condition of the unit",
    basis: "written_notice",
    summary:
      "A landlord may enter to inspect whether the unit is in a good state of repair and meets maintenance standards, where it is reasonable to do so, with at least 24 hours' written notice.",
    citation: "RTA s.27(1) para 4",
  },
  showing_to_purchaser: {
    label: "Showing the unit to a potential buyer",
    basis: "written_notice",
    summary: "A landlord (or their real estate agent) may show the unit to a potential purchaser with at least 24 hours' written notice.",
    citation: "RTA s.27(2)",
  },
  mortgagee_or_insurer: {
    label: "A lender or insurer viewing the unit",
    basis: "written_notice",
    summary: "A landlord may let a potential mortgagee or insurer view the unit with at least 24 hours' written notice.",
    citation: "RTA s.27(1) para 2",
  },
  lease_specified_reason: {
    label: "Another reason written into my lease",
    basis: "written_notice",
    summary:
      "A landlord may enter for another reasonable reason specified in the tenancy agreement, with at least 24 hours' written notice.",
    citation: "RTA s.27(1) para 5",
  },
  other: {
    label: "Something else, or no reason given",
    basis: "not_permitted",
    summary:
      "A landlord may enter a rental unit only for the reasons set out in sections 26 and 27. An entry for any other reason is not one the Act permits.",
    citation: "RTA s.25",
  },
};

const HOUR_MS = 60 * 60 * 1000;

/** Encodes a wall-clock "YYYY-MM-DD" date and "HH:MM" time as a UTC Date, or null if invalid. */
export function toEntryDateTime(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [dm[1], dm[2], dm[3], tm[1], tm[2]].map(Number);
  if (h > 23 || mi > 59) return null;
  const result = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // Reject dates like 2026-02-30 that Date.UTC silently rolls over.
  if (result.getUTCMonth() !== mo - 1 || result.getUTCDate() !== d) return null;
  return result;
}

export function isWithinEntryWindow(at: Date): boolean {
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  return minutes >= ENTRY_WINDOW_START_MIN && minutes <= ENTRY_WINDOW_END_MIN;
}

function formatClock(at: Date): string {
  const h = at.getUTCHours();
  const m = String(at.getUTCMinutes()).padStart(2, "0");
  const suffix = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

function windowCheck(entryAt: Date, citation: string): EntryCheckItem {
  return isWithinEntryWindow(entryAt)
    ? {
        id: "entry_window",
        label: "Between 8 a.m. and 8 p.m.",
        status: "pass",
        detail: `The entry at ${formatClock(entryAt)} was between 8 a.m. and 8 p.m.`,
        citation,
      }
    : {
        id: "entry_window",
        label: "Between 8 a.m. and 8 p.m.",
        status: "fail",
        detail: `The entry at ${formatClock(entryAt)} was outside the 8 a.m. to 8 p.m. window this kind of entry is limited to.`,
        citation,
      };
}

function writtenNoticeChecks(entryAt: Date, notice: WrittenNoticeInput | null): { checks: EntryCheckItem[]; noticeHours: number | null } {
  if (!notice) {
    return {
      noticeHours: null,
      checks: [
        {
          id: "written_notice",
          label: "24 hours' written notice",
          status: "fail",
          detail: "No written notice was given. This kind of entry requires written notice at least 24 hours before the time of entry.",
          citation: "RTA s.27(1)",
        },
      ],
    };
  }

  const noticeHours = (entryAt.getTime() - notice.givenAt.getTime()) / HOUR_MS;
  const checks: EntryCheckItem[] = [
    noticeHours >= MIN_NOTICE_HOURS
      ? {
          id: "written_notice",
          label: "24 hours' written notice",
          status: "pass",
          detail: `Written notice was given ${formatHours(noticeHours)} before the entry, meeting the 24-hour minimum.`,
          citation: "RTA s.27(1)",
        }
      : {
          id: "written_notice",
          label: "24 hours' written notice",
          status: "fail",
          detail:
            noticeHours < 0
              ? "The notice is dated after the entry — check the dates and times entered."
              : `Written notice was given only ${formatHours(noticeHours)} before the entry. The Act requires at least 24 hours.`,
          citation: "RTA s.27(1)",
        },
    notice.statedReason
      ? {
          id: "notice_reason",
          label: "Notice stated the reason",
          status: "pass",
          detail: "The notice stated the reason for entry.",
          citation: "RTA s.27(3)",
        }
      : {
          id: "notice_reason",
          label: "Notice stated the reason",
          status: "fail",
          detail: "A notice of entry must state the reason for the entry.",
          citation: "RTA s.27(3)",
        },
    notice.statedTime
      ? {
          id: "notice_time",
          label: "Notice stated the day and time",
          status: "pass",
          detail: "The notice stated the day of entry and a time.",
          citation: "RTA s.27(3)",
        }
      : {
          id: "notice_time",
          label: "Notice stated the day and time",
          status: "fail",
          detail: "A notice of entry must state the day of entry and a time of entry between 8 a.m. and 8 p.m.",
          citation: "RTA s.27(3)",
        },
    windowCheck(entryAt, "RTA s.27(3)"),
  ];
  return { checks, noticeHours };
}

function addOneYear(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear() + 1, at.getUTCMonth(), at.getUTCDate()));
  // Feb 29 + 1 year rolls into March — clamp back to Feb 28.
  if (d.getUTCMonth() !== at.getUTCMonth()) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function buildNextSteps(verdict: EntryVerdict, applicationDeadline: string): string[] {
  if (verdict === "appears_permitted") {
    return [
      "Keep a copy of any notice you received, in case questions come up later.",
      "If entries like this happen so often that they interfere with your use of the unit, keep a dated log — frequent entries can still be raised with the Board as interference with reasonable enjoyment.",
    ];
  }
  return [
    "Write down the date, time, who entered, and what happened while it's fresh, and keep any notice, texts or emails.",
    "Tell your landlord in writing that the entry did not follow the Act, and ask that future entries do. A dated letter is strong evidence if it happens again.",
    `You can apply to the Landlord and Tenant Board (Form T2) for an order about an entry the landlord was not permitted to make. You must apply within one year of the entry — by ${applicationDeadline}.`,
    "The Board can order a rent abatement, order the landlord not to repeat the conduct, or order the landlord to pay a fine.",
  ];
}

export function checkLandlordEntry(input: EntryCheckInput): EntryCheckResult {
  const rule = RULES[input.reason];
  const checks: EntryCheckItem[] = [];
  let noticeHours: number | null = null;

  switch (input.reason) {
    case "emergency":
    case "tenant_consented":
      checks.push({
        id: "no_notice_basis",
        label: "No notice needed",
        status: "pass",
        detail: rule.summary,
        citation: rule.citation,
      });
      break;

    case "regular_cleaning": {
      checks.push(
        input.leaseRequiresCleaning
          ? {
              id: "cleaning_in_lease",
              label: "Lease requires regular cleaning",
              status: "pass",
              detail: "You indicated the tenancy agreement requires the landlord to clean the unit at regular intervals.",
              citation: "RTA s.26(2)",
            }
          : {
              id: "cleaning_in_lease",
              label: "Lease requires regular cleaning",
              status: "fail",
              detail: "Entering to clean without written notice is only permitted if the tenancy agreement requires the landlord to clean at regular intervals.",
              citation: "RTA s.26(2)",
            }
      );
      if (input.leaseRequiresCleaning && input.atLeaseSpecifiedCleaningTime) {
        checks.push({
          id: "entry_window",
          label: "At a time the lease specifies",
          status: "pass",
          detail: "You indicated the entry was at a cleaning time the tenancy agreement specifies.",
          citation: "RTA s.26(2)(a)",
        });
      } else {
        checks.push(windowCheck(input.entryAt, "RTA s.26(2)(b)"));
      }
      break;
    }

    case "showing_to_prospective_tenant": {
      checks.push(
        input.tenancyEnding
          ? {
              id: "tenancy_ending",
              label: "Tenancy is ending",
              status: "pass",
              detail: "You indicated the tenancy is ending by agreement or a notice of termination.",
              citation: "RTA s.26(3)(a)",
            }
          : {
              id: "tenancy_ending",
              label: "Tenancy is ending",
              status: "fail",
              detail:
                "Showing the unit to prospective tenants without written notice is only permitted once the tenancy is ending by agreement or a notice of termination.",
              citation: "RTA s.26(3)(a)",
            }
      );
      checks.push(windowCheck(input.entryAt, "RTA s.26(3)(b)"));
      checks.push(
        input.tenantInformedBeforehand
          ? {
              id: "tenant_informed",
              label: "Tenant informed beforehand",
              status: "pass",
              detail: "You indicated the landlord told you, or made a reasonable effort to tell you, before entering.",
              citation: "RTA s.26(3)(c)",
            }
          : {
              id: "tenant_informed",
              label: "Tenant informed beforehand",
              status: "fail",
              detail: "Before entering to show the unit, the landlord must inform or make a reasonable effort to inform the tenant.",
              citation: "RTA s.26(3)(c)",
            }
      );
      break;
    }

    case "repairs_or_work":
    case "inspection":
    case "showing_to_purchaser":
    case "mortgagee_or_insurer":
    case "lease_specified_reason": {
      checks.push({
        id: "permitted_reason",
        label: "Permitted reason for entry",
        status: "pass",
        detail: rule.summary,
        citation: rule.citation,
      });
      const notice = writtenNoticeChecks(input.entryAt, input.writtenNotice);
      checks.push(...notice.checks);
      noticeHours = notice.noticeHours;
      break;
    }

    case "other":
      checks.push({
        id: "permitted_reason",
        label: "Permitted reason for entry",
        status: "fail",
        detail: rule.summary,
        citation: rule.citation,
      });
      break;
  }

  const verdict: EntryVerdict = checks.some((c) => c.status === "fail") ? "may_not_be_permitted" : "appears_permitted";
  const applicationDeadline = addOneYear(input.entryAt);

  return {
    reason: input.reason,
    reasonLabel: rule.label,
    basis: rule.basis,
    verdict,
    summary:
      verdict === "appears_permitted"
        ? "Based on what you entered, this entry appears to be one the Act permits."
        : "Based on what you entered, this entry may not have been permitted under the Act — see the failed checks below.",
    noticeHours,
    checks,
    applicationDeadline,
    nextSteps: buildNextSteps(verdict, applicationDeadline),
    disclaimer: DISCLAIMER,
  };
}

export function entryReasonRule(reason: EntryReason): EntryReasonRule {
  return RULES[reason];
}

export function allEntryReasons(): EntryReason[] {
  return Object.keys(RULES) as EntryReason[];
}

export function isEntryReason(value: unknown): value is EntryReason {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RULES, value);
}
