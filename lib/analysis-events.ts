/**
 * lib/analysis-events.ts — In-process event bus for streaming analysis progress.
 *
 * The agent emits events here; the SSE route subscribes and forwards them to
 * the browser. Both live in the same Next.js Node.js process, so a module-level
 * EventEmitter singleton is the simplest and most responsive approach.
 *
 * Includes a replay buffer so clients that connect mid-analysis receive all
 * previously emitted events immediately on subscribe.
 *
 * IMPORTANT — globalThis pinning:
 * Next.js (Turbopack / Webpack) compiles each API route into its own module
 * graph, meaning a bare `const bus = new EventEmitter()` produces separate
 * instances for upload/route.ts → agent.ts and stream/[id]/route.ts. Events
 * emitted on one instance are invisible to the other. Pinning to globalThis
 * guarantees a single shared instance across all module graphs within the same
 * Node.js process, and also survives HMR hot-reloads in development.
 */

import { EventEmitter } from "events";

export interface AnalysisEvent {
  type: "log" | "complete" | "error";
  message: string;
  /** Present on log events that also advance the step timeline (0–4). */
  step?: number;
  severity?: "info" | "success" | "warning" | "critical";
  timestamp: number; // Unix ms
}

// ── GlobalThis singleton ──────────────────────────────────────────────────────
// Typed augmentation so TypeScript doesn't complain about unknown properties.
declare global {
  // eslint-disable-next-line no-var
  var __leaseAnalysisBus: EventEmitter | undefined;
  // eslint-disable-next-line no-var
  var __leaseReplayBuffers: Map<string, AnalysisEvent[]> | undefined;
}

if (!globalThis.__leaseAnalysisBus) {
  globalThis.__leaseAnalysisBus = new EventEmitter();
  globalThis.__leaseAnalysisBus.setMaxListeners(500);
}
if (!globalThis.__leaseReplayBuffers) {
  globalThis.__leaseReplayBuffers = new Map<string, AnalysisEvent[]>();
}

const bus = globalThis.__leaseAnalysisBus;
const replayBuffers = globalThis.__leaseReplayBuffers;

// ── Public API ────────────────────────────────────────────────────────────────

export function emitAnalysisEvent(
  leaseId: string,
  event: Omit<AnalysisEvent, "timestamp">
): void {
  const full: AnalysisEvent = { ...event, timestamp: Date.now() };

  if (!replayBuffers.has(leaseId)) {
    replayBuffers.set(leaseId, []);
  }
  replayBuffers.get(leaseId)!.push(full);

  bus.emit(`a:${leaseId}`, full);

  // Clean up 10 min after the terminal event so we don't leak memory.
  if (full.type === "complete" || full.type === "error") {
    setTimeout(() => {
      replayBuffers.delete(leaseId);
      bus.removeAllListeners(`a:${leaseId}`);
    }, 10 * 60 * 1000);
  }
}

/**
 * Subscribe to analysis events for a lease.
 * Replays all buffered events synchronously before subscribing for live ones.
 * Returns an unsubscribe function.
 */
export function subscribeToAnalysis(
  leaseId: string,
  handler: (event: AnalysisEvent) => void
): () => void {
  const key = `a:${leaseId}`;

  // Replay any events emitted before this subscription.
  const buf = replayBuffers.get(leaseId) ?? [];
  for (const ev of buf) {
    handler(ev);
  }

  bus.on(key, handler);
  return () => bus.off(key, handler);
}

/** True if there are buffered events for a lease (used by SSE route). */
export function hasBufferedEvents(leaseId: string): boolean {
  return (replayBuffers.get(leaseId)?.length ?? 0) > 0;
}
