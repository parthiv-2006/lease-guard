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
 *   2. Auth check (identifies user for rate limiting)
 *   3. DB-backed rate limit (daily · hourly · per-lease — see lib/chat-rate-limit.ts)
 *   4. Fetch lease context from Supabase
 *   5. Embed user question via Gemini REST (RETRIEVAL_QUERY, 768-dim)
 *   6. Parallel hybrid search: statutes + tribunal decisions
 *   7. Build grounded system prompt
 *   8. Stream Gemini response
 *   9. Record request in chat_requests (for future rate limit counts)
 *
 * CRITICAL: Do NOT import from mcp-server/src/lib/embeddings.ts — that module
 * uses ESM imports for the MCP server environment. Gemini embed is duplicated
 * inline here using the same REST approach (Gotcha #1 from HANDOFF.md).
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkDbChatRateLimit } from "@/lib/chat-rate-limit";
import {
  detectPromptInjection,
  sanitizeChatMessage,
  CHAT_SCOPE_GUARD,
} from "@/lib/ai-safety";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Constants ─────────────────────────────────────────────────────────────────

const LEASE_ID_RE = /^[0-9a-f-]{36}$/;
const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GROQ_GENERATE_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const JURISDICTION = "CA-ON";

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
    if (resp.status === 429) {
      throw Object.assign(new Error("rate_limit_exceeded"), { code: "rate_limit_exceeded" });
    }
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

// ── Groq Chat Streaming (OpenAI-compatible REST) ──────────────────────────────

/**
 * Calls llama-3.3-70b-versatile via Groq's OpenAI-compatible streaming endpoint.
 * Free tier: 14,400 RPD / 30 RPM — far exceeds Gemini's 1,500 RPD / 15 RPM.
 * Groq uses standard OpenAI roles ("user" / "assistant") — no conversion needed.
 */
async function streamGroqChat(
  systemPrompt: string,
  history: ChatHistory[],
  userMessage: string,
  onToken: (text: string) => void
): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];

  const resp = await fetch(GROQ_GENERATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      stream: true,
      max_tokens: 600,
      temperature: 0.4,
    }),
  });

  if (!resp.ok) {
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
    console.error(`[chat] Groq generate error ${resp.status}:`, body);
    throw Object.assign(new Error("generate_failed"), { code: "generate_failed" });
  }

  if (!resp.body) throw new Error("Groq returned no response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Parse OpenAI-compatible SSE stream: data: {"choices":[{"delta":{"content":"..."}}]}
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const text = parsed?.choices?.[0]?.delta?.content;
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

  return `${CHAT_SCOPE_GUARD}You are LeaseGuard's AI legal assistant. You help Ontario tenants understand their specific lease document using retrieved legal sources.

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

// ── Friendly error messages ───────────────────────────────────────────────────

const RATE_LIMIT_MESSAGES: Record<string, string> = {
  daily_user_limit:
    "You've used all 50 chat messages for today. Your limit resets in 24 hours.",
  hourly_user_limit:
    "You're sending messages too quickly. Please wait a few minutes before asking another question.",
  daily_ip_limit:
    "You've reached today's chat limit. Sign in for a higher limit, or try again tomorrow.",
  hourly_ip_limit:
    "You're sending messages too quickly. Please wait before asking another question.",
  per_lease_limit:
    "You've reached the limit of 30 questions for this lease today. Try again tomorrow or ask about a different lease.",
};

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

  // ── Extract IP ───────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // ── Auth check (identifies user for rate limiting) ───────────────────────
  let userId: string | null = null;
  try {
    const authClient = await createSupabaseServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Auth failure is non-fatal — treat as guest
    userId = null;
  }

  // ── Service-role Supabase client (DB queries + rate limit) ───────────────
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── DB-backed rate limit ─────────────────────────────────────────────────
  // Three checks in parallel: daily user/IP, hourly user/IP, per-lease daily.
  // Persists across Vercel cold starts — counts actual rows in chat_requests.
  const rl = await checkDbChatRateLimit(userId, ip, leaseId, supabase);
  if (!rl.allowed) {
    const retryAfterSecs = Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000);
    return Response.json(
      {
        error:     "rate_limit_exceeded",
        reason:    rl.reason,
        message:   RATE_LIMIT_MESSAGES[rl.reason ?? ""] ?? "Too many requests. Please try again later.",
        limit:     rl.limit,
        reset_at:  rl.resetAt.toISOString(),
        remaining: 0,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSecs) },
      }
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let message: string;
  let history: ChatHistory[];
  try {
    const body = await req.json();
    message = typeof body.message === "string" ? body.message.trim() : "";
    // Validate history: only keep entries with the correct shape, cap content
    // at 2000 chars per entry, strip user messages that trigger the injection
    // detector, and keep only the last 6 entries.
    history = (Array.isArray(body.history) ? body.history : [])
      .filter(
        (e: unknown): e is ChatHistory =>
          e !== null &&
          typeof e === "object" &&
          ((e as ChatHistory).role === "user" || (e as ChatHistory).role === "assistant") &&
          typeof (e as ChatHistory).content === "string" &&
          (e as ChatHistory).content.length > 0
      )
      .map((e: ChatHistory): ChatHistory => ({
        role: e.role,
        content: e.content.slice(0, 2000),
      }))
      .filter((e: ChatHistory) => {
        if (e.role !== "user") return true;
        return !detectPromptInjection(e.content).blocked;
      })
      .slice(-6);
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

  // ── Prompt injection / jailbreak check ──────────────────────────────────
  const injectionCheck = detectPromptInjection(message);
  if (injectionCheck.blocked) {
    return Response.json(
      { error: "invalid_message", message: injectionCheck.reason },
      { status: 400 }
    );
  }

  // ── Sanitize message before embedding in prompts or vector queries ───────
  message = sanitizeChatMessage(message);

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
        // ── Record request before Gemini calls ──────────────────────────
        // Fire-and-forget: logs the usage slot so future rate limit checks
        // count this request. Failure is non-fatal — worst case the user
        // gets one undercounted message.
        supabase
          .from("chat_requests")
          .insert({ user_id: userId, ip, lease_id: leaseId })
          .then(({ error }: { error: unknown }) => {
            if (error) console.error("[chat] failed to record chat_request:", error);
          });

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
          // Re-throw rate limit errors — no point making the generate call if quota is exhausted
          if ((embedErr as { code?: string }).code === "rate_limit_exceeded") throw embedErr;
          console.error("[chat] embed/retrieval error:", embedErr);
          // Other embed/retrieval failures: proceed with empty sources
        }

        // ── 4. Build system prompt ───────────────────────────────────────
        const systemPrompt = buildSystemPrompt(leaseContext, statutes, decisions);

        // ── 5. Stream Groq (Llama 3.3 70B) response ─────────────────────
        await streamGroqChat(systemPrompt, history, message, (text) => {
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
