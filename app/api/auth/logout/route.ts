import { NextRequest, NextResponse } from "next/server";
import { clearAuthenticatedSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export async function POST(request: NextRequest) {
  await clearAuthenticatedSession();
  return NextResponse.redirect(new URL("/", request.url));
}
