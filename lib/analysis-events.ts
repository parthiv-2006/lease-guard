/**
 * lib/analysis-events.ts — In-process event bus for streaming analysis progress.
 *
 * The agent emits events here; the SSE route subscribes and forwards them to
 * the browser. Both live in the same Next.js Node.js process, so a module-level
 * EventEmitter singleton is the simplest and most responsive approach.
 *
 * Includes a replay buffer so clients that connect mid-analysis receive all
 * previously emitted events immediately on subscribe.
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

// Module-level singleton — same instance for all imports in the process.
const bus = new EventEmitter();
bus.setMaxListeners(500);

// Replay buffers — keyed by leaseId. Allows late SSE connects to catch up.
const replayBuffers = new Map<string, AnalysisEvent[]>();

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
