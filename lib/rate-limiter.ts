/**
 * In-memory sliding-window rate limiter.
 *
 * Each route that needs rate-limiting calls `checkRateLimit(ip, config)`.
 * The store is keyed by `${ip}::${storeKey}` so each route has its own bucket.
 *
 * Config options:
 *   maxRequests  — maximum calls allowed per window (default 5)
 *   windowMs     — window duration in milliseconds (default 1 hour)
 *   storeKey     — unique namespace for this route's bucket (default "upload")
 */

interface RateLimitConfig {
  maxRequests?: number;
  windowMs?: number;
  storeKey?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const store = new Map<string, { count: number; resetAt: number }>();

const HOUR_MS = 60 * 60 * 1000;

export function checkRateLimit(
  ip: string,
  config: RateLimitConfig = {}
): RateLimitResult {
  const {
    maxRequests = 5,
    windowMs = HOUR_MS,
    storeKey = "upload",
  } = config;

  const key = `${ip}::${storeKey}`;
  const now = Date.now();
  const record = store.get(key);

  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

/**
 * Returns a 429 response body and headers ready to return from a route handler.
 * Import and use when `checkRateLimit` returns `allowed: false`.
 */
export function rateLimitExceededResponse(resetAt: number): {
  body: { error: string; message: string; reset_at: string };
  headers: Record<string, string>;
  status: 429;
} {
  return {
    body: {
      error: "rate_limit_exceeded",
      message: "Too many requests. Please try again later.",
      reset_at: new Date(resetAt).toISOString(),
    },
    headers: {
      "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
    },
    status: 429,
  };
}
