import { NextRequest, NextResponse } from "next/server";
import { clearAuthenticatedSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  await clearAuthenticatedSession();
  return NextResponse.redirect(new URL("/", request.url));
}
