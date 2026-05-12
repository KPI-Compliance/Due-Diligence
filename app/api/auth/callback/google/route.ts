import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuthSettings, isAllowedGoogleIdentity, setAuthenticatedSession, validateOauthState } from "@/lib/auth";
import { writeAuditLog, getClientIp, getClientUserAgent } from "@/lib/audit";

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

  const actor_ip = getClientIp(request);
  const actor_ua = getClientUserAgent(request);

  if (oauthError) {
    await writeAuditLog({ event_type: "LOGIN_FAILURE", actor_ip, actor_ua, result: "failure", failure_reason: "google_access_denied" });
    return buildErrorRedirect(request, "google_access_denied");
  }

  if (!code) {
    await writeAuditLog({ event_type: "LOGIN_FAILURE", actor_ip, actor_ua, result: "failure", failure_reason: "google_missing_code" });
    return buildErrorRedirect(request, "google_missing_code");
  }

  const isValidState = await validateOauthState(state);

  if (!isValidState) {
    await writeAuditLog({ event_type: "LOGIN_FAILURE", actor_ip, actor_ua, result: "failure", failure_reason: "google_invalid_state" });
    return buildErrorRedirect(request, "google_invalid_state");
  }

  try {
    const { clientId, clientSecret, tokenUri, redirectUri } = getGoogleOAuthSettings(url.origin);

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
      await writeAuditLog({ event_type: "LOGIN_FAILURE", actor_ip, actor_ua, result: "failure", failure_reason: "google_token_exchange_failed" });
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
      await writeAuditLog({ event_type: "LOGIN_FAILURE", actor_ip, actor_ua, result: "failure", failure_reason: "google_userinfo_failed" });
      return buildErrorRedirect(request, "google_userinfo_failed");
    }

    if (!isAllowedGoogleIdentity(userInfo.email)) {
      await writeAuditLog({ event_type: "LOGIN_FAILURE", actor_email: userInfo.email, actor_ip, actor_ua, result: "failure", failure_reason: "google_unauthorized_account" });
      return buildErrorRedirect(request, "google_unauthorized_account");
    }

    await setAuthenticatedSession({
      email: userInfo.email,
      name: userInfo.name ?? userInfo.email,
      picture: userInfo.picture,
    });

    await writeAuditLog({ event_type: "LOGIN_SUCCESS", actor_email: userInfo.email, actor_ip, actor_ua, result: "success" });
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch {
    await writeAuditLog({ event_type: "LOGIN_FAILURE", actor_ip, actor_ua, result: "failure", failure_reason: "google_sso_error" });
    return buildErrorRedirect(request, "google_sso_failed");
  }
}
