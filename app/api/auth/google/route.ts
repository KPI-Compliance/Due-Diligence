import { NextRequest, NextResponse } from "next/server";
import { createOauthState, getGoogleOAuthSettings } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { clientId, authUri, redirectUri } = getGoogleOAuthSettings(request.nextUrl.origin);
  const state = await createOauthState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  return NextResponse.redirect(`${authUri}?${params.toString()}`);
}
