import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuthSettings, setAuthenticatedSession, validateOauthState } from "@/lib/auth";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
  picture?: string;
};

function buildErrorRedirect(request: NextRequest, code: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return buildErrorRedirect(request, "google_access_denied");
  }

  if (!code) {
    return buildErrorRedirect(request, "google_missing_code");
  }

  const isValidState = await validateOauthState(state);

  if (!isValidState) {
    return buildErrorRedirect(request, "google_invalid_state");
  }

  try {
    const { clientId, clientSecret, tokenUri, redirectUri } = getGoogleOAuthSettings();

    const tokenResponse = await fetch(tokenUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok || !tokenData.access_token) {
      return buildErrorRedirect(request, "google_token_exchange_failed");
    }

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: "no-store",
    });

    const userInfo = (await userResponse.json()) as GoogleUserInfo;

    if (!userResponse.ok || !userInfo.email) {
      return buildErrorRedirect(request, "google_userinfo_failed");
    }

    await setAuthenticatedSession({
      email: userInfo.email,
      name: userInfo.name ?? userInfo.email,
      picture: userInfo.picture,
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch {
    return buildErrorRedirect(request, "google_sso_failed");
  }
}
