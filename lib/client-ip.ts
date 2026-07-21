/**
 * lib/client-ip.ts — Trusted client-IP extraction for rate limiting.
 *
 * Security note: the leftmost value of `X-Forwarded-For` is fully
 * client-controllable — a caller can send `X-Forwarded-For: 1.2.3.4` and the
 * platform proxy appends the real connecting IP after it. Keying rate limits on
 * that leftmost value lets an attacker (a) evade their own limit by rotating a
 * spoofed prefix, and (b) exhaust a victim IP's quota by spoofing it.
 *
 * Platforms set a dedicated, non-spoofable single-value header with the real
 * client IP that the edge determines from the TCP connection:
 *   • Vercel  → `x-real-ip`
 *   • Fly.io  → `fly-client-ip`
 * We prefer those. Only when neither is present (e.g. local dev, an unknown
 * proxy) do we fall back to the leftmost `X-Forwarded-For` entry.
 */

import type { NextRequest } from "next/server";

export function getClientIp(req: NextRequest): string {
  // Platform-set, edge-derived client IP headers take priority — these reflect
  // the real TCP peer and cannot be overridden by the client.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const flyClientIp = req.headers.get("fly-client-ip")?.trim();
  if (flyClientIp) return flyClientIp;

  // Fallback: leftmost X-Forwarded-For entry (spoofable — used only when no
  // trusted header is available, e.g. local development).
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  return "unknown";
}
