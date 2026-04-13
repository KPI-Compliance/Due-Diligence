import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const envLine = fs
  .readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((line) => line.startsWith("DATABASE_URL="));
if (envLine && !process.env.DATABASE_URL) process.env.DATABASE_URL = envLine.slice("DATABASE_URL=".length);
const sql = neon(process.env.DATABASE_URL);

const issueKey = process.argv[2] || "VSC-1323511";
const [cfgRow] = await sql.query("select config from integration_settings where provider='JIRA' limit 1");
const cfg = cfgRow?.config ?? {};
const base = String(cfg.base_url ?? "").replace(/\/$/, "");
const auth = `Basic ${Buffer.from(`${String(cfg.api_email ?? "")}:${String(cfg.api_token ?? "")}`).toString("base64")}`;

const issueRes = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`, {
  headers: { Accept: "application/json", Authorization: auth },
});
const issue = await issueRes.json();
const attachment = (issue?.fields?.attachment ?? [])
  .filter((item) => String(item?.mimeType ?? "").toLowerCase() === "application/pdf")
  .sort((a, b) => Date.parse(String(b?.created ?? "")) - Date.parse(String(a?.created ?? "")))[0];

if (!attachment?.id) throw new Error("No PDF attachment found.");

const pdfRes = await fetch(`${base}/rest/api/3/attachment/content/${encodeURIComponent(attachment.id)}`, {
  headers: { Accept: "*/*", Authorization: auth },
});
if (!pdfRes.ok) throw new Error(`Failed to download PDF: ${pdfRes.status}`);

const buf = Buffer.from(await pdfRes.arrayBuffer());
const doc = await getDocument({
  data: new Uint8Array(buf),
  stopAtErrors: false,
  isEvalSupported: false,
  disableFontFace: true,
  verbosity: 0,
}).promise;

const lines = [];
for (let p = 1; p <= doc.numPages; p += 1) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const pageText = content.items
    .map((item) => {
      if (!("str" in item) || typeof item.str !== "string") return "";
      return `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`;
    })
    .join("");
  lines.push(
    ...pageText
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}
await doc.destroy();

console.log(JSON.stringify({ issueKey, filename: attachment.filename, lines: lines.slice(0, 80) }, null, 2));
