import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAnthropicClient } from "@/lib/anthropic";

// ── Template fallback ─────────────────────────────────────────────────────────
// Used when the Anthropic API key is not configured or the API call fails.
// Generates a complete, professional proposal from the structured data already
// in the database (counter_language, legal_argument, statutory_violations, etc.).

interface ProposalItem {
  number: string;
  heading: string;
  original_text: string;
  ask: string;
  counter_language: string;
  legal_argument: string;
  landlord_likely_response: string;
  tenant_rebuttal: string;
  statutory_violations: Array<{ statute_section: string; violation_description: string }>;
}

function generateTemplateProposal(params: {
  tenantName: string;
  landlordName: string;
  propertyAddress: string;
  tone: string;
  items: ProposalItem[];
}): {
  email_subject: string;
  email_body: string;
  addendum_title: string;
  addendum_intro: string;
  addendum_clauses: Array<{ original_number: string; heading: string; proposed_text: string }>;
} {
  const { tenantName, landlordName, propertyAddress, tone, items } = params;

  const openings: Record<string, string> = {
    cooperative:
      `I hope this message finds you well. I'm reaching out ahead of signing to discuss a few ` +
      `clauses in our lease agreement. I want to ensure we start the tenancy on a clear and ` +
      `positive footing, and I believe addressing these points now will prevent misunderstandings ` +
      `for both of us down the road.`,
    assertive:
      `I am writing regarding several provisions in the proposed lease agreement for the above ` +
      `premises. After reviewing the agreement against the Ontario Residential Tenancies Act, ` +
      `R.S.O. 2006, c. 17 (the "RTA"), I have identified clauses that are inconsistent with ` +
      `mandatory statutory protections. Pursuant to RTA s.3(1), any provision that purports to ` +
      `negate or modify a tenant's rights under the Act is void. I am requesting the following ` +
      `amendments as a condition of signing.`,
    formal:
      `I am writing with respect to the residential tenancy agreement for the above-noted premises. ` +
      `Upon careful review, I have identified provisions that require amendment prior to execution ` +
      `in order to bring the agreement into conformity with applicable Ontario tenancy law. ` +
      `I respectfully request that the following amendments be incorporated into the final agreement.`,
  };

  const closings: Record<string, string> = {
    cooperative:
      `I am very much looking forward to this tenancy and hope we can resolve these points quickly. ` +
      `Please don't hesitate to call me if you'd like to discuss any of this in person. I've ` +
      `attached a formal Lease Amendment Addendum for your convenience.\n\nWarm regards`,
    assertive:
      `Please confirm your agreement to the proposed amendments in writing within seven (7) days. ` +
      `I have prepared a Lease Amendment Addendum (attached) which may be signed alongside the ` +
      `original lease. Should you require clarification on any of the statutory references, ` +
      `I am happy to provide them.\n\nYours truly`,
    formal:
      `I have prepared a Lease Amendment Addendum setting out the proposed replacement language ` +
      `for each affected clause. Please review and advise whether the amendments are acceptable ` +
      `at your earliest convenience.\n\nRespectfully`,
  };

  const clauseSummaries = items.map((item, idx) => {
    const violation = item.statutory_violations?.[0];
    const rtaRef = violation?.statute_section ? ` (${violation.statute_section})` : "";
    return `${idx + 1}. Clause ${item.number} — ${item.heading}: ${item.ask}${rtaRef}`;
  });

  const email_subject = `Proposed Lease Amendments — ${propertyAddress}`;

  const email_body =
    `Dear ${landlordName},\n\n` +
    `Re: Proposed Amendments to Lease Agreement — ${propertyAddress}\n\n` +
    `${openings[tone] ?? openings.formal}\n\n` +
    `The following clauses require amendment:\n\n` +
    clauseSummaries.join("\n") +
    `\n\n` +
    (tone === "assertive"
      ? items
          .map(
            (item) =>
              `Regarding Clause ${item.number} (${item.heading}): ${item.legal_argument}`
          )
          .join("\n\n") + "\n\n"
      : "") +
    `${closings[tone] ?? closings.formal},\n${tenantName}`;

  const addendum_intro =
    `This Lease Amendment Addendum ("Addendum") is entered into between ${landlordName} ` +
    `(the "Landlord") and ${tenantName} (the "Tenant") with respect to the residential ` +
    `tenancy agreement for the premises municipally known as ${propertyAddress} ` +
    `(the "Agreement"). This Addendum supplements and amends the Agreement. In the event ` +
    `of any conflict between this Addendum and the Agreement, this Addendum shall prevail. ` +
    `All other terms and conditions of the Agreement remain in full force and effect.`;

  const addendum_clauses = items.map((item) => ({
    original_number: item.number,
    heading: item.heading,
    proposed_text:
      item.counter_language?.trim() ||
      `This clause is amended to comply with the Ontario Residential Tenancies Act. ` +
        item.ask,
  }));

  return {
    email_subject,
    email_body,
    addendum_title: `Lease Amendment Addendum — ${propertyAddress}`,
    addendum_intro,
    addendum_clauses,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { leaseId, tenantName, landlordName, tone, selectedClauseIds } = body;

    // Validate inputs
    if (!leaseId || !/^[0-9a-f-]{36}$/.test(leaseId)) {
      return NextResponse.json(
        { error: "invalid_lease_id", message: "Lease ID is required and must be a valid UUID." },
        { status: 400 }
      );
    }
    if (!tenantName?.trim()) {
      return NextResponse.json(
        { error: "missing_tenant_name", message: "Tenant name is required." },
        { status: 400 }
      );
    }
    if (!landlordName?.trim()) {
      return NextResponse.json(
        { error: "missing_landlord_name", message: "Landlord name is required." },
        { status: 400 }
      );
    }
    if (!["cooperative", "assertive", "formal"].includes(tone)) {
      return NextResponse.json(
        { error: "invalid_tone", message: "Tone must be cooperative, assertive, or formal." },
        { status: 400 }
      );
    }
    if (!Array.isArray(selectedClauseIds) || selectedClauseIds.length === 0) {
      return NextResponse.json(
        { error: "invalid_clauses", message: "selectedClauseIds must be a non-empty array." },
        { status: 400 }
      );
    }
    for (const cid of selectedClauseIds) {
      if (!/^[0-9a-f-]{36}$/.test(cid)) {
        return NextResponse.json(
          { error: "invalid_clause_id", message: `Clause ID ${cid} is not a valid UUID.` },
          { status: 400 }
        );
      }
    }

    // 1. Fetch lease property details
    const { data: lease, error: leaseErr } = await supabase
      .from("leases")
      .select("id, property_address, property_unit, property_city, jurisdiction")
      .eq("id", leaseId)
      .single();

    if (leaseErr || !lease) {
      return NextResponse.json(
        { error: "lease_not_found", message: "The specified lease was not found." },
        { status: 404 }
      );
    }

    // 2. Fetch clauses & negotiation_points (full fields for template fallback)
    const [clausesRes, negPointsRes] = await Promise.all([
      supabase
        .from("clauses")
        .select("id, clause_number, heading, raw_text, statutory_violations")
        .in("id", selectedClauseIds),
      supabase
        .from("negotiation_points")
        .select(
          "clause_id, priority, ask, counter_language, legal_argument, " +
          "landlord_likely_response, tenant_rebuttal, cited_statutes"
        )
        .in("clause_id", selectedClauseIds),
    ]);

    if (clausesRes.error) {
      return NextResponse.json(
        { error: "clauses_fetch_failed", message: "Failed to retrieve lease clauses." },
        { status: 500 }
      );
    }
    if (negPointsRes.error) {
      return NextResponse.json(
        { error: "negotiations_fetch_failed", message: "Failed to retrieve negotiation points." },
        { status: 500 }
      );
    }

    const clauses = clausesRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const negPoints: any[] = (negPointsRes.data as any[]) ?? [];

    if (clauses.length === 0) {
      return NextResponse.json(
        { error: "no_matching_clauses", message: "None of the selected clause IDs matched clauses for this lease." },
        { status: 400 }
      );
    }

    // 3. Map clauses to their negotiation details
    const formattedItems: ProposalItem[] = clauses.map((c) => {
      const np = negPoints.find((n) => n.clause_id === c.id);
      return {
        number: c.clause_number ?? "",
        heading: c.heading || "Unnamed Clause",
        original_text: c.raw_text ?? "",
        ask: np?.ask || "Align with RTA standards.",
        counter_language: np?.counter_language || "",
        legal_argument: np?.legal_argument || "",
        landlord_likely_response: np?.landlord_likely_response || "",
        tenant_rebuttal: np?.tenant_rebuttal || "",
        statutory_violations: (c.statutory_violations as any[]) || [],
      };
    });

    const propertyAddress = lease.property_unit
      ? `${lease.property_unit} - ${lease.property_address}`
      : lease.property_address || "the rental unit";
    const fullAddress = [propertyAddress, lease.property_city].filter(Boolean).join(", ");

    // 4. Try Anthropic API — fall back to template if key is missing or invalid
    const formattedClausesList = formattedItems
      .map((item, idx) => {
        const violationsStr = item.statutory_violations
          .map((v) => `• ${v.statute_section}: ${v.violation_description}`)
          .join("\n");
        return (
          `[Clause ${idx + 1}]\n` +
          `- Original Clause Number in Lease: ${item.number}\n` +
          `- Heading: ${item.heading}\n` +
          `- Original Text: "${item.original_text}"\n` +
          `- Issue/Violation details:\n${violationsStr}\n` +
          `- Suggested Tenant Ask: ${item.ask}\n` +
          `- Legal Argument: ${item.legal_argument}\n` +
          `- Reference compliant counter language: "${item.counter_language}"`
        );
      })
      .join("\n---\n");

    const systemPrompt =
      `You are an expert Ontario residential tenancy lawyer assisting a tenant in writing ` +
      `a negotiation proposal to their landlord.\n\n` +
      `Generate an email proposal and lease addendum based on the following metadata:\n` +
      `Tenant Name: ${tenantName}\n` +
      `Landlord Name: ${landlordName}\n` +
      `Property Address: ${fullAddress}\n` +
      `Tone: ${tone} (cooperative / assertive / formal)\n\n` +
      `Selected Lease Clauses & Issues to Address:\n${formattedClausesList}\n\n` +
      `Guidelines:\n` +
      `1. Tone Tuning:\n` +
      `   - "cooperative": Highly collaborative, friendly, emphasizes building a great landlord-tenant relationship.\n` +
      `   - "assertive": Direct, firm, legally precise. Cites specific RTA sections. States void clauses are unenforceable under RTA s.3.\n` +
      `   - "formal": Business professional letter styling. Objective, polite, standard.\n` +
      `2. Never refer to clauses as "illegal" — use "potentially unenforceable" or "inconsistent with the standard form of lease".\n` +
      `3. Incorporate RTA-compliant counter-language. Addendum clauses must be legally ready to sign.\n` +
      `4. Force output structure using the 'output_negotiation_proposal' tool.`;

    let apiResult: Record<string, unknown> | null = null;

    try {
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 4000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: "Please generate the proposal email and lease amendment addendum.",
          },
        ],
        tools: [
          {
            name: "output_negotiation_proposal",
            description: "Output the generated negotiation email and lease addendum.",
            input_schema: {
              type: "object" as const,
              properties: {
                email_subject: { type: "string" },
                email_body: {
                  type: "string",
                  description: "Email body matching the selected tone.",
                },
                addendum_title: { type: "string" },
                addendum_intro: {
                  type: "string",
                  description:
                    "Legal introduction for a lease amendment naming both parties and property address.",
                },
                addendum_clauses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      original_number: { type: "string" },
                      heading: { type: "string" },
                      proposed_text: {
                        type: "string",
                        description: "RTA-compliant replacement clause text.",
                      },
                    },
                    required: ["original_number", "heading", "proposed_text"],
                  },
                },
              },
              required: [
                "email_subject",
                "email_body",
                "addendum_title",
                "addendum_intro",
                "addendum_clauses",
              ],
            },
          },
        ],
        tool_choice: { type: "tool", name: "output_negotiation_proposal" },
      });

      const toolCall = response.content.find((c) => c.type === "tool_use");
      if (toolCall && toolCall.type === "tool_use" && toolCall.name === "output_negotiation_proposal") {
        apiResult = toolCall.input as Record<string, unknown>;
      }
    } catch (apiErr: any) {
      // Log but don't throw — template fallback runs below
      console.warn(
        "[negotiation/generate] Anthropic API unavailable, using template fallback:",
        apiErr?.message ?? apiErr
      );
    }

    // 5. Use API result if valid, otherwise generate from template
    const result =
      apiResult ??
      generateTemplateProposal({
        tenantName,
        landlordName,
        propertyAddress: fullAddress,
        tone,
        items: formattedItems,
      });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Negotiation copilot generation failed:", error);
    return NextResponse.json(
      {
        error: "internal_server_error",
        message: error.message || "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
