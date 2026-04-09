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

function normalizeExtractedCompany(value) {
  const normalized = normalizeWhitespace(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const stripped = normalized.replace(/^(company|empresa)\s*\*?\s*[:|-]?\s*/i, "").trim();
  const cleaned = stripped || normalized;
  if (!cleaned) return null;
  if (/^(cap|cap number)$/i.test(cleaned)) return null;

  if (/company\s*\*/i.test(cleaned) || /empresa\s*\*/i.test(cleaned)) {
    const token = cleaned
      .replace(/^(company|empresa)\s*\*?\s*/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .pop();
    return token?.trim() || null;
  }

  return cleaned.length <= 120 ? cleaned : null;
}

function normalizeVendorDisplayName(value) {
  const normalized = normalizeWhitespace(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const stripped = normalized
    .replace(
      /^(name of vendor|nome do vendor|nome do fornecedor|vendor name|nome da empresa)\s*\*?\s*[:|-]?\s*/i,
      "",
    )
    .trim();
  const cleaned = stripped || normalized;
  if (!cleaned) return null;

  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(cleaned)) {
    return null;
  }

  return cleaned.length <= 120 ? cleaned : cleaned.slice(0, 120).trim();
}

function normalizeCompanyGroup(value) {
  const normalized = normalizeWhitespace(value ?? "").toUpperCase();
  if (normalized === "VTEX" || normalized === "WENI") return normalized;
  return null;
}

function normalizeExtractedCapNumber(value) {
  const normalized = normalizeWhitespace(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const stripped = normalized.replace(/^(cap|cap number)\s*\*?\s*[:|-]?\s*/i, "").trim();
  const cleaned = stripped || normalized;
  if (!cleaned) return null;
  if (/company|empresa/i.test(cleaned) && !/\d/.test(cleaned)) return null;

  const digits = cleaned.match(/\b\d{2,}\b/);
  if (digits?.[0]) return digits[0];

  if (/company|empresa|scope|escopo|context/i.test(cleaned)) return null;
  const compact = cleaned.replace(/\s+/g, "");
  if (/^[a-z0-9-]{2,20}$/i.test(compact)) return compact;
  return null;
}

function parseLabeledValueFromLines(lines, labels) {
  const normalizedLabels = labels.map((label) => normalizeKey(label));

  const isKnownLabel = (line) => {
    const normalizedLine = normalizeKey(line);
    return (
      normalizedLabels.some(
        (label) =>
          normalizedLine === label ||
          normalizedLine.startsWith(label) ||
          normalizedLine.includes(label),
      ) ||
      /(nameofvendor|vendoremail|vtexemailresponsible|vendorlanguagepreferences|priority|capnumber|company|scope|escopo|contexto)/i.test(
        normalizedLine,
      )
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index] ?? "";
    const normalizedCurrent = normalizeKey(current);
    const labelMatch = normalizedLabels.some(
      (label) =>
        normalizedCurrent === label ||
        normalizedCurrent.startsWith(label) ||
        normalizedCurrent.includes(label),
    );

    if (!labelMatch) continue;

    const collected = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor]?.trim() ?? "";
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
    "VTEX e-mail responsável",
    "E-mail responsável VTEX",
    "Email responsavel VTEX",
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
      const value = normalizeWhitespace(match[1]);
      if (value) return value;
    }
  }

  return null;
}

function parseEmailByLabel(text, labels) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  for (const label of labels) {
    const strict = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})`,
      "iu",
    );
    const strictMatch = normalizedText.match(strict);
    if (strictMatch?.[1]) {
      return extractEmailFromText(strictMatch[1]);
    }

    // Proforma/JSM PDFs often render: Label *  "Display Name"  <user@domain.com>
    const labelRe = new RegExp(escapeRegex(label), "iu");
    const labelHit = labelRe.exec(normalizedText);
    if (!labelHit) continue;
    const afterLabel = normalizedText.slice(labelHit.index + labelHit[0].length).trim();
    const window = afterLabel.slice(0, 520);
    const loose = extractEmailFromText(window);
    if (loose) return loose;
  }

  return null;
}

function parseTextByLabel(text, labels, boundaries) {
  const boundaryPattern = boundaries.map((item) => escapeRegex(item)).join("|");
  for (const label of labels) {
    const regex = new RegExp(
      `${escapeRegex(label)}\\s*\\*?\\s*[:|-]?\\s*([\\s\\S]{1,500}?)(?=(?:${boundaryPattern})\\s*\\*?\\s*[:|-]?|$)`,
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
  if (fields.vendorDisplayName) score += 2;
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

function sanitizeLabelOnlyTextValue(value, labels) {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  const isLabelOnly = labels.some((label) => lowered === normalizeWhitespace(label).toLowerCase());
  if (isLabelOnly) return null;
  return normalized;
}

function sanitizeVendorFormFieldValues(fields) {
  return {
    vendorEmail: extractEmailFromText(fields.vendorEmail ?? null),
    vtexResponsibleEmail: extractEmailFromText(fields.vtexResponsibleEmail ?? null),
    languagePreference: sanitizeLabelOnlyTextValue(fields.languagePreference ?? null, [
      "vendor language preferences",
      "language preference",
      "language",
      "idioma",
    ]),
    priority: sanitizeLabelOnlyTextValue(fields.priority ?? null, ["priority", "prioridade"]),
    company: normalizeExtractedCompany(fields.company ?? null),
    capNumber: normalizeExtractedCapNumber(fields.capNumber ?? null),
    scope: sanitizeLabelOnlyTextValue(fields.scope ?? null, ["scope", "escopo", "context", "contexto"]),
  };
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

function isVendorRequestPdfFilename(filename) {
  const normalized = String(filename ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("vendor request") && normalized.endsWith(".pdf");
}

async function listVendorPdfAttachmentsForIssue(jira, issueKey) {
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
    return [];
  }

  const payload = await issueResponse.json();
  const attachments = Array.isArray(payload?.fields?.attachment) ? payload.fields.attachment : [];
  return attachments
    .filter((item) => {
      const mimeType = String(item?.mimeType ?? "").toLowerCase();
      const filename = String(item?.filename ?? "").toLowerCase();
      return mimeType === "application/pdf" || filename.endsWith(".pdf");
    })
    .sort((left, right) => {
      const leftPreferred = isVendorRequestPdfFilename(left?.filename) ? 1 : 0;
      const rightPreferred = isVendorRequestPdfFilename(right?.filename) ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      return Date.parse(String(right?.created ?? "")) - Date.parse(String(left?.created ?? ""));
    });
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
    "VTEX e-mail responsável",
    "E-mail responsável VTEX",
    "Email responsavel VTEX",
    "Vendor Language Preferences",
    "Priority",
    "CAP NUMBER",
    "Company",
    "Scope",
    "Escopo",
    "Context",
    "Contexto",
  ];

  const vendorDisplayName = normalizeVendorDisplayName(
    parseTextByLabel(rawText, ["Name of Vendor", "Nome do fornecedor", "Nome do vendor", "Vendor name"], boundaries) ??
      parseLabeledValueFromLines(lines, ["Name of Vendor", "Nome do fornecedor", "Nome do vendor", "Vendor name"]),
  );

  const parsed = {
    vendorDisplayName,
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
        "VTEX e-mail responsável",
        "E-mail responsável VTEX",
        "Email responsavel VTEX",
        "E-mail Responsável VTEX",
        "Responsavel VTEX",
        "Responsável VTEX",
        "Ponto focal VTEX",
      ]) ??
      parseLabeledValueFromLines(lines, [
        "VTEX e-mail responsible",
        "VTEX email responsible",
        "VTEX e-mail responsável",
        "E-mail responsável VTEX",
        "Email responsavel VTEX",
        "Responsavel VTEX",
        "Responsável VTEX",
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

  const normalized = sanitizeVendorFormFieldValues(parsed);

  const result = { ...normalized, vendorDisplayName: parsed.vendorDisplayName ?? null };

  if (scoreExtractedFields(result) === 0) return null;

  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const forceAll = process.argv.includes("--force-all");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.slice("--limit=".length), 10)) : 1000;
  const issueArg = process.argv.find((arg) => arg.startsWith("--issue="));
  const issueKeyFilter = issueArg ? issueArg.slice("--issue=".length).trim() : null;
  /** When true, non-empty PDF values win over stored JSON (same idea as Jira webhook attachment path). */
  const preferPdf = Boolean(issueKeyFilter) || process.argv.includes("--prefer-pdf");

  const jira = await getJiraConfig();

  const entities = issueKeyFilter
    ? await sql`
        SELECT
          id::text,
          name,
          jira_issue_key,
          contact_email,
          description,
          company_group,
          owner_user_id::text AS owner_user_id,
          jira_form_data
        FROM entities
        WHERE kind = 'VENDOR'
          AND jira_issue_key = ${issueKeyFilter}
        LIMIT 1
      `
    : forceAll
      ? await sql`
          SELECT
            id::text,
            name,
            jira_issue_key,
            contact_email,
            description,
            company_group,
            owner_user_id::text AS owner_user_id,
            jira_form_data
          FROM entities
          WHERE kind = 'VENDOR'
            AND jira_issue_key IS NOT NULL
          ORDER BY jira_synced_at DESC NULLS LAST, updated_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT
            id::text,
            name,
            jira_issue_key,
            contact_email,
            description,
            company_group,
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
              OR lower(COALESCE(jira_form_data->>'capNumber', '')) LIKE '%company%'
              OR lower(COALESCE(jira_form_data->>'capNumber', '')) LIKE '%empresa%'
              OR lower(COALESCE(jira_form_data->>'priority', '')) IN ('priority', 'prioridade')
            )
          ORDER BY jira_synced_at DESC NULLS LAST, updated_at DESC
          LIMIT ${limit}
        `;

  if (issueKeyFilter && entities.length === 0) {
    throw new Error(
      `[backfill-vendor-jira-form-fields] No VENDOR entity found for jira_issue_key=${issueKeyFilter}.`,
    );
  }

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
      const pdfAttachments = await listVendorPdfAttachmentsForIssue(jira, issueKey);
      if (pdfAttachments.length === 0) {
        noPdf += 1;
        continue;
      }

      let parsed = null;
      let bestScore = 0;
      for (const attachment of pdfAttachments) {
        const contentUrl = attachment?.content;
        if (!contentUrl) continue;
        const candidate = await extractFieldsFromPdfUrl(jira, String(contentUrl));
        if (!candidate) continue;
        const score = scoreExtractedFields(candidate);
        if (score > bestScore) {
          bestScore = score;
          parsed = candidate;
        }
      }

      if (!parsed || bestScore === 0) {
        noExtract += 1;
        continue;
      }

      const jiraFormData =
        row.jira_form_data && typeof row.jira_form_data === "object" && !Array.isArray(row.jira_form_data)
          ? row.jira_form_data
          : {};
      const sanitizedExisting = sanitizeVendorFormFieldValues({
        vendorEmail: jiraFormData.vendorEmail,
        vtexResponsibleEmail: jiraFormData.vtexResponsibleEmail,
        languagePreference: jiraFormData.languagePreference,
        priority: jiraFormData.priority,
        company: jiraFormData.company,
        capNumber: jiraFormData.capNumber,
        scope: jiraFormData.scope,
      });

      const pick = (pdfVal, existingVal) =>
        preferPdf ? (pdfVal || existingVal || null) : (pdfVal ?? existingVal ?? null);

      const existingVendorDisplayName =
        typeof jiraFormData.vendorDisplayName === "string" && jiraFormData.vendorDisplayName.trim()
          ? jiraFormData.vendorDisplayName.trim()
          : null;
      const mergedVendorDisplayName = pick(parsed.vendorDisplayName, existingVendorDisplayName);

      const nextJiraFormData = {
        ...jiraFormData,
        vendorDisplayName: mergedVendorDisplayName ?? null,
        vendorEmail: pick(parsed.vendorEmail, sanitizedExisting.vendorEmail),
        scope: pick(parsed.scope, sanitizedExisting.scope),
        vtexResponsibleEmail: pick(parsed.vtexResponsibleEmail, sanitizedExisting.vtexResponsibleEmail),
        languagePreference: pick(parsed.languagePreference, sanitizedExisting.languagePreference),
        priority: pick(parsed.priority, sanitizedExisting.priority),
        company: pick(parsed.company, sanitizedExisting.company),
        capNumber: pick(parsed.capNumber, sanitizedExisting.capNumber),
      };

      const currentEmail = extractEmailFromText(row.contact_email);
      const currentScope = sanitizeLabelOnlyTextValue(row.description, ["scope", "escopo", "context", "contexto"]);
      const currentResponsible = extractEmailFromText(jiraFormData.vtexResponsibleEmail);
      const mergedVendorEmail = nextJiraFormData.vendorEmail;
      const mergedScope = nextJiraFormData.scope;
      const mergedResponsible = nextJiraFormData.vtexResponsibleEmail;
      const shouldUpdateEmail = Boolean(mergedVendorEmail && mergedVendorEmail !== currentEmail);
      const shouldUpdateScope = Boolean(mergedScope && mergedScope !== currentScope);
      const shouldUpdateResponsible = Boolean(mergedResponsible && mergedResponsible !== currentResponsible);
      const shouldUpdateJiraFormData =
        JSON.stringify(nextJiraFormData) !== JSON.stringify(jiraFormData);
      const mergedCompanyGroup = normalizeCompanyGroup(nextJiraFormData.company);
      const storedCompanyGroup = normalizeCompanyGroup(row.company_group);
      const shouldUpdateCompanyGroup = Boolean(mergedCompanyGroup && mergedCompanyGroup !== storedCompanyGroup);
      const storedEntityName = String(row.name ?? "").trim();
      const shouldUpdateName = Boolean(
        mergedVendorDisplayName && mergedVendorDisplayName !== storedEntityName,
      );
      let nextOwnerUserId = row.owner_user_id ?? null;
      if (isBlank(nextOwnerUserId) && !isBlank(mergedResponsible)) {
        const ownerRows = await sql`
          SELECT id::text
          FROM users
          WHERE lower(email) = lower(${mergedResponsible})
          LIMIT 1
        `;
        nextOwnerUserId = ownerRows[0]?.id ?? null;
      }
      const shouldUpdateOwner = isBlank(row.owner_user_id) && !isBlank(nextOwnerUserId);

      if (
        !shouldUpdateEmail &&
        !shouldUpdateScope &&
        !shouldUpdateResponsible &&
        !shouldUpdateJiraFormData &&
        !shouldUpdateOwner &&
        !shouldUpdateCompanyGroup &&
        !shouldUpdateName
      ) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await sql`
          UPDATE entities
          SET
            name = CASE
              WHEN ${shouldUpdateName}::boolean THEN ${mergedVendorDisplayName ?? null}
              ELSE name
            END,
            contact_email = CASE
              WHEN ${shouldUpdateEmail}::boolean THEN ${mergedVendorEmail ?? null}
              ELSE contact_email
            END,
            description = CASE
              WHEN ${shouldUpdateScope}::boolean THEN ${mergedScope ?? null}
              ELSE description
            END,
            owner_user_id = CASE
              WHEN ${shouldUpdateOwner}::boolean THEN ${nextOwnerUserId ?? null}::uuid
              ELSE owner_user_id
            END,
            company_group = CASE
              WHEN ${shouldUpdateCompanyGroup}::boolean THEN ${mergedCompanyGroup ?? null}::company_group
              ELSE company_group
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
        forceAll,
        issueKeyFilter,
        preferPdf,
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
