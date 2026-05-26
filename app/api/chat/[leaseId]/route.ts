/**
 * app/api/chat/[leaseId]/route.ts — Ask Your Lease: streaming conversational AI.
 *
 * POST /api/chat/[leaseId]
 * Body: { message: string; history: Array<{ role: "user"|"assistant"; content: string }> }
 *
 * Streams back text/event-stream SSE events:
 *   {"type":"token","text":"..."} — partial response text
 *   {"type":"sources","sources":[...]} — retrieved statute/decision citations
 *   {"type":"done"} — stream complete
 *   {"type":"error","message":"..."} — error occurred
 *
 * Architecture:
 *   1. Validate request
 *   2. Rate-limit (20 req/hr/IP)
 *   3. Fetch lease context from Supabase
 *   4. Embed user question via Gemini REST (RETRIEVAL_QUERY, 768-dim)
 *   5. Parallel hybrid search: statutes + tribunal decisions
 *   6. Build grounded system prompt
 *   7. Stream Claude Haiku response
 *
 * CRITICAL: Do NOT import from mcp-server/src/lib/embeddings.ts — that module
 * uses ESM imports for the MCP server environment. Gemini embed is duplicated
 * inline here using the same REST approach (Gotcha #1 from HANDOFF.md).
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Constants ─────────────────────────────────────────────────────────────────

const LEASE_ID_RE = /^[0-9a-f-]{36}$/;
const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent";
const JURISDICTION = "CA-ON";

/**
 * Gemini free-tier limits (2025):
 *   gemini-2.0-flash: 15 RPM, 1 500 RPD, 1 M TPM
 *
 * We apply a per-IP cap of 10 req/hr.  With up to ~6 concurrent users this
 * keeps the global RPD well under 1 500 and leaves headroom for embed calls.
 */
const CHAT_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000, storeKey: "chat" } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatHistory {
  role: "user" | "assistant";
  content: string;
}

interface StatuteSource {
  act_name: string;
  section_number: string;
  section_title: string;
  full_text: string;
  url: string;
}

interface DecisionSource {
  case_number: string;
  relevant_principle: string;
  ruling_summary: string;
  url: string;
}

// ── Gemini Embed (REST, no SDK — Gotcha #1) ───────────────────────────────────

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const resp = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: text.trim().slice(0, 2000) }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini embed error ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values || values.length !== 768) {
    throw new Error("Gemini returned unexpected embedding dimensions");
  }
  return values;
}

// ── Gemini Chat Streaming (REST, no SDK — Gotcha #1) ─────────────────────────

/**
 * Calls gemini-2.0-flash via streamGenerateContent SSE endpoint.
 * Converts "assistant" role → "model" as required by the Gemini API.
 * Invokes onToken for each partial text chunk received.
 */
