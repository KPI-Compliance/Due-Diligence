import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const sql = neon(databaseUrl);

function normalizeKey(value) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseLabeledValueFromLines(lines, labels) {
  const normalizedLabels = labels.map(normalizeKey);
  const knownFieldHints = [
    "nameofvendor",
    "vendoremail",
    "vtexemailresponsible",
    "vendorlanguagepreferences",
    "priority",
    "capnumber",
    "company",
    "scope",
    "escopo",
    "contexto",
  ];

  const isKnownLabel = (line) => {
    const normalized = normalizeKey(line);
    return (
      normalizedLabels.some(
        (label) => normalized === label || normalized.includes(label) || label.includes(normalized),
      ) || knownFieldHints.some((hint) => normalized.includes(hint))
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const normalizedCurrent = normalizeKey(current);
    const labelMatch = normalizedLabels.some(
      (label) =>
        normalizedCurrent === label ||
        normalizedCurrent.includes(label) ||
        label.includes(normalizedCurrent),
    );

    if (!labelMatch) continue;

    const collected = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate) continue;
      if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(candidate)) break;
      if (isKnownLabel(candidate)) break;
      collected.push(candidate);
    }

    const merged = collected.join("\n").trim();
    if (merged) return merged;
  }

  return null;
}

function isBlank(value) {
  return !value || String(value).trim().length === 0;
}

async function getJiraConfig() {
  const rows = await sql`
    SELECT config
    FROM integration_settings
    WHERE provider = 'JIRA'
    LIMIT 1
  `;

  const config = rows[0]?.config ?? null;
  if (!config || typeof config !== "object") {
    throw new Error("JIRA integration config not found.");
  }

  const baseUrl = String(config.base_url ?? "").trim().replace(/\/$/, "");
  const email = String(config.api_email ?? process.env.JIRA_API_EMAIL ?? "").trim();
  const token = String(config.api_token ?? process.env.JIRA_API_TOKEN ?? "").trim();

  if (!baseUrl || !email || !token) {
    throw new Error("JIRA credentials are incomplete (base_url/api_email/api_token).");
  }

  return { baseUrl, email, token };
}

async function fetchLatestVendorPdfAttachment(jira, issueKey) {
  const auth = `Basic ${Buffer.from(`${jira.email}:${jira.token}`).toString("base64")}`;
  const issueUrl = `${jira.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`;
  const issueResponse = await fetch(issueUrl, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!issueResponse.ok) {
    return null;
  }

  const payload = await issueResponse.json();
  const attachments = Array.isArray(payload?.fields?.attachment) ? payload.fields.attachment : [];
  const pdfAttachments = attachments
    .filter((item) => {
      const mimeType = String(item?.mimeType ?? "").toLowerCase();
      const filename = String(item?.filename ?? "").toLowerCase();
      return mimeType === "application/pdf" || filename.endsWith(".pdf");
    })
    .sort((left, right) => Date.parse(String(right?.created ?? "")) - Date.parse(String(left?.created ?? "")));

  return pdfAttachments[0] ?? null;
}

async function extractFieldsFromPdfUrl(jira, contentUrl) {
  const auth = `Basic ${Buffer.from(`${jira.email}:${jira.token}`).toString("base64")}`;
  const response = await fetch(contentUrl, {
    headers: {
      Authorization: auth,
      Accept: "application/pdf",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer());
  const parser = new PDFParse({ data: fileBuffer });
  const parsed = await parser.getText();
  await parser.destroy();

  const lines = String(parsed.text ?? "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  return {
    vendorEmail: parseLabeledValueFromLines(lines, [
      "Vendor e-mail address",
      "Vendor e-mail",
      "Vendor email address",
      "Vendor email",
      "E-mail do vendor",
      "Email do vendor",
      "Email do fornecedor",
    ]),
    scope: parseLabeledValueFromLines(lines, ["Scope", "Escopo", "Context", "Contexto"]),
    vtexResponsibleEmail: parseLabeledValueFromLines(lines, [
      "VTEX e-mail responsible",
      "VTEX email responsible",
      "Responsável VTEX",
      "Responsavel VTEX",
    ]),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.slice("--limit=".length), 10)) : 1000;

  const jira = await getJiraConfig();

  const entities = await sql`
    SELECT
      id::text,
      jira_issue_key,
      contact_email,
      description,
      jira_form_data
    FROM entities
    WHERE kind = 'VENDOR'
      AND jira_issue_key IS NOT NULL
      AND (
        COALESCE(NULLIF(contact_email, ''), NULLIF(jira_form_data->>'vendorEmail', '')) IS NULL
        OR COALESCE(NULLIF(description, ''), NULLIF(jira_form_data->>'scope', '')) IS NULL
      )
    ORDER BY jira_synced_at DESC NULLS LAST, updated_at DESC
    LIMIT ${limit}
  `;

  let updated = 0;
  let noPdf = 0;
  let noExtract = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of entities) {
    const issueKey = String(row.jira_issue_key ?? "").trim();
    if (!issueKey) {
      skipped += 1;
      continue;
    }

    try {
      const attachment = await fetchLatestVendorPdfAttachment(jira, issueKey);
      if (!attachment?.content) {
        noPdf += 1;
        continue;
      }

      const parsed = await extractFieldsFromPdfUrl(jira, String(attachment.content));
      if (!parsed || (isBlank(parsed.vendorEmail) && isBlank(parsed.scope) && isBlank(parsed.vtexResponsibleEmail))) {
        noExtract += 1;
        continue;
      }

      const jiraFormData =
        row.jira_form_data && typeof row.jira_form_data === "object" && !Array.isArray(row.jira_form_data)
          ? row.jira_form_data
          : {};

      const nextJiraFormData = {
        ...jiraFormData,
        vendorEmail: !isBlank(jiraFormData.vendorEmail) ? jiraFormData.vendorEmail : parsed.vendorEmail ?? null,
        scope: !isBlank(jiraFormData.scope) ? jiraFormData.scope : parsed.scope ?? null,
        vtexResponsibleEmail:
          !isBlank(jiraFormData.vtexResponsibleEmail)
            ? jiraFormData.vtexResponsibleEmail
            : parsed.vtexResponsibleEmail ?? null,
      };

      const shouldUpdateEmail = isBlank(row.contact_email) && !isBlank(parsed.vendorEmail);
      const shouldUpdateScope = isBlank(row.description) && !isBlank(parsed.scope);
      const shouldUpdateJiraFormData =
        JSON.stringify(nextJiraFormData) !== JSON.stringify(jiraFormData);

      if (!shouldUpdateEmail && !shouldUpdateScope && !shouldUpdateJiraFormData) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await sql`
          UPDATE entities
          SET
            contact_email = CASE
              WHEN ${shouldUpdateEmail}::boolean THEN ${parsed.vendorEmail ?? null}
              ELSE contact_email
            END,
            description = CASE
              WHEN ${shouldUpdateScope}::boolean THEN ${parsed.scope ?? null}
              ELSE description
            END,
            jira_form_data = ${JSON.stringify(nextJiraFormData)}::jsonb,
            updated_at = now()
          WHERE id = ${row.id}::uuid
        `;
      }

      updated += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `[backfill-vendor-jira-form-fields] failed issue ${issueKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned: entities.length,
        updated,
        noPdf,
        noExtract,
        skipped,
        failed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
