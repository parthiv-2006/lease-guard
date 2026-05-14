import { z } from "zod";
import type { ClauseType } from "../types.js";

export const toolDefinition = {
  name: "check_missing",
  description:
    "Check which required Ontario lease protections are absent from the analyzed lease. Also returns implicit protections that apply by law regardless of the lease text.",
  inputSchema: {
    type: "object" as const,
    properties: {
      found_clause_types: {
        type: "array",
        items: { type: "string" },
        description: "List of ClauseTypes found in the lease",
      },
      jurisdiction_code: {
        type: "string",
        description: "Jurisdiction code e.g. CA-ON",
      },
    },
    required: ["found_clause_types", "jurisdiction_code"],
  },
};

const InputSchema = z.object({
  found_clause_types: z.array(z.string()),
  jurisdiction_code: z.string(),
});

interface RequiredProtection {
  clause_type: ClauseType;
  description: string;
  statute_reference: string;
  statute_section: string;
  risk_if_missing: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface ImplicitProtection {
  name: string;
  description: string;
  statute_reference: string;
  applies_regardless_of_lease: boolean;
}

interface MissingCheckResult {
  missing_protections: RequiredProtection[];
  found_protections: Array<{
    clause_type: ClauseType;
    description: string;
    statute_reference: string;
  }>;
  implicit_protections: ImplicitProtection[];
  all_required_present: boolean;
  jurisdiction_supported: boolean;
  coverage_score: number;
}

const ONTARIO_REQUIRED_PROTECTIONS: RequiredProtection[] = [
  {
    clause_type: "rent_payment",
    description: "Rent payment terms",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 12 RTA",
    risk_if_missing:
      "Without explicit rent terms, disputes about amount, due date, and acceptable payment methods are harder to resolve.",
    severity: "medium",
  },
  {
    clause_type: "entry_rights",
    description: "Landlord entry rights with 24-hour notice requirement",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 27 RTA",
    risk_if_missing:
      "If entry rights are not addressed, landlord may attempt unconsented entry. RTA s.27 still applies, but an explicit clause helps enforce compliance.",
    severity: "high",
  },
  {
    clause_type: "quiet_enjoyment",
    description: "Tenant's right to quiet enjoyment of the rental unit",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 22 RTA",
    risk_if_missing:
      "Absence of a quiet enjoyment clause leaves the tenant without a contractual remedy; RTA s.22 still applies but should be reinforced.",
    severity: "medium",
  },
  {
    clause_type: "security_deposit",
    description: "Security deposit terms and return conditions",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 105 RTA",
    risk_if_missing:
      "Without explicit deposit terms, there is no written record of the deposit amount, conditions of return, or deduction basis.",
    severity: "high",
  },
  {
    clause_type: "subletting_assignment",
    description: "Subletting and assignment rights",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 97 RTA",
    risk_if_missing:
      "Absence of subletting terms may leave the tenant without clarity on exit options before lease end.",
    severity: "medium",
  },
  {
    clause_type: "maintenance_repairs",
    description: "Landlord and tenant maintenance obligations",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 20 RTA",
    risk_if_missing:
      "Without explicit maintenance terms, responsibility for repairs may be disputed. The landlord's statutory obligation remains, but documentation is weaker.",
    severity: "high",
  },
  {
    clause_type: "early_termination",
    description: "Early termination procedures and penalties",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Sections 59–84 RTA",
    risk_if_missing:
      "No clause describing early termination means the tenant may face unclear consequences if they need to leave before lease end.",
    severity: "medium",
  },
  {
    clause_type: "rent_increase",
    description: "Rent increase notice and guideline compliance",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 120 RTA",
    risk_if_missing:
      "Without an explicit rent increase clause, the landlord may attempt unilateral increases. RTA s.120 limits increases but a clause memorialises the agreement.",
    severity: "medium",
  },
  {
    clause_type: "renewal_terms",
    description: "Lease renewal and holdover provisions",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 95 RTA",
    risk_if_missing:
      "Without renewal terms, both parties may have different expectations about what happens at lease end.",
    severity: "low",
  },
  {
    clause_type: "alterations",
    description: "Tenant alteration and modification rights",
    statute_reference: "Residential Tenancies Act, 2006",
    statute_section: "Section 29 RTA",
    risk_if_missing:
      "Without an alterations clause, tenant and landlord expectations about modifications, painting, or fixtures may diverge.",
    severity: "low",
  },
];

const ONTARIO_IMPLICIT_PROTECTIONS: ImplicitProtection[] = [
  {
    name: "Habitability standard",
    description:
      "The landlord must maintain the rental unit in a good state of repair, fit for habitation, and compliant with health, safety, housing, and maintenance standards.",
    statute_reference: "Residential Tenancies Act s.20; Ontario Reg. 517/06",
    applies_regardless_of_lease: true,
  },
  {
    name: "Rent increase guideline cap",
    description:
      "Rent increases are capped at the provincial guideline percentage each year. No lease clause can override this limit for most residential units.",
    statute_reference: "Residential Tenancies Act s.120",
    applies_regardless_of_lease: true,
  },
  {
    name: "Prohibition on unlawful eviction",
    description:
      "The landlord cannot evict a tenant without a valid LTB order. Self-help eviction (changing locks, removing belongings) is illegal.",
    statute_reference: "Residential Tenancies Act ss.35–36, 83",
    applies_regardless_of_lease: true,
  },
  {
    name: "Anti-reprisal protection",
    description:
      "The landlord cannot retaliate against a tenant for exercising rights under the RTA, including filing LTB applications or requesting repairs.",
    statute_reference: "Residential Tenancies Act s.83(3)",
    applies_regardless_of_lease: true,
  },
  {
    name: "Last month's rent interest",
    description:
      "If a last-month's-rent deposit was collected, the landlord must pay interest on it annually at the rent increase guideline rate.",
    statute_reference: "Residential Tenancies Act s.106(6)",
    applies_regardless_of_lease: true,
  },
];

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { found_clause_types, jurisdiction_code } = parsed.data;

  // Unsupported jurisdiction
  if (jurisdiction_code !== "CA-ON") {
    return {
      missing_protections: [],
      found_protections: [],
      implicit_protections: [],
      all_required_present: false,
      jurisdiction_supported: false,
      coverage_score: 0,
      note: `Jurisdiction ${jurisdiction_code} is not supported in MVP. Only CA-ON (Ontario, Canada) is supported.`,
    };
  }

  const foundSet = new Set(found_clause_types as ClauseType[]);

  const missingProtections: RequiredProtection[] = [];
  const foundProtections: Array<{
    clause_type: ClauseType;
    description: string;
    statute_reference: string;
  }> = [];

  for (const protection of ONTARIO_REQUIRED_PROTECTIONS) {
    if (foundSet.has(protection.clause_type)) {
      foundProtections.push({
        clause_type: protection.clause_type,
        description: protection.description,
        statute_reference: protection.statute_reference,
      });
    } else {
      missingProtections.push(protection);
    }
  }

  const totalRequired = ONTARIO_REQUIRED_PROTECTIONS.length;
  const foundCount = foundProtections.length;
  const coverageScore = Math.round((foundCount / totalRequired) * 100) / 100;

  return {
    missing_protections: missingProtections,
    found_protections: foundProtections,
    implicit_protections: ONTARIO_IMPLICIT_PROTECTIONS,
    all_required_present: missingProtections.length === 0,
    jurisdiction_supported: true,
    coverage_score: coverageScore,
  } satisfies MissingCheckResult;
}
