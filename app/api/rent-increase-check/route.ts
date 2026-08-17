import { NextRequest, NextResponse } from "next/server";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { checkRentIncrease } from "@/lib/rent-increase-checker";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  const rl = await checkDbRateLimit(getClientIp(req), {
    storeKey: "rent-increase-check",
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
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body." },
      { status: 400 }
    );
  }

  const {
    currentRent,
    proposedRent,
    noticeGivenDate: rawNoticeGivenDate,
    effectiveDate: rawEffectiveDate,
    lastIncreaseDate: rawLastIncreaseDate,
    isNewBuildingExempt,
    hasAgiApproval,
  } = body as Record<string, unknown>;

  if (!isFiniteNumber(currentRent) || currentRent <= 0 || currentRent > 1_000_000) {
    return NextResponse.json(
      { error: "invalid_current_rent", message: "'currentRent' must be a positive number." },
      { status: 400 }
    );
  }
  if (!isFiniteNumber(proposedRent) || proposedRent <= 0 || proposedRent > 1_000_000) {
    return NextResponse.json(
      { error: "invalid_proposed_rent", message: "'proposedRent' must be a positive number." },
      { status: 400 }
    );
  }

  const noticeGivenDate = parseDate(rawNoticeGivenDate);
  const effectiveDate = parseDate(rawEffectiveDate);
  const lastIncreaseDate = parseDate(rawLastIncreaseDate);
  if (!noticeGivenDate || !effectiveDate || !lastIncreaseDate) {
    return NextResponse.json(
      {
        error: "invalid_dates",
        message: "'noticeGivenDate', 'effectiveDate', and 'lastIncreaseDate' must all be valid dates.",
      },
      { status: 400 }
    );
  }
  if (effectiveDate.getTime() <= lastIncreaseDate.getTime()) {
    return NextResponse.json(
      {
        error: "invalid_date_order",
        message: "'effectiveDate' must be after 'lastIncreaseDate'.",
      },
      { status: 400 }
    );
  }

  if (typeof isNewBuildingExempt !== "boolean" || typeof hasAgiApproval !== "boolean") {
    return NextResponse.json(
      {
        error: "invalid_flags",
        message: "'isNewBuildingExempt' and 'hasAgiApproval' must be booleans.",
      },
      { status: 400 }
    );
  }

  const result = checkRentIncrease({
    currentRent,
    proposedRent,
    noticeGivenDate,
    effectiveDate,
    lastIncreaseDate,
    isNewBuildingExempt,
    hasAgiApproval,
  });

  return NextResponse.json(result);
}