async function streamGeminiChat(
  systemPrompt: string,
  history: ChatHistory[],
  userMessage: string,
  onToken: (text: string) => void
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  // Keep the last 6 turns; convert role names for Gemini
  const contents = [
    ...history.slice(-6).map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const resp = await fetch(`${GEMINI_GENERATE_URL}?alt=sse&key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.4,
      },
    }),
  });

  if (!resp.ok) {
    // Map HTTP status codes to structured error codes so the outer catch
    // can send user-friendly messages instead of raw API JSON blobs.
    if (resp.status === 429) {
      throw Object.assign(new Error("rate_limit_exceeded"), { code: "rate_limit_exceeded" });
    }
    if (resp.status === 401 || resp.status === 403) {
      throw Object.assign(new Error("auth_error"), { code: "auth_error" });
    }
    if (resp.status >= 500) {
      throw Object.assign(new Error("service_unavailable"), { code: "service_unavailable" });
    }
    const body = await resp.text().catch(() => "");
    console.error(`[chat] Gemini generate error ${resp.status}:`, body);
    throw Object.assign(new Error("generate_failed"), { code: "generate_failed" });
  }

  if (!resp.body) throw new Error("Gemini returned no response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Parse the SSE stream: each chunk may contain multiple `data: {...}` lines
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep any incomplete trailing line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === "string" && text) onToken(text);
      } catch {
        // skip malformed SSE chunk
      }
    }
  }
}

// ── Supabase RAG retrieval ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function retrieveStatutes(
  embedding: number[],
  queryText: string,
  supabase: any
): Promise<StatuteSource[]> {
  // Try hybrid search first (migration 005), fall back to pure vector
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("search_statutes_hybrid", {
    query_embedding: embedding,
    query_text: queryText,
    jurisdiction: JURISDICTION,
    match_threshold: 0.55,
    match_count: 5,
  });

  if (error) {
    // PGRST202 = hybrid RPC not found — fall back to pure vector
    if (error.code === "PGRST202" || error.message?.includes("search_statutes_hybrid")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: vData, error: vErr } = await (supabase as any).rpc("search_statutes", {
        query_embedding: embedding,
        jurisdiction: JURISDICTION,
        match_threshold: 0.60,
        match_count: 5,
      });
      if (vErr || !Array.isArray(vData)) return [];
      return (vData as Record<string, unknown>[]).map((r) => ({
        act_name: (r.act_name as string) ?? "",
        section_number: (r.section_number as string) ?? "",
        section_title: (r.section_title as string) ?? "",
        full_text: ((r.full_text as string) ?? "").slice(0, 600),
        url: (r.url as string) ?? "",
      }));
    }
    return [];
  }

  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    act_name: (r.act_name as string) ?? "",
    section_number: (r.section_number as string) ?? "",
    section_title: (r.section_title as string) ?? "",
    full_text: ((r.full_text as string) ?? "").slice(0, 600),
    url: (r.url as string) ?? "",
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function retrieveDecisions(
  embedding: number[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<DecisionSource[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("search_decisions", {
    query_embedding: embedding,
    jurisdiction: JURISDICTION,
    match_threshold: 0.45,
    match_count: 3,
  });

  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    case_number: (r.case_number as string) ?? "",
    relevant_principle: (r.relevant_principle as string) ?? "",
    ruling_summary: ((r.ruling_summary as string) ?? "").slice(0, 400),
    url: (r.url as string) ?? "",
  }));
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(
  leaseContext: {
    address: string;
    city: string;
    riskScore: number;
    riskLevel: string;
    clauseCount: number;
    clauses: Array<{
      number: string;
      heading: string;
      risk_level: string;
      plain_english_explanation: string;
      statutory_violations: Array<{ statute_section: string }>;
      is_potentially_unenforceable: boolean;
    }>;
  },
  statutes: StatuteSource[],
  decisions: DecisionSource[]
): string {
  const clausesSummary = leaseContext.clauses
    .slice(0, 12) // cap to avoid token overflow
    .map(
      (c) =>
        `Clause ${c.number} — ${c.heading} [${c.risk_level.toUpperCase()}]${
          c.is_potentially_unenforceable ? " ⚠ potentially unenforceable" : ""
        }: ${c.plain_english_explanation}` +
        (c.statutory_violations.length > 0
          ? ` (Violations: ${c.statutory_violations.map((v) => v.statute_section).join(", ")})`
          : "")
    )
    .join("\n");

  const statutesSummary =
    statutes.length > 0
      ? statutes
          .map(
            (s) =>
              `${s.act_name} ${s.section_number} — ${s.section_title}:\n${s.full_text}`
          )
          .join("\n\n")
      : "No specific statutes retrieved for this question.";

  const decisionsSummary =
    decisions.length > 0
      ? decisions
          .map(
            (d) =>
              `Case ${d.case_number} — Principle: ${d.relevant_principle}\nSummary: ${d.ruling_summary}`
          )
          .join("\n\n")
      : "No LTB decisions retrieved for this question.";

  return `You are LeaseGuard's AI legal assistant. You help Ontario tenants understand their specific lease document using retrieved legal sources.

CRITICAL RULES — follow these exactly:
1. Only make legal claims that are directly supported by the RETRIEVED STATUTES or LTB DECISIONS below. If no retrieved source covers the question, say so clearly and recommend consulting a paralegal or the Landlord and Tenant Board.
2. Never use the word "illegal" — always say "potentially unenforceable under the RTA" or "void under the Residential Tenancies Act".
3. Always cite the specific statute section when making a legal claim (e.g., "Under RTA s.105..." or "As established in...").
4. Keep answers concise (3-5 sentences max). Use plain language that a non-lawyer can understand.
5. End every response with: "⚠ This is educational information, not legal advice. For your specific situation, consult a paralegal or contact the Landlord and Tenant Board at 1-888-332-3234."

LEASE CONTEXT:
Property: ${leaseContext.address}${leaseContext.city ? `, ${leaseContext.city}` : ""}
Overall Risk Score: ${leaseContext.riskScore.toFixed(1)}/10 (${leaseContext.riskLevel})
Clauses analyzed: ${leaseContext.clauseCount}

KEY CLAUSES FROM THIS LEASE:
${clausesSummary}

RETRIEVED STATUTES (cite these in your answer):
${statutesSummary}

RETRIEVED LTB DECISIONS (use as precedents if relevant):
${decisionsSummary}`;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params;

  // ── Validate lease ID ────────────────────────────────────────────────────
  if (!leaseId || !LEASE_ID_RE.test(leaseId)) {
    return Response.json(
      { error: "invalid_id", message: "Invalid lease ID format." },
      { status: 400 }
    );
  }

  // ── Rate limit: 10 questions/hour/IP ────────────────────────────────────
  // Gemini 2.0 Flash free tier: 1 500 RPD globally. 10/IP/hr keeps the global
  // daily budget safe for up to ~6 concurrent active users.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = checkRateLimit(ip, CHAT_RATE_LIMIT);
  if (!rl.allowed) {
    const { body, headers, status } = rateLimitExceededResponse(rl.resetAt);
    return Response.json(body, { status, headers });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let message: string;
  let history: ChatHistory[];
  try {
    const body = await req.json();
    message = typeof body.message === "string" ? body.message.trim() : "";
    history = Array.isArray(body.history) ? body.history : [];
  } catch {
    return Response.json(
      { error: "invalid_body", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (!message) {
    return Response.json(
      { error: "empty_message", message: "Message cannot be empty." },
      { status: 400 }
    );
  }

  if (message.length > 500) {
    return Response.json(
      { error: "message_too_long", message: "Message must be 500 characters or fewer." },
      { status: 400 }
    );
  }

  // ── Supabase client ──────────────────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── SSE stream ───────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event)));
        } catch {
          closed = true;
        }
      }

      function close() {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

      try {
        // ── 1. Fetch lease context ───────────────────────────────────────
        const [clausesResult, leaseResult, reportResult] = await Promise.all([
          supabase
            .from("clauses")
            .select(
              "id, clause_number, heading, risk_level, plain_english_explanation, statutory_violations, is_potentially_unenforceable"
            )
            .eq("lease_id", leaseId)
            .order("clause_number"),
          supabase
            .from("leases")
            .select("property_address, property_city, jurisdiction")
            .eq("id", leaseId)
            .single(),
          supabase
            .from("reports")
            .select("overall_risk_score, overall_risk_level")
            .eq("lease_id", leaseId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single(),
        ]);

        const rawClauses = (clausesResult.data ?? []) as Array<Record<string, unknown>>;
        const leaseRow = leaseResult.data as Record<string, unknown> | null;
        const reportRow = reportResult.data as Record<string, unknown> | null;

        const leaseContext = {
          address: (leaseRow?.property_address as string) ?? "Rental Unit",
          city: (leaseRow?.property_city as string) ?? (leaseRow?.jurisdiction as string) ?? "",
          riskScore: (reportRow?.overall_risk_score as number) ?? 0,
          riskLevel: (reportRow?.overall_risk_level as string) ?? "unknown",
          clauseCount: rawClauses.length,
          clauses: rawClauses
            .filter((c) => !String(c.clause_number ?? "").startsWith("synthetic"))
            .map((c) => ({
              number: String(c.clause_number ?? ""),
              heading: (c.heading as string) ?? "",
              risk_level: (c.risk_level as string) ?? "low",
              plain_english_explanation: (c.plain_english_explanation as string) ?? "",
              statutory_violations:
                (c.statutory_violations as Array<{ statute_section: string }>) ?? [],
              is_potentially_unenforceable: (c.is_potentially_unenforceable as boolean) ?? false,
            })),
        };

        // ── 2. Embed user question ───────────────────────────────────────
        let embedding: number[] | null = null;
        let statutes: StatuteSource[] = [];
        let decisions: DecisionSource[] = [];

        try {
          embedding = await embedQuery(message);

          // ── 3. Parallel RAG retrieval ──────────────────────────────────
          [statutes, decisions] = await Promise.all([
            retrieveStatutes(embedding, message, supabase),
            retrieveDecisions(embedding, supabase),
          ]);
        } catch (embedErr) {
          console.error("[chat] embed/retrieval error:", embedErr);
          // Proceed with empty sources — Gemini will answer based on lease context only
        }

        // ── 4. Build system prompt ───────────────────────────────────────
        const systemPrompt = buildSystemPrompt(leaseContext, statutes, decisions);

        // ── 5. Stream Gemini 2.0 Flash response ─────────────────────────
        await streamGeminiChat(systemPrompt, history, message, (text) => {
          send({ type: "token", text });
        });

        // ── 6. Send sources after full response ──────────────────────────
        const sourcePayload = [
          ...statutes.map((s) => ({
            type: "statute" as const,
            act_name: s.act_name,
            section_number: s.section_number,
            section_title: s.section_title,
            url: s.url,
          })),
          ...decisions.map((d) => ({
            type: "decision" as const,
            case_number: d.case_number,
            relevant_principle: d.relevant_principle,
            url: d.url,
          })),
        ];

        send({ type: "sources", sources: sourcePayload });
        send({ type: "done" });
      } catch (err) {
        console.error("[chat] stream error:", err);

        // Map structured error codes → friendly, actionable user messages.
        const code = (err as { code?: string }).code ?? "unknown";
        const FRIENDLY_ERRORS: Record<string, string> = {
          rate_limit_exceeded:
            "You've reached the hourly chat limit. Please wait a few minutes, then try again.",
          auth_error:
            "The AI assistant isn't configured correctly right now. Please try again later.",
          service_unavailable:
            "The AI assistant is temporarily unavailable. Please try again in a moment.",
          generate_failed:
            "The AI assistant couldn't generate a response. Please try again.",
          unknown:
            "Something went wrong. Please try again.",
        };
        send({
          type: "error",
          code,
          message: FRIENDLY_ERRORS[code] ?? FRIENDLY_ERRORS.unknown,
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
