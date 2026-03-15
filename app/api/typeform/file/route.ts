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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get("url")?.trim();

  if (!fileUrl || !isAllowedTypeformFileUrl(fileUrl)) {
    return new Response("Invalid Typeform file URL.", { status: 400 });
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
