/**
 * Repair request letter, built from a Maintenance & Repairs Checker result.
 * Legal statements come from the checker's rule table (lib/maintenance-repairs-checker.ts)
 * plus s.27(1)/(3) for entry notice — see lib/tenant-letters/core.ts.
 */

import type { RepairCheckResult } from "../maintenance-repairs-checker";
import { addDays, createLetter, formatLetterDate, type LetterBlock, type LetterParties, type TenantLetter } from "./core";

export interface RepairLetterDetails {
  /** Optional description in the tenant's own words, e.g. "The bathroom ceiling is leaking." */
  description?: string;
  /** Date the tenant first reported the problem, if they already have. */
  reportedDate?: Date | null;
  reportedInWriting?: boolean;
}

/** Days the landlord is asked to respond within — mirrors the checker's urgency. */
const RESPOND_WITHIN_DAYS = { urgent: 1, standard: 7 } as const;

export function buildRepairRequestLetter(
  result: RepairCheckResult,
  details: RepairLetterDetails,
  parties: Partial<LetterParties>,
  letterDate: Date
): TenantLetter {
  const issue = result.label.charAt(0).toLowerCase() + result.label.slice(1);
  const blocks: LetterBlock[] = [];

  const description = details.description?.trim();
  blocks.push({
    type: "paragraph",
    text: `I am writing to ask you to repair a problem in my rental unit: ${issue}.${description ? ` ${description}` : ""}`,
  });

  if (details.reportedDate && result.daysSinceReported !== null) {
    const days = result.daysSinceReported;
    blocks.push({
      type: "paragraph",
      text:
        `I first reported this problem to you ${details.reportedInWriting ? "in writing " : ""}on ${formatLetterDate(details.reportedDate)}, ` +
        `${days} ${days === 1 ? "day" : "days"} before the date of this letter, and it has not yet been fixed.`,
    });
  }

  blocks.push({
    type: "paragraph",
    text:
      "Under section 20(1) of the Residential Tenancies Act, 2006, a landlord must keep a rental unit in a good state of repair, " +
      "fit for habitation, and in line with health, safety, housing and maintenance standards. This applies even if a tenant " +
      "knew about the problem before signing the lease (s.20(2)).",
  });

  blocks.push({ type: "paragraph", text: `For this problem specifically: ${result.obligation}` });

  if (result.heat?.belowMinimum) {
    blocks.push({
      type: "paragraph",
      text: `The temperature in my unit is below the ${result.heat.minimumC} °C minimum that applies from September 1 to June 15 (O. Reg. 516/06 s.4).`,
    });
  }

  if (result.citations.includes("RTA s.21(1)")) {
    blocks.push({
      type: "paragraph",
      text: "This is a vital service. Section 21(1) of the Act provides that a landlord shall not withhold, or deliberately interfere with, the reasonable supply of a vital service it is obliged to supply.",
    });
  }

  const respondWithinDays = RESPOND_WITHIN_DAYS[result.urgency];
  const respondBy = formatLetterDate(addDays(letterDate, respondWithinDays));
  blocks.push({
    type: "paragraph",
    text:
      `Please arrange for this to be repaired and confirm in writing by ${respondBy} when the work will be done. ` +
      "If you need to enter the unit, please give me written notice at least 24 hours in advance stating the reason, " +
      "the day, and a time between 8 a.m. and 8 p.m., as required by section 27 of the Act.",
  });

  if (result.status === "follow_up_overdue") {
    blocks.push({
      type: "paragraph",
      text: result.citations.includes("RTA s.21(1)")
        ? "If the problem is not fixed, I may apply to the Landlord and Tenant Board under section 29 of the Act for an order that a vital service was withheld, and I may contact the municipal property standards office."
        : "If the problem is not fixed, I may apply to the Landlord and Tenant Board under section 29 of the Act for an order that the landlord has breached its maintenance obligations, and I may contact the municipal property standards office.",
    });
  }

  blocks.push({
    type: "paragraph",
    text: "I will continue to pay my rent while this is being resolved, and I am keeping dated records and photos of the problem.",
  });

  return createLetter({
    kind: "repair_request",
    title: "Repair request",
    subject: `Request for repair — ${result.label}`,
    letterDate,
    respondWithinDays,
    parties,
    blocks,
    citations: [
      "RTA s.20(1)",
      "RTA s.20(2)",
      ...result.citations,
      "RTA s.27(1), (3)",
      ...(result.status === "follow_up_overdue" ? ["RTA s.29(1)"] : []),
    ],
  });
}
