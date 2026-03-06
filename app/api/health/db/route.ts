import { NextResponse } from "next/server";
import { dbHealthCheck } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
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
