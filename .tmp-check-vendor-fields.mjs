import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const env = fs.readFileSync(".env.local", "utf8");
const dbLine = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
const sql = neon(dbLine.slice("DATABASE_URL=".length));

const issueKey = process.argv[2] || "VSC-1323511";
const [integration] = await sql.query(
  `select config from integration_settings where provider = 'JIRA' limit 1`,
);
const config = integration?.config ?? {};
const baseUrl = String(config.base_url ?? "").trim().replace(/\/$/, "");
const email = String(config.api_email ?? process.env.JIRA_API_EMAIL ?? "").trim();
const token = String(config.api_token ?? process.env.JIRA_API_TOKEN ?? "").trim();

if (!baseUrl || !email || !token) {
  throw new Error("Missing Jira credentials from integration_settings.");
}

const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
async function get(url) {
  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text,
  };
}

async function getBinary(url, accept) {
  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: accept },
    cache: "no-store",
    redirect: "follow",
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get("content-type"),
    size: buffer.length,
  };
}

const issueRes = await get(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names`);
let issueId = null;
if (issueRes.ok) {
  try {
    issueId = JSON.parse(issueRes.body)?.id ?? null;
  } catch {}
}

const requestByKey = await get(
  `${baseUrl}/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}?expand=requestFieldValues`,
);
const requestById =
  issueId
    ? await get(`${baseUrl}/rest/servicedeskapi/request/${encodeURIComponent(issueId)}?expand=requestFieldValues`)
    : null;

const issueJson = issueRes.ok ? JSON.parse(issueRes.body) : null;
const attachmentUrl =
  issueJson?.fields?.attachment?.[0]?.content ??
  requestByKey.ok
    ? (JSON.parse(requestByKey.body)?.requestFieldValues ?? [])
        .flatMap((item) => Array.isArray(item?.value) ? item.value : [])
        .find((item) => item?.content)?.content ?? null
    : null;
const attachmentDownloadPdf = attachmentUrl ? await getBinary(attachmentUrl, "application/pdf") : null;
const attachmentDownloadAny = attachmentUrl ? await getBinary(attachmentUrl, "*/*") : null;

console.log(
  JSON.stringify(
    {
      issueKey,
      issueId,
      issue: {
        ok: issueRes.ok,
        status: issueRes.status,
        body: issueRes.ok ? JSON.parse(issueRes.body) : issueRes.body,
      },
      requestByKey: {
        ok: requestByKey.ok,
        status: requestByKey.status,
        body: requestByKey.ok ? JSON.parse(requestByKey.body) : requestByKey.body,
      },
      requestById: requestById
        ? {
            ok: requestById.ok,
            status: requestById.status,
            body: requestById.ok ? JSON.parse(requestById.body) : requestById.body,
          }
        : null,
      attachmentUrl,
      attachmentDownloadPdf,
      attachmentDownloadAny,
    },
    null,
    2,
  ),
);
