import { NextRequest, NextResponse } from "next/server";
import { isDevAuthBypassEnabled, setAuthenticatedSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!isDevAuthBypassEnabled()) {
    return NextResponse.redirect(new URL("/?error=dev_login_disabled", request.url));
  }

  await setAuthenticatedSession({
    email: "dev.local@vtex.com",
    name: "VTEX Dev Local",
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
