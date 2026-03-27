import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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

function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractEmailFromText(value) {
  if (!value) return null;
  const match = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.trim().toLowerCase() ?? null;
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

  const flattened = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!flattened) return null;

  const fieldBoundaries = [
    "Name of Vendor",
    "Vendor e-mail address",
    "Vendor e-mail",
    "Vendor email address",
    "Vendor email",
    "VTEX e-mail responsible",
    "VTEX email responsible",
    "Vendor Language Preferences",
    "Priority",
    "CAP NUMBER",
    "Company",
    "Scope",
    "Escopo",
    "Context",
    "Contexto",
  ];
  const boundariesPattern = fieldBoundaries.map(escapeRegex).join("|");

  for (const label of labels) {
    const pattern = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*(.+?)(?=\\s+(?:${boundariesPattern})\\s*\\*?|$)`,
      "i",
    );
    const match = flattened.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value) return value;
    }
  }

  return null;
}

function parseEmailByLabel(text, labels) {
  for (const label of labels) {
    const regex = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})`,
      "iu",
    );
    const match = text.match(regex);
    if (match?.[1]) {
      return extractEmailFromText(match[1]);
    }
  }

  return null;
}

function parseTextByLabel(text, labels, boundaries) {
  const boundaryPattern = boundaries.map((item) => escapeRegex(item)).join("|");
  for (const label of labels) {
    const regex = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*([\\s\\S]{1,1200}?)(?=(?:${boundaryPattern})\\s*\\*?\\s*[:|-]?|$)`,
      "iu",
    );
    const match = text.match(regex);
    if (match?.[1]) {
      const normalized = normalizeWhitespace(match[1]).replace(/\s+/g, " ").trim();
      if (normalized) return normalized;
    }
  }

  return null;
}

function scoreExtractedFields(fields) {
  if (!fields) return 0;
  let score = 0;
  if (fields.vendorEmail) score += 3;
  if (fields.vtexResponsibleEmail) score += 3;
  if (fields.scope) score += 3;
  if (fields.languagePreference) score += 1;
  if (fields.priority) score += 1;
  if (fields.company) score += 1;
  if (fields.capNumber) score += 1;
  return score;
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

  const preferred = pdfAttachments.find((item) => /vendor\s*request/i.test(String(item?.filename ?? "")));
  return preferred ?? pdfAttachments[0] ?? null;
}

async function extractFieldsFromPdfUrl(jira, contentUrl) {
  const auth = `Basic ${Buffer.from(`${jira.email}:${jira.token}`).toString("base64")}`;
  let response = await fetch(contentUrl, {
    headers: {
      Authorization: auth,
      Accept: "*/*",
    },
    cache: "no-store",
  });

  if (!response.ok && jira.baseUrl) {
    const attachmentIdMatch = String(contentUrl).match(/\/attachment\/(?:content\/)?(\d+)/i);
    const attachmentId = attachmentIdMatch?.[1] ?? null;
    if (attachmentId) {
      const fallbackUrl = `${jira.baseUrl}/rest/api/3/attachment/content/${encodeURIComponent(attachmentId)}`;
      response = await fetch(fallbackUrl, {
        headers: {
          Authorization: auth,
          Accept: "*/*",
        },
        cache: "no-store",
      });
    }
  }

  if (!response.ok) {
    return null;
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer());
  const pdfDocument = await getDocument({
    data: new Uint8Array(fileBuffer),
    stopAtErrors: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => {
        if (!("str" in item) || typeof item.str !== "string") return "";
        const suffix = "hasEOL" in item && item.hasEOL ? "\n" : " ";
        return `${item.str}${suffix}`;
      })
      .join("")
      .trim();
    if (pageText) pageTexts.push(pageText);
  }
  await pdfDocument.destroy();

  const rawText = normalizeWhitespace(pageTexts.join("\n"));
  const lines = rawText
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const singleLineText = rawText.replace(/\s+/g, " ").trim();
  const boundaries = [
    "Name of Vendor",
    "Vendor e-mail address",
    "Vendor e-mail",
    "Vendor email address",
    "Vendor email",
    "VTEX e-mail responsible",
    "VTEX email responsible",
    "Vendor Language Preferences",
    "Priority",
    "CAP NUMBER",
    "Company",
    "Scope",
    "Escopo",
    "Context",
    "Contexto",
  ];

  const parsed = {
    vendorEmail:
      parseEmailByLabel(singleLineText, [
        "Vendor e-mail address",
        "Vendor e-mail",
        "Vendor email address",
        "Vendor email",
        "E-mail do vendor",
        "Email do vendor",
        "Email do fornecedor",
      ]) ??
      parseLabeledValueFromLines(lines, [
        "Vendor e-mail address",
        "Vendor e-mail",
        "Vendor email address",
        "Vendor email",
        "E-mail do vendor",
        "Email do vendor",
        "Email do fornecedor",
      ]),
    scope:
      parseTextByLabel(rawText, ["Scope", "Escopo", "Context", "Contexto"], boundaries) ??
      parseLabeledValueFromLines(lines, ["Scope", "Escopo", "Context", "Contexto"]),
    vtexResponsibleEmail:
      parseEmailByLabel(singleLineText, [
        "VTEX e-mail responsible",
        "VTEX email responsible",
        "Responsável VTEX",
        "Responsavel VTEX",
        "Ponto focal VTEX",
      ]) ??
      parseLabeledValueFromLines(lines, [
        "VTEX e-mail responsible",
        "VTEX email responsible",
        "Responsável VTEX",
        "Responsavel VTEX",
      ]),
    languagePreference:
      parseTextByLabel(rawText, ["Vendor Language Preferences", "Language Preference", "Idioma", "Language"], boundaries) ??
      parseLabeledValueFromLines(lines, ["Vendor Language Preferences", "Language Preference", "Idioma", "Language"]),
    priority:
      parseTextByLabel(rawText, ["Priority", "Prioridade"], boundaries) ??
      parseLabeledValueFromLines(lines, ["Priority", "Prioridade"]),
    company:
      parseTextByLabel(rawText, ["Company", "Empresa", "Business unit", "Company group", "Grupo"], boundaries) ??
      parseLabeledValueFromLines(lines, ["Company", "Empresa", "Business unit", "Company group", "Grupo"]),
    capNumber:
      parseTextByLabel(rawText, ["CAP NUMBER", "CAP", "CAP Number"], boundaries) ??
      parseLabeledValueFromLines(lines, ["CAP NUMBER", "CAP", "CAP Number"]),
  };

  const normalized = {
    ...parsed,
    vendorEmail: extractEmailFromText(parsed.vendorEmail),
    vtexResponsibleEmail: extractEmailFromText(parsed.vtexResponsibleEmail),
  };

  if (scoreExtractedFields(normalized) === 0) return null;

  return normalized;
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
      owner_user_id::text AS owner_user_id,
      jira_form_data
    FROM entities
    WHERE kind = 'VENDOR'
      AND jira_issue_key IS NOT NULL
      AND (
        COALESCE(NULLIF(contact_email, ''), NULLIF(jira_form_data->>'vendorEmail', '')) IS NULL
        OR COALESCE(NULLIF(jira_form_data->>'scope', ''), '') = ''
        OR COALESCE(NULLIF(description, ''), NULLIF(jira_form_data->>'scope', '')) IS NULL
        OR COALESCE(NULLIF(jira_form_data->>'vtexResponsibleEmail', ''), '') = ''
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
      if (!parsed || scoreExtractedFields(parsed) === 0) {
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
        languagePreference:
          !isBlank(jiraFormData.languagePreference)
            ? jiraFormData.languagePreference
            : parsed.languagePreference ?? null,
        priority: !isBlank(jiraFormData.priority) ? jiraFormData.priority : parsed.priority ?? null,
        company: !isBlank(jiraFormData.company) ? jiraFormData.company : parsed.company ?? null,
        capNumber: !isBlank(jiraFormData.capNumber) ? jiraFormData.capNumber : parsed.capNumber ?? null,
      };

      const shouldUpdateEmail = isBlank(row.contact_email) && !isBlank(parsed.vendorEmail);
      const shouldUpdateScope = isBlank(row.description) && !isBlank(parsed.scope);
      const shouldUpdateResponsible = isBlank(jiraFormData.vtexResponsibleEmail) && !isBlank(parsed.vtexResponsibleEmail);
      const shouldUpdateJiraFormData =
        JSON.stringify(nextJiraFormData) !== JSON.stringify(jiraFormData);
      let nextOwnerUserId = row.owner_user_id ?? null;
      if (isBlank(nextOwnerUserId) && !isBlank(parsed.vtexResponsibleEmail)) {
        const ownerRows = await sql`
          SELECT id::text
          FROM users
          WHERE lower(email) = lower(${parsed.vtexResponsibleEmail})
          LIMIT 1
        `;
        nextOwnerUserId = ownerRows[0]?.id ?? null;
      }
      const shouldUpdateOwner = isBlank(row.owner_user_id) && !isBlank(nextOwnerUserId);

      if (!shouldUpdateEmail && !shouldUpdateScope && !shouldUpdateResponsible && !shouldUpdateJiraFormData && !shouldUpdateOwner) {
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
            owner_user_id = CASE
              WHEN ${shouldUpdateOwner}::boolean THEN ${nextOwnerUserId ?? null}::uuid
              ELSE owner_user_id
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
