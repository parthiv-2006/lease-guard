const uploadCounts = new Map<string, { count: number; resetAt: number }>();

const MAX_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = uploadCounts.get(ip);

  if (!record || now > record.resetAt) {
    const resetAt = now + WINDOW_MS;
    uploadCounts.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_PER_HOUR - 1, resetAt };
  }

  if (record.count >= MAX_PER_HOUR) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: MAX_PER_HOUR - record.count,
    resetAt: record.resetAt,
  };
}
