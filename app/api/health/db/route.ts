import { NextResponse } from "next/server";
import { dbHealthCheck } from "@/lib/db";
import { isHealthDiagnosticRequestAuthorized } from "@/lib/internal-tool-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isHealthDiagnosticRequestAuthorized(request))) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const ok = await dbHealthCheck();

    if (!ok) {
      return NextResponse.json({ ok: false, message: "Database responded with an unexpected result." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Neon database connection successful." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
