/**
 * app/api/stream/[id]/route.ts — Server-Sent Events endpoint for live analysis progress.
 *
 * The browser opens an EventSource to this route immediately after upload.
 * Events are forwarded from the in-process event bus (lib/analysis-events.ts).
 * If the client connects after analysis is already complete, the replay buffer
 * in the event bus catches them up instantly.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { subscribeToAnalysis, hasBufferedEvents } from "@/lib/analysis-events";
import type { AnalysisEvent } from "@/lib/analysis-events";
import { checkRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 30 connections/hour per IP (SSE connections are long-lived)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = checkRateLimit(ip, { storeKey: "stream", maxRequests: 30 });
  if (!rl.allowed) {
    return new Response("Too many requests. Please try again later.", { status: 429 });
  }

  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return new Response("Invalid lease ID", { status: 400 });
  }

  // Check current DB status for the case where analysis completed before any
  // events were buffered (e.g. very fast failure, or server restart mid-run).
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await supabase
    .from("leases")
    .select("status, overall_risk_score, overall_risk_level, error_message")
    .eq("id", id)
    .single();

  const encoder = new TextEncoder();
  let closed = false;

  function encode(event: AnalysisEvent | object): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  }

  const stream = new ReadableStream({
    start(controller) {
      function send(event: AnalysisEvent | object): void {
        if (closed) return;
        try {
          controller.enqueue(encode(event));
        } catch {
          closed = true;
        }
      }

      function close(): void {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

      // Subscribe (replays buffered events synchronously, then live)
      const unsub = subscribeToAnalysis(id, (event) => {
        send(event);
        if (event.type === "complete" || event.type === "error") {
          unsub();
          close();
        }
      });

      // If stream is already closed from replay (terminal event was in buffer), done.
      if (closed) return;

      // If no buffered events AND DB shows terminal state, synthesize a terminal event.
      if (!hasBufferedEvents(id)) {
        if (data?.status === "complete") {
          send({
            type: "complete",
            message: `Analysis complete — risk score: ${data.overall_risk_score?.toFixed(1)} (${data.overall_risk_level})`,
            severity: "success",
            timestamp: Date.now(),
          } satisfies AnalysisEvent);
          unsub();
          close();
          return;
        }
        if (data?.status === "failed") {
          const raw = data.error_message as string | null;
          send({
            type: "error",
            message: raw ?? "Analysis failed.",
            severity: "critical",
            timestamp: Date.now(),
          } satisfies AnalysisEvent);
          unsub();
          close();
          return;
        }
      }

      // Heartbeat to keep the connection alive through proxies / load balancers.
      const hbInterval = setInterval(() => {
        if (closed) {
          clearInterval(hbInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(hbInterval);
        }
      }, 20_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(hbInterval);
        unsub();
        close();
      });
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
