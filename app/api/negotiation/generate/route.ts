import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAnthropicClient } from "@/lib/anthropic";

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

    // 2. Fetch clauses & negotiation_points
    const [clausesRes, negPointsRes] = await Promise.all([
      supabase
        .from("clauses")
        .select("id, clause_number, heading, raw_text, statutory_violations")
        .in("id", selectedClauseIds),
      supabase
        .from("negotiation_points")
        .select("clause_id, priority, ask, counter_language, legal_argument")
        .in("clause_id", selectedClauseIds)
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
    const negPoints = negPointsRes.data ?? [];

    if (clauses.length === 0) {
      return NextResponse.json(
        { error: "no_matching_clauses", message: "None of the selected clause IDs matched clauses for this lease." },
        { status: 400 }
      );
    }

    // Map clauses to their negotiation details
    const formattedItems = clauses.map(c => {
      const np = negPoints.find(n => n.clause_id === c.id);
      return {
        id: c.id,
        number: c.clause_number,
        heading: c.heading || "Unnamed Clause",
        original_text: c.raw_text,
        ask: np?.ask || "Align with RTA standards.",
        counter_language: np?.counter_language || "",
        legal_argument: np?.legal_argument || "",
        statutory_violations: c.statutory_violations || []
      };
    });

    const propertyAddress = lease.property_unit 
      ? `${lease.property_unit} - ${lease.property_address}` 
      : lease.property_address || "the rental unit";

    // 3. Construct prompt for Claude
    const formattedClausesList = formattedItems.map((item, idx) => {
      const violationsStr = Array.isArray(item.statutory_violations)
        ? (item.statutory_violations as any[]).map((v: any) => `• Section ${v.statute_section}: ${v.violation_description}`).join("\n")
        : "";
      return `[Clause ${idx + 1}]
- Original Clause Number in Lease: ${item.number}
- Heading: ${item.heading}
- Original Text: "${item.original_text}"
- Issue/Violation details:
${violationsStr}
- Suggested Tenant Ask: ${item.ask}
- Legal Argument: ${item.legal_argument}
- Reference compliant counter language: "${item.counter_language}"
`;
    }).join("\n---\n");

    const systemPrompt = `You are an expert Ontario residential tenancy lawyer assisting a tenant in writing a negotiation proposal to their landlord.

Generate an email proposal and lease addendum based on the following metadata:
Tenant Name: ${tenantName}
Landlord Name: ${landlordName}
Property Address: ${propertyAddress}, ${lease.property_city || ""}
Tone: ${tone} (cooperative / assertive / formal)

Selected Lease Clauses & Issues to Address:
${formattedClausesList}

Guidelines:
1. Tone Tuning:
   - "cooperative": Highly collaborative, friendly, emphasizes building a great landlord-tenant relationship. Explains that aligning the lease with standard Ontario rules is normal and avoids future misunderstandings.
   - "assertive": Direct, firm, and legally precise. Cites the specific sections of the Ontario Residential Tenancies Act (RTA) (e.g., Section 26, Section 105) and explicitly states that terms contradicting the RTA are void and unenforceable under RTA Section 3.
   - "formal": Business professional letter styling. Objective, polite, and standard.
2. Content Guidelines:
   - For each clause, incorporate the standard RTA-compliant counter-language. Ensure the addendum clauses are legally drafted and ready to sign.
   - Use the actual clause numbers (e.g., "Clause ${formattedItems[0]?.number}") in the email text to reference what is being modified.
   - Never refer to clauses as "illegal" — always use "potentially unenforceable" or "inconsistent with the standard form of lease" in accordance with Ontario RTA styling.
   - Force output structure using the 'output_negotiation_proposal' tool.`;

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 4000,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: "Please generate the proposal email and lease amendment addendum according to the instructions."
        }
      ],
      tools: [
        {
          name: "output_negotiation_proposal",
          description: "Output the generated negotiation email and lease addendum.",
          input_schema: {
            type: "object",
            properties: {
              email_subject: { type: "string" },
              email_body: { type: "string", description: "Subject line and email body matching the selected tone." },
              addendum_title: { type: "string" },
              addendum_intro: { type: "string", description: "Standard legal introduction for a lease amendment naming both parties and the property address." },
              addendum_clauses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    original_number: { type: "string" },
                    heading: { type: "string" },
                    proposed_text: { type: "string", description: "The exact RTA-compliant clause text that should replace the old clause." }
                  },
                  required: ["original_number", "heading", "proposed_text"]
                }
              }
            },
            required: ["email_subject", "email_body", "addendum_title", "addendum_intro", "addendum_clauses"]
          }
        }
      ],
      tool_choice: { type: "tool", name: "output_negotiation_proposal" }
    });

    const toolCall = response.content.find(c => c.type === "tool_use");
    if (!toolCall || toolCall.name !== "output_negotiation_proposal") {
      return NextResponse.json(
        { error: "generation_failed", message: "Claude failed to call the output generator tool." },
        { status: 500 }
      );
    }

    const result = toolCall.input;
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Negotiation copilot generation failed:", error);
    return NextResponse.json(
      { error: "internal_server_error", message: error.message || "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
