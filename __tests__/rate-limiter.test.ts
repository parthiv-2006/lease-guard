import { checkRateLimit } from "../lib/rate-limiter";

describe("checkRateLimit", () => {
  it("allows the first request from a new IP", () => {
    const result = checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks counts per IP independently", () => {
    checkRateLimit("10.0.0.1");
    checkRateLimit("10.0.0.1");
    const r1 = checkRateLimit("10.0.0.1");
    const r2 = checkRateLimit("10.0.0.2");
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(4);
  });

  it("blocks after 5 requests within the hour", () => {
    const ip = "5.5.5.5";
    for (let i = 0; i < 5; i++) checkRateLimit(ip);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns a future resetAt timestamp", () => {
    const before = Date.now();
    const result = checkRateLimit("6.6.6.6");
    expect(result.resetAt).toBeGreaterThan(before);
  });

  it("allows exactly 5 requests before blocking", () => {
    const ip = "7.7.7.7";
    const results = Array.from({ length: 5 }, () => checkRateLimit(ip));
    expect(results.every((r) => r.allowed)).toBe(true);
    const blocked = checkRateLimit(ip);
    expect(blocked.allowed).toBe(false);
  });
});
