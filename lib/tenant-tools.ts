/**
 * Single source of truth for LeaseGuard's standalone tenant tools (the
 * deterministic RTA checkers). The /tools hub, the landing page, the sitemap
 * and the report's clause panels all read from this list, so adding a new
 * checker is one entry here rather than an edit in every page.
 *
 * `clauseTypes` uses the classifier's clause type keys (see CLAUSE_TYPE_LABELS
 * in app/components/shared.tsx) and decides which report clauses link out to
 * the tool.
 */

export interface TenantTool {
  slug: string;
  href: string;
  title: string;
  question: string;
  blurb: string;
  statuteRefs: string[];
  clauseTypes: string[];
}

export const TENANT_TOOLS: TenantTool[] = [
  {
    slug: "rent-increase-checker",
    href: "/rent-increase-checker",
    title: "Rent Increase Checker",
    question: "Is your rent increase legal?",
    blurb:
      "Checks a rent increase notice against the 90-day written notice rule, the 12-month rule, and the annual guideline cap for rent-controlled units.",
    statuteRefs: ["s. 116", "s. 119", "s. 120"],
    clauseTypes: ["rent_increase"],
  },
  {
    slug: "eviction-notice-checker",
    href: "/eviction-notice-checker",
    title: "Eviction Notice Checker",
    question: "Is your eviction notice valid?",
    blurb:
      "Checks an N4, N5, N8, N12 or N13 notice for the required notice period, termination date and landlord obligations before it can be enforced.",
    statuteRefs: ["s. 48", "s. 50", "s. 58", "s. 59", "s. 62"],
    clauseTypes: ["early_termination"],
  },
  {
    slug: "deposit-fees-checker",
    href: "/deposit-fees-checker",
    title: "Deposit & Fees Checker",
    question: "Are your deposit and fees legal?",
    blurb:
      "Calculates the interest owed on a last month's rent deposit and flags deposits and fees the RTA does not permit a landlord to charge.",
    statuteRefs: ["s. 105", "s. 106", "s. 134"],
    clauseTypes: ["security_deposit", "pets", "rent_payment"],
  },
  {
    slug: "maintenance-repairs-checker",
    href: "/maintenance-repairs-checker",
    title: "Maintenance & Repairs Checker",
    question: "Is your landlord keeping up with repairs?",
    blurb:
      "Shows what the RTA and Ontario's maintenance standards require for heat, hot water, pests, mould and other repairs, and when to escalate to the Landlord and Tenant Board.",
    statuteRefs: ["s. 20", "s. 21", "s. 29", "s. 30"],
    clauseTypes: ["maintenance_repairs"],
  },
];

export function toolsForClauseType(clauseType: string): TenantTool[] {
  return TENANT_TOOLS.filter((tool) => tool.clauseTypes.includes(clauseType));
}
