import { NextResponse } from "next/server";
import { getGoogleSheetsHealth } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getGoogleSheetsHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 500 });
}
