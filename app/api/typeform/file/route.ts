import { getAuthenticatedSessionResult } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getTypeformApiCredentials } from "@/lib/typeform-admin";

export const runtime = "nodejs";

function isAllowedTypeformFileUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "api.typeform.com" &&
      (/^\/forms\/[^/]+\/responses\/[^/]+\/fields\/[^/]+\/files\/.+/i.test(url.pathname) ||
        /^\/responses\/files\/.+/i.test(url.pathname))
    );
  } catch {
    return false;
  }
}

function extractFormAndResponseFromTypeformFileUrl(value: string): { formId: string; responseToken: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "api.typeform.com") {
      return null;
    }
    const match = url.pathname.match(/^\/forms\/([^/]+)\/responses\/([^/]+)\//i);
    if (!match) {
      return null;
    }
    return { formId: match[1], responseToken: match[2] };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const sessionResult = await getAuthenticatedSessionResult();
  if (!sessionResult.session) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get("url")?.trim();

  if (!fileUrl || !isAllowedTypeformFileUrl(fileUrl)) {
    return new Response("Invalid Typeform file URL.", { status: 400 });
  }

  const parsed = extractFormAndResponseFromTypeformFileUrl(fileUrl);
  if (parsed) {
    // Validate ownership: the authenticated user's RBAC group must have access to the entity
    // this assessment belongs to. Prevents cross-entity file access (IDOR).
    const { resolveUserAccess } = await import("@/lib/access-control");
    const access = await resolveUserAccess(sessionResult.session.email);

    const rows = (await sql`
      SELECT e.kind::text AS entity_kind
      FROM assessments a
      INNER JOIN entities e ON e.id = a.entity_id
      WHERE a.typeform_form_id = ${parsed.formId}
        AND a.typeform_response_token = ${parsed.responseToken}
      LIMIT 1
    `) as Array<{ entity_kind: string }>;

    if (rows.length === 0) {
      return new Response("Forbidden.", { status: 403 });
    }

    const kind = rows[0].entity_kind;
    const canAccess =
      access.permissions.canManageSettings ||
      (kind === "VENDOR" && access.permissions.canWriteVendors) ||
      (kind === "PARTNER" && access.permissions.canWritePartners);

    if (!canAccess) {
      return new Response("Forbidden.", { status: 403 });
    }
  }

  const { token } = await getTypeformApiCredentials();
  if (!token) {
    return new Response("Typeform API token is not configured.", { status: 500 });
  }

  const upstream = await fetch(fileUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Typeform file fetch failed (${upstream.status}).`, { status: upstream.status || 502 });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const contentDisposition = upstream.headers.get("content-disposition");
  const contentLength = upstream.headers.get("content-length");

  if (contentType) headers.set("content-type", contentType);
  if (contentDisposition) headers.set("content-disposition", contentDisposition);
  if (contentLength) headers.set("content-length", contentLength);

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
