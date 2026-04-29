import { NextResponse } from "next/server";
import { isInternalToolRequestAuthorized } from "@/lib/internal-tool-auth";
import { autoRepairTypeformResponseIntegrity } from "@/lib/typeform-response-integrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runRepair(request: Request) {
  if (!isInternalToolRequestAuthorized(request)) {
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
