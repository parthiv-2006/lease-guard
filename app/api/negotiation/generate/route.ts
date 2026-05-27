/**
 * app/api/negotiation/generate/route.ts — Negotiation Copilot proposal generator.
 *
 * POST /api/negotiation/generate
 * Body: { leaseId, tenantName, landlordName, tone, selectedClauseIds }
 *
 * Architecture:
 *   1. Validate inputs
 *   2. Fetch lease + clause + negotiation_points from Supabase
 *   3. Call Groq (llama-3.3-70b-versatile) with JSON mode to generate proposal
 *   4. Validate the returned JSON shape
 *   5. Fall back to template generator if Groq fails for any reason
 *
 * Why Groq instead of Anthropic:
 *   - Free tier: 14,400 RPD / 30 RPM (Anthropic requires paid key for tool_use)
 *   - OpenAI-compatible JSON mode (response_format: { type: "json_object" }) is
 *     simpler than Anthropic tool_choice for structured output
 *   - Template fallback means zero downtime if Groq is unavailable
 *
 * PERMANENT GOTCHA: Do NOT use @anthropic-ai/sdk here. The Anthropic API key
 * is an OAuth token (sk-ant-o...) which cannot be used for direct messages.create()
 * calls. Groq handles this route; Anthropic is only used in lib/agent.ts via
 * lib/anthropic.ts which handles OAuth tokens internally.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sanitizeName } from "@/lib/ai-safety";

// ── Constants ─────────────────────────────────────────────────────────────────

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProposalItem {
  number:                 string;
  heading:                string;
  original_text:          string;
  ask:                    string;
  counter_language:       string;
  legal_argument:         string;
  landlord_likely_response: string;
  tenant_rebuttal:        string;
  statutory_violations:   Array<{ statute_section: string; violation_description: string }>;
}

interface ProposalResult {
  email_subject:    string;
  email_body:       string;
  addendum_title:   string;
  addendum_intro:   string;
  addendum_clauses: Array<{ original_number: string; heading: string; proposed_text: string }>;
}

// ── Template fallback ─────────────────────────────────────────────────────────
// Used when Groq is unavailable or returns malformed JSON.
// Generates a complete, professional proposal from the structured data already
// in the database (counter_language, legal_argument, statutory_violations, etc.).

function generateTemplateProposal(params: {
  tenantName:      string;
  landlordName:    string;
  propertyAddress: string;
  tone:            string;
  items:           ProposalItem[];
}): ProposalResult {
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

  const email_body =
    `Dear ${landlordName},\n\n` +
    `Re: Proposed Amendments to Lease Agreement — ${propertyAddress}\n\n` +
    `${openings[tone] ?? openings.formal}\n\n` +
    `The following clauses require amendment:\n\n` +
    clauseSummaries.join("\n") +
    `\n\n` +
    (tone === "assertive"
      ? items
          .map((item) => `Regarding Clause ${item.number} (${item.heading}): ${item.legal_argument}`)
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

  return {
    email_subject:   `Proposed Lease Amendments — ${propertyAddress}`,
    email_body,
    addendum_title:  `Lease Amendment Addendum — ${propertyAddress}`,
    addendum_intro,
    addendum_clauses: items.map((item) => ({
      original_number: item.number,
      heading:         item.heading,
      proposed_text:
        item.counter_language?.trim() ||
        `This clause is amended to comply with the Ontario Residential Tenancies Act. ${item.ask}`,
    })),
  };
}

// ── Groq JSON generation ──────────────────────────────────────────────────────

async function generateWithGroq(params: {
  tenantName:      string;
  landlordName:    string;
  propertyAddress: string;
  tone:            string;
  items:           ProposalItem[];
}): Promise<ProposalResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[negotiation/generate] GROQ_API_KEY not set — using template fallback");
    return null;
  }

  const { tenantName, landlordName, propertyAddress, tone, items } = params;

  const clausesList = items
    .map((item, idx) => {
      const violationsStr = item.statutory_violations
        .map((v) => `    • ${v.statute_section}: ${v.violation_description}`)
        .join("\n");
      return (
        `[Clause ${idx + 1}]\n` +
        `  Original number in lease: ${item.number}\n` +
        `  Heading: ${item.heading}\n` +
        `  Original text: "${item.original_text}"\n` +
        `  Statutory violations:\n${violationsStr || "    (none noted)"}\n` +
        `  Suggested ask: ${item.ask}\n` +
        `  Legal argument: ${item.legal_argument}\n` +
        `  RTA-compliant counter language: "${item.counter_language}"`
      );
    })
    .join("\n---\n");

  const systemPrompt =
    `You are an expert Ontario residential tenancy lawyer helping a tenant negotiate their lease.\n\n` +
    `Generate a negotiation proposal based on the inputs below. Output ONLY valid JSON matching ` +
    `this exact schema — no prose, no markdown, no extra keys:\n\n` +
    `{\n` +
    `  "email_subject": string,\n` +
    `  "email_body": string,          // full email body text, newlines as \\n\n` +
    `  "addendum_title": string,\n` +
    `  "addendum_intro": string,      // legal addendum introduction paragraph\n` +
    `  "addendum_clauses": [          // one entry per clause\n` +
    `    {\n` +
    `      "original_number": string, // clause number from lease\n` +
    `      "heading": string,\n` +
    `      "proposed_text": string    // RTA-compliant replacement clause text, ready to sign\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `INPUTS:\n` +
    `  Tenant name: ${tenantName}\n` +
    `  Landlord name: ${landlordName}\n` +
    `  Property address: ${propertyAddress}\n` +
    `  Tone: ${tone}\n\n` +
    `TONE GUIDE:\n` +
    `  cooperative — Friendly, collaborative, emphasises a positive landlord-tenant relationship.\n` +
    `  formal      — Standard professional business letter, objective and polite.\n` +
    `  assertive   — Direct and legally precise. Cite specific RTA sections. State that conflicting ` +
    `clauses are void under RTA s.3(1).\n\n` +
    `CRITICAL RULES:\n` +
    `  1. Never call a clause "illegal" — use "potentially unenforceable" or "void under the RTA".\n` +
    `  2. Every addendum clause must cite the relevant RTA section and be legally ready to sign.\n` +
    `  3. Addendum intro must name both parties and the property address.\n` +
    `  4. Email body must open with a greeting and close with the tenant's name.\n\n` +
    `CLAUSES TO ADDRESS:\n${clausesList}`;

  try {
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: "Generate the negotiation proposal JSON now." },
        ],
        response_format: { type: "json_object" },
        max_tokens:      4000,
        temperature:     0.1,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.warn(`[negotiation/generate] Groq returned ${resp.status}:`, body);
      return null;
    }

    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("[negotiation/generate] Groq returned empty content");
      return null;
    }

    const parsed = JSON.parse(content) as Partial<ProposalResult>;

    // Validate all required fields are present and non-empty
    if (
      typeof parsed.email_subject    !== "string" || !parsed.email_subject.trim() ||
      typeof parsed.email_body       !== "string" || !parsed.email_body.trim() ||
      typeof parsed.addendum_title   !== "string" || !parsed.addendum_title.trim() ||
      typeof parsed.addendum_intro   !== "string" || !parsed.addendum_intro.trim() ||
      !Array.isArray(parsed.addendum_clauses)     || parsed.addendum_clauses.length === 0
    ) {
      console.warn("[negotiation/generate] Groq JSON missing required fields — using template");
      return null;
    }

    // Validate each addendum clause
    for (const clause of parsed.addendum_clauses) {
      if (
        typeof clause.original_number !== "string" ||
        typeof clause.heading         !== "string" ||
        typeof clause.proposed_text   !== "string" ||
        !clause.proposed_text.trim()
      ) {
        console.warn("[negotiation/generate] Groq addendum_clauses malformed — using template");
        return null;
      }
    }

    return parsed as ProposalResult;
  } catch (err) {
    console.warn("[negotiation/generate] Groq call failed:", (err as Error).message);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { leaseId, tenantName, landlordName, tone, selectedClauseIds } = body;

    // ── Input validation ─────────────────────────────────────────────────────
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

    // ── Sanitize free-text name fields before embedding in LLM prompts ──────
    // Strips newlines, control chars, and token delimiters that could be used
    // to inject instructions into the system prompt.
    const safeTenantName   = sanitizeName(tenantName);
    const safeLandlordName = sanitizeName(landlordName);

    // ── 1. Fetch lease property details ──────────────────────────────────────
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

    // ── 2. Fetch clauses + negotiation_points in parallel ────────────────────
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

    const clauses   = clausesRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const negPoints = (negPointsRes.data as any[]) ?? [];

    if (clauses.length === 0) {
      return NextResponse.json(
        { error: "no_matching_clauses", message: "None of the selected clause IDs matched clauses for this lease." },
        { status: 400 }
      );
    }

    // ── 3. Map clauses → ProposalItem ────────────────────────────────────────
    const formattedItems: ProposalItem[] = clauses.map((c) => {
      const np = negPoints.find((n) => n.clause_id === c.id);
      return {
        number:                   c.clause_number ?? "",
        heading:                  c.heading || "Unnamed Clause",
        original_text:            c.raw_text ?? "",
        ask:                      np?.ask || "Align with RTA standards.",
        counter_language:         np?.counter_language || "",
        legal_argument:           np?.legal_argument || "",
        landlord_likely_response: np?.landlord_likely_response || "",
        tenant_rebuttal:          np?.tenant_rebuttal || "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        statutory_violations:     (c.statutory_violations as any[]) || [],
      };
    });

    const propertyAddress = lease.property_unit
      ? `${lease.property_unit} - ${lease.property_address}`
      : lease.property_address || "the rental unit";
    const fullAddress = [propertyAddress, lease.property_city].filter(Boolean).join(", ");

    const generationParams = {
      tenantName:      safeTenantName,
      landlordName:    safeLandlordName,
      propertyAddress: fullAddress,
      tone,
      items: formattedItems,
    };

    // ── 4. Try Groq — fall back to template if unavailable or malformed ──────
    const groqResult = await generateWithGroq(generationParams);
    const result     = groqResult ?? generateTemplateProposal(generationParams);

    if (groqResult) {
      console.log("[negotiation/generate] Groq proposal generated successfully");
    } else {
      console.log("[negotiation/generate] Using template fallback");
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error("[negotiation/generate] Unhandled error:", message);
    return NextResponse.json(
      { error: "internal_server_error", message },
      { status: 500 }
    );
  }
}
