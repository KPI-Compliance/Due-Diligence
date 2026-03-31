import { NextResponse } from "next/server";
import { autoRepairTypeformResponseIntegrity } from "@/lib/typeform-response-integrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const querySecret = new URL(request.url).searchParams.get("secret")?.trim() ?? "";

  return bearer === secret || querySecret === secret;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runRepair(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parsePositiveInt(searchParams.get("limit"), 200);
  const entityKindRaw = (searchParams.get("entity_kind") ?? "ALL").toUpperCase();
  const entityKind =
    entityKindRaw === "VENDOR" || entityKindRaw === "PARTNER" || entityKindRaw === "ALL"
      ? entityKindRaw
      : "ALL";

  const result = await autoRepairTypeformResponseIntegrity({
    limit,
    entityKind,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return runRepair(request);
}

export async function POST(request: Request) {
  return runRepair(request);
}
