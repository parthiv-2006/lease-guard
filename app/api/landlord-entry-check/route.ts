import { NextRequest, NextResponse } from "next/server";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { checkLandlordEntry, isEntryReason, toEntryDateTime } from "@/lib/landlord-entry-checker";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function parseDateTime(date: unknown, time: unknown): Date | null {
  if (typeof date !== "string" || typeof time !== "string") return null;
  return toEntryDateTime(date, time);
}

export async function POST(req: NextRequest) {
  const rl = await checkDbRateLimit(getClientIp(req), {
    storeKey: "landlord-entry-check",
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    const { body: rlBody, headers, status } = dbRateLimitExceededResponse(rl.resetAt);
    return NextResponse.json(rlBody, { status, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Expected JSON body." }, { status: 400 });
  }

  const {
    reason,
    entryDate,
    entryTime,
    writtenNotice,
    leaseRequiresCleaning,
    atLeaseSpecifiedCleaningTime,
    tenancyEnding,
    tenantInformedBeforehand,
  } = (body ?? {}) as Record<string, unknown>;

  if (!isEntryReason(reason)) {
    return NextResponse.json(
      { error: "invalid_reason", message: "'reason' must be one of the supported entry reasons." },
      { status: 400 }
    );
  }

  const entryAt = parseDateTime(entryDate, entryTime);
  if (!entryAt) {
    return NextResponse.json(
      { error: "invalid_datetime", message: "'entryDate' must be YYYY-MM-DD and 'entryTime' must be HH:MM." },
      { status: 400 }
    );
  }

  let notice: { givenAt: Date; statedReason: boolean; statedTime: boolean } | null = null;
  if (writtenNotice !== null && writtenNotice !== undefined) {
    if (typeof writtenNotice !== "object") {
      return NextResponse.json(
        { error: "invalid_notice", message: "'writtenNotice' must be an object or null." },
        { status: 400 }
      );
    }
    const n = writtenNotice as Record<string, unknown>;
    const givenAt = parseDateTime(n.date, n.time);
    if (!givenAt) {
      return NextResponse.json(
        { error: "invalid_datetime", message: "'writtenNotice.date' must be YYYY-MM-DD and 'writtenNotice.time' must be HH:MM." },
        { status: 400 }
      );
    }
    notice = { givenAt, statedReason: n.statedReason === true, statedTime: n.statedTime === true };
  }

  const result = checkLandlordEntry({
    reason,
    entryAt,
    writtenNotice: notice,
    leaseRequiresCleaning: leaseRequiresCleaning === true,
    atLeaseSpecifiedCleaningTime: atLeaseSpecifiedCleaningTime === true,
    tenancyEnding: tenancyEnding === true,
    tenantInformedBeforehand: tenantInformedBeforehand === true,
  });
  return NextResponse.json(result);
}
