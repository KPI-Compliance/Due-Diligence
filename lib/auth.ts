import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

type GoogleOAuthFile = {
  web: {
    client_id: string;
    client_secret: string;
    auth_uri: string;
    token_uri: string;
    redirect_uris: string[];
  };
};

type SessionPayload = {
  email: string;
  name: string;
  picture?: string;
};

type GoogleOAuthConfig = {
  client_id: string;
  client_secret: string;
  auth_uri: string;
  token_uri: string;
  redirect_uris: string[];
};

const GOOGLE_OAUTH_FILE = "client_secret_1026620199601-b7sj26vpj8aap7h8pavjg5239hpslajc.apps.googleusercontent.com.json";
const SESSION_COOKIE = "dd_session";
const OAUTH_STATE_COOKIE = "dd_oauth_state";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;
const STATE_DURATION_SECONDS = 60 * 10;
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sanitizeEnvValue(value: string | undefined) {
  return value?.trim().replace(/^"(.*)"$/, "$1");
}

function splitEnvList(value: string | undefined) {
  return (sanitizeEnvValue(value) ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getGoogleOAuthConfig() {
  const clientId = sanitizeEnvValue(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = sanitizeEnvValue(process.env.GOOGLE_CLIENT_SECRET);
  const authUri = sanitizeEnvValue(process.env.GOOGLE_AUTH_URI) ?? "https://accounts.google.com/o/oauth2/v2/auth";
  const tokenUri = sanitizeEnvValue(process.env.GOOGLE_TOKEN_URI) ?? "https://oauth2.googleapis.com/token";
  const redirectUri = sanitizeEnvValue(process.env.GOOGLE_OAUTH_REDIRECT_URI);

  if (clientId && clientSecret) {
    return {
      client_id: clientId,
      client_secret: clientSecret,
      auth_uri: authUri,
      token_uri: tokenUri,
      redirect_uris: redirectUri ? [redirectUri] : [],
    } satisfies GoogleOAuthConfig;
  }

  const filePath = path.join(process.cwd(), GOOGLE_OAUTH_FILE);
  const rawFile = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(rawFile) as GoogleOAuthFile;

  return parsed.web;
}

function normalizeUrl(value: string) {
  return value.replace(/\/$/, "");
}

function getSessionSecret() {
  const sessionSecret = sanitizeEnvValue(process.env.DD_AUTH_SECRET);

  if (!sessionSecret) {
    throw new Error("DD_AUTH_SECRET precisa estar configurado.");
  }

  return sessionSecret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function createSessionToken(payload: SessionPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature || sign(encodedPayload) !== signature) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
  } catch {
    return null;
  }
}

export function getGoogleOAuthSettings(requestOrigin?: string) {
  const config = getGoogleOAuthConfig();
  const normalizedOrigin = requestOrigin ? normalizeUrl(requestOrigin) : "";
  const originRedirectUri = normalizedOrigin ? `${normalizedOrigin}/api/auth/callback/google` : "";
  const baseUrl = normalizeUrl(sanitizeEnvValue(process.env.NEXT_PUBLIC_APP_URL) ?? "");
  const redirectUri =
    (originRedirectUri && config.redirect_uris.includes(originRedirectUri) ? originRedirectUri : undefined) ??
    sanitizeEnvValue(process.env.GOOGLE_OAUTH_REDIRECT_URI) ??
    config.redirect_uris.find((uri) => baseUrl && uri.startsWith(baseUrl)) ??
    config.redirect_uris[0];

  if (!redirectUri) {
    throw new Error("Nenhum redirect URI do Google OAuth foi configurado.");
  }

  return {
    clientId: config.client_id,
    clientSecret: config.client_secret,
    authUri: config.auth_uri,
    tokenUri: config.token_uri,
    redirectUri,
  };
}

export function getAllowedGoogleDomains() {
  return splitEnvList(process.env.ALLOWED_GOOGLE_DOMAINS);
}

export function getAllowedGoogleEmails() {
  return splitEnvList(process.env.ALLOWED_GOOGLE_EMAILS);
}

export function isAllowedGoogleIdentity(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const allowedEmails = getAllowedGoogleEmails();
  const allowedDomains = getAllowedGoogleDomains();
  const emailDomain = normalizedEmail.split("@")[1] ?? "";

  if (allowedEmails.length === 0 && allowedDomains.length === 0) {
    return false;
  }

  return allowedEmails.includes(normalizedEmail) || allowedDomains.includes(emailDomain);
}

export function getPreferredHostedDomain() {
  const [firstDomain] = getAllowedGoogleDomains();
  return firstDomain;
}

export function isTrustedLocalhostOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return LOCAL_DEV_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function createOauthState() {
  const state = randomUUID();
  const cookieStore = await cookies();

  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_DURATION_SECONDS,
  });

  return state;
}

export async function validateOauthState(state: string | null) {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  return Boolean(state && storedState && state === storedState);
}

export async function setAuthenticatedSession(payload: SessionPayload) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, createSessionToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearAuthenticatedSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(OAUTH_STATE_COOKIE);
}

export async function getAuthenticatedSession() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export function isDevAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" && sanitizeEnvValue(process.env.DEV_AUTH_BYPASS) === "true";
}
