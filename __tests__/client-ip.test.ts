import { getClientIp } from "../lib/client-ip";
import type { NextRequest } from "next/server";

// Build a minimal NextRequest-like object exposing only the `headers.get` API
// that getClientIp relies on.
function reqWith(headers: Record<string, string>): NextRequest {
  const map = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    headers: { get: (k: string) => map.get(k.toLowerCase()) ?? null },
  } as unknown as NextRequest;
}

describe("getClientIp", () => {
  it("prefers the platform-set x-real-ip over a spoofable x-forwarded-for", () => {
    // Attacker prepends a spoofed IP to X-Forwarded-For; the real client IP is
    // what the edge placed in x-real-ip. We must key on the trusted header.
    const req = reqWith({
      "x-forwarded-for": "6.6.6.6, 203.0.113.9",
      "x-real-ip": "203.0.113.9",
    });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("prevents a client from poisoning another IP's bucket via x-forwarded-for", () => {
    const victimSpoof = reqWith({
      "x-forwarded-for": "203.0.113.50", // victim's IP, attacker-supplied
      "x-real-ip": "198.51.100.7", // attacker's real IP
    });
    expect(getClientIp(victimSpoof)).toBe("198.51.100.7");
  });

  it("falls back to fly-client-ip when x-real-ip is absent", () => {
    const req = reqWith({
      "x-forwarded-for": "6.6.6.6, 203.0.113.9",
      "fly-client-ip": "203.0.113.9",
    });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to the leftmost x-forwarded-for when no trusted header exists", () => {
    const req = reqWith({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    expect(getClientIp(reqWith({}))).toBe("unknown");
  });
});
