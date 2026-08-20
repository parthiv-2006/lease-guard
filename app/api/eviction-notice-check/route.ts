import { NextRequest, NextResponse } from "next/server";
import { checkDbRateLimit, dbRateLimitExceededResponse } from "@/lib/rate-limiter-db";
import {
  checkEvictionNotice,
  type EvictionCheckInput,
  type NoticeType,
  type TenancyType,
  type N5Ground,
  type N13Ground,
  type N12ServedBy,
} from "@/lib/eviction-notice-checker";

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

const NOTICE_TYPES: NoticeType[] = ["N4", "N5", "N8", "N12", "N13"];
const TENANCY_TYPES: TenancyType[] = ["daily_weekly", "other"];
const N5_GROUNDS: N5Ground[] = ["damage_ordinary", "damage_wilful_severe", "interference", "overcrowding"];
const N13_GROUNDS: N13Ground[] = ["demolition", "conversion", "repairs"];
const N12_SERVED_BY: N12ServedBy[] = ["landlord", "purchaser"];

export async function POST(req: NextRequest) {
  const rl = await checkDbRateLimit(getClientIp(req), {
    storeKey: "eviction-notice-check",
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

  const b = body as Record<string, unknown>;
  const noticeType = b.noticeType as NoticeType;
  if (!NOTICE_TYPES.includes(noticeType)) {
    return NextResponse.json(
      { error: "invalid_notice_type", message: `'noticeType' must be one of ${NOTICE_TYPES.join(", ")}.` },
      { status: 400 }
    );
  }

  const noticeGivenDate = parseDate(b.noticeGivenDate);
  const terminationDate = parseDate(b.terminationDate);
  if (!noticeGivenDate || !terminationDate) {
    return NextResponse.json(
      { error: "invalid_dates", message: "'noticeGivenDate' and 'terminationDate' must both be valid dates." },
      { status: 400 }
    );
  }

  let input: EvictionCheckInput;

  switch (noticeType) {
    case "N4":
    case "N8": {
      const tenancyType = b.tenancyType as TenancyType;
      if (!TENANCY_TYPES.includes(tenancyType)) {
        return NextResponse.json(
          { error: "invalid_tenancy_type", message: `'tenancyType' must be one of ${TENANCY_TYPES.join(", ")}.` },
          { status: 400 }
        );
      }
      input = { noticeType, noticeGivenDate, terminationDate, tenancyType };
      break;
    }
    case "N5": {
      const ground = b.ground as N5Ground;
      if (!N5_GROUNDS.includes(ground)) {
        return NextResponse.json(
          { error: "invalid_ground", message: `'ground' must be one of ${N5_GROUNDS.join(", ")}.` },
          { status: 400 }
        );
      }
      input = { noticeType: "N5", noticeGivenDate, terminationDate, ground };
      break;
    }
    case "N12": {
      const servedBy = b.servedBy as N12ServedBy;
      if (!N12_SERVED_BY.includes(servedBy)) {
        return NextResponse.json(
          { error: "invalid_served_by", message: `'servedBy' must be one of ${N12_SERVED_BY.join(", ")}.` },
          { status: 400 }
        );
      }
      if (
        typeof b.landlordIsIndividual !== "boolean" ||
        typeof b.unitIndividuallyOwned !== "boolean" ||
        typeof b.compensationOffered !== "boolean"
      ) {
        return NextResponse.json(
          {
            error: "invalid_flags",
            message: "'landlordIsIndividual', 'unitIndividuallyOwned', and 'compensationOffered' must be booleans.",
          },
          { status: 400 }
        );
      }
      input = {
        noticeType: "N12",
        noticeGivenDate,
        terminationDate,
        servedBy,
        landlordIsIndividual: b.landlordIsIndividual,
        unitIndividuallyOwned: b.unitIndividuallyOwned,
        compensationOffered: b.compensationOffered,
      };
      break;
    }
    case "N13": {
      const ground = b.ground as N13Ground;
      if (!N13_GROUNDS.includes(ground)) {
        return NextResponse.json(
          { error: "invalid_ground", message: `'ground' must be one of ${N13_GROUNDS.join(", ")}.` },
          { status: 400 }
        );
      }
      const buildingUnitCount = b.buildingUnitCount;
      if (typeof buildingUnitCount !== "number" || !Number.isFinite(buildingUnitCount) || buildingUnitCount < 1) {
        return NextResponse.json(
          { error: "invalid_unit_count", message: "'buildingUnitCount' must be a positive number." },
          { status: 400 }
        );
      }
      if (typeof b.compensationOffered !== "boolean") {
        return NextResponse.json(
          { error: "invalid_flags", message: "'compensationOffered' must be a boolean." },
          { status: 400 }
        );
      }
      input = {
        noticeType: "N13",
        noticeGivenDate,
        terminationDate,
        ground,
        buildingUnitCount,
        compensationOffered: b.compensationOffered,
      };
      break;
    }
  }

  const result = checkEvictionNotice(input);
  return NextResponse.json(result);
}
