import { NextResponse } from "next/server";
import { isHealthDiagnosticRequestAuthorized } from "@/lib/internal-tool-auth";
import { getTypeformResponseIntegrityHealth } from "@/lib/typeform-response-integrity";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    if (!(await isHealthDiagnosticRequestAuthorized(request))) {
      return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parsePositiveInt(searchParams.get("limit"), 200);
    const entityKindRaw = (searchParams.get("entity_kind") ?? "ALL").toUpperCase();
    const entityKind =
      entityKindRaw === "VENDOR" || entityKindRaw === "PARTNER" || entityKindRaw === "ALL"
        ? entityKindRaw
        : "ALL";

    const health = await getTypeformResponseIntegrityHealth({
      limit,
      entityKind,
    });

    return NextResponse.json(health, { status: health.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Typeform response integrity error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
