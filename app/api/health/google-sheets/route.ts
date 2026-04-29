import { NextResponse } from "next/server";
import { getGoogleSheetsHealth } from "@/lib/google-sheets";
import { isHealthDiagnosticRequestAuthorized } from "@/lib/internal-tool-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isHealthDiagnosticRequestAuthorized(request))) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const health = await getGoogleSheetsHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 500 });
}
