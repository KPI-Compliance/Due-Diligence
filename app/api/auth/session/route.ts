import { NextResponse } from "next/server";
import {
  clearAuthenticatedSession,
  getAuthenticatedSessionResult,
  getSessionErrorCode,
  refreshAuthenticatedSession,
} from "@/lib/auth";

export async function GET() {
  const result = await getAuthenticatedSessionResult();

  if (!result.session) {
    await clearAuthenticatedSession();
    return NextResponse.json(
      { ok: false, reason: result.reason, error: getSessionErrorCode(result.reason) },
      { status: 401 },
    );
  }

  await refreshAuthenticatedSession(result.session);
  return NextResponse.json({
    ok: true,
    session: {
      email: result.session.email,
      name: result.session.name,
    },
  });
}
