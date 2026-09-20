import { NextRequest, NextResponse } from "next/server";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import { checkRepairIssue, isRepairIssueType } from "@/lib/maintenance-repairs-checker";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  const rl = await checkDbRateLimit(getClientIp(req), {
    storeKey: "maintenance-repairs-check",
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
    issueType,
    reportedDate: rawReportedDate,
    reportedInWriting,
    asOfDate: rawAsOfDate,
    measuredTempC,
  } = (body ?? {}) as Record<string, unknown>;

  if (!isRepairIssueType(issueType)) {
    return NextResponse.json(
      { error: "invalid_issue_type", message: "'issueType' must be one of the supported repair issues." },
      { status: 400 }
    );
  }

  const asOfDate = parseDate(rawAsOfDate);
  if (!asOfDate) {
    return NextResponse.json(
      { error: "invalid_dates", message: "'asOfDate' must be a valid date." },
      { status: 400 }
    );
  }

  let reportedDate: Date | null = null;
  if (rawReportedDate !== null && rawReportedDate !== undefined && rawReportedDate !== "") {
    reportedDate = parseDate(rawReportedDate);
    if (!reportedDate) {
      return NextResponse.json(
        { error: "invalid_dates", message: "'reportedDate' must be a valid date or null." },
        { status: 400 }
      );
    }
    if (reportedDate.getTime() > asOfDate.getTime()) {
      return NextResponse.json(
        { error: "invalid_date_order", message: "'reportedDate' must be on or before 'asOfDate'." },
        { status: 400 }
      );
    }
  }

  if (measuredTempC !== undefined && measuredTempC !== null) {
    if (typeof measuredTempC !== "number" || !Number.isFinite(measuredTempC) || measuredTempC < -50 || measuredTempC > 60) {
      return NextResponse.json(
        { error: "invalid_temperature", message: "'measuredTempC' must be a number between -50 and 60." },
        { status: 400 }
      );
    }
  }

  const result = checkRepairIssue({
    issueType,
    reportedDate,
    reportedInWriting: reportedInWriting === true,
    asOfDate,
    measuredTempC: typeof measuredTempC === "number" ? measuredTempC : null,
  });
  return NextResponse.json(result);
}
