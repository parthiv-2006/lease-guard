import { NextRequest, NextResponse } from "next/server";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { checkDepositInterest } from "@/lib/deposit-fees-checker";

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
    storeKey: "deposit-fees-check",
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

  const { depositAmount, monthlyRent, depositPaidDate: rawPaidDate, asOfDate: rawAsOfDate } = body as Record<
    string,
    unknown
  >;

  if (!isFiniteNumber(depositAmount) || depositAmount <= 0 || depositAmount > 1_000_000) {
    return NextResponse.json(
      { error: "invalid_deposit_amount", message: "'depositAmount' must be a positive number." },
      { status: 400 }
    );
  }
  if (!isFiniteNumber(monthlyRent) || monthlyRent <= 0 || monthlyRent > 1_000_000) {
    return NextResponse.json(
      { error: "invalid_monthly_rent", message: "'monthlyRent' must be a positive number." },
      { status: 400 }
    );
  }

  const depositPaidDate = parseDate(rawPaidDate);
  const asOfDate = parseDate(rawAsOfDate);
  if (!depositPaidDate || !asOfDate) {
    return NextResponse.json(
      { error: "invalid_dates", message: "'depositPaidDate' and 'asOfDate' must both be valid dates." },
      { status: 400 }
    );
  }
  if (asOfDate.getTime() < depositPaidDate.getTime()) {
    return NextResponse.json(
      { error: "invalid_date_order", message: "'asOfDate' must be on or after 'depositPaidDate'." },
      { status: 400 }
    );
  }

  const result = checkDepositInterest({ depositAmount, monthlyRent, depositPaidDate, asOfDate });
  return NextResponse.json(result);
}
