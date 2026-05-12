import { NextRequest, NextResponse } from "next/server";
import { clearAuthenticatedSession, getAuthenticatedSession } from "@/lib/auth";
import { writeAuditLog, getClientIp, getClientUserAgent } from "@/lib/audit";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedSession();
  await clearAuthenticatedSession();
  await writeAuditLog({
    event_type: "LOGOUT",
    actor_email: session?.email ?? null,
    actor_ip: getClientIp(request),
    actor_ua: getClientUserAgent(request),
    result: "success",
  });
  return NextResponse.redirect(new URL("/", request.url));
}
